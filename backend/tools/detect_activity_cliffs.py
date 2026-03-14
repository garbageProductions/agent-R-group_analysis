"""
Tool: detect_activity_cliffs  [ADDITIONAL AGENT]
Identifies activity cliffs: pairs of structurally similar compounds
with large differences in biological activity.

Uses SALI (Structure-Activity Landscape Index) and Tanimoto similarity.
Critical for understanding SAR sensitivity and guiding medicinal chemistry.
"""

import logging
import math
from itertools import combinations
from typing import List, Optional, Dict, Any

from rdkit import Chem
from rdkit.Chem import AllChem, DataStructs

logger = logging.getLogger(__name__)


def _morgan_fp(mol: Chem.Mol, radius: int = 2, nbits: int = 2048):
    return AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=nbits)


def _tanimoto(fp1, fp2) -> float:
    return DataStructs.TanimotoSimilarity(fp1, fp2)


def _sali(activity_a: float, activity_b: float, similarity: float) -> Optional[float]:
    """
    Structure-Activity Landscape Index:
    SALI = |activity_A - activity_B| / (1 - similarity)
    Higher SALI → steeper cliff (large activity change, small structural change).
    """
    denominator = 1.0 - similarity
    if denominator < 1e-9:
        return None  # identical structures
    return abs(activity_a - activity_b) / denominator


def detect_activity_cliffs(
    smiles_list: List[str],
    activity_values: List[float],
    labels: Optional[List[str]] = None,
    activity_in_log: bool = True,
    similarity_threshold: float = 0.7,
    activity_diff_threshold: float = 1.0,
    sali_percentile: float = 90.0,
    morgan_radius: int = 2,
    morgan_bits: int = 2048,
) -> Dict[str, Any]:
    """
    Detect activity cliffs in a compound set.

    Args:
        smiles_list:            Input SMILES
        activity_values:        Corresponding activity values (e.g., pIC50)
        labels:                 Optional molecule IDs
        activity_in_log:        If True, values are already in log scale (pIC50, pKd, etc.)
        similarity_threshold:   Tanimoto cutoff to consider pairs 'similar' (default 0.7)
        activity_diff_threshold: Minimum |activity difference| to flag as cliff
        sali_percentile:        SALI percentile above which pairs are "cliff" pairs
        morgan_radius:          Morgan fingerprint radius
        morgan_bits:            Morgan fingerprint bit size

    Returns:
        dict with keys:
          - num_molecules
          - num_cliff_pairs
          - num_similar_pairs
          - cliff_pairs: sorted list of MMP cliff records
          - sali_threshold: SALI value at the given percentile
          - activity_landscape_stats
          - most_promiscuous_cliffs: molecules involved in most cliffs
          - scaffold_cliff_enrichment: if any scaffold has disproportionate cliffs
    """
    result: Dict[str, Any] = {
        "num_molecules": 0,
        "num_cliff_pairs": 0,
        "num_similar_pairs": 0,
        "cliff_pairs": [],
        "sali_threshold": None,
        "activity_landscape_stats": {},
        "most_promiscuous_cliffs": [],
        "error": None,
    }

    if len(smiles_list) != len(activity_values):
        result["error"] = "smiles_list and activity_values must be the same length"
        return result

    if labels is None:
        labels = [f"Mol_{i}" for i in range(len(smiles_list))]

    # Parse and filter valid molecules
    mol_data = []
    for i, (smi, act, lab) in enumerate(zip(smiles_list, activity_values, labels)):
        if act is None:
            continue
        mol = Chem.MolFromSmiles(smi)
        if mol is not None:
            try:
                fp = _morgan_fp(mol, morgan_radius, morgan_bits)
                mol_data.append({
                    "idx": i, "smiles": smi, "label": lab,
                    "activity": float(act), "fp": fp,
                })
            except Exception:
                pass

    result["num_molecules"] = len(mol_data)
    if len(mol_data) < 2:
        result["error"] = "Need at least 2 valid molecules with activity data"
        return result

    # Compute all pairwise SALI scores
    all_sali_scores = []
    all_pairs = []

    for a, b in combinations(range(len(mol_data)), 2):
        da = mol_data[a]
        db = mol_data[b]

        sim = _tanimoto(da["fp"], db["fp"])
        act_diff = abs(da["activity"] - db["activity"])
        sali = _sali(da["activity"], db["activity"], sim)

        if sali is not None:
            all_sali_scores.append(sali)

        pair = {
            "mol_a_idx": da["idx"],
            "mol_b_idx": db["idx"],
            "mol_a_label": da["label"],
            "mol_b_label": db["label"],
            "mol_a_smiles": da["smiles"],
            "mol_b_smiles": db["smiles"],
            "mol_a_activity": round(da["activity"], 4),
            "mol_b_activity": round(db["activity"], 4),
            "activity_diff": round(act_diff, 4),
            "tanimoto_similarity": round(sim, 4),
            "sali": round(sali, 4) if sali is not None else None,
            "is_similar_pair": sim >= similarity_threshold,
            "is_activity_cliff": (
                sim >= similarity_threshold
                and act_diff >= activity_diff_threshold
            ),
        }
        all_pairs.append(pair)

    # SALI threshold at given percentile
    if all_sali_scores:
        all_sali_scores_sorted = sorted(all_sali_scores)
        pct_idx = int(len(all_sali_scores_sorted) * sali_percentile / 100)
        pct_idx = min(pct_idx, len(all_sali_scores_sorted) - 1)
        result["sali_threshold"] = round(all_sali_scores_sorted[pct_idx], 4)

    similar_pairs = [p for p in all_pairs if p["is_similar_pair"]]
    cliff_pairs = [p for p in all_pairs if p["is_activity_cliff"]]

    # Sort cliff pairs by SALI descending
    cliff_pairs.sort(key=lambda p: p["sali"] or 0, reverse=True)

    result["num_similar_pairs"] = len(similar_pairs)
    result["num_cliff_pairs"] = len(cliff_pairs)
    result["cliff_pairs"] = cliff_pairs[:200]  # cap output

    # Activity landscape stats
    all_activities = [d["activity"] for d in mol_data]
    act_diffs = [p["activity_diff"] for p in similar_pairs]

    def safe_stat(vals, func):
        try:
            return round(func(vals), 4) if vals else None
        except Exception:
            return None

    result["activity_landscape_stats"] = {
        "mean_activity": safe_stat(all_activities, lambda v: sum(v) / len(v)),
        "activity_range": round(max(all_activities) - min(all_activities), 4) if all_activities else None,
        "mean_tanimoto_similar_pairs": safe_stat(
            [p["tanimoto_similarity"] for p in similar_pairs],
            lambda v: sum(v) / len(v)
        ),
        "mean_activity_diff_similar_pairs": safe_stat(act_diffs, lambda v: sum(v) / len(v)),
        "max_sali": safe_stat(all_sali_scores, max),
        "mean_sali": safe_stat(all_sali_scores, lambda v: sum(v) / len(v)),
        "cliff_fraction": round(len(cliff_pairs) / max(len(similar_pairs), 1), 4),
    }

    # Most promiscuous cliff molecules
    cliff_involvement: Dict[str, int] = {}
    for pair in cliff_pairs:
        cliff_involvement[pair["mol_a_label"]] = cliff_involvement.get(pair["mol_a_label"], 0) + 1
        cliff_involvement[pair["mol_b_label"]] = cliff_involvement.get(pair["mol_b_label"], 0) + 1

    result["most_promiscuous_cliffs"] = [
        {"label": lab, "num_cliff_pairs": cnt}
        for lab, cnt in sorted(cliff_involvement.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    return result
