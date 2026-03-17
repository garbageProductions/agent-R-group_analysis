# REINVENT4 Scaffold Decoration Agent — Design Spec
**Date:** 2026-03-17
**Status:** Approved for implementation

---

## Overview

Add a REINVENT4-powered generative design capability to the R-group analysis pipeline. The first mode implemented is **scaffold decoration**: given a detected core scaffold, run REINVENT4 in an intelligent iterative loop that adapts based on convergence signals until the best possible R-group variants are found or the iteration budget is exhausted.

This is the first of three planned REINVENT4 modes. The architecture is explicitly designed so that de novo design and scaffold hopping can be added later with minimal structural changes.

---

## Architecture

Three new files inside `backend/agents/`, plus one utility module:

```
backend/agents/
  reinvent4_agent.py       ← supervisory loop (inherits BaseAgent)
  convergence_subagent.py  ← single-turn Claude convergence analyst
  reinvent4_utils.py       ← TOML builder, subprocess runner, result parser
  qsar_trainer.py          ← pure sklearn QSAR model (no LLM)
```

### Why `qsar_trainer.py` is not a Claude agent

QSAR training is deterministic sklearn work (Morgan fingerprints → RandomForestRegressor → pickle export). No reasoning loop is needed. Keeping it LLM-free saves API calls and latency.

### Why `ConvergenceSubagent` is a Claude agent

Per-iteration convergence decisions require judgment: is this plateau worth escaping? should we reweight vs. add diversity pressure? These are reasoning tasks that benefit from Claude rather than hard-coded thresholds.

### REINVENT4 isolation

REINVENT4 runs in its own isolated environment (separate venv or conda env on a GPU machine). The main application communicates with it exclusively via subprocess. This keeps PyTorch and model weights out of the main app's venv and makes AWS deployment straightforward — the main app and the GPU worker can run on separate instances if needed.

---

## Components

### `Reinvent4Agent` (inherits `BaseAgent`)

The outer supervisory loop. Uses the standard Claude tool-use agentic loop to drive the iteration cycle.

**Tools:**

| Tool | Purpose |
|---|---|
| `train_qsar_model` | Calls `qsar_trainer.py` — trains RF on activity data, returns model path + CV R² |
| `build_toml_config` | Writes the REINVENT4 `.toml` — scaffold SMARTS, scoring components, n_steps, output path |
| `run_reinvent4` | Subprocess call to the `reinvent` CLI in its isolated env; streams stdout to logs |
| `parse_results` | Reads REINVENT4's output CSV → top-N SMILES with scores, deduplicated |
| `analyze_convergence` | Dispatches `ConvergenceSubagent` with this iteration's metrics + full history |
| `adjust_config` | Modifies scoring weights in the current TOML based on convergence recommendations |
| `get_iteration_summary` | Returns a compact history of all iterations (scores, diversity, actions taken) — keeps Claude's context light |

**Iteration loop:**

1. Optionally train QSAR model (if activity data present and `scoring_mode` includes `qsar`)
2. Build initial TOML config
3. **Iteration loop** (configurable, default max 5 iterations):
   - Run REINVENT4
   - Parse results
   - Dispatch `ConvergenceSubagent` → receive structured recommendation
   - Claude decides action: `continue` / `reweight` / `escape` / `stop`
   - If `reweight` or `escape` → adjust config and loop again
   - If `stop` or max iterations reached → return top molecules
4. Return structured results to orchestrator

**Default iteration budget:** 5 iterations × 500 steps = 2,500 molecules generated total.

---

### `ConvergenceSubagent` (inherits `BaseAgent`, single-turn)

A focused, single-turn Claude call (no tool loop). Receives a compact metrics payload and returns a structured JSON decision.

**Input payload:**
```json
{
  "iteration": 3,
  "current": {
    "mean_score": 0.61,
    "top10_score": 0.78,
    "diversity": 0.42
  },
  "history": [
    { "iteration": 1, "mean_score": 0.51, "diversity": 0.71 },
    { "iteration": 2, "mean_score": 0.60, "diversity": 0.55 }
  ],
  "scoring_weights": { "qsar": 0.6, "qed": 0.3, "sa_score": 0.1 }
}
```

**States it detects:**

| State | Condition | Recommended action |
|---|---|---|
| `improving` | Score rising, diversity healthy | `continue` |
| `plateau` | Score delta < threshold for 2+ iterations | `escape` (increase diversity weight / sigma) |
| `collapsed` | Diversity < 0.3 | `reweight` (reduce exploitation, boost diversity) |
| `converged` | Top-10 score stable + high | `stop` |

**Output:**
```json
{
  "status": "plateau",
  "action": "escape",
  "rationale": "Mean score has not improved in 2 iterations and diversity is declining.",
  "suggested_adjustments": { "sigma": 120, "diversity_weight": 0.2 }
}
```

---

