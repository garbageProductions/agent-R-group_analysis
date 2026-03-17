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
