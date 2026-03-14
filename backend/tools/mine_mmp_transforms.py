"""
Tool: mine_mmp_transforms
Matched Molecular Pair (MMP) analysis using RDKit's rdMMPA module.
Finds pairs of molecules that differ by exactly one structural change,
quantifies property effects, and ranks transforms by impact.
"""

import logging
from collections import defaultdict
from itertools import combinations
from typing import List, Optional, Dict, Any, Tuple

from rdkit import Chem
from rdkit.Chem import AllChem, DataStructs
from rdkit.Chem import rdMMPA

logger = logging.getLogger(__name__)

MAX_FRAGMENT_HEAVY_ATOMS = 13  # max size of variable fragment for a "clean" MMP


def _canonical(smiles: str) -> Optional[str]:
    mol = Chem.MolFromSmiles(smiles)
    return Chem.MolToSmiles(mol) if mol else None


def _fragment_mol(mol: Chem.Mol, max_cuts: int = 1) -> List[Tuple[str, str]]:
    """
    Fragment a molecule using rdMMPA (MMPA-style single bond cuts).
    Returns list of (core_smiles, sidechain_smiles) tuples.

    rdMMPA.FragmentMol with maxCuts=1 returns ('', 'frag_a.frag_b') — the core
    is always an empty string for single-cut MMPs and both halves of the cut are
    joined with a dot in the second element.  We split them and designate the
    larger fragment as the core (constant part) and the smaller as the sidechain
    (variable part).
    """
    try:
        frags = rdMMPA.FragmentMol(mol, maxCuts=max_cuts, resultsAsMols=False)
        result = []
        for pair in frags:
            if len(pair) != 2:
                continue
            core_smi, side_smi = pair

            if not core_smi and side_smi:
                # Single-cut output: side_smi = 'frag_a.[*:1].frag_b.[*:1]' (dot-joined)
                parts = side_smi.split(".")
                if len(parts) != 2:
                    continue
                f1, f2 = parts[0], parts[1]
                m1 = Chem.MolFromSmiles(f1)
                m2 = Chem.MolFromSmiles(f2)
                if m1 is None or m2 is None:
                    continue
                # Larger fragment = core, smaller = sidechain
                if m1.GetNumHeavyAtoms() >= m2.GetNumHeavyAtoms():
                    result.append((f1, f2))
                else:
                    result.append((f2, f1))

            elif core_smi and side_smi:
                # Multi-cut or traditional format
                result.append((core_smi, side_smi))

        return result
    except Exception as e:
        logger.debug(f"Fragment failed: {e}")
        return []


def _safe_mean(vals):
    return sum(vals) / len(vals) if vals else 0.0


