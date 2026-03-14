"""
Tool: diversity_analysis  [ADDITIONAL AGENT]
Assesses chemical space coverage and diversity of a compound set.
Performs fingerprint-based clustering, MaxMin diverse subset selection,
and identifies chemical space gaps in the SAR.
"""

import logging
import math
from typing import List, Optional, Dict, Any, Tuple

from rdkit import Chem
from rdkit.Chem import AllChem, DataStructs, rdMolDescriptors

logger = logging.getLogger(__name__)


def _morgan_fp(mol, radius: int = 2, nbits: int = 2048):
    return AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=nbits)


def _tanimoto_matrix(fps) -> List[List[float]]:
    n = len(fps)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 1.0
        for j in range(i + 1, n):
            sim = DataStructs.TanimotoSimilarity(fps[i], fps[j])
            matrix[i][j] = sim
            matrix[j][i] = sim
    return matrix


def _maxmin_pick(fps, n_select: int, seed_idx: int = 0) -> List[int]:
    """
    MaxMin diversity picking: iteratively selects the molecule most dissimilar
    to all already-selected molecules.
    """
    if n_select >= len(fps):
        return list(range(len(fps)))

    selected = [seed_idx]
    remaining = list(range(len(fps)))
    remaining.remove(seed_idx)

    # Track min-similarity to selected set for each remaining molecule
    min_sims = [DataStructs.TanimotoSimilarity(fps[seed_idx], fps[i]) for i in remaining]

    while len(selected) < n_select and remaining:
        # Pick the molecule with the smallest min-similarity to selected
        min_idx = min(range(len(remaining)), key=lambda i: min_sims[i])
        chosen = remaining[min_idx]
        selected.append(chosen)
        remaining.pop(min_idx)
        min_sims.pop(min_idx)

        # Update min_sims for remaining
        new_fps = fps[chosen]
        for i, r_idx in enumerate(remaining):
            sim = DataStructs.TanimotoSimilarity(new_fps, fps[r_idx])
            if sim < min_sims[i]:
                min_sims[i] = sim

    return selected


def _leader_cluster(fps, similarity_cutoff: float = 0.65) -> Dict[int, List[int]]:
    """
    Simple leader clustering: assign each molecule to the first cluster
    whose centroid has Tanimoto ≥ cutoff, else create new cluster.
    """
    clusters: Dict[int, List[int]] = {}  # leader_idx -> [member_idxs]
    leaders: List[int] = []

    for i, fp in enumerate(fps):
        assigned = False
        for leader in leaders:
            sim = DataStructs.TanimotoSimilarity(fps[leader], fp)
            if sim >= similarity_cutoff:
                clusters[leader].append(i)
                assigned = True
                break
        if not assigned:
            leaders.append(i)
            clusters[i] = [i]

    return clusters


