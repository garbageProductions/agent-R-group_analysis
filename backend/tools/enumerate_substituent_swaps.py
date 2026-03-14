"""
Tool: enumerate_substituent_swaps
Generates a virtual library by swapping R-group substituents on a core scaffold.
Supports filtering by drug-likeness, molecular weight, and custom constraints.
"""

import logging
from itertools import product
from typing import List, Optional, Dict, Any

from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors

logger = logging.getLogger(__name__)

# Default built-in R-group library (common medicinal chemistry substituents)
DEFAULT_RGROUP_LIBRARY = {
    "aromatic": [
        "c1ccccc1",       # phenyl
        "c1ccncc1",       # pyridyl
        "c1ccoc1",        # furanyl
        "c1ccsc1",        # thienyl
        "c1cncc1",        # pyrimidyl
        "c1cc[nH]c1",     # pyrrolyl
        "c1ccc(F)cc1",    # 4-fluorophenyl
        "c1ccc(Cl)cc1",   # 4-chlorophenyl
        "c1ccc(C)cc1",    # 4-methylphenyl
        "c1ccc(OC)cc1",   # 4-methoxyphenyl
        "c1ccc(CF3)cc1",  # 4-trifluoromethylphenyl
    ],
    "aliphatic": [
        "C",              # methyl
        "CC",             # ethyl
        "CCC",            # propyl
        "C(C)C",          # isopropyl
        "C1CC1",          # cyclopropyl
        "C1CCCC1",        # cyclopentyl
        "C1CCCCC1",       # cyclohexyl
        "CC(F)(F)F",      # trifluoroethyl
    ],
    "polar": [
        "CO",             # methanol
        "CN",             # methylamine
        "C(=O)O",         # carboxylic acid
        "C(=O)N",         # amide
        "CS(=O)(=O)N",    # sulfonamide
        "CN1CCCC1",       # N-methylpyrrolidine
    ],
    "halogens": [
        "F", "Cl", "Br", "I",
    ],
}


def _compute_properties(mol: Chem.Mol) -> Dict[str, Any]:
    return {
        "mw": round(Descriptors.MolWt(mol), 2),
        "logp": round(Descriptors.MolLogP(mol), 2),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),
        "hba": rdMolDescriptors.CalcNumHBA(mol),
        "tpsa": round(Descriptors.TPSA(mol), 2),
        "num_rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "num_rings": rdMolDescriptors.CalcNumRings(mol),
        "num_heavy_atoms": mol.GetNumHeavyAtoms(),
        "lipinski_pass": (
            Descriptors.MolWt(mol) <= 500
            and Descriptors.MolLogP(mol) <= 5
            and rdMolDescriptors.CalcNumHBD(mol) <= 5
            and rdMolDescriptors.CalcNumHBA(mol) <= 10
        ),
    }


def _attach_rgroup(core_smiles: str, attachment_idx: int, rgroup_smiles: str) -> Optional[str]:
    """
    Attach an R-group SMILES to the attachment point [*:n] in the core.
    Replaces the nth dummy atom with the R-group.
    """
    try:
        # Build replacement SMILES: replace [*:n] with R-group
        marker = f"[*:{attachment_idx + 1}]"
        if marker not in core_smiles:
            return None

        # Use RDKit fragment combination
        core_mol = Chem.MolFromSmiles(core_smiles.replace(marker, f"[Xe]"))
        rg_mol = Chem.MolFromSmiles(rgroup_smiles)
        if core_mol is None or rg_mol is None:
            return None

        # Simple SMILES substitution approach
        new_smiles = core_smiles.replace(marker, f"({rgroup_smiles})")
        mol = Chem.MolFromSmiles(new_smiles)
        if mol is not None:
            Chem.SanitizeMol(mol)
            return Chem.MolToSmiles(mol)
    except Exception:
        pass
    return None


def _build_molecule_from_core_and_rgroups(
    core_smarts: str,
    rgroup_combo: Dict[int, str],
) -> Optional[str]:
    """
    Build a complete molecule by replacing dummy atoms [*:n] in core SMARTS
    with actual R-group SMILES fragments.
    """
    try:
        smi = core_smarts
        # Replace each attachment point in order
        for pos, rg_smi in sorted(rgroup_combo.items()):
            marker = f"[*:{pos}]"
            if marker in smi:
                smi = smi.replace(marker, rg_smi, 1)

        # Remove any remaining dummy atoms
        smi = smi.replace("[*]", "")

        mol = Chem.MolFromSmiles(smi)
        if mol is not None:
            Chem.SanitizeMol(mol)
            return Chem.MolToSmiles(mol)
    except Exception:
        pass
    return None


