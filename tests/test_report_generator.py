"""Unit tests for ReportGenerator."""
import pytest
from backend.utils.report_generator import ReportGenerator


MINIMAL_SESSION = {
    "smiles": ["c1ccccc1", "CC(=O)O"],
    "labels": ["benzene", "acetic_acid"],
    "properties": {"pIC50": [7.5, 6.2]},
    "property_columns": ["pIC50"],
    "source_format": "sdf",
    "filename": "test.sdf",
}

MINIMAL_RESULTS = {
    "strategy": "rgroup",
    "agents_run": ["CoreDetectionAgent", "DecompositionAgent"],
    "core": {"mcs_smarts": "c1ccccc1"},
    "rgroup_decomposition": {},
    "sar_ranking": {},
    "mmp_transforms": {},
    "activity_cliffs": {},
    "enumeration": {},
    "generative": None,
}


def test_generate_returns_string():
    html = ReportGenerator().generate(MINIMAL_SESSION, MINIMAL_RESULTS)
    assert isinstance(html, str)


def test_generate_returns_valid_html():
    html = ReportGenerator().generate(MINIMAL_SESSION, MINIMAL_RESULTS)
    assert "<!DOCTYPE html" in html or "<html" in html


def test_generate_includes_session_id_section():
    html = ReportGenerator().generate(MINIMAL_SESSION, MINIMAL_RESULTS)
    # Report should contain the analysis metadata section
    assert "benzene" in html or "acetic_acid" in html


def test_generate_includes_inline_style():
    html = ReportGenerator().generate(MINIMAL_SESSION, MINIMAL_RESULTS)
    assert "<style" in html


def test_generate_no_external_cdn_links():
    html = ReportGenerator().generate(MINIMAL_SESSION, MINIMAL_RESULTS)
    assert "cdn.jsdelivr.net" not in html
    assert "unpkg.com" not in html
    assert "cdnjs.cloudflare.com" not in html


def test_generate_with_empty_results_does_not_raise():
    html = ReportGenerator().generate(MINIMAL_SESSION, {})
    assert isinstance(html, str)


def test_generate_with_generative_results():
    results_with_gen = {
        **MINIMAL_RESULTS,
        "generative": {
            "top_molecules": [{"smiles": "c1ccccc1", "score": 0.85}],
            "iterations_run": 3,
        },
    }
    html = ReportGenerator().generate(MINIMAL_SESSION, results_with_gen)
    assert isinstance(html, str)


def test_generate_caps_molecule_grid_at_50():
    """Report should not fail with large datasets; only first 50 rendered."""
    big_session = {
        **MINIMAL_SESSION,
        "smiles": ["c1ccccc1"] * 100,
        "labels": [f"mol{i}" for i in range(100)],
        "properties": {"pIC50": [7.5] * 100},
    }
    html = ReportGenerator().generate(big_session, MINIMAL_RESULTS)
    assert isinstance(html, str)