def mine_mmp_transforms(
    smiles_list: List[str],
    properties: Optional[Dict[str, List[float]]] = None,
    labels: Optional[List[str]] = None,
    max_fragment_heavy_atoms: int = MAX_FRAGMENT_HEAVY_ATOMS,
    max_pairs: int = 5000,
) -> Dict[str, Any]:
    """
    Mine matched molecular pairs from a compound set.

    Args:
        smiles_list:              Input SMILES
        properties:               {prop_name: [float values]} same length as smiles_list
        labels:                   Optional molecule identifiers
        max_fragment_heavy_atoms: Ignore transforms where variable part > N heavy atoms
        max_pairs:                Cap on total MMPs to avoid combinatorial explosion

    Returns:
        dict with keys:
          - num_valid_molecules
          - num_pairs: total MMPs found
          - pairs: list of MMP records
          - transforms: aggregated transform stats
          - top_transforms_by_property: {prop: sorted list}
          - property_names
    """
    result: Dict[str, Any] = {
        "num_valid_molecules": 0,
        "num_pairs": 0,
        "pairs": [],
        "transforms": {},
        "top_transforms_by_property": {},
        "property_names": list(properties.keys()) if properties else [],
        "error": None,
    }

    if not smiles_list:
        result["error"] = "No SMILES provided"
        return result

    if labels is None:
        labels = [f"Mol_{i}" for i in range(len(smiles_list))]

    # Parse molecules
    mol_data = []  # list of (idx, mol, smiles, label)
    for i, smi in enumerate(smiles_list):
        mol = Chem.MolFromSmiles(smi)
        if mol is not None:
            mol_data.append((i, mol, smi, labels[i]))

    result["num_valid_molecules"] = len(mol_data)
    if len(mol_data) < 2:
        result["error"] = "Need at least 2 valid molecules"
        return result

    # Fragment all molecules: {core_smi: [(mol_idx, sidechain_smi)]}
    core_index: Dict[str, List[Tuple[int, str]]] = defaultdict(list)
    for idx, mol, smi, label in mol_data:
        frags = _fragment_mol(mol, max_cuts=1)
        for core_smi, side_smi in frags:
            # Filter large sidechains
            side_mol = Chem.MolFromSmiles(side_smi)
            if side_mol and side_mol.GetNumHeavyAtoms() <= max_fragment_heavy_atoms:
                core_index[core_smi].append((idx, side_smi))

    # Find MMPs: same core, different sidechain
    pairs = []
    mol_idx_map = {d[0]: d for d in mol_data}

    for core_smi, mol_side_list in core_index.items():
        if len(mol_side_list) < 2:
            continue
        seen_pairs: set = set()
        for (idx_a, side_a), (idx_b, side_b) in combinations(mol_side_list, 2):
            if idx_a == idx_b:
                continue
            pair_key = (min(idx_a, idx_b), max(idx_a, idx_b), core_smi)
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            if side_a == side_b:
                continue

            # Build transform string: A>>B (canonical smaller→larger or alphabetical)
            can_a = _canonical(side_a) or side_a
            can_b = _canonical(side_b) or side_b
            transform = f"{can_a}>>{can_b}" if can_a <= can_b else f"{can_b}>>{can_a}"
            a_first = can_a <= can_b

            pair_record: Dict[str, Any] = {
                "mol_a_idx": idx_a if a_first else idx_b,
                "mol_b_idx": idx_b if a_first else idx_a,
                "mol_a_label": mol_idx_map[idx_a if a_first else idx_b][3],
                "mol_b_label": mol_idx_map[idx_b if a_first else idx_a][3],
                "mol_a_smiles": mol_idx_map[idx_a if a_first else idx_b][2],
                "mol_b_smiles": mol_idx_map[idx_b if a_first else idx_a][2],
                "core": core_smi,
                "from_frag": can_a if a_first else can_b,
                "to_frag": can_b if a_first else can_a,
                "transform": transform,
                "property_deltas": {},
            }

            # Property deltas
            if properties:
                a_orig_idx = idx_a if a_first else idx_b
                b_orig_idx = idx_b if a_first else idx_a
                for prop_name, prop_vals in properties.items():
                    if a_orig_idx < len(prop_vals) and b_orig_idx < len(prop_vals):
                        val_a = prop_vals[a_orig_idx]
                        val_b = prop_vals[b_orig_idx]
                        if val_a is not None and val_b is not None:
                            try:
                                pair_record["property_deltas"][prop_name] = round(
                                    float(val_b) - float(val_a), 4
                                )
                            except (TypeError, ValueError):
                                pass

            pairs.append(pair_record)
            if len(pairs) >= max_pairs:
                logger.warning(f"MMP pair cap ({max_pairs}) reached; stopping early")
                break
        if len(pairs) >= max_pairs:
            break

    result["num_pairs"] = len(pairs)
    result["pairs"] = pairs

    # Aggregate transforms
    transform_agg: Dict[str, Dict] = defaultdict(lambda: {"count": 0, "property_deltas": defaultdict(list)})
    for pair in pairs:
        t = pair["transform"]
        transform_agg[t]["count"] += 1
        transform_agg[t]["from_frag"] = pair["from_frag"]
        transform_agg[t]["to_frag"] = pair["to_frag"]
        for prop, delta in pair["property_deltas"].items():
            transform_agg[t]["property_deltas"][prop].append(delta)

    transforms_out = {}
    for t, agg in transform_agg.items():
        rec: Dict[str, Any] = {
            "transform": t,
            "from_frag": agg["from_frag"],
            "to_frag": agg["to_frag"],
            "count": agg["count"],
            "mean_deltas": {},
            "std_deltas": {},
        }
        for prop, deltas in agg["property_deltas"].items():
            import math
            rec["mean_deltas"][prop] = round(_safe_mean(deltas), 4)
            if len(deltas) > 1:
                m = _safe_mean(deltas)
                rec["std_deltas"][prop] = round(math.sqrt(sum((d - m) ** 2 for d in deltas) / (len(deltas) - 1)), 4)
        transforms_out[t] = rec

    result["transforms"] = transforms_out

    # Top transforms per property
    if properties:
        for prop_name in properties.keys():
            ranked = sorted(
                [rec for rec in transforms_out.values() if prop_name in rec["mean_deltas"]],
                key=lambda r: abs(r["mean_deltas"][prop_name]),
                reverse=True,
            )
            result["top_transforms_by_property"][prop_name] = [
                {
                    "transform": r["transform"],
                    "from": r["from_frag"],
                    "to": r["to_frag"],
                    "mean_delta": r["mean_deltas"][prop_name],
                    "count": r["count"],
                }
                for r in ranked[:20]
            ]

    return result
