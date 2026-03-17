# REINVENT4 Scaffold Decoration Agent — Design Spec
**Date:** 2026-03-17
**Status:** Approved for implementation

---

## Overview

Add a REINVENT4-powered generative design capability to the R-group analysis pipeline. The first mode implemented is **scaffold decoration**: given a detected core scaffold, run REINVENT4 in an intelligent iterative loop that adapts based on convergence signals until the best possible R-group variants are found or the iteration budget is exhausted.

This is the first of three planned REINVENT4 modes. The architecture is explicitly designed so that de novo design and scaffold hopping can be added later with minimal structural changes.

---

## File Layout

```
backend/
  agents/
    reinvent4_agent.py        ← supervisory loop (inherits BaseAgent)
    convergence_subagent.py   ← single-turn Claude convergence analyst (plain class)
  utils/
    reinvent4_utils.py        ← TOML builder, subprocess runner, result parser
    qsar_trainer.py           ← pure sklearn QSAR model (no LLM)
```

`reinvent4_utils.py` and `qsar_trainer.py` are pure utilities with no agent behavior; they belong in `backend/utils/` alongside the existing `mol_utils.py` and `file_parsers.py`.

---

## Architecture

### REINVENT4 isolation

REINVENT4 runs in its own isolated environment (separate venv or conda env on a GPU machine). The main application communicates with it exclusively via subprocess. This keeps PyTorch and model weights out of the main app's venv and makes AWS deployment straightforward.

### Why `qsar_trainer.py` is not a Claude agent

QSAR training is deterministic sklearn work (Morgan fingerprints → RandomForestRegressor → pickle export). No reasoning loop is needed. Keeping it LLM-free saves API calls and latency.

### Why `ConvergenceSubagent` is a Claude agent (plain class, not BaseAgent)

Per-iteration convergence decisions require judgment: is this plateau worth escaping? should we reweight vs. add diversity pressure? These benefit from Claude's reasoning rather than hard-coded thresholds.

`ConvergenceSubagent` is **not** a subclass of `BaseAgent`. It is a plain class that holds an `anthropic.Anthropic` client reference and makes a single `client.messages.create()` call per invocation — no tool loop, no multi-turn cycle. This avoids forcing the agentic loop machinery onto a purely analytical operation.

---

## Components

### `Reinvent4Agent` (inherits `BaseAgent`)

The outer supervisory loop. Overrides `run()` with a custom typed signature (see below). Internally it calls the standard `client.messages.create()` loop directly (same pattern as the existing agentic loop in `BaseAgent`) with `max_iterations=40` to accommodate up to 5 outer iterations × ~6 tool calls each.

**Custom `run()` signature:**

```python
def run(
    self,
    core_smarts: str,
    sar_data: Dict[str, Any],
    properties: Dict[str, List],
    property_of_interest: Optional[str],
    generative_config: GenerativeConfig,
) -> Dict[str, Any]:
```

This does not call `super().run()`. It constructs its own message list and enters the same tool-use loop pattern defined in `BaseAgent`, with `max_iterations=40`.

**Tools:**

| Tool | Purpose |
|---|---|
| `train_qsar_model` | Calls `qsar_trainer.train()` — trains RF on activity data, returns `{model_path, cv_r2, scoring_component_config}` |
| `build_toml_config` | Writes the REINVENT4 `.toml` — scaffold SMARTS, scoring components, sigma, n_steps, output path. Returns `toml_path`. |
| `run_reinvent4` | Subprocess call to the `reinvent` CLI. Returns `output_csv_path`. |
| `parse_results` | Reads output CSV → top-N SMILES with per-component scores, deduplicated. Returns `List[MolResult]`. |
| `analyze_convergence` | Calls `ConvergenceSubagent.analyze()` with iteration metrics + history. Returns structured recommendation. |
| `adjust_config` | Patches the current TOML config dict in memory using convergence `suggested_adjustments`, then calls `build_toml_config` to write a new file. Returns new `toml_path`. |
| `get_iteration_summary` | Returns a compact summary of all iterations so far (scores, diversity, actions taken) to keep the main context light. |

**Iteration loop:**

1. Optionally call `train_qsar_model` (if `scoring_mode` includes `"qsar"`)
2. Call `build_toml_config` with initial scoring config
3. **Outer loop** (max `generative_config.n_iterations`, default 5):
   - `run_reinvent4(toml_path)`
   - `parse_results(output_csv_path)`
   - `analyze_convergence(metrics, history)` → recommendation
   - Claude decides action: `continue` / `reweight` / `escape` / `stop`
   - If `reweight` or `escape` → `adjust_config(suggested_adjustments)` then loop
   - If `stop` or budget exhausted → exit loop
