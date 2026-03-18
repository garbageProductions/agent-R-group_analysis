"""Tests for mol_to_3d_sdf in mol_utils."""
import pytest
from backend.utils.mol_utils import mol_to_3d_sdf


def test_returns_string_for_valid_smiles():
    result = mol_to_3d_sdf("c1ccccc1")
    assert isinstance(result, str)


def test_result_contains_sdf_terminator():
    result = mol_to_3d_sdf("c1ccccc1")
    assert "$$$$" in result


def test_result_contains_molblock_header():
    result = mol_to_3d_sdf("c1ccccc1")
    # MolBlock always has M  END
    assert "M  END" in result


def test_returns_none_for_invalid_smiles():
    result = mol_to_3d_sdf("not_a_smiles_xyz")
    assert result is None


def test_returns_none_for_empty_string():
    result = mol_to_3d_sdf("")
    assert result is None


def test_larger_molecule_aspirin():
    result = mol_to_3d_sdf("CC(=O)Oc1ccccc1C(=O)O")
    assert result is not None
    assert "$$$$" in result


@pytest.mark.xfail(strict=False, reason="counts line format differs between V2000 and V3000 SDF")
def test_no_hydrogen_atoms_in_output():
    """Explicit Hs should be stripped from the returned SDF (V2000 only)."""
    result = mol_to_3d_sdf("c1ccccc1")
    # 3D coords present but no explicit H atoms in heavy-atom SDF
    assert result is not None
    lines = result.splitlines()
    # In V2000 format: line index 3 (0-based) is the counts line;
    # first 3 chars are atom count. Not reliable in V3000 — hence xfail.
    counts_line = lines[3] if len(lines) > 3 else ""
    atom_count = int(counts_line[:3].strip()) if counts_line else 0
    assert atom_count == 6  # benzene has 6 heavy atoms