def diversity_analysis(
    smiles_list: List[str],
    labels: Optional[List[str]] = None,
    n_diverse: int = 10,
    cluster_cutoff: float = 0.65,
    morgan_radius: int = 2,
    morgan_bits: int = 2048,
) -> Dict[str, Any]:
    """
    Analyze chemical diversity of a compound set.

    Args:
        smiles_list:    Input SMILES
        labels:         Molecule identifiers
        n_diverse:      Number of diverse compounds to select (MaxMin)
        cluster_cutoff: Tanimoto cutoff for clustering (default 0.65)
        morgan_radius:  Morgan fingerprint radius
        morgan_bits:    Morgan fingerprint bit size

    Returns:
        dict with keys:
          - num_molecules
          - mean_tanimoto: average pairwise Tanimoto
          - diversity_score: 1 - mean_tanimoto (higher = more diverse)
          - num_clusters
          - clusters: cluster assignments {cluster_leader_label: [member_labels]}
          - cluster_sizes: distribution of cluster sizes
          - diverse_subset: labels of MaxMin-selected diverse compounds
          - diverse_subset_smiles: SMILES of diverse subset
          - coverage_stats: coverage of chemical space by selected subset
          - singleton_clusters: clusters with only one member (unique scaffolds)
    """
    result: Dict[str, Any] = {
        "num_molecules": 0,
        "mean_tanimoto": None,
        "diversity_score": None,
        "num_clusters": 0,
        "clusters": {},
        "cluster_sizes": {},
        "diverse_subset": [],
        "diverse_subset_smiles": [],
        "coverage_stats": {},
        "singleton_clusters": 0,
        "error": None,
    }

    if labels is None:
        labels = [f"Mol_{i}" for i in range(len(smiles_list))]

    # Parse and fingerprint
    valid_data = []
    fps = []
    for i, smi in enumerate(smiles_list):
        mol = Chem.MolFromSmiles(smi)
        if mol is not None:
            try:
                fp = _morgan_fp(mol, morgan_radius, morgan_bits)
                fps.append(fp)
                valid_data.append({"idx": i, "smiles": smi, "label": labels[i]})
            except Exception:
                pass

    n = len(valid_data)
    result["num_molecules"] = n

    if n < 2:
        result["error"] = "Need at least 2 valid molecules"
        return result

    # Mean pairwise Tanimoto (sample if large)
    sample_size = min(n, 200)
    sample_indices = list(range(sample_size))
    pairwise_sims = []
    for i in range(sample_size):
        for j in range(i + 1, sample_size):
            pairwise_sims.append(DataStructs.TanimotoSimilarity(fps[i], fps[j]))

    if pairwise_sims:
        mean_tanimoto = sum(pairwise_sims) / len(pairwise_sims)
        result["mean_tanimoto"] = round(mean_tanimoto, 4)
        result["diversity_score"] = round(1.0 - mean_tanimoto, 4)

    # Clustering
    clusters = _leader_cluster(fps, similarity_cutoff=cluster_cutoff)
    result["num_clusters"] = len(clusters)

    clusters_labeled: Dict[str, List[str]] = {}
    cluster_sizes = []
    singletons = 0

    for leader_local_idx, member_local_idxs in clusters.items():
        leader_label = valid_data[leader_local_idx]["label"]
        member_labels = [valid_data[i]["label"] for i in member_local_idxs]
        clusters_labeled[leader_label] = member_labels
        cluster_sizes.append(len(member_labels))
        if len(member_labels) == 1:
            singletons += 1

    result["clusters"] = clusters_labeled
    result["singleton_clusters"] = singletons

    # Cluster size distribution
    size_dist: Dict[str, int] = {}
    for size in cluster_sizes:
        bucket = str(size) if size <= 5 else "6+"
        size_dist[bucket] = size_dist.get(bucket, 0) + 1
    result["cluster_sizes"] = size_dist

    # MaxMin diverse subset
    actual_n_diverse = min(n_diverse, n)
    diverse_local_indices = _maxmin_pick(fps, actual_n_diverse)
    result["diverse_subset"] = [valid_data[i]["label"] for i in diverse_local_indices]
    result["diverse_subset_smiles"] = [valid_data[i]["smiles"] for i in diverse_local_indices]

    # Coverage stats: how well does the diverse subset represent the full set?
    if diverse_local_indices and n > len(diverse_local_indices):
        diverse_fps = [fps[i] for i in diverse_local_indices]
        max_sims_to_diverse = []
        for j in range(n):
            if j not in diverse_local_indices:
                max_sim = max(DataStructs.TanimotoSimilarity(fps[j], dfp) for dfp in diverse_fps)
                max_sims_to_diverse.append(max_sim)

        if max_sims_to_diverse:
            result["coverage_stats"] = {
                "mean_max_sim_to_diverse": round(sum(max_sims_to_diverse) / len(max_sims_to_diverse), 4),
                "fraction_within_0_4": round(
                    sum(1 for s in max_sims_to_diverse if s >= 0.4) / len(max_sims_to_diverse), 4
                ),
                "fraction_within_0_6": round(
                    sum(1 for s in max_sims_to_diverse if s >= 0.6) / len(max_sims_to_diverse), 4
                ),
                "n_diverse_selected": len(diverse_local_indices),
                "n_molecules_covered": len(max_sims_to_diverse),
            }

    return result