### `qsar_trainer.py` (utility class, no LLM)

Trains a scikit-learn model on the uploaded dataset when activity data is present.

- **Features:** Morgan fingerprints (radius 2, 2048 bits) via RDKit
- **Model:** `RandomForestRegressor` with 5-fold cross-validation
- **Output:** serialized model (pickle), CV R², and a REINVENT4-compatible scoring component config dict
- **Fallback:** if fewer than 10 data points or CV R² < 0.3, logs a warning and signals the caller to fall back to physicochemical-only scoring

---

### `reinvent4_utils.py` (pure utilities)

Three focused functions:

- **`build_toml(scaffold_smarts, scoring_config, n_steps, output_dir) → Path`** — assembles and writes the REINVENT4 TOML config file
- **`run_reinvent4(toml_path, exec_path) → Path`** — subprocess call, captures stdout/stderr, returns path to output CSV
- **`parse_results(csv_path, top_n=50) → List[dict]`** — reads SMILES + composite scores, deduplicates, returns top N

---

## Data Flow

```
OrchestratorAgent.run_full_pipeline()
  └── [if run_generative and core detected]
      └── Reinvent4Agent.run(core_smarts, sar_data, properties, generative_config)
            │
            ├── [if scoring_mode includes "qsar"]
            │     └── qsar_trainer.train(activity_data) → model_path, cv_r2
            │
            ├── reinvent4_utils.build_toml(...) → toml_path
            │
            └── ITERATION LOOP (max n_iterations)
                  ├── reinvent4_utils.run_reinvent4(toml_path) → csv_path
                  ├── reinvent4_utils.parse_results(csv_path) → batch_results
                  ├── ConvergenceSubagent.run(metrics, history) → recommendation
                  ├── Claude decides: continue / reweight / escape / stop
                  └── [if reweight/escape] → reinvent4_utils.build_toml(adjusted_config)

          → returns { top_molecules, iteration_history, converged, scoring_mode_used }
```

---

## API Changes

### Request body additions (existing `/analyze` endpoint)

```python
run_generative: bool = False          # opt-in, defaults off
generative_config: Optional[GenerativeConfig] = None
```

```python
class GenerativeConfig(BaseModel):
    scoring_mode: Literal["physico", "qsar", "both"] = "both"
    n_iterations: int = 5
    n_steps: int = 500
    reinvent4_exec: Optional[str] = None  # overrides REINVENT4_EXEC env var
```

### Environment variable

```
REINVENT4_EXEC=/opt/reinvent4/venv/bin/reinvent
```

Default path; overridable per-request via `generative_config.reinvent4_exec`.

### Response additions

The existing response gains a new optional field:
```json
"generative": {
  "top_molecules": [...],
  "iteration_history": [...],
  "converged": true,
  "scoring_mode_used": "both",
  "did_not_converge": false
}
```

---

## Frontend Changes

- New **"Generative Design"** toggle in the analysis config panel (off by default)
- When toggled on: sub-panel appears with:
  - Scoring mode selector: `Physicochemical` / `QSAR` / `Both`
  - Advanced options (collapsible): iterations, steps per iteration
- Results panel gains a new **"Generated Molecules"** tab showing top molecules with scores and iteration provenance

---

## Error Handling

| Failure | Handling |
|---|---|
| REINVENT4 executable not found | Fail fast: `"REINVENT4_EXEC not found — check env config"` |
| REINVENT4 subprocess crashes | Capture stderr, return partial results if any iterations completed |
| QSAR training fails (too few points, low R²) | Auto-fall back to physico-only scoring, log warning in response |
| Zero valid molecules in an iteration | ConvergenceSubagent flags `collapsed`; outer agent attempts escape; if still zero → stop with error |
| Max iterations reached without convergence | Return best molecules found, set `"did_not_converge": true` in response |

---

## Testing Strategy

All tests runnable without a GPU.

| Component | Test approach |
|---|---|
| `reinvent4_utils.py` | Unit tests with mock subprocess + pre-baked CSV fixtures |
| `qsar_trainer.py` | Unit tests using existing `test_data/` molecules |
| `ConvergenceSubagent` | Unit tests with fixture metric payloads; assert correct action returned |
| `Reinvent4Agent` | Integration test with REINVENT4 mocked as subprocess returning fixture CSVs; full loop runs end-to-end |
| Live GPU smoke test | Manual test on dev machine or AWS; not in CI |

---

## Future Modes (out of scope for this spec)

The `Reinvent4Agent` is designed to support three modes. This spec covers **scaffold decoration** only. The following will be added in separate specs:

- **De novo design with RL** — generate novel molecules guided by a scoring function derived from SAR data
- **R-group replacement / bioisostere** — targeted swap of specific R-groups for bioisosteres

The `ConvergenceSubagent`, `qsar_trainer.py`, and `reinvent4_utils.py` are shared across all three modes.