4. Return `{top_molecules, iteration_history, converged_status}`

---

### `ConvergenceSubagent` (plain class, single `client.messages.create()` call)

```python
class ConvergenceSubagent:
    def __init__(self, client: anthropic.Anthropic, model: str = DEFAULT_MODEL):
        self.client = client
        self.model = model

    def analyze(self, metrics: Dict, history: List[Dict]) -> Dict:
        """Single-turn Claude call. Returns structured convergence recommendation."""
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=CONVERGENCE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps({"metrics": metrics, "history": history})}],
        )
        return json.loads(response.content[0].text)
```

**Input payload:**
```json
{
  "metrics": {
    "iteration": 3,
    "mean_score": 0.61,
    "top10_score": 0.78,
    "internal_diversity": 0.42,
    "n_molecules": 487
  },
  "history": [
    { "iteration": 1, "mean_score": 0.51, "top10_score": 0.65, "internal_diversity": 0.71 },
    { "iteration": 2, "mean_score": 0.60, "top10_score": 0.74, "internal_diversity": 0.55 }
  ]
}
```

**Convergence states (detected by Claude reasoning, not hard-coded thresholds):**

| State | Description | Action |
|---|---|---|
| `improving` | Scores rising, diversity healthy | `continue` |
| `plateau` | Mean score delta negligible (< ~0.02) for 2+ iterations | `escape` |
| `low_diversity` | Internal Tanimoto diversity < ~0.3 | `reweight` |
| `converged` | Top-10 score stable and high | `stop` |

Note: "plateau" and "low_diversity" are distinct states. Zero-molecule runs are handled upstream in `Reinvent4Agent` before `analyze_convergence` is called (see Error Handling).

**Output:**
```json
{
  "status": "plateau",
  "action": "escape",
  "rationale": "Mean score has not improved in 2 iterations and diversity is declining.",
  "suggested_adjustments": {
    "sigma": 120,
    "diversity_filter": "IdenticalMurckoScaffold"
  }
}
```

---

### `qsar_trainer.py` (utility class, no LLM)

```python
class QSARTrainer:
    def train(self, smiles: List[str], activity: List[float], output_dir: Path) -> Dict:
        """
        Returns:
          model_path: Path  (joblib-serialized RandomForestRegressor)
          cv_r2: float
          scoring_component_config: dict  (REINVENT4 custom_alerts scoring block)
        """
```

- **Features:** Morgan fingerprints (radius 2, 2048 bits) via RDKit
- **Model:** `RandomForestRegressor(n_estimators=100)`, 5-fold CV via `cross_val_score`
- **Serialization:** `joblib.dump()` → `{output_dir}/qsar_model.pkl`
- **Fallback:** if `len(smiles) < 10` or `cv_r2 < 0.3`, raises `QSARTrainingFailed` with reason; caller falls back to physico-only
- **REINVENT4 scoring config:** returns a dict describing a `custom_alerts` or `predictive_property` scoring component that points to the model pickle path — the exact schema matches REINVENT4's `[stage.scoring]` TOML block

---

### `reinvent4_utils.py` (pure utilities)

#### `build_toml()`

```python
def build_toml(
    scaffold_smarts: str,
    scoring_config: ScoringConfig,   # {components: [{type, weight, params}]}
    n_steps: int,
    output_dir: Path,
    sigma: int = 100,
    diversity_filter: str = "IdenticalMurckoScaffold",
) -> Path:
```

Writes a TOML file to `output_dir/reinvent4_config.toml`. Returns the path.

**Adjustable TOML fields and their `suggested_adjustments` keys:**

| `suggested_adjustments` key | REINVENT4 TOML path | Effect |
|---|---|---|
| `sigma` | `[parameters] sigma` | Controls exploitation vs. exploration sharpness |
| `diversity_filter` | `[diversity_filter] name` | Scaffold diversity enforcement strategy |
| `n_steps` | `[parameters] n_steps` | Molecules sampled per run |
| `qsar_weight` | `[stage.scoring.component.qsar] weight` | Relative weight of QSAR component |
| `qed_weight` | `[stage.scoring.component.qed] weight` | Relative weight of QED component |
| `sa_score_weight` | `[stage.scoring.component.sa_score] weight` | Relative weight of SA score component |

