# REINVENT4 Scaffold Decoration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a REINVENT4-powered scaffold decoration agent that iterates intelligently, detects convergence/minima, and adapts its scoring strategy — integrated into the existing R-group analysis pipeline.

**Architecture:** `Reinvent4Agent` (inherits `BaseAgent`) is the outer supervisory loop using Claude tool-use to drive iterations. `ConvergenceSubagent` is a plain class making a single `client.messages.create()` call per iteration to reason about convergence. `QSARTrainer` and `reinvent4_utils` are pure-Python utility modules in `backend/utils/`.

**Tech Stack:** Python 3.12, FastAPI, Anthropic SDK, scikit-learn, joblib, RDKit, pytest + unittest.mock, React (inline styles)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `tests/__init__.py` | Create | Makes tests a package |
| `tests/conftest.py` | Create | Shared pytest fixtures |
| `tests/fixtures/sample_reinvent4_output.csv` | Create | Mock REINVENT4 output for tests |
| `backend/utils/qsar_trainer.py` | Create | Morgan FP → RF model, CV, joblib export |
| `backend/utils/reinvent4_utils.py` | Create | TOML builder, subprocess runner, CSV parser |
| `backend/agents/convergence_subagent.py` | Create | Plain class, single Claude API call |
| `backend/agents/reinvent4_agent.py` | Create | Supervisory tool-use loop |
| `tests/test_qsar_trainer.py` | Create | QSARTrainer unit tests |
| `tests/test_reinvent4_utils.py` | Create | reinvent4_utils unit tests |
| `tests/test_convergence_subagent.py` | Create | ConvergenceSubagent unit tests |
| `tests/test_reinvent4_agent.py` | Create | Reinvent4Agent integration tests |
| `backend/api/routes/analyze.py` | Modify | Add `GenerativeConfig`, new fields on `AnalysisRequest`, pass through pipeline |
| `backend/agents/orchestrator.py` | Modify | Add `run_generative` + `generative_config` params, call `Reinvent4Agent` after SAR |
| `frontend/src/api.js` | Modify | Pass `runGenerative` + `generativeConfig` in `startAnalysis` |
| `frontend/src/pages/ConfigPage.jsx` | Modify | Add generative toggle + scoring mode sub-panel |
| `frontend/src/components/GeneratedMoleculesPanel.jsx` | Create | Table of top generated molecules with scores |
| `frontend/src/pages/ResultsPage.jsx` | Modify | Add "Generated" tab + import new panel |

---

## Chunk 1: Foundation Utilities

### Task 1: Test infrastructure setup

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/fixtures/sample_reinvent4_output.csv`

- [ ] **Step 1: Create test package init**

```bash
touch tests/__init__.py
```

- [ ] **Step 2: Create conftest.py**

Create `tests/conftest.py`:

```python
"""Shared pytest fixtures for REINVENT4 tests."""

import csv
import io
from pathlib import Path

import pytest


SAMPLE_SMILES = [
    "O=C(Cc1ccccc1)Nc1ccccc1",
    "O=C(Cc1ccc(F)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(Cl)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(Br)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(C)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(OC)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CF)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CN)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CC)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CF)cc1)Nc1ccc(F)cc1",
    "O=C(Cc1ccc(Cl)cc1)Nc1ccc(Cl)cc1",
    "O=C(Cc1ccc(Br)cc1)Nc1ccc(F)cc1",
]

SAMPLE_ACTIVITY = [6.0, 6.8, 7.2, 7.1, 6.5, 6.3, 6.9, 6.1, 6.4, 7.5, 7.3, 7.0]


@pytest.fixture
def sample_smiles():
    return SAMPLE_SMILES.copy()


@pytest.fixture
def sample_activity():
    return SAMPLE_ACTIVITY.copy()


@pytest.fixture
def tmp_output_dir(tmp_path):
    out = tmp_path / "reinvent_output"
    out.mkdir()
    return out


@pytest.fixture
def sample_csv_path():
    return Path(__file__).parent / "fixtures" / "sample_reinvent4_output.csv"
```

- [ ] **Step 3: Create fixture CSV**

Create `tests/fixtures/sample_reinvent4_output.csv`:

```csv
SMILES,Score,scaffold_decoration,qed_score,sa_score,Step
O=C(Cc1ccc(F)cc1)Nc1ccc(Cl)cc1,0.82,1.0,0.88,0.75,10
O=C(Cc1ccc(Cl)cc1)Nc1ccc(F)cc1,0.79,1.0,0.85,0.72,15
O=C(Cc1ccc(Br)cc1)Nc1ccc(Cl)cc1,0.77,1.0,0.81,0.70,20
O=C(Cc1ccc(F)cc1)Nc1ccc(F)cc1,0.76,1.0,0.90,0.68,25
O=C(Cc1ccc(F)cc1)Nc1ccc(C)cc1,0.74,1.0,0.87,0.71,30
O=C(Cc1ccc(C)cc1)Nc1ccc(F)cc1,0.73,1.0,0.86,0.69,35
O=C(Cc1ccc(Cl)cc1)Nc1ccc(Cl)cc1,0.72,1.0,0.80,0.74,40
O=C(Cc1ccc(Br)cc1)Nc1ccc(F)cc1,0.71,1.0,0.82,0.66,45
O=C(Cc1ccc(F)cc1)Nc1ccc(Br)cc1,0.70,1.0,0.83,0.67,50
O=C(Cc1ccc(Cl)cc1)Nc1ccc(Br)cc1,0.69,1.0,0.79,0.73,55
```

- [ ] **Step 4: Verify test infrastructure works**

```bash
cd /home/jlaureanti85/agent-R-group-analysis && python -m pytest tests/ --collect-only
```

Expected: `0 tests collected` (no tests yet, no errors)

- [ ] **Step 5: Commit**

```bash
git add tests/ && git commit -m "feat: add test infrastructure for REINVENT4 agent"
```

---

### Task 2: QSARTrainer

**Files:**
- Create: `backend/utils/qsar_trainer.py`
- Create: `tests/test_qsar_trainer.py`

- [ ] **Step 1: Write failing tests first**

Create `tests/test_qsar_trainer.py`:

```python
"""Unit tests for QSARTrainer."""

import pytest
from pathlib import Path
from unittest.mock import patch

from backend.utils.qsar_trainer import QSARTrainer, QSARTrainingFailed


