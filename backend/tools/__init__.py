"""
R-Group Analysis Tool Modules
Each tool is a pure function (no LLM) that operates on molecular data.
"""

from .standardize_molecule import standardize_molecule, standardize_molecules_batch
from .detect_series_core import detect_series_core
from .rgroup_decompose_series import rgroup_decompose_series
from .rank_rgroup_vs_property import rank_rgroup_vs_property
from .mine_mmp_transforms import mine_mmp_transforms
from .enumerate_substituent_swaps import enumerate_substituent_swaps
from .detect_activity_cliffs import detect_activity_cliffs
from .scaffold_tree import build_scaffold_tree
from .diversity_analysis import diversity_analysis

__all__ = [
    "standardize_molecule",
    "standardize_molecules_batch",
    "detect_series_core",
    "rgroup_decompose_series",
    "rank_rgroup_vs_property",
    "mine_mmp_transforms",
    "enumerate_substituent_swaps",
    "detect_activity_cliffs",
    "build_scaffold_tree",
    "diversity_analysis",
]
