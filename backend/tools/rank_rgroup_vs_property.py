"""
Tool: rank_rgroup_vs_property
Ranks R-group substituents by their association with a target property.
Performs per-position statistical analysis: mean, median, std, ANOVA,
pairwise enrichment, and best/worst substituent identification.
"""

import logging
import math
from collections import defaultdict
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)


def _safe_mean(vals):
    return sum(vals) / len(vals) if vals else None


def _safe_std(vals):
    if len(vals) < 2:
        return None
    mean = _safe_mean(vals)
    variance = sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)
    return math.sqrt(variance)


def _safe_median(vals):
    if not vals:
        return None
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2


def _anova_f(groups: Dict[str, List[float]]) -> Optional[float]:
    """One-way ANOVA F-statistic (manual, no scipy dependency)."""
    all_vals = [v for g in groups.values() for v in g]
    k = len(groups)
    n = len(all_vals)
    if k < 2 or n < k + 1:
        return None
    grand_mean = _safe_mean(all_vals)
    sst = sum((v - grand_mean) ** 2 for v in all_vals)
    ssw = sum(
        sum((v - _safe_mean(g)) ** 2 for v in g)
        for g in groups.values()
        if len(g) > 0
    )
    ssb = sst - ssw
    df_between = k - 1
    df_within = n - k
    if df_within <= 0 or ssw == 0:
        return None
    return (ssb / df_between) / (ssw / df_within)


def rank_rgroup_vs_property(
    decomposition: List[Dict[str, Any]],
    property_name: str,
    rgroup_columns: Optional[List[str]] = None,
    higher_is_better: bool = True,
    min_count: int = 2,
) -> Dict[str, Any]:
    """
    Rank substituents at each R-group position by their effect on a property.

    Args:
        decomposition:    List of records from rgroup_decompose_series
        property_name:    Name of the property column to analyse
        rgroup_columns:   Which R-group columns to analyse (default: all Rn columns)
        higher_is_better: If True, higher property values are preferred
        min_count:        Minimum observations required to include a substituent

    Returns:
        dict with keys:
          - property_name
          - rgroup_analyses: {Rn: {substituent: {mean, median, std, n, delta_from_mean}}}
          - ranked_substituents: {Rn: sorted list of (smiles, mean_value)}
          - best_substituents: {Rn: smiles of best substituent}
          - worst_substituents: {Rn: smiles of worst substituent}
          - anova_f_scores: {Rn: F-statistic}
          - global_property_stats: {mean, median, std, min, max, n}
          - position_importance: {Rn: variance explained estimate}
    """
    result: Dict[str, Any] = {
        "property_name": property_name,
        "rgroup_analyses": {},
        "ranked_substituents": {},
        "best_substituents": {},
        "worst_substituents": {},
        "anova_f_scores": {},
        "global_property_stats": {},
        "position_importance": {},
        "error": None,
    }

    if not decomposition:
        result["error"] = "Empty decomposition input"
        return result

    # Extract property values
    all_prop_vals = []
    for rec in decomposition:
        val = rec.get(property_name)
        if val is not None:
            try:
                all_prop_vals.append(float(val))
            except (TypeError, ValueError):
                pass

    if not all_prop_vals:
        result["error"] = f"Property '{property_name}' not found or all values are non-numeric"
        return result

    # Global stats
    result["global_property_stats"] = {
        "mean": round(_safe_mean(all_prop_vals), 4),
        "median": round(_safe_median(all_prop_vals), 4),
        "std": round(_safe_std(all_prop_vals) or 0.0, 4),
        "min": round(min(all_prop_vals), 4),
        "max": round(max(all_prop_vals), 4),
        "n": len(all_prop_vals),
    }
    global_mean = result["global_property_stats"]["mean"]

    # Determine R-group columns to analyse
    if rgroup_columns is None:
        sample = decomposition[0] if decomposition else {}
        rgroup_columns = [k for k in sample.keys() if k.startswith("R") and k[1:].isdigit()]

    # Per-position analysis
    for col in rgroup_columns:
        groups: Dict[str, List[float]] = defaultdict(list)
        for rec in decomposition:
            rg_smi = rec.get(col, "")
            prop_val = rec.get(property_name)
            if rg_smi and prop_val is not None:
                try:
                    groups[rg_smi].append(float(prop_val))
                except (TypeError, ValueError):
                    pass

        if not groups:
            continue

        # Filter by min_count
        groups = {k: v for k, v in groups.items() if len(v) >= min_count}
        if not groups:
            continue

        # Stats per substituent
        col_analysis: Dict[str, Any] = {}
        for smi, vals in groups.items():
            mean_val = _safe_mean(vals)
            col_analysis[smi] = {
                "mean": round(mean_val, 4),
                "median": round(_safe_median(vals), 4),
                "std": round(_safe_std(vals) or 0.0, 4),
                "n": len(vals),
                "delta_from_global_mean": round(mean_val - global_mean, 4),
                "values": vals,
            }

        result["rgroup_analyses"][col] = col_analysis

        # Ranked list
        ranked = sorted(
            [(smi, stats["mean"]) for smi, stats in col_analysis.items()],
            key=lambda x: x[1],
            reverse=higher_is_better,
        )
        result["ranked_substituents"][col] = [
            {"smiles": smi, "mean": round(mean, 4)} for smi, mean in ranked
        ]

        if ranked:
            result["best_substituents"][col] = ranked[0][0]
            result["worst_substituents"][col] = ranked[-1][0]

        # ANOVA
        f_stat = _anova_f(groups)
        result["anova_f_scores"][col] = round(f_stat, 4) if f_stat is not None else None

    # Position importance (proportional to F-statistic)
    f_scores = {k: v for k, v in result["anova_f_scores"].items() if v is not None}
    if f_scores:
        total_f = sum(f_scores.values())
        if total_f > 0:
            result["position_importance"] = {
                k: round(v / total_f, 4) for k, v in f_scores.items()
            }

    return result