class TestQSARTrainerHappyPath:
    def test_train_returns_model_path(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert "model_path" in result
        assert Path(result["model_path"]).exists()

    def test_model_path_is_pkl(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert str(result["model_path"]).endswith(".pkl")

    def test_train_returns_cv_r2(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert "cv_r2" in result
        assert isinstance(result["cv_r2"], float)
        assert -1.0 <= result["cv_r2"] <= 1.0

    def test_train_returns_scoring_component_config(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert "scoring_component_config" in result
        cfg = result["scoring_component_config"]
        assert "model_path" in cfg
        assert "weight" in cfg
        assert "name" in cfg

    def test_scoring_config_model_path_matches_model_file(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert result["scoring_component_config"]["model_path"] == str(result["model_path"])


class TestQSARTrainerFallback:
    def test_raises_when_too_few_samples(self, tmp_output_dir):
        trainer = QSARTrainer()
        few_smiles = ["O=C(Cc1ccccc1)Nc1ccccc1"] * 5
        few_activity = [6.0] * 5
        with pytest.raises(QSARTrainingFailed) as exc_info:
            trainer.train(few_smiles, few_activity, tmp_output_dir)
        assert "too few" in str(exc_info.value).lower()

    def test_raises_when_low_r2(self, tmp_output_dir):
        trainer = QSARTrainer()
        # Identical SMILES → zero variance in features → R² will be ~0
        smiles = ["O=C(Cc1ccccc1)Nc1ccccc1"] * 15
        activity = list(range(15))  # Random activity, no FP signal
        with pytest.raises(QSARTrainingFailed) as exc_info:
            trainer.train(smiles, activity, tmp_output_dir)
        assert "r2" in str(exc_info.value).lower()
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
python -m pytest tests/test_qsar_trainer.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'backend.utils.qsar_trainer'`

- [ ] **Step 3: Implement QSARTrainer**

Create `backend/utils/qsar_trainer.py`:

```python
"""
QSAR model trainer for REINVENT4 scoring integration.
Trains a RandomForestRegressor on Morgan fingerprints.
No LLM involved — pure sklearn.
"""

import logging
from pathlib import Path
from typing import Dict, List, Any

import joblib
import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score

logger = logging.getLogger(__name__)

CV_FOLDS = 5
MIN_SAMPLES = 10
MIN_R2 = 0.3
FP_RADIUS = 2
FP_NBITS = 2048


class QSARTrainingFailed(Exception):
    """Raised when QSAR training cannot produce a usable model."""


class QSARTrainer:
    """
    Trains a RandomForestRegressor QSAR model and exports it for use
    as a REINVENT4 predictive_property scoring component.
    """

    def train(
        self,
        smiles: List[str],
        activity: List[float],
        output_dir: Path,
    ) -> Dict[str, Any]:
        """
        Train a QSAR model and export it.

        Args:
            smiles:      List of SMILES strings (training set)
            activity:    Corresponding activity values (same length)
            output_dir:  Directory to write qsar_model.pkl

        Returns:
            {model_path, cv_r2, scoring_component_config}

        Raises:
            QSARTrainingFailed: if dataset is too small or model quality is insufficient
        """
        if len(smiles) < MIN_SAMPLES:
            raise QSARTrainingFailed(
                f"Too few training samples: {len(smiles)} < {MIN_SAMPLES} required"
            )

        X = self._smiles_to_fingerprints(smiles)
        y = np.array(activity, dtype=float)

        model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
        cv_scores = cross_val_score(model, X, y, cv=CV_FOLDS, scoring="r2")
        cv_r2 = float(np.mean(cv_scores))

        if cv_r2 < MIN_R2:
            raise QSARTrainingFailed(
                f"R2 too low for reliable scoring: cv_r2={cv_r2:.3f} < {MIN_R2} threshold"
            )

        # Fit on full dataset before export
        model.fit(X, y)

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        model_path = output_dir / "qsar_model.pkl"
        joblib.dump(model, model_path)
        logger.info(f"QSAR model saved to {model_path} (cv_r2={cv_r2:.3f})")

        scoring_component_config = {
            "name": "qsar_activity",
            "model_path": str(model_path),
            "weight": 0.6,
            "type": "predictive_property",
        }

        return {
            "model_path": model_path,
            "cv_r2": cv_r2,
            "scoring_component_config": scoring_component_config,
        }

    def _smiles_to_fingerprints(self, smiles: List[str]) -> np.ndarray:
        fps = []
        for smi in smiles:
            mol = Chem.MolFromSmiles(smi)
            if mol is None:
                fps.append(np.zeros(FP_NBITS, dtype=np.uint8))
                continue
            fp = AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_NBITS)
            fps.append(np.array(fp, dtype=np.uint8))
        return np.vstack(fps)
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
python -m pytest tests/test_qsar_trainer.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/utils/qsar_trainer.py tests/test_qsar_trainer.py && git commit -m "feat: add QSARTrainer utility with Morgan FP + RandomForest"
```

---

### Task 3: reinvent4_utils — build_toml

**Files:**
- Create: `backend/utils/reinvent4_utils.py` (partial)
- Create: `tests/test_reinvent4_utils.py` (partial)

- [ ] **Step 1: Write failing tests for build_toml**

Create `tests/test_reinvent4_utils.py`:

```python
"""Unit tests for reinvent4_utils."""

import csv
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch, call
import pytest

from backend.utils.reinvent4_utils import (
    build_toml,
    run_reinvent4,
    parse_results,
    Reinvent4RunFailed,
)


# ── build_toml ────────────────────────────────────────────────────────────────

class TestBuildToml:
    def test_creates_toml_file(self, tmp_output_dir):
        path = build_toml(
            scaffold_smarts="[*:1]c1ccccc1[*:2]",
            scoring_config={"components": []},
            n_steps=500,
            output_dir=tmp_output_dir,
        )
        assert path.exists()
        assert path.suffix == ".toml"

    def test_toml_contains_scaffold_smarts(self, tmp_output_dir):
        smarts = "[*:1]c1ccccc1[*:2]"
        path = build_toml(smarts, {"components": []}, 500, tmp_output_dir)
        content = path.read_text()
        assert smarts in content

    def test_toml_contains_n_steps(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 250, tmp_output_dir)
        content = path.read_text()
        assert "250" in content

    def test_toml_contains_sigma(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir, sigma=120)
        content = path.read_text()
        assert "sigma = 120" in content

    def test_toml_contains_diversity_filter(self, tmp_output_dir):
        path = build_toml(
            "[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir,
            diversity_filter="ScaffoldSimilarity"
        )
        content = path.read_text()
        assert "ScaffoldSimilarity" in content

    def test_toml_contains_qsar_component_when_provided(self, tmp_output_dir):
        scoring_config = {
            "components": [
                {"type": "qsar_activity", "weight": 0.6, "model_path": "/tmp/model.pkl"}
            ]
        }
        path = build_toml("[*:1]c1ccccc1", scoring_config, 500, tmp_output_dir)
        content = path.read_text()
        assert "/tmp/model.pkl" in content

    def test_toml_always_contains_qed_component(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir)
        content = path.read_text()
        assert "qed" in content.lower()

    def test_toml_always_contains_sa_score_component(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir)
        content = path.read_text()
        assert "sa_score" in content.lower()

    def test_default_sigma_is_100(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir)
        content = path.read_text()
        assert "sigma = 100" in content

    def test_default_diversity_filter(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir)
        content = path.read_text()
        assert "IdenticalMurckoScaffold" in content
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
python -m pytest tests/test_reinvent4_utils.py::TestBuildToml -v 2>&1 | head -15
```

Expected: `ModuleNotFoundError: No module named 'backend.utils.reinvent4_utils'`

- [ ] **Step 3: Implement build_toml**

Create `backend/utils/reinvent4_utils.py`:

```python
"""
REINVENT4 utilities: TOML config builder, subprocess runner, result parser.
These are pure-Python utilities — no LLM involved.
"""

import csv
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from rdkit import Chem

logger = logging.getLogger(__name__)


class Reinvent4RunFailed(Exception):
    """Raised when the REINVENT4 subprocess exits with a non-zero code."""

    def __init__(self, stderr: str = "", returncode: int = -1):
        self.stderr = stderr
        self.returncode = returncode
        super().__init__(f"REINVENT4 failed (exit {returncode}): {stderr[:500]}")


def build_toml(
    scaffold_smarts: str,
    scoring_config: Dict[str, Any],
    n_steps: int,
    output_dir: Path,
    sigma: int = 100,
    diversity_filter: str = "IdenticalMurckoScaffold",
) -> Path:
    """
    Write a REINVENT4 scaffold decoration TOML config file.

    Args:
        scaffold_smarts:  SMARTS string with attachment points [*:1], [*:2], ...
        scoring_config:   Dict with key "components" — list of scoring component dicts.
                          Each component: {type, weight, model_path (optional)}
        n_steps:          Number of REINVENT4 sampling steps
        output_dir:       Directory to write reinvent4_config.toml
        sigma:            REINVENT4 sigma parameter (exploitation sharpness)
        diversity_filter: REINVENT4 diversity filter name

    Returns:
        Path to the written TOML file
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build scoring components section
    components_toml = _build_scoring_components(scaffold_smarts, scoring_config)

    toml_content = f"""[parameters]
  use_checkpoint = false
  n_steps = {n_steps}
  sigma = {sigma}

[diversity_filter]
  name = "{diversity_filter}"
  bucket_size = 25
  minscore = 0.4

[[stage]]
  max_score = 1.0

  [stage.scoring]
    type = "arithmetic_mean"
{components_toml}
"""

    toml_path = output_dir / "reinvent4_config.toml"
    toml_path.write_text(toml_content)
    logger.info(f"REINVENT4 TOML written to {toml_path}")
    return toml_path


def _build_scoring_components(scaffold_smarts: str, scoring_config: Dict[str, Any]) -> str:
    """Build the [[stage.scoring.component]] blocks as a TOML string."""
    lines = []

    # Always include scaffold decoration component
    lines.append("    [[stage.scoring.component]]")
    lines.append("      [stage.scoring.component.scaffold_decoration]")
    lines.append('        name = "scaffold"')
    lines.append("        weight = 1.0")
    lines.append("        [[stage.scoring.component.scaffold_decoration.endpoint]]")
    lines.append('          name = "scaffold_smarts"')
    lines.append(f'          smarts = "{scaffold_smarts}"')
    lines.append("")

    # Add QSAR component if provided
    for comp in scoring_config.get("components", []):
        if comp.get("type") == "qsar_activity":
            lines.append("    [[stage.scoring.component]]")
            lines.append("      [stage.scoring.component.predictive_property]")
            lines.append(f'        name = "qsar_activity"')
            lines.append(f'        weight = {comp.get("weight", 0.6)}')
            lines.append("        [[stage.scoring.component.predictive_property.endpoint]]")
            lines.append('          name = "model"')
            lines.append(f'          path = "{comp["model_path"]}"')
            lines.append('          scikit-learn = true')
            lines.append("")

    # Always include QED
    qed_weight = next(
        (c.get("weight", 0.3) for c in scoring_config.get("components", []) if c.get("type") == "qed"),
        0.3
    )
    lines.append("    [[stage.scoring.component]]")
    lines.append("      [stage.scoring.component.qed_score]")
    lines.append('        name = "qed"')
    lines.append(f"        weight = {qed_weight}")
    lines.append("")

    # Always include SA score
    sa_weight = next(
        (c.get("weight", 0.1) for c in scoring_config.get("components", []) if c.get("type") == "sa_score"),
        0.1
    )
    lines.append("    [[stage.scoring.component]]")
    lines.append("      [stage.scoring.component.sa_score]")
    lines.append('        name = "sa_score"')
    lines.append(f"        weight = {sa_weight}")

    return "\n".join(lines)
```

- [ ] **Step 4: Run build_toml tests — confirm they pass**

```bash
python -m pytest tests/test_reinvent4_utils.py::TestBuildToml -v
```

Expected: All 10 tests PASS

- [ ] **Step 5: Commit build_toml**

```bash
git add backend/utils/reinvent4_utils.py tests/test_reinvent4_utils.py && git commit -m "feat: add reinvent4_utils build_toml"
```

---

### Task 4: reinvent4_utils — run_reinvent4 and parse_results

**Files:**
- Modify: `backend/utils/reinvent4_utils.py` (add two functions)
- Modify: `tests/test_reinvent4_utils.py` (add two test classes)

- [ ] **Step 1: Add failing tests for run_reinvent4 and parse_results**

Append to `tests/test_reinvent4_utils.py`:

```python

# ── run_reinvent4 ─────────────────────────────────────────────────────────────

class TestRunReinvent4:
    def test_calls_subprocess_with_correct_args(self, tmp_output_dir):
        toml_path = tmp_output_dir / "config.toml"
        toml_path.write_text("[parameters]\n  n_steps = 10\n")

        # Create the expected output file so parse doesn't fail
        results_dir = tmp_output_dir / "results"
        results_dir.mkdir()
        csv_path = results_dir / "scaffold_decoration.csv"
        csv_path.write_text("SMILES,Score,Step\nCCO,0.5,1\n")

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = ""
        mock_result.stderr = ""

        with patch("backend.utils.reinvent4_utils.subprocess.run", return_value=mock_result) as mock_run:
            run_reinvent4(toml_path, exec_path="/opt/reinvent4/venv/bin/reinvent")
            mock_run.assert_called_once_with(
                ["/opt/reinvent4/venv/bin/reinvent", "-i", str(toml_path)],
                capture_output=True,
                text=True,
            )

    def test_returns_output_csv_path(self, tmp_output_dir):
        toml_path = tmp_output_dir / "config.toml"
        toml_path.write_text("[parameters]\n  n_steps = 10\n")
        results_dir = tmp_output_dir / "results"
        results_dir.mkdir()
        csv_path = results_dir / "scaffold_decoration.csv"
        csv_path.write_text("SMILES,Score,Step\nCCO,0.5,1\n")

        mock_result = MagicMock(returncode=0, stdout="", stderr="")
        with patch("backend.utils.reinvent4_utils.subprocess.run", return_value=mock_result):
            returned = run_reinvent4(toml_path, exec_path="/fake/reinvent")
            assert returned == csv_path

    def test_raises_on_nonzero_exit(self, tmp_output_dir):
        toml_path = tmp_output_dir / "config.toml"
        toml_path.write_text("")
        mock_result = MagicMock(returncode=1, stdout="", stderr="CUDA error: device not found")
        with patch("backend.utils.reinvent4_utils.subprocess.run", return_value=mock_result):
            with pytest.raises(Reinvent4RunFailed) as exc_info:
                run_reinvent4(toml_path, exec_path="/fake/reinvent")
            assert "CUDA error" in str(exc_info.value)


# ── parse_results ─────────────────────────────────────────────────────────────

class TestParseResults:
    def test_returns_list_of_dicts(self, sample_csv_path):
        results = parse_results(sample_csv_path)
        assert isinstance(results, list)
        assert len(results) > 0
        assert isinstance(results[0], dict)

    def test_result_has_required_keys(self, sample_csv_path):
        results = parse_results(sample_csv_path)
        required = {"smiles", "canonical_smiles", "composite_score", "qsar_score", "qed", "sa_score", "step", "iteration"}
        assert required.issubset(results[0].keys())

    def test_deduplicates_by_canonical_smiles(self, tmp_output_dir):
        # Both rows are the same molecule (canonical form matches)
        csv_path = tmp_output_dir / "dupes.csv"
        csv_path.write_text(
            "SMILES,Score,Step\n"
            "O=C(Cc1ccc(F)cc1)Nc1ccccc1,0.8,10\n"
            "O=C(Cc1ccc(F)cc1)Nc1ccccc1,0.7,20\n"  # duplicate
        )
        results = parse_results(csv_path)
        canonical_smiles = [r["canonical_smiles"] for r in results]
        assert len(canonical_smiles) == len(set(canonical_smiles))

    def test_sorted_by_score_descending(self, sample_csv_path):
        results = parse_results(sample_csv_path)
        scores = [r["composite_score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_top_n_respected(self, sample_csv_path):
        results = parse_results(sample_csv_path, top_n=3)
        assert len(results) <= 3

    def test_handles_missing_optional_score_columns(self, tmp_output_dir):
        csv_path = tmp_output_dir / "minimal.csv"
        csv_path.write_text("SMILES,Score,Step\nCCO,0.5,1\nCCCO,0.6,2\n")
        results = parse_results(csv_path)
        assert len(results) == 2
        assert results[0]["composite_score"] == pytest.approx(0.6)
```

- [ ] **Step 2: Run new tests — confirm they fail**

```bash
python -m pytest tests/test_reinvent4_utils.py::TestRunReinvent4 tests/test_reinvent4_utils.py::TestParseResults -v 2>&1 | head -20
```

Expected: `ImportError` or `AttributeError` — functions not yet implemented

- [ ] **Step 3: Implement run_reinvent4 and parse_results**

Append to `backend/utils/reinvent4_utils.py`:

```python

def run_reinvent4(toml_path: Path, exec_path: str) -> Path:
    """
    Invoke the REINVENT4 CLI subprocess.

    Args:
        toml_path:  Path to the REINVENT4 TOML config file
        exec_path:  Path to the reinvent executable (from REINVENT4_EXEC env var)

    Returns:
        Path to the output CSV file

    Raises:
        Reinvent4RunFailed: on non-zero subprocess exit
    """
    toml_path = Path(toml_path)
    result = subprocess.run(
        [exec_path, "-i", str(toml_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise Reinvent4RunFailed(stderr=result.stderr, returncode=result.returncode)

    output_csv = toml_path.parent / "results" / "scaffold_decoration.csv"
    logger.info(f"REINVENT4 completed. Output: {output_csv}")
    return output_csv


def parse_results(csv_path: Path, top_n: int = 50) -> List[Dict[str, Any]]:
    """
    Parse REINVENT4 output CSV into a deduplicated, sorted list.

    Columns expected: SMILES, Score, [optional: per-component scores], Step

    Args:
        csv_path:  Path to REINVENT4 output CSV
        top_n:     Maximum number of results to return (by composite Score)

    Returns:
        List of dicts sorted by composite_score descending, deduplicated by
        canonical SMILES.  Each dict: {smiles, canonical_smiles, composite_score,
        qsar_score, qed, sa_score, step}
    """
    csv_path = Path(csv_path)
    rows = []

    with csv_path.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            smiles = row.get("SMILES", "").strip()
            if not smiles:
                continue
            mol = Chem.MolFromSmiles(smiles)
            canonical = Chem.MolToSmiles(mol) if mol else smiles

            try:
                score = float(row.get("Score", 0.0))
            except (ValueError, TypeError):
                score = 0.0

            rows.append({
                "smiles": smiles,
                "canonical_smiles": canonical,
                "composite_score": score,
                "qsar_score": _safe_float(row.get("predictive_property") or row.get("qsar_score")),
                "qed": _safe_float(row.get("qed_score") or row.get("qed")),
                "sa_score": _safe_float(row.get("sa_score")),
                "step": _safe_int(row.get("Step")),
                "iteration": None,  # Filled in by Reinvent4Agent after parse
            })

    # Deduplicate by canonical SMILES — keep highest score
    seen: Dict[str, Dict] = {}
    for row in rows:
        key = row["canonical_smiles"]
        if key not in seen or row["composite_score"] > seen[key]["composite_score"]:
            seen[key] = row

    sorted_results = sorted(seen.values(), key=lambda r: r["composite_score"], reverse=True)
    return sorted_results[:top_n]


def _safe_float(val) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def _safe_int(val) -> int:
    try:
        return int(val) if val is not None else 0
    except (ValueError, TypeError):
        return 0
```

- [ ] **Step 4: Run all reinvent4_utils tests**

```bash
python -m pytest tests/test_reinvent4_utils.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/utils/reinvent4_utils.py tests/test_reinvent4_utils.py tests/fixtures/ && git commit -m "feat: add reinvent4_utils run_reinvent4 and parse_results"
```

---

## Chunk 2: ConvergenceSubagent

### Task 5: ConvergenceSubagent

**Files:**
- Create: `backend/agents/convergence_subagent.py`
- Create: `tests/test_convergence_subagent.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_convergence_subagent.py`:

```python
"""Unit tests for ConvergenceSubagent."""

import json
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.convergence_subagent import ConvergenceSubagent


def _make_claude_response(json_dict: dict) -> MagicMock:
    """Build a mock Anthropic Messages response returning the given dict as text."""
    block = MagicMock()
    block.text = json.dumps(json_dict)
    response = MagicMock()
    response.content = [block]
    return response


@pytest.fixture
def mock_client():
    client = MagicMock()
    return client


@pytest.fixture
def subagent(mock_client):
    return ConvergenceSubagent(client=mock_client)


@pytest.fixture
def improving_metrics():
    return {
        "iteration": 2,
        "mean_score": 0.65,
        "top10_score": 0.80,
        "internal_diversity": 0.60,
        "n_molecules": 450,
    }


@pytest.fixture
def plateau_history():
    return [
        {"iteration": 1, "mean_score": 0.60, "top10_score": 0.74, "internal_diversity": 0.65},
        {"iteration": 2, "mean_score": 0.61, "top10_score": 0.75, "internal_diversity": 0.58},
    ]


class TestConvergenceSubagentInterface:
    def test_analyze_returns_dict(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving",
            "action": "continue",
            "rationale": "Scores are rising steadily.",
            "suggested_adjustments": {},
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert isinstance(result, dict)

    def test_analyze_calls_messages_create_once(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "converged", "action": "stop", "rationale": "done", "suggested_adjustments": {}
        })
        subagent.analyze(improving_metrics, plateau_history)
        mock_client.messages.create.assert_called_once()

    def test_result_has_status_field(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving", "action": "continue", "rationale": "ok", "suggested_adjustments": {}
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert "status" in result

    def test_result_has_action_field(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "plateau", "action": "escape", "rationale": "stuck", "suggested_adjustments": {"sigma": 120}
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert "action" in result

    def test_result_has_suggested_adjustments_field(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "low_diversity", "action": "reweight", "rationale": "collapsed",
            "suggested_adjustments": {"diversity_filter": "ScaffoldSimilarity"}
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert "suggested_adjustments" in result


class TestConvergenceSubagentFallback:
    def test_returns_continue_on_bad_json(self, subagent, mock_client, improving_metrics, plateau_history):
        """When Claude returns unparseable JSON, default to continue."""
        block = MagicMock()
        block.text = "NOT VALID JSON {{{{"
        mock_client.messages.create.return_value = MagicMock(content=[block])
        result = subagent.analyze(improving_metrics, plateau_history)
        assert result["action"] == "continue"

    def test_passes_metrics_and_history_in_message(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving", "action": "continue", "rationale": "ok", "suggested_adjustments": {}
        })
        subagent.analyze(improving_metrics, plateau_history)
        call_kwargs = mock_client.messages.create.call_args
        user_message = call_kwargs.kwargs["messages"][0]["content"]
        payload = json.loads(user_message)
        assert payload["metrics"]["iteration"] == improving_metrics["iteration"]
        assert len(payload["history"]) == len(plateau_history)

    def test_uses_correct_max_tokens(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving", "action": "continue", "rationale": "ok", "suggested_adjustments": {}
        })
        subagent.analyze(improving_metrics, plateau_history)
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs.kwargs["max_tokens"] == 1024
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
python -m pytest tests/test_convergence_subagent.py -v 2>&1 | head -15
```

Expected: `ModuleNotFoundError: No module named 'backend.agents.convergence_subagent'`

- [ ] **Step 3: Implement ConvergenceSubagent**

Create `backend/agents/convergence_subagent.py`:

```python
"""
ConvergenceSubagent: single-turn Claude call to analyze REINVENT4 iteration metrics.

This is NOT a BaseAgent subclass. It makes exactly one client.messages.create()
call per invocation — no tool loop, no multi-turn cycle.
"""

import json
import logging
from typing import Any, Dict, List

import anthropic

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-4-6"

CONVERGENCE_SYSTEM_PROMPT = """You are an expert in generative chemistry optimization analysis.

You will receive JSON containing:
- "metrics": current iteration statistics (mean_score, top10_score, internal_diversity, n_molecules, iteration)
- "history": list of previous iteration statistics

Your job is to analyze whether the REINVENT4 scaffold decoration optimization is:
- improving: scores rising, diversity healthy — action: "continue"
- plateau: mean score barely changing (<~0.02 delta) for 2+ iterations — action: "escape"
- low_diversity: internal Tanimoto diversity below ~0.3 — action: "reweight"
- converged: top-10 score is stable and high (>0.75) — action: "stop"

Respond ONLY with valid JSON in this exact format:
{
  "status": "improving" | "plateau" | "low_diversity" | "converged",
  "action": "continue" | "escape" | "reweight" | "stop",
  "rationale": "<one sentence explanation>",
  "suggested_adjustments": {
    "sigma": <int, optional — increase for escape>,
    "diversity_filter": "<string, optional>",
    "qsar_weight": <float, optional>,
    "qed_weight": <float, optional>,
    "sa_score_weight": <float, optional>
  }
}

No explanation outside the JSON. No markdown fences. Raw JSON only."""


class ConvergenceSubagent:
    """
    Analyzes per-iteration REINVENT4 metrics and recommends the next action.
    Makes a single Claude API call per invocation.
    """

    def __init__(self, client: anthropic.Anthropic, model: str = DEFAULT_MODEL):
        self.client = client
        self.model = model

    def analyze(
        self,
        metrics: Dict[str, Any],
        history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Analyze convergence for the current iteration.

        Args:
            metrics:  Current iteration stats dict
            history:  List of previous iteration stats dicts

        Returns:
            Dict with keys: status, action, rationale, suggested_adjustments
            Falls back to {"action": "continue", ...} if Claude returns unparseable JSON.
        """
        payload = json.dumps({"metrics": metrics, "history": history})

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=CONVERGENCE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": payload}],
            )
            text = response.content[0].text
            return json.loads(text)
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"ConvergenceSubagent returned unparseable response: {e}. Defaulting to continue.")
            return {
                "status": "improving",
                "action": "continue",
                "rationale": "Could not parse convergence analysis — defaulting to continue.",
                "suggested_adjustments": {},
            }
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
python -m pytest tests/test_convergence_subagent.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/agents/convergence_subagent.py tests/test_convergence_subagent.py && git commit -m "feat: add ConvergenceSubagent (single-turn Claude convergence analysis)"
```

---

## Chunk 3: Reinvent4Agent

### Task 6: Reinvent4Agent implementation

**Files:**
- Create: `backend/agents/reinvent4_agent.py`
- Create: `tests/test_reinvent4_agent.py`

- [ ] **Step 1: Write failing integration tests**

Create `tests/test_reinvent4_agent.py`:

```python
"""Integration tests for Reinvent4Agent. All REINVENT4 subprocess calls are mocked."""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

from backend.agents.reinvent4_agent import Reinvent4Agent
from backend.api.routes.analyze import GenerativeConfig


def _tool_response(tool_name: str, tool_id: str, result: dict) -> dict:
    """Build a mock tool-result message."""
    return {
        "role": "user",
        "content": [{
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": json.dumps(result),
        }],
    }


def _tool_use_block(name: str, tool_id: str, input_dict: dict) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.name = name
    block.id = tool_id
    block.input = input_dict
    return block


def _end_turn_response(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.stop_reason = "end_turn"
    response.content = [block]
    return response


def _tool_use_response(blocks: list) -> MagicMock:
    response = MagicMock()
    response.stop_reason = "tool_use"
    response.content = blocks
    return response


@pytest.fixture
def mock_client():
    return MagicMock()


@pytest.fixture
def config():
    return GenerativeConfig(scoring_mode="physico", n_iterations=2, n_steps=100)


@pytest.fixture
def agent(mock_client):
    return Reinvent4Agent(client=mock_client)


@pytest.fixture
def sample_sar_data():
    return {"positions": {"R1": {"top_substituents": ["F", "Cl"]}}}


class TestReinvent4AgentValidation:
    def test_fails_fast_when_reinvent4_exec_not_set(self, agent, sample_sar_data, config):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("REINVENT4_EXEC", None)
            result = agent.run(
                core_smarts="[*:1]c1ccccc1",
                sar_data=sample_sar_data,
                properties={},
                property_of_interest=None,
                generative_config=config,
            )
        assert "error" in result
        assert "REINVENT4_EXEC" in result["error"]

    def test_returns_dict(self, agent, mock_client, sample_sar_data, config, tmp_path):
        # Simulate a 1-iteration run that converges immediately
        toml_path = tmp_path / "config.toml"
        toml_path.write_text("")
        csv_path = tmp_path / "results" / "scaffold_decoration.csv"
        csv_path.parent.mkdir()
        csv_path.write_text("SMILES,Score,Step\nCCO,0.9,1\n")

        # Claude sequence: build_toml → run_reinvent4 → parse_results → analyze_convergence → stop
        mock_client.messages.create.side_effect = [
            _tool_use_response([_tool_use_block("build_toml_config", "t1", {
                "scaffold_smarts": "[*:1]c1ccccc1", "scoring_config": {"components": []},
                "n_steps": 100,
            })]),
            _tool_use_response([_tool_use_block("run_reinvent4", "t2", {"toml_path": str(toml_path)})]),
            _tool_use_response([_tool_use_block("parse_results", "t3", {"csv_path": str(csv_path)})]),
            _tool_use_response([_tool_use_block("analyze_convergence", "t4", {
                "metrics": {"iteration": 1, "mean_score": 0.9, "top10_score": 0.9, "internal_diversity": 0.5, "n_molecules": 1},
                "history": [],
            })]),
            _end_turn_response(json.dumps({
                "top_molecules": [{"smiles": "CCO", "composite_score": 0.9}],
                "iteration_history": [{"iteration": 1, "mean_score": 0.9, "action_taken": "stop"}],
                "converged_status": "converged",
                "scoring_mode_used": "physico",
            })),
        ]

        with patch.dict(os.environ, {"REINVENT4_EXEC": "/fake/reinvent"}):
            with patch("backend.utils.reinvent4_utils.build_toml", return_value=toml_path):
                with patch("backend.utils.reinvent4_utils.run_reinvent4", return_value=csv_path):
                    with patch("backend.utils.reinvent4_utils.parse_results", return_value=[
                        {"smiles": "CCO", "canonical_smiles": "CCO", "composite_score": 0.9}
                    ]):
                        with patch("backend.agents.convergence_subagent.ConvergenceSubagent.analyze", return_value={
                            "status": "converged", "action": "stop", "rationale": "done", "suggested_adjustments": {}
                        }):
                            result = agent.run(
                                core_smarts="[*:1]c1ccccc1",
                                sar_data=sample_sar_data,
                                properties={},
                                property_of_interest=None,
                                generative_config=config,
                            )
        assert isinstance(result, dict)

    def test_result_contains_top_molecules(self, agent, mock_client, sample_sar_data, config, tmp_path):
        toml_path = tmp_path / "config.toml"
        toml_path.write_text("")
        csv_path = tmp_path / "results" / "scaffold_decoration.csv"
        csv_path.parent.mkdir()
        csv_path.write_text("SMILES,Score,Step\nCCO,0.9,1\n")

        mock_client.messages.create.side_effect = [
            _tool_use_response([_tool_use_block("build_toml_config", "t1", {
                "scaffold_smarts": "[*:1]c1ccccc1", "scoring_config": {"components": []}, "n_steps": 100,
            })]),
            _tool_use_response([_tool_use_block("run_reinvent4", "t2", {"toml_path": str(toml_path)})]),
            _tool_use_response([_tool_use_block("parse_results", "t3", {"csv_path": str(csv_path)})]),
            _tool_use_response([_tool_use_block("analyze_convergence", "t4", {
                "metrics": {"iteration": 1, "mean_score": 0.9, "top10_score": 0.9, "internal_diversity": 0.5, "n_molecules": 1},
                "history": [],
            })]),
            _end_turn_response(json.dumps({
                "top_molecules": [{"smiles": "CCO", "composite_score": 0.9}],
                "iteration_history": [],
                "converged_status": "converged",
                "scoring_mode_used": "physico",
            })),
        ]

        with patch.dict(os.environ, {"REINVENT4_EXEC": "/fake/reinvent"}):
            with patch("backend.utils.reinvent4_utils.build_toml", return_value=toml_path):
                with patch("backend.utils.reinvent4_utils.run_reinvent4", return_value=csv_path):
                    with patch("backend.utils.reinvent4_utils.parse_results", return_value=[
                        {"smiles": "CCO", "canonical_smiles": "CCO", "composite_score": 0.9}
                    ]):
                        with patch("backend.agents.convergence_subagent.ConvergenceSubagent.analyze", return_value={
                            "status": "converged", "action": "stop", "rationale": "done", "suggested_adjustments": {}
                        }):
                            result = agent.run(
                                core_smarts="[*:1]c1ccccc1",
                                sar_data=sample_sar_data,
                                properties={},
                                property_of_interest=None,
                                generative_config=config,
                            )
        assert "top_molecules" in result
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
python -m pytest tests/test_reinvent4_agent.py -v 2>&1 | head -15
```

Expected: `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Implement Reinvent4Agent**

Create `backend/agents/reinvent4_agent.py`:

```python
"""
Reinvent4Agent: supervisory loop for REINVENT4 scaffold decoration.

Inherits BaseAgent but overrides run() with a custom typed signature.
Implements its own Claude tool-use loop (same pattern as BaseAgent)
with max_iterations=40 to accommodate multi-iteration RL runs.
"""

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent, DEFAULT_MODEL
from .convergence_subagent import ConvergenceSubagent
from backend.utils.qsar_trainer import QSARTrainer, QSARTrainingFailed
from backend.utils import reinvent4_utils
from backend.utils.reinvent4_utils import Reinvent4RunFailed

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 40  # Total Claude tool-call turns budget


class Reinvent4Agent(BaseAgent):
    """
    Supervisory agent for REINVENT4 scaffold decoration.
    Drives an iterative optimization loop, detecting convergence/minima
    and adapting scoring strategy via Claude reasoning.
    """

    @property
    def name(self) -> str:
        return "Reinvent4Agent"

    @property
    def description(self) -> str:
        return (
            "Supervisory agent for REINVENT4 scaffold decoration. "
            "Iterates REINVENT4 runs, detects convergence or local minima, "
            "and adapts scoring weights to find optimal R-group variants."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "train_qsar_model",
                "description": "Train a QSAR model on activity data. Returns model_path, cv_r2, and scoring_component_config.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles": {"type": "array", "items": {"type": "string"}, "description": "Training SMILES"},
                        "activity": {"type": "array", "items": {"type": "number"}, "description": "Activity values"},
                    },
                    "required": ["smiles", "activity"],
                },
            },
            {
                "name": "build_toml_config",
                "description": "Write the REINVENT4 TOML config file for scaffold decoration. Returns toml_path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "scaffold_smarts": {"type": "string", "description": "Scaffold SMARTS with attachment points [*:N]"},
                        "scoring_config": {
                            "type": "object",
                            "description": "Scoring config dict with 'components' list",
                        },
                        "n_steps": {"type": "integer", "description": "Number of REINVENT4 sampling steps"},
                        "sigma": {"type": "integer", "description": "Exploitation sharpness sigma (default 100)"},
                        "diversity_filter": {"type": "string", "description": "Diversity filter name (default IdenticalMurckoScaffold)"},
                    },
                    "required": ["scaffold_smarts", "scoring_config", "n_steps"],
                },
            },
            {
                "name": "run_reinvent4",
                "description": "Run REINVENT4 via subprocess. Returns output_csv_path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "toml_path": {"type": "string", "description": "Path to the REINVENT4 TOML config file"},
                    },
                    "required": ["toml_path"],
                },
            },
            {
                "name": "parse_results",
                "description": "Parse REINVENT4 output CSV. Returns top-N molecules sorted by score.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "csv_path": {"type": "string", "description": "Path to REINVENT4 output CSV"},
                        "top_n": {"type": "integer", "description": "Max results to return (default 50)"},
                    },
                    "required": ["csv_path"],
                },
            },
            {
                "name": "analyze_convergence",
                "description": "Analyze iteration metrics and return convergence recommendation (status, action, suggested_adjustments).",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "metrics": {
                            "type": "object",
                            "description": "Current iteration stats: {iteration, mean_score, top10_score, internal_diversity, n_molecules}",
                        },
                        "history": {
                            "type": "array",
                            "description": "List of previous iteration stats dicts",
                        },
                    },
                    "required": ["metrics", "history"],
                },
            },
            {
                "name": "adjust_config",
                "description": "Apply suggested_adjustments to rebuild the TOML config. Returns new toml_path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "current_toml_path": {"type": "string"},
                        "suggested_adjustments": {"type": "object", "description": "Dict of adjustment keys (sigma, diversity_filter, qsar_weight, qed_weight, sa_score_weight, n_steps)"},
                        "scaffold_smarts": {"type": "string"},
                        "current_scoring_config": {"type": "object"},
                        "n_steps": {"type": "integer"},
                    },
                    "required": ["current_toml_path", "suggested_adjustments", "scaffold_smarts", "current_scoring_config", "n_steps"],
                },
            },
            {
                "name": "get_iteration_summary",
                "description": "Return a compact summary of all iterations so far.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        """Dispatch tool calls to their implementations."""
        if tool_name == "train_qsar_model":
            return self._tool_train_qsar(tool_input)
        elif tool_name == "build_toml_config":
            return self._tool_build_toml(tool_input)
        elif tool_name == "run_reinvent4":
            return self._tool_run_reinvent4(tool_input)
        elif tool_name == "parse_results":
            return self._tool_parse_results(tool_input)
        elif tool_name == "analyze_convergence":
            return self._tool_analyze_convergence(tool_input)
        elif tool_name == "adjust_config":
            return self._tool_adjust_config(tool_input)
        elif tool_name == "get_iteration_summary":
            return self._tool_get_iteration_summary()
        return {"error": f"Unknown tool: {tool_name}"}

    # ── Custom run() ─────────────────────────────────────────────────────────

    def run(
        self,
        core_smarts: str,
        sar_data: Dict[str, Any],
        properties: Dict[str, List],
        property_of_interest: Optional[str],
        generative_config,  # GenerativeConfig instance
    ) -> Dict[str, Any]:
        """
        Execute the REINVENT4 scaffold decoration loop.
        Does NOT call super().run() — implements its own tool-use loop
        with max_iterations=40.
        """
        # Fail fast if REINVENT4 is not configured
        exec_path = os.environ.get("REINVENT4_EXEC", "")
        if not exec_path or not Path(exec_path).exists():
            return {
                "error": f"REINVENT4_EXEC not configured or not found: '{exec_path}'. "
                         "Set the REINVENT4_EXEC environment variable to the reinvent executable path."
            }

        self._exec_path = exec_path
        self._generative_config = generative_config
        self._iteration_history: List[Dict] = []
        self._work_dir = Path(tempfile.mkdtemp(prefix="reinvent4_"))
        self._convergence_subagent = ConvergenceSubagent(client=self.client, model=self.model)

        # Build the task prompt for Claude
        task = self._build_task_prompt(core_smarts, sar_data, properties, property_of_interest, generative_config)
        system = self.build_system_prompt()
        tools = self.get_tools()
        messages = [{"role": "user", "content": task}]

        self._emit_progress("Reinvent4Agent: starting scaffold decoration loop")

        iterations = 0
        while iterations < MAX_ITERATIONS:
            iterations += 1

            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    system=system,
                    tools=tools,
                    messages=messages,
                )
            except anthropic.APIError as e:
                logger.error(f"Claude API error in Reinvent4Agent: {e}")
                return {"error": str(e), "agent": self.name}

            if response.stop_reason == "end_turn":
                text_blocks = [b.text for b in response.content if hasattr(b, "text")]
                final_text = "\n".join(text_blocks)
                self._emit_progress("Reinvent4Agent: complete")
                try:
                    import re
                    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", final_text, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group(1))
                    start = final_text.rfind("{")
                    end = final_text.rfind("}") + 1
                    if start >= 0 and end > start:
                        return json.loads(final_text[start:end])
                except (json.JSONDecodeError, ValueError):
                    pass
                return {"result": final_text, "agent": self.name}

            if response.stop_reason == "tool_use":
                tool_results = []
                messages.append({"role": "assistant", "content": response.content})
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    self._emit_progress(f"Reinvent4Agent: calling tool {block.name}")
                    try:
                        result = self.execute_tool(block.name, block.input)
                        content = json.dumps(result, default=str)
                    except Exception as e:
                        logger.error(f"Tool {block.name} failed: {e}", exc_info=True)
                        content = json.dumps({"error": str(e), "tool": block.name})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content,
                    })
                messages.append({"role": "user", "content": tool_results})
            else:
                logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
                break

        return {"error": "Max iterations reached", "agent": self.name}

    # ── Tool implementations ──────────────────────────────────────────────────

    def _tool_train_qsar(self, inp: Dict) -> Dict:
        try:
            trainer = QSARTrainer()
            result = trainer.train(
                smiles=inp["smiles"],
                activity=inp["activity"],
                output_dir=self._work_dir,
            )
            result["model_path"] = str(result["model_path"])
            return result
        except QSARTrainingFailed as e:
            logger.warning(f"QSAR training failed: {e} — falling back to physico-only")
            return {"error": str(e), "fallback": "physico"}

    def _tool_build_toml(self, inp: Dict) -> Dict:
        path = reinvent4_utils.build_toml(
            scaffold_smarts=inp["scaffold_smarts"],
            scoring_config=inp.get("scoring_config", {"components": []}),
            n_steps=inp.get("n_steps", self._generative_config.n_steps),
            output_dir=self._work_dir,
            sigma=inp.get("sigma", 100),
            diversity_filter=inp.get("diversity_filter", "IdenticalMurckoScaffold"),
        )
        return {"toml_path": str(path)}

    def _tool_run_reinvent4(self, inp: Dict) -> Dict:
        try:
            csv_path = reinvent4_utils.run_reinvent4(
                toml_path=Path(inp["toml_path"]),
                exec_path=self._exec_path,
            )
            return {"csv_path": str(csv_path)}
        except Reinvent4RunFailed as e:
            return {"error": str(e), "stderr": e.stderr}

    def _tool_parse_results(self, inp: Dict) -> Dict:
        results = reinvent4_utils.parse_results(
            csv_path=Path(inp["csv_path"]),
            top_n=inp.get("top_n", 50),
        )
        return {"molecules": results, "n_molecules": len(results)}

    def _tool_analyze_convergence(self, inp: Dict) -> Dict:
        recommendation = self._convergence_subagent.analyze(
            metrics=inp["metrics"],
            history=inp.get("history", []),
        )
        # Track iteration history
        metrics = inp["metrics"]
        self._iteration_history.append({
            "iteration": metrics.get("iteration"),
            "mean_score": metrics.get("mean_score"),
            "top10_score": metrics.get("top10_score"),
            "internal_diversity": metrics.get("internal_diversity"),
            "action_taken": recommendation.get("action"),
        })
        return recommendation

    def _tool_adjust_config(self, inp: Dict) -> Dict:
        adj = inp.get("suggested_adjustments", {})
        scoring_config = inp.get("current_scoring_config", {"components": []})

        # Apply weight adjustments
        for comp in scoring_config.get("components", []):
            if "qsar_weight" in adj and comp.get("type") == "qsar_activity":
                comp["weight"] = adj["qsar_weight"]
            if "qed_weight" in adj and comp.get("type") == "qed":
                comp["weight"] = adj["qed_weight"]
            if "sa_score_weight" in adj and comp.get("type") == "sa_score":
                comp["weight"] = adj["sa_score_weight"]

        path = reinvent4_utils.build_toml(
            scaffold_smarts=inp["scaffold_smarts"],
            scoring_config=scoring_config,
            n_steps=adj.get("n_steps", inp.get("n_steps", self._generative_config.n_steps)),
            output_dir=self._work_dir,
            sigma=adj.get("sigma", 100),
            diversity_filter=adj.get("diversity_filter", "IdenticalMurckoScaffold"),
        )
        return {"toml_path": str(path)}

    def _tool_get_iteration_summary(self) -> Dict:
        return {
            "total_iterations": len(self._iteration_history),
            "history": self._iteration_history,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _build_task_prompt(
        self,
        core_smarts: str,
        sar_data: Dict,
        properties: Dict,
        property_of_interest: Optional[str],
        config,
    ) -> str:
        activity_data = []
        if property_of_interest and property_of_interest in properties:
            activity_data = properties[property_of_interest]

        has_activity = len(activity_data) >= 10
        scoring_mode = config.scoring_mode

        smiles_list = list(properties.get("smiles", []))

        return f"""You are running REINVENT4 scaffold decoration to generate novel R-group variants.

CORE SCAFFOLD: {core_smarts}
SCORING MODE: {scoring_mode}
MAX ITERATIONS: {config.n_iterations}
STEPS PER ITERATION: {config.n_steps}
HAS ACTIVITY DATA: {has_activity}
PROPERTY OF INTEREST: {property_of_interest or "None"}

SAR SUMMARY: {json.dumps(sar_data, indent=2)[:2000]}

INSTRUCTIONS:
1. {"Call train_qsar_model first with the activity data." if scoring_mode in ("qsar", "both") and has_activity else "Skip QSAR training (physico-only mode or insufficient data)."}
2. Call build_toml_config to create the initial REINVENT4 config.
   - For scoring_config, include {"a qsar_activity component (use model_path from train_qsar_model) plus " if scoring_mode in ("qsar", "both") and has_activity else ""}QED and SA score components.
3. Run the iteration loop (max {config.n_iterations} iterations):
   a. Call run_reinvent4 with the current toml_path.
   b. Call parse_results with the returned csv_path.
   c. Compute metrics: mean_score = average composite_score, top10_score = mean of top 10%,
      n_molecules = total parsed. Estimate internal_diversity as 0.5 if unknown.
   d. Call analyze_convergence with the metrics and iteration history.
   e. Act on the recommendation:
      - "continue": proceed to next iteration
      - "escape": call adjust_config with suggested_adjustments, then continue
      - "reweight": call adjust_config with suggested_adjustments, then continue
      - "stop": exit the loop and return results
4. After the loop (or on stop), return a JSON result:
{{
  "top_molecules": [<top 20 molecules from all iterations, sorted by composite_score>],
  "iteration_history": [<from get_iteration_summary>],
  "converged_status": "converged" | "budget_exhausted" | "error",
  "scoring_mode_used": "{scoring_mode}"
}}

ACTIVITY DATA (first 20 values): {json.dumps(list(zip(smiles_list[:20], activity_data[:20])))}

Begin now. Use tools only — never fabricate molecular scores."""
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
python -m pytest tests/test_reinvent4_agent.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 5: Run the full test suite to confirm nothing is broken**

```bash
python -m pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/agents/reinvent4_agent.py tests/test_reinvent4_agent.py && git commit -m "feat: add Reinvent4Agent supervisory tool-use loop"
```

---

## Chunk 4: API & Orchestrator Integration

### Task 7: GenerativeConfig model + AnalysisRequest update

**Files:**
- Modify: `backend/api/routes/analyze.py`

- [ ] **Step 1: Add GenerativeConfig to analyze.py**

Edit `backend/api/routes/analyze.py`. After the existing imports, add:

```python
from typing import Literal
from pydantic import Field
```

Replace the existing `AnalysisRequest` class with the following two classes, in this order (`GenerativeConfig` must come first since `AnalysisRequest` references it):

```python
class GenerativeConfig(BaseModel):
    scoring_mode: Literal["physico", "qsar", "both"] = "both"
    n_iterations: int = Field(default=5, ge=1, le=20)
    n_steps: int = Field(default=500, ge=100, le=5000)


class AnalysisRequest(BaseModel):
    session_id: str
    property_of_interest: Optional[str] = None
    core_smarts: Optional[str] = None
    run_enumeration: bool = False
    similarity_threshold: float = 0.7
    activity_diff_threshold: float = 1.0
    # New generative design fields:
    run_generative: bool = False
    generative_config: Optional[GenerativeConfig] = None
```

- [ ] **Step 2: Update `_run_pipeline` to pass generative params**

In `_run_pipeline`, update the `orchestrator.run_full_pipeline(...)` call:

```python
        results = orchestrator.run_full_pipeline(
            smiles=session_data["smiles"],
            labels=session_data["labels"],
            properties=session_data["properties"],
            property_of_interest=request.property_of_interest,
            run_enumeration=request.run_enumeration,
            core_smarts=request.core_smarts,
            run_generative=request.run_generative,
            generative_config=request.generative_config,
        )
```

- [ ] **Step 3: Verify the app starts without errors**

```bash
cd /home/jlaureanti85/agent-R-group-analysis && python -c "from backend.api.routes.analyze import AnalysisRequest, GenerativeConfig; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes/analyze.py && git commit -m "feat: add GenerativeConfig and run_generative to AnalysisRequest"
```

---

### Task 8: Orchestrator integration

**Files:**
- Modify: `backend/agents/orchestrator.py`

- [ ] **Step 1: Add import at top of orchestrator.py**

Add after the existing agent imports:

```python
from .reinvent4_agent import Reinvent4Agent
```

- [ ] **Step 2: Update `run_full_pipeline` signature**

Change the method signature from:

```python
    def run_full_pipeline(
        self,
        smiles: List[str],
        labels: List[str],
        properties: Dict[str, List],
        property_of_interest: Optional[str] = None,
        run_enumeration: bool = False,
        core_smarts: Optional[str] = None,
    ) -> Dict[str, Any]:
```

To:

```python
    def run_full_pipeline(
        self,
        smiles: List[str],
        labels: List[str],
        properties: Dict[str, List],
        property_of_interest: Optional[str] = None,
        run_enumeration: bool = False,
        core_smarts: Optional[str] = None,
        run_generative: bool = False,
        generative_config=None,  # Optional[GenerativeConfig]
    ) -> Dict[str, Any]:
```

- [ ] **Step 3: Add Reinvent4Agent call after SAR step**

In `run_full_pipeline`, locate the end of the `if strategy == "rgroup":` block (after the `run_enumeration` block). Add the following **outside** all strategy branches but before the Activity Cliff step:

```python
        # ── 3b. Generative Design (optional, requires detected core) ─────────
        if run_generative:
            detected_core = core_smarts or core_result.get("mcs_smarts")
            if detected_core:
                from backend.api.routes.analyze import GenerativeConfig
                emit("Generative: Running REINVENT4 scaffold decoration...")
                try:
                    reinvent4_agent = Reinvent4Agent(
                        client=self.client,
                        progress_callback=self.progress_callback,
                    )
                    generative_result = reinvent4_agent.run(
                        core_smarts=detected_core,
                        sar_data=pipeline_results.get("sar_ranking", {}),
                        properties=properties,
                        property_of_interest=property_of_interest,
                        generative_config=generative_config or GenerativeConfig(),
                    )
                    pipeline_results["generative"] = generative_result
                    pipeline_results["agents_run"].append("Reinvent4Agent")
                except Exception as e:
                    logger.error(f"Reinvent4Agent failed: {e}", exc_info=True)
                    pipeline_results["generative"] = {"error": str(e)}
            else:
                emit("Generative: skipped — no core scaffold detected")
                pipeline_results["generative"] = {"error": "No core scaffold detected for generative design"}
```

- [ ] **Step 4: Verify import chain works**

```bash
python -c "from backend.agents.orchestrator import OrchestratorAgent; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/agents/orchestrator.py && git commit -m "feat: integrate Reinvent4Agent into OrchestratorAgent pipeline"
```

---

## Chunk 5: Frontend

### Task 9: Update App.jsx config state and api.js

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add generative fields to App.jsx config state**

In `frontend/src/App.jsx`, replace the `useState` config initializer:

```javascript
  const [config, setConfig] = useState({
    propertyOfInterest: '',
    coreSmarts: '',
    runEnumeration: false,
    similarityThreshold: 0.7,
    activityDiffThreshold: 1.0,
  })
```

With:

```javascript
  const [config, setConfig] = useState({
    propertyOfInterest: '',
    coreSmarts: '',
    runEnumeration: false,
    similarityThreshold: 0.7,
    activityDiffThreshold: 1.0,
    // Generative design
    runGenerative: false,
    generativeScoringMode: 'both',
    generativeIterations: 5,
    generativeSteps: 500,
  })
```

- [ ] **Step 2: Update startAnalysis in api.js**

In `frontend/src/api.js`, replace the `startAnalysis` function with:

```javascript
export function startAnalysis({ sessionId, propertyOfInterest, coreSmarts, runEnumeration, similarityThreshold, activityDiffThreshold, runGenerative, generativeConfig }) {
  return request('/analyze/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      property_of_interest: propertyOfInterest || null,
      core_smarts: coreSmarts || null,
      run_enumeration: runEnumeration,
      similarity_threshold: similarityThreshold,
      activity_diff_threshold: activityDiffThreshold,
      run_generative: runGenerative || false,
      generative_config: generativeConfig || null,
    }),
  })
}
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd /home/jlaureanti85/agent-R-group-analysis/frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/api.js && git commit -m "feat: add generative config fields to App state and api.js startAnalysis"
```

---

### Task 10: ConfigPage generative toggle

**Files:**
- Modify: `frontend/src/pages/ConfigPage.jsx`

- [ ] **Step 1: Add generative config state**

In `ConfigPage.jsx`, inside the component body, after existing state declarations, the `config` prop already holds all config. We need to ensure the parent (`App.jsx`) initializes `runGenerative` and `generativeConfig`. In the `handleRun` function, add the new fields to the `startAnalysis` call:

Replace:
```javascript
      await startAnalysis({
        sessionId: uploadData.session_id,
        propertyOfInterest: config.propertyOfInterest,
        coreSmarts: config.coreSmarts,
        runEnumeration: config.runEnumeration,
        similarityThreshold: config.similarityThreshold,
        activityDiffThreshold: config.activityDiffThreshold,
      })
