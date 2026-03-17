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
        assert "n_steps = 250" in content

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

    def test_qsar_absent_without_config(self, tmp_output_dir):
        path = build_toml("[*:1]c1ccccc1", {"components": []}, 500, tmp_output_dir)
        content = path.read_text()
        assert "predictive_property" not in content
        assert "qsar_activity" not in content

    def test_raises_on_qsar_missing_model_path(self, tmp_output_dir):
        scoring_config = {"components": [{"type": "qsar_activity", "weight": 0.6}]}  # no model_path
        with pytest.raises(ValueError, match="model_path"):
            build_toml("[*:1]c1ccccc1", scoring_config, 500, tmp_output_dir)


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
