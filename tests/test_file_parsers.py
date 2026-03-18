"""Tests for parse_activity_csv in file_parsers."""
import pytest
from backend.utils.file_parsers import parse_activity_csv


# ── Happy path ──────────────────────────────────────────────────────────────

def test_returns_property_columns():
    content = "id,pIC50,Ki\nmol1,8.4,120.5\nmol2,7.9,250.0\n"
    cols, _ = parse_activity_csv(content, ["mol1", "mol2"])
    assert cols == ["pIC50", "Ki"]


def test_returns_column_oriented_properties():
    content = "id,pIC50\nmol1,8.4\nmol2,7.9\nmol3,6.8\n"
    _, props = parse_activity_csv(content, ["mol1", "mol2", "mol3"])
    assert props["pIC50"] == [8.4, 7.9, 6.8]


def test_properties_length_matches_existing_labels():
    content = "id,pIC50\nmol1,8.4\nmol2,7.9\n"
    _, props = parse_activity_csv(content, ["mol1", "mol2"])
    assert len(props["pIC50"]) == 2


def test_unmatched_existing_labels_get_none():
    """Molecules in session but not in CSV get None."""
    content = "id,pIC50\nmol1,8.4\n"
    _, props = parse_activity_csv(content, ["mol1", "mol2", "mol3"])
    assert props["pIC50"] == [8.4, None, None]


def test_case_insensitive_label_matching():
    content = "id,pIC50\nMOL1,8.4\nMOL2,7.9\n"
    _, props = parse_activity_csv(content, ["mol1", "mol2"])
    assert props["pIC50"][0] == 8.4
    assert props["pIC50"][1] == 7.9


def test_non_numeric_values_become_none():
    content = "id,pIC50\nmol1,N/A\nmol2,7.9\n"
    _, props = parse_activity_csv(content, ["mol1", "mol2"])
    assert props["pIC50"][0] is None
    assert props["pIC50"][1] == 7.9


def test_detects_label_col_by_name():
    """Column named 'name' is treated as label, not property."""
    content = "name,pIC50\ncompound_a,8.4\ncompound_b,7.9\n"
    cols, props = parse_activity_csv(content, ["compound_a", "compound_b"])
    assert "name" not in cols
    assert "pIC50" in cols


def test_first_non_numeric_column_used_as_label_when_no_known_name():
    """Falls back to first non-numeric column if no recognized label column name."""
    content = "compound_code,activity\nC001,8.4\nC002,7.9\n"
    cols, props = parse_activity_csv(content, ["C001", "C002"])
    assert "compound_code" not in cols
    assert props["activity"] == [8.4, 7.9]


# ── Error cases ─────────────────────────────────────────────────────────────

def test_raises_value_error_on_empty_csv():
    with pytest.raises(ValueError, match="empty"):
        parse_activity_csv("", ["mol1"])


def test_raises_value_error_when_no_numeric_columns():
    content = "id,name,category\nmol1,compound_a,type1\n"
    with pytest.raises(ValueError, match="numeric"):
        parse_activity_csv(content, ["mol1"])


def test_raises_value_error_on_duplicate_label():
    content = "id,pIC50\nmol1,8.4\nmol1,7.9\n"
    with pytest.raises(ValueError, match="[Dd]uplicate"):
        parse_activity_csv(content, ["mol1"])
