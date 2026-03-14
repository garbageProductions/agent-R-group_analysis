"""
Tool: rgroup_decompose_series
Decomposes a set of molecules into a core + R-group table using RDKit's
RGroupDecomposition. Handles automatic core detection via MCS if no core
SMARTS is provided.
"""

import logging
from typing import List, Optional, Dict, Any

from rdkit import Chem
from rdkit.Chem import rdFMCS
from rdkit.Chem.rdRGroupDecomposition import (
    RGroupDecompose,
    RGroupDecompositionParameters,
    RGroupCoreAlignment,
    RGroupLabelling,
    RGroupScore,
)

logger = logging.getLogger(__name__)


def _auto_detect_core(mols: List[Chem.Mol], timeout: int = 15) -> Optional[str]:
    """Find MCS and convert to core SMARTS usable for R-group decomp."""
    try:
        result = rdFMCS.FindMCS(
            mols[:50],  # cap for speed
            timeout=timeout,
            ringMatchesRingOnly=True,
            completeRingsOnly=True,
            atomCompare=rdFMCS.AtomCompare.CompareElements,
            bondCompare=rdFMCS.BondCompare.CompareOrder,
        )
        if result.numAtoms >= 3:
            return result.smartsString
    except Exception as e:
        logger.warning(f"Auto core detection failed: {e}")
    return None


def _mol_svg(mol, width: int = 150, height: int = 120) -> Optional[str]:
    """Generate an inline SVG for a molecule."""
    try:
        from rdkit.Chem.Draw import rdMolDraw2D
        drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        return drawer.GetDrawingText()
    except Exception:
        return None


def rgroup_decompose_series(
    smiles_list: List[str],
    core_smarts: Optional[str] = None,
    labels: Optional[List[str]] = None,
    properties: Optional[Dict[str, List]] = None,
    generate_svgs: bool = False,
) -> Dict[str, Any]:
    """
    Decompose a compound series into core + R-groups.

    Args:
        smiles_list:  Input SMILES
        core_smarts:  SMARTS for the common core (auto-detected if None)
        labels:       Optional molecule IDs/names, same length as smiles_list
        properties:   Optional dict of {prop_name: [values]} same length as smiles_list
        generate_svgs: Whether to generate SVG strings for each molecule

    Returns:
        dict with keys:
          - core_smarts: the core used
          - core_smiles: SMILES of the core (for display)
          - rgroup_columns: list of column names ["Core","R1","R2",...]
          - decomposition: list of dicts, one per matched molecule
          - unmatched: list of SMILES that didn't match
          - num_matched: count of matched molecules
          - num_unmatched: count unmatched
          - success_rate: fraction matched
          - rgroup_frequency: {Rn: {substituent_smiles: count}}
    """
    result: Dict[str, Any] = {
        "core_smarts": None,
        "core_smiles": None,
        "rgroup_columns": [],
        "decomposition": [],
        "unmatched": [],
        "num_matched": 0,
        "num_unmatched": 0,
        "success_rate": 0.0,
        "rgroup_frequency": {},
        "error": None,
    }

    if not smiles_list:
        result["error"] = "No SMILES provided"
        return result

    if labels is None:
        labels = [f"Mol_{i}" for i in range(len(smiles_list))]

    # Parse molecules
    mols = []
    valid_indices = []
    for i, smi in enumerate(smiles_list):
        m = Chem.MolFromSmiles(smi)
        if m is not None:
            mols.append(m)
            valid_indices.append(i)
        else:
            result["unmatched"].append(smi)

    if len(mols) < 2:
        result["error"] = "Need at least 2 valid molecules for decomposition"
        return result

    # Detect or parse core
    if core_smarts is None:
        core_smarts = _auto_detect_core(mols)
        if core_smarts is None:
            result["error"] = "Could not auto-detect a common core; please provide core_smarts"
            return result
        logger.info(f"Auto-detected core: {core_smarts}")

    core_mol = Chem.MolFromSmarts(core_smarts)
    if core_mol is None:
        result["error"] = f"Invalid core SMARTS: {core_smarts}"
        return result

    result["core_smarts"] = core_smarts
    try:
        core_mol_for_display = Chem.MolFromSmarts(core_smarts)
        if core_mol_for_display:
            result["core_smiles"] = Chem.MolToSmiles(core_mol_for_display)
    except Exception:
        pass

    # Configure R-group decomposition
    params = RGroupDecompositionParameters()
    params.alignment = RGroupCoreAlignment.MCS
    params.scoreMethod = RGroupScore.FingerprintVariance
    params.removeHydrogensPostMatch = True

    try:
        rows, unmatched_idxs = RGroupDecompose([core_mol], mols, asSmiles=True, asRows=True, options=params)
    except Exception as e:
        result["error"] = f"RGroupDecompose failed: {e}"
        logger.error(f"RGroupDecompose error: {e}", exc_info=True)
        return result

    if not rows:
        result["error"] = "RGroupDecompose returned no results"
        return result

    # Build column list
    if rows:
        rgroup_columns = list(rows[0].keys())
        result["rgroup_columns"] = rgroup_columns

    # Map unmatched
    unmatched_smiles = [smiles_list[valid_indices[i]] for i in unmatched_idxs if i < len(valid_indices)]
    result["unmatched"].extend(unmatched_smiles)

    # Build decomposition records
    matched_valid_indices = [i for i in range(len(mols)) if i not in unmatched_idxs]
    rgroup_freq: Dict[str, Dict[str, int]] = {}

    for row_idx, row in enumerate(rows):
        orig_idx = valid_indices[matched_valid_indices[row_idx]] if row_idx < len(matched_valid_indices) else -1
        record: Dict[str, Any] = {
            "index": orig_idx,
            "label": labels[orig_idx] if orig_idx >= 0 else f"Match_{row_idx}",
            "original_smiles": smiles_list[orig_idx] if orig_idx >= 0 else "",
            **row,
        }

        # Add properties if provided
        if properties and orig_idx >= 0:
            for prop_name, prop_vals in properties.items():
                if orig_idx < len(prop_vals):
                    record[prop_name] = prop_vals[orig_idx]

        # Generate SVG
        if generate_svgs and orig_idx >= 0:
            mol = mols[matched_valid_indices[row_idx]]
            record["svg"] = _mol_svg(mol)

        result["decomposition"].append(record)

        # Count R-group frequencies
        for col in rgroup_columns:
            if col == "Core":
                continue
            rg_smi = row.get(col, "")
            if rg_smi:
                rgroup_freq.setdefault(col, {})
                rgroup_freq[col][rg_smi] = rgroup_freq[col].get(rg_smi, 0) + 1

    result["rgroup_frequency"] = rgroup_freq
    result["num_matched"] = len(rows)
    result["num_unmatched"] = len(result["unmatched"])
    total = len(smiles_list)
    result["success_rate"] = round(result["num_matched"] / total, 4) if total else 0.0

    return result