def enumerate_substituent_swaps(
    core_smarts: str,
    rgroup_library: Optional[Dict[int, List[str]]] = None,
    builtin_library_categories: Optional[List[str]] = None,
    constraints: Optional[Dict[str, Any]] = None,
    max_compounds: int = 10000,
) -> Dict[str, Any]:
    """
    Enumerate a virtual compound library by systematically replacing R-groups on a core.

    Args:
        core_smarts:                  Core SMARTS with [*:1], [*:2], etc. attachment points
        rgroup_library:               {position: [smiles_list]} for each attachment point
        builtin_library_categories:   Use built-in R-groups from categories
                                      ('aromatic', 'aliphatic', 'polar', 'halogens')
        constraints:                  Filters: {max_mw, max_logp, min_lipinski_pass, ...}
        max_compounds:                Hard cap on library size

    Returns:
        dict with keys:
          - core_smarts
          - num_attachment_points
          - num_rgroups_per_position
          - theoretical_library_size
          - enumerated_smiles: list of SMILES strings
          - enumerated_compounds: list of {smiles, properties, rgroup_combo}
          - num_enumerated
          - num_passing_filters
          - filter_pass_rate
    """
    result: Dict[str, Any] = {
        "core_smarts": core_smarts,
        "num_attachment_points": 0,
        "num_rgroups_per_position": {},
        "theoretical_library_size": 0,
        "enumerated_smiles": [],
        "enumerated_compounds": [],
        "num_enumerated": 0,
        "num_passing_filters": 0,
        "filter_pass_rate": 0.0,
        "error": None,
    }

    if not core_smarts:
        result["error"] = "No core SMARTS provided"
        return result

    # Determine attachment points
    import re
    attachment_points = sorted(set(int(m) for m in re.findall(r'\[(?:\*|#\d+):(\d+)\]', core_smarts)))
    if not attachment_points:
        # Try [*] without index
        attachment_points = [1] if "[*]" in core_smarts else []
        if not attachment_points:
            result["error"] = "No attachment points ([*:n]) found in core SMARTS"
            return result

    result["num_attachment_points"] = len(attachment_points)

    # Build per-position R-group lists
    pos_rgroups: Dict[int, List[str]] = {}

    if rgroup_library:
        pos_rgroups = {int(k): v for k, v in rgroup_library.items()}
    else:
        # Use built-in library
        cats = builtin_library_categories or list(DEFAULT_RGROUP_LIBRARY.keys())
        combined = []
        for cat in cats:
            if cat in DEFAULT_RGROUP_LIBRARY:
                combined.extend(DEFAULT_RGROUP_LIBRARY[cat])
        for pos in attachment_points:
            pos_rgroups[pos] = combined

    # Fill missing positions
    for pos in attachment_points:
        if pos not in pos_rgroups:
            pos_rgroups[pos] = DEFAULT_RGROUP_LIBRARY["aromatic"] + DEFAULT_RGROUP_LIBRARY["aliphatic"]

    result["num_rgroups_per_position"] = {str(p): len(v) for p, v in pos_rgroups.items()}

    # Theoretical size
    theoretical = 1
    for pos in attachment_points:
        theoretical *= len(pos_rgroups.get(pos, []))
    result["theoretical_library_size"] = theoretical

    # Default constraints
    if constraints is None:
        constraints = {}

    max_mw = constraints.get("max_mw", 600.0)
    max_logp = constraints.get("max_logp", 6.0)
    require_lipinski = constraints.get("require_lipinski", False)
    min_heavy_atoms = constraints.get("min_heavy_atoms", 5)
    max_heavy_atoms = constraints.get("max_heavy_atoms", 50)

    # Enumerate
    position_lists = [pos_rgroups.get(pos, []) for pos in attachment_points]
    enumerated = []
    passing = []
    count = 0

    for combo in product(*position_lists):
        if count >= max_compounds:
            logger.warning(f"Enumeration cap ({max_compounds}) reached")
            break

        rgroup_combo = {pos: rg for pos, rg in zip(attachment_points, combo)}
        mol_smiles = _build_molecule_from_core_and_rgroups(core_smarts, rgroup_combo)

        if mol_smiles is None:
            continue

        mol = Chem.MolFromSmiles(mol_smiles)
        if mol is None:
            continue

        count += 1
        props = _compute_properties(mol)

        passes = (
            props["mw"] <= max_mw
            and props["logp"] <= max_logp
            and props["num_heavy_atoms"] >= min_heavy_atoms
            and props["num_heavy_atoms"] <= max_heavy_atoms
            and (not require_lipinski or props["lipinski_pass"])
        )

        record = {
            "smiles": mol_smiles,
            "properties": props,
            "rgroup_combo": {str(k): v for k, v in rgroup_combo.items()},
            "passes_filters": passes,
        }
        enumerated.append(record)
        if passes:
            passing.append(record)

    result["enumerated_smiles"] = [r["smiles"] for r in passing]
    result["enumerated_compounds"] = enumerated
    result["num_enumerated"] = len(enumerated)
    result["num_passing_filters"] = len(passing)
    result["filter_pass_rate"] = round(len(passing) / len(enumerated), 4) if enumerated else 0.0

    return result