```

With:
```javascript
      await startAnalysis({
        sessionId: uploadData.session_id,
        propertyOfInterest: config.propertyOfInterest,
        coreSmarts: config.coreSmarts,
        runEnumeration: config.runEnumeration,
        similarityThreshold: config.similarityThreshold,
        activityDiffThreshold: config.activityDiffThreshold,
        runGenerative: config.runGenerative || false,
        generativeConfig: config.runGenerative ? {
          scoring_mode: config.generativeScoringMode || 'both',
          n_iterations: config.generativeIterations || 5,
          n_steps: config.generativeSteps || 500,
        } : null,
      })
```

- [ ] **Step 2: Add the generative design UI section**

In `ConfigPage.jsx`, find the closing `</div>` of the last config section (above the launch button). Insert the following generative design section before it:

```jsx
        {/* ── Generative Design ─────────────────────────────────── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)',
          padding: '18px 20px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: config.runGenerative ? 16 : 0 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Generative Design</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Run REINVENT4 scaffold decoration to generate novel R-group variants
              </div>
            </div>
            <Toggle
              checked={config.runGenerative || false}
              onChange={v => set('runGenerative', v)}
            />
          </div>

          {config.runGenerative && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Scoring mode */}
              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  Scoring Mode
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { value: 'physico', label: 'Physicochemical' },
                    { value: 'qsar', label: 'QSAR' },
                    { value: 'both', label: 'Both' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => set('generativeScoringMode', opt.value)}
                      style={{
                        padding: '5px 14px',
                        borderRadius: 'var(--radius)',
                        border: '1px solid',
                        borderColor: (config.generativeScoringMode || 'both') === opt.value
                          ? 'var(--nanome-cyan)' : 'var(--border-subtle)',
                        background: (config.generativeScoringMode || 'both') === opt.value
                          ? 'rgba(0,188,212,0.12)' : 'transparent',
                        color: (config.generativeScoringMode || 'both') === opt.value
                          ? 'var(--nanome-cyan)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        fontWeight: 500,
                        transition: 'all 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced options (collapsible) */}
              <details style={{ fontSize: '0.82rem' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', userSelect: 'none' }}>
                  Advanced options
                </summary>
                <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                      Iterations (1–20)
                    </label>
                    <input
                      type="number" min={1} max={20}
                      value={config.generativeIterations || 5}
                      onChange={e => set('generativeIterations', Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                      style={{
                        width: '100%', padding: '5px 8px',
                        background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '0.82rem',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                      Steps per iteration (100–5000)
                    </label>
                    <input
                      type="number" min={100} max={5000} step={100}
                      value={config.generativeSteps || 500}
                      onChange={e => set('generativeSteps', Math.max(100, Math.min(5000, parseInt(e.target.value) || 500)))}
                      style={{
                        width: '100%', padding: '5px 8px',
                        background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '0.82rem',
                      }}
                    />
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd /home/jlaureanti85/agent-R-group-analysis/frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ConfigPage.jsx && git commit -m "feat: add generative design toggle and scoring config to ConfigPage"
```

---

### Task 11: GeneratedMoleculesPanel component

**Files:**
- Create: `frontend/src/components/GeneratedMoleculesPanel.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/GeneratedMoleculesPanel.jsx`:

```jsx
import { getSmilesSvgUrl } from '../api.js'

const SCORE_BAR_COLOR = 'var(--nanome-cyan)'

function ScoreBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 5, background: 'var(--border-subtle)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: SCORE_BAR_COLOR, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
        {(value || 0).toFixed(2)}
      </span>
    </div>
  )
}

function IterationBadge({ iteration }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 999,
      fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em',
      background: 'rgba(0,188,212,0.1)', color: 'var(--nanome-cyan)',
      border: '1px solid rgba(0,188,212,0.3)',
    }}>
      iter {iteration}
    </span>
  )
}

export default function GeneratedMoleculesPanel({ generativeData }) {
  if (!generativeData) return null

  const { top_molecules = [], iteration_history = [], converged_status, scoring_mode_used } = generativeData

  if (generativeData.error) {
    return (
      <div style={{
        padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius)',
        border: '1px solid rgba(255,80,80,0.3)', color: 'var(--text-muted)',
      }}>
        <strong style={{ color: '#ff6b6b' }}>Generative design error:</strong> {generativeData.error}
      </div>
    )
  }

  const statusColor = {
    converged: '#4ade80',
    budget_exhausted: '#facc15',
    error: '#f87171',
  }[converged_status] || 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: '12px 16px',
        fontSize: '0.82rem',
      }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Status: </span>
          <span style={{ color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>
            {converged_status?.replace('_', ' ') || '—'}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Molecules generated: </span>
          <span style={{ fontWeight: 600 }}>{top_molecules.length}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Iterations: </span>
          <span style={{ fontWeight: 600 }}>{iteration_history.length}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Scoring: </span>
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{scoring_mode_used || '—'}</span>
        </div>
      </div>

      {/* Iteration history */}
      {iteration_history.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem', fontWeight: 600 }}>
            Iteration History
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Iter', 'Mean Score', 'Top-10 Score', 'Diversity', 'Action'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {iteration_history.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '7px 12px' }}>{row.iteration}</td>
                    <td style={{ padding: '7px 12px' }}>{(row.mean_score || 0).toFixed(3)}</td>
                    <td style={{ padding: '7px 12px' }}>{(row.top10_score || 0).toFixed(3)}</td>
                    <td style={{ padding: '7px 12px' }}>{(row.internal_diversity || 0).toFixed(3)}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                        background: {
                          continue: 'rgba(74,222,128,0.1)', escape: 'rgba(250,204,21,0.1)',
                          reweight: 'rgba(96,165,250,0.1)', stop: 'rgba(0,188,212,0.1)',
                        }[row.action_taken] || 'var(--border-subtle)',
                        color: {
                          continue: '#4ade80', escape: '#facc15',
                          reweight: '#60a5fa', stop: 'var(--nanome-cyan)',
                        }[row.action_taken] || 'var(--text-muted)',
                      }}>
                        {row.action_taken || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top molecules grid */}
      {top_molecules.length > 0 && (
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12 }}>
            Top Generated Molecules
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {top_molecules.map((mol, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
              }}>
                {mol.canonical_smiles && (
                  <div style={{ background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'center', padding: 8 }}>
                    <img
                      src={getSmilesSvgUrl(mol.canonical_smiles, 220, 160)}
                      alt={mol.canonical_smiles}
                      style={{ maxWidth: 220, maxHeight: 160 }}
                    />
                  </div>
                )}
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mol.canonical_smiles || mol.smiles}
                    </span>
                    {mol.iteration != null && <IterationBadge iteration={mol.iteration} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 1 }}>Composite</div>
                    <ScoreBar value={mol.composite_score} />
                    {mol.qsar_score > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>QSAR</div>
                        <ScoreBar value={mol.qsar_score} />
                      </>
                    )}
                    {mol.qed > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>QED</div>
                        <ScoreBar value={mol.qed} />
                      </>
                    )}
                    {mol.sa_score > 0 && (
                      <>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>SA Score</div>
                        <ScoreBar value={mol.sa_score} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {top_molecules.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center', fontSize: '0.85rem' }}>
          No molecules were generated.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd /home/jlaureanti85/agent-R-group-analysis/frontend && npm run build 2>&1 | tail -10
```

Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GeneratedMoleculesPanel.jsx && git commit -m "feat: add GeneratedMoleculesPanel component for REINVENT4 results"
```

---

### Task 12: Add Generated tab to ResultsPage

**Files:**
- Modify: `frontend/src/pages/ResultsPage.jsx`

- [ ] **Step 1: Add import and tab entry**

In `ResultsPage.jsx`, add the import at the top:

```javascript
import GeneratedMoleculesPanel from '../components/GeneratedMoleculesPanel.jsx'
```

Add to the `TABS` array (after the `diversity` entry):

```javascript
  { id: 'generated', label: 'Generated', icon: '✦' },
```

- [ ] **Step 2: Add data extraction and tab render**

After the existing `const diversityData = ...` line, add:

```javascript
  const generativeData = results?.generative
```

In the tab content render section (where each tab's panel is rendered), add the generated tab case. Find the `diversity` tab render and add after it:

```jsx
          {activeTab === 'generated' && (
            <GeneratedMoleculesPanel generativeData={generativeData} />
          )}
```

Conditionally show the tab only when generative data exists. Update the `TABS` constant to be dynamic, or add a visual indicator. The simplest approach: keep the tab always visible but `GeneratedMoleculesPanel` handles the null/empty state gracefully (it already does with the early `if (!generativeData) return null` check). Replace that early return with a placeholder:

In `GeneratedMoleculesPanel.jsx`, replace:

```jsx
  if (!generativeData) return null
```

With:

```jsx
  if (!generativeData) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center', fontSize: '0.85rem' }}>
        Enable <strong>Generative Design</strong> in the analysis configuration to generate novel R-group variants with REINVENT4.
      </div>
    )
  }
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/jlaureanti85/agent-R-group-analysis/frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors

- [ ] **Step 4: Run full test suite one final time**

```bash
cd /home/jlaureanti85/agent-R-group-analysis && python -m pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ResultsPage.jsx frontend/src/components/GeneratedMoleculesPanel.jsx && git commit -m "feat: add Generated Molecules tab to ResultsPage"
```

---

## Final Verification

- [ ] **Start the backend and confirm it loads without errors**

```bash
cd /home/jlaureanti85/agent-R-group-analysis && python -m uvicorn backend.main:app --reload --port 8000 2>&1 | head -20
```

Expected: `Application startup complete.` with no import errors

- [ ] **Confirm new endpoint accepts generative config**

```bash
curl -s -X POST http://localhost:8000/api/analyze/start \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test", "run_generative": true, "generative_config": {"scoring_mode": "physico", "n_iterations": 2, "n_steps": 100}}' | python -m json.tool
```

Expected: `{"status": "not_started"}` or session-not-found error (not a validation error)

- [ ] **Final commit**

```bash
git status
```

Confirm working tree is clean (all changes committed in individual task commits). No additional commit needed if output shows `nothing to commit, working tree clean`.