**Reference TOML structure (scaffold decoration):**

```toml
[parameters]
  use_checkpoint = false
  n_steps = 500
  sigma = 100

[diversity_filter]
  name = "IdenticalMurckoScaffold"
  bucket_size = 25
  minscore = 0.4

[[stage]]
  max_score = 1.0

  [stage.scoring]
    type = "arithmetic_mean"
    [[stage.scoring.component]]
      [stage.scoring.component.scaffold_decoration]
        name = "scaffold"
        weight = 1.0
        [[stage.scoring.component.scaffold_decoration.endpoint]]
          name = "scaffold_smarts"
          smarts = "SCAFFOLD_SMARTS_HERE"

    [[stage.scoring.component]]
      [stage.scoring.component.qed_score]
        name = "qed"
        weight = 0.3

    [[stage.scoring.component]]
      [stage.scoring.component.sa_score]
        name = "sa_score"
        weight = 0.1
```

#### `run_reinvent4()`

```python
def run_reinvent4(toml_path: Path, exec_path: str) -> Path:
```

**Subprocess invocation:**
```bash
{exec_path} -i {toml_path}
```

- Captures stdout and stderr via `subprocess.run(..., capture_output=True, text=True)`
- On non-zero exit code: raises `Reinvent4RunFailed(stderr=...)`
- Output file: `{toml_path.parent}/results/scaffold_decoration.csv` (REINVENT4's default output path relative to the config file location)
- Returns path to the output CSV

#### `parse_results()`

```python
def parse_results(csv_path: Path, top_n: int = 50) -> List[Dict]:
```

- Reads REINVENT4's output CSV (columns: `SMILES`, `Score`, per-component score columns, `Step`)
- Deduplicates by canonical SMILES (via RDKit)
- Returns top `top_n` by composite `Score`, descending
- Each entry: `{smiles, canonical_smiles, composite_score, qsar_score, qed, sa_score, step, iteration}`

---

## API Changes

### Updated `AnalysisRequest` (Pydantic model)

```python
class GenerativeConfig(BaseModel):
    scoring_mode: Literal["physico", "qsar", "both"] = "both"
    n_iterations: int = Field(default=5, ge=1, le=20)
    n_steps: int = Field(default=500, ge=100, le=5000)
    # reinvent4_exec is server-side only — not exposed to end users
    # resolved from REINVENT4_EXEC env var on the backend

class AnalysisRequest(BaseModel):
    # ... existing fields unchanged ...
    run_generative: bool = False
    generative_config: Optional[GenerativeConfig] = None
```

`reinvent4_exec` is **not** a user-supplied field. The executable path is resolved server-side from the `REINVENT4_EXEC` environment variable only, preventing arbitrary subprocess injection.

### Updated `run_full_pipeline()` signature

```python
def run_full_pipeline(
    self,
    smiles: List[str],
    labels: List[str],
    properties: Dict[str, List],
    property_of_interest: Optional[str] = None,
    run_enumeration: bool = False,
    core_smarts: Optional[str] = None,
    # New:
    run_generative: bool = False,
    generative_config: Optional[GenerativeConfig] = None,
) -> Dict[str, Any]:
```

**Insertion point in `run_full_pipeline()`** — after `sar_results` are collected and core is confirmed:

```python
# After SAR step:
if run_generative and detected_core_smarts:
    reinvent4_agent = Reinvent4Agent(client=self.client, ...)
    results["generative"] = reinvent4_agent.run(
        core_smarts=detected_core_smarts,
        sar_data=sar_results,
        properties=properties,
        property_of_interest=property_of_interest,
        generative_config=generative_config or GenerativeConfig(),
    )
```

### Environment variable

```
REINVENT4_EXEC=/opt/reinvent4/venv/bin/reinvent
```

### Response additions

The existing response gains a new optional field:

```json
"generative": {
  "top_molecules": [
    {
      "smiles": "...",
      "canonical_smiles": "...",
      "composite_score": 0.81,
      "qsar_score": 0.74,
      "qed": 0.88,
      "sa_score": 0.92,
      "iteration": 3
    }
  ],
  "iteration_history": [
    { "iteration": 1, "mean_score": 0.51, "top10_score": 0.65, "internal_diversity": 0.71, "action_taken": "continue" },
    { "iteration": 2, "mean_score": 0.60, "top10_score": 0.74, "internal_diversity": 0.55, "action_taken": "escape" }
  ],
  "converged_status": "converged",
  "scoring_mode_used": "both"
}
```

`converged_status` is a single string enum: `"converged"` | `"budget_exhausted"` | `"error"`.

---

## Data Flow

```
OrchestratorAgent.run_full_pipeline(run_generative=True, generative_config=...)
  └── [after SAR completes, core detected]
      └── Reinvent4Agent.run(core_smarts, sar_data, properties, property_of_interest, generative_config)
            │
            │  [if scoring_mode in ("qsar", "both")]
            ├── QSARTrainer.train(smiles, activity) → {model_path, cv_r2, scoring_component_config}
            │     └── on QSARTrainingFailed → fall back to physico-only, log warning
            │
            ├── reinvent4_utils.build_toml(scaffold_smarts, scoring_config, n_steps) → toml_path
            │
            └── ITERATION LOOP (max n_iterations)
                  │
                  ├── [zero molecules check happens here — before convergence analysis]
                  │     └── if n_molecules == 0 → attempt escape via adjust_config
                  │           └── if still 0 after escape → exit loop with status "error"
                  │
                  ├── reinvent4_utils.run_reinvent4(toml_path, exec_path) → csv_path
                  ├── reinvent4_utils.parse_results(csv_path) → batch_results
                  ├── ConvergenceSubagent.analyze(metrics, history) → recommendation
                  ├── Claude decides: continue / reweight / escape / stop
                  └── [if reweight/escape] → reinvent4_utils.build_toml(adjusted_config) → new toml_path

          → returns {top_molecules, iteration_history, converged_status, scoring_mode_used}
```

---

## Frontend Changes

- New **"Generative Design"** toggle in the analysis config panel (off by default)
- When toggled on, sub-panel appears with:
  - Scoring mode selector: `Physicochemical` / `QSAR` / `Both`
  - Advanced options (collapsible): iterations (1–20), steps per iteration (100–5000)
- Results panel gains a new **"Generated Molecules"** tab with columns:
  - Structure (2D depiction via RDKit SVG)
  - Composite Score, QSAR Score, QED, SA Score
  - Iteration (provenance)

---

## Error Handling

| Failure | Handling |
|---|---|
| `REINVENT4_EXEC` env var not set / path not found | Fail fast before any subprocess call: return `{error: "REINVENT4_EXEC not configured"}` |
| REINVENT4 subprocess non-zero exit | Raise `Reinvent4RunFailed`; if ≥1 prior iterations completed, return partial results with `converged_status: "error"` |
| `QSARTrainingFailed` (< 10 points or R² < 0.3) | Auto-fall back to physico-only scoring; log warning in response `iteration_history` |
| Zero valid molecules after a run | Check before calling `ConvergenceSubagent`; attempt escape (one `adjust_config` call); if still zero, exit loop with `converged_status: "error"` |
| Max iterations reached without convergence | Return best molecules found, set `converged_status: "budget_exhausted"` |
| `ConvergenceSubagent` returns unparseable JSON | Log error, default to `action: "continue"` for that iteration |

---

## Testing Strategy

All tests runnable without a GPU.

| Component | Test approach |
|---|---|
| `reinvent4_utils.build_toml()` | Unit test: assert TOML output has correct keys and values for given inputs |
| `reinvent4_utils.run_reinvent4()` | Unit test with `subprocess` mocked to return fixture CSV; assert correct output path returned |
| `reinvent4_utils.parse_results()` | Unit test with fixture CSV: assert deduplication, top-N selection, canonical SMILES |
| `qsar_trainer.py` | Unit test using existing `test_data/` molecules; assert model trains and CV R² is returned |
| `ConvergenceSubagent` | Unit test with fixture metric payloads and Claude mocked; assert correct action type returned |
| `Reinvent4Agent` | Integration test: REINVENT4 subprocess mocked, full 3-iteration loop exercised end-to-end |
| Live GPU smoke test | Manual test on dev machine or AWS; not in CI |

---

## Future Modes (out of scope for this spec)

The `Reinvent4Agent` is designed to support three modes. This spec covers **scaffold decoration** only. The following will be added in separate specs:

- **De novo design with RL** — generate novel molecules guided by a scoring function derived from SAR data
- **R-group replacement / bioisostere** — targeted swap of specific R-groups for bioisosteres

`ConvergenceSubagent`, `qsar_trainer.py`, and `reinvent4_utils.py` are designed to be shared across all three modes.
