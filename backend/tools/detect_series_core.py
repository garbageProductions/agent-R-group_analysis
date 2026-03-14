"""
Tool: detect_series_core
Determines the best analysis strategy for a compound set:
  - Common-core R-group decomposition
  - Scaffold-family analysis
  - Matched molecular pair (MMP) analysis

Uses MCS (Maximum Common Substructure) and Murcko scaffold clustering.
"""

import logging
from collections import Counter
from typing import List, Optional, Dict, Any

from rdkit import Chem
from rdkit.Chem import rdFMCS, AllChem
from rdkit.Chem.Scaffolds import MurckoScaffold

logger = logging.getLogger(__name__)

# Thresholds for strategy selection
MCS_COVERAGE_RGROUP_THRESHOLD = 0.60   # >60% atom coverage → rgroup
MCS_COVERAGE_SCAFFOLD_THRESHOLD = 0.30  # 30-60% → scaffold families
SCAFFOLD_DOMINANCE_THRESHOLD = 0.50     # >50% in one scaffold → scaffold family


def _mol_from_smiles(smiles: str) -> Optional[Chem.Mol]:
    mol = Chem.MolFromSmiles(smiles)
    if mol is not None:
        Chem.SanitizeMol(mol)
    return mol


def _get_murcko_scaffold(mol) -> Optional[str]:
    try:
        scaffold = MurckoScaffold.GetScaffoldForMol(mol)
        if scaffold is not None:
            return Chem.MolToSmiles(scaffold)
    except Exception:
        pass
    return None


def _get_generic_scaffold(mol) -> Optional[str]:
    try:
        scaffold = MurckoScaffold.GetScaffoldForMol(mol)
        generic = MurckoScaffold.MakeScaffoldGeneric(scaffold)
        if generic is not None:
            return Chem.MolToSmiles(generic)
    except Exception:
        pass
    return None


def _compute_mcs(mols: List[Chem.Mol], timeout: int = 10) -> Optional[str]:
    """Run MCS on a list of mols; return SMARTS or None."""
    if len(mols) < 2:
        return None
    try:
        result = rdFMCS.FindMCS(
            mols,
            timeout=timeout,
            ringMatchesRingOnly=True,
            completeRingsOnly=True,
            atomCompare=rdFMCS.AtomCompare.CompareElements,
            bondCompare=rdFMCS.BondCompare.CompareOrder,
        )
        if result.canceled:
            logger.warning("MCS timed out; partial result returned")
        if result.numAtoms > 0:
            return result.smartsString
    except Exception as e:
        logger.error(f"MCS failed: {e}")
    return None


def _mcs_coverage(mol, mcs_smarts: str) -> float:
    """Fraction of mol's heavy atoms covered by MCS match."""
    try:
        patt = Chem.MolFromSmarts(mcs_smarts)
        if patt is None:
            return 0.0
        matches = mol.GetSubstructMatches(patt)
        if not matches:
            return 0.0
        matched_atoms = len(matches[0])
        return matched_atoms / mol.GetNumHeavyAtoms()
    except Exception:
        return 0.0


def detect_series_core(
    smiles_list: List[str],
    property_col: Optional[str] = None,
    mcs_timeout: int = 15,
) -> Dict[str, Any]:
    """
    Analyze a compound set to determine the optimal analysis strategy.

    Args:
        smiles_list: List of SMILES strings
        property_col: Optional property name (informational only)
        mcs_timeout: Seconds before MCS gives up

    Returns:
        dict with keys:
          - mcs_smarts: SMARTS of maximum common substructure
          - mcs_num_atoms: size of MCS
          - mean_mcs_coverage: average atom coverage across molecules
          - molecules_matching_mcs: count that match MCS
          - murcko_scaffolds: {smiles: count} scaffold distribution
          - num_unique_scaffolds: number of distinct Murcko scaffolds
          - dominant_scaffold: most common scaffold SMILES
          - dominant_scaffold_fraction: fraction in dominant scaffold
          - generic_scaffold: atom-type-agnostic scaffold
          - recommended_approach: 'rgroup' | 'scaffold_family' | 'mmp'
          - recommendation_reason: human-readable explanation
          - valid_mols: count of parseable molecules
          - invalid_mols: count of failures
    """
    result: Dict[str, Any] = {
        "mcs_smarts": None,
        "mcs_num_atoms": 0,
        "mean_mcs_coverage": 0.0,
        "molecules_matching_mcs": 0,
        "murcko_scaffolds": {},
        "num_unique_scaffolds": 0,
        "dominant_scaffold": None,
        "dominant_scaffold_fraction": 0.0,
        "generic_scaffold": None,
        "recommended_approach": "mmp",
        "recommendation_reason": "Default fallback to MMP analysis",
        "valid_mols": 0,
        "invalid_mols": 0,
    }

    mols = []
    invalid = []
    for i, smi in enumerate(smiles_list):
        m = _mol_from_smiles(smi)
        if m is not None:
            mols.append(m)
        else:
            invalid.append(i)

    result["valid_mols"] = len(mols)
    result["invalid_mols"] = len(invalid)

    if len(mols) < 2:
        result["recommendation_reason"] = "Too few valid molecules for analysis"
        return result

    # --- Murcko scaffold distribution ---
    scaffolds = []
    for mol in mols:
        s = _get_murcko_scaffold(mol)
        scaffolds.append(s if s else "__no_scaffold__")

    scaffold_counts = Counter(scaffolds)
    most_common_scaffold, most_common_count = scaffold_counts.most_common(1)[0]

    result["murcko_scaffolds"] = dict(scaffold_counts.most_common(20))
    result["num_unique_scaffolds"] = len(scaffold_counts)
    result["dominant_scaffold"] = most_common_scaffold if most_common_scaffold != "__no_scaffold__" else None
    result["dominant_scaffold_fraction"] = round(most_common_count / len(mols), 4)

    if result["dominant_scaffold"]:
        try:
            dom_mol = _mol_from_smiles(result["dominant_scaffold"])
            result["generic_scaffold"] = _get_generic_scaffold(dom_mol) if dom_mol else None
        except Exception:
            pass

    # --- MCS analysis ---
    # Sample up to 50 molecules for MCS to keep it fast
    mcs_sample = mols[:50] if len(mols) > 50 else mols
    mcs_smarts = _compute_mcs(mcs_sample, timeout=mcs_timeout)

    if mcs_smarts:
        result["mcs_smarts"] = mcs_smarts
        patt = Chem.MolFromSmarts(mcs_smarts)
        result["mcs_num_atoms"] = patt.GetNumAtoms() if patt else 0

        coverages = [_mcs_coverage(mol, mcs_smarts) for mol in mols]
        matching = sum(1 for c in coverages if c > 0)
        result["mean_mcs_coverage"] = round(sum(coverages) / len(coverages), 4)
        result["molecules_matching_mcs"] = matching

    # --- Strategy recommendation ---
    mean_cov = result["mean_mcs_coverage"]
    dom_frac = result["dominant_scaffold_fraction"]
    num_scaffolds = result["num_unique_scaffolds"]

    if mean_cov >= MCS_COVERAGE_RGROUP_THRESHOLD and result["molecules_matching_mcs"] >= len(mols) * 0.7:
        result["recommended_approach"] = "rgroup"
        result["recommendation_reason"] = (
            f"Strong common core: MCS covers {mean_cov:.0%} of atoms on average "
            f"across {result['molecules_matching_mcs']}/{len(mols)} molecules. "
            "R-group decomposition recommended."
        )
    elif dom_frac >= SCAFFOLD_DOMINANCE_THRESHOLD or num_scaffolds <= max(3, len(mols) // 5):
        result["recommended_approach"] = "scaffold_family"
        result["recommendation_reason"] = (
            f"{num_scaffolds} unique Murcko scaffolds found; "
            f"dominant scaffold covers {dom_frac:.0%} of the set. "
            "Scaffold-family analysis recommended."
        )
    else:
        result["recommended_approach"] = "mmp"
        result["recommendation_reason"] = (
            f"Low structural convergence (MCS coverage {mean_cov:.0%}, "
            f"{num_scaffolds} scaffolds). "
            "Matched Molecular Pair analysis recommended."
        )

    return result
