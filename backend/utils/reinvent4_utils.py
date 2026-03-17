"""
REINVENT4 utilities: TOML config builder, subprocess runner, result parser.
These are pure-Python utilities — no LLM involved.
"""

import csv
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from rdkit import Chem

logger = logging.getLogger(__name__)


class Reinvent4RunFailed(Exception):
    """Raised when the REINVENT4 subprocess exits with a non-zero code."""

    def __init__(self, stderr: str = "", returncode: int = -1):
        self.stderr = stderr
        self.returncode = returncode
        super().__init__(f"REINVENT4 failed (exit {returncode}): {stderr[:500]}")


def build_toml(
    scaffold_smarts: str,
    scoring_config: Dict[str, Any],
    n_steps: int,
    output_dir: Path,
    sigma: int = 100,
    diversity_filter: str = "IdenticalMurckoScaffold",
) -> Path:
    """
    Write a REINVENT4 scaffold decoration TOML config file.

    Args:
        scaffold_smarts:  SMARTS string with attachment points [*:1], [*:2], ...
        scoring_config:   Dict with key "components" — list of scoring component dicts.
                          Each component: {type, weight, model_path (optional)}
        n_steps:          Number of REINVENT4 sampling steps
        output_dir:       Directory to write reinvent4_config.toml
        sigma:            REINVENT4 sigma parameter (exploitation sharpness)
        diversity_filter: REINVENT4 diversity filter name

    Returns:
        Path to the written TOML file
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build scoring components section
    components_toml = _build_scoring_components(scaffold_smarts, scoring_config)

    toml_content = f"""[parameters]
  use_checkpoint = false
  n_steps = {n_steps}
  sigma = {sigma}

[diversity_filter]
  name = "{diversity_filter}"
  bucket_size = 25
  minscore = 0.4

[[stage]]
  max_score = 1.0

  [stage.scoring]
    type = "arithmetic_mean"
{components_toml}
"""

    toml_path = output_dir / "reinvent4_config.toml"
    toml_path.write_text(toml_content)
    logger.info(f"REINVENT4 TOML written to {toml_path}")
    return toml_path


def _build_scoring_components(scaffold_smarts: str, scoring_config: Dict[str, Any]) -> str:
    """Build the [[stage.scoring.component]] blocks as a TOML string."""
    lines = []

    # Always include scaffold decoration component
    lines.append("    [[stage.scoring.component]]")
    lines.append("      [stage.scoring.component.scaffold_decoration]")
    lines.append('        name = "scaffold"')
    lines.append("        weight = 1.0")
    lines.append("        [[stage.scoring.component.scaffold_decoration.endpoint]]")
    lines.append('          name = "scaffold_smarts"')
    lines.append(f'          smarts = "{scaffold_smarts}"')
    lines.append("")

    # Add QSAR component if provided
    for comp in scoring_config.get("components", []):
        if comp.get("type") == "qsar_activity":
            model_path = comp.get("model_path")
            if not model_path:
                raise ValueError(
                    "qsar_activity scoring component requires a 'model_path' entry"
                )
            lines.append("    [[stage.scoring.component]]")
            lines.append("      [stage.scoring.component.predictive_property]")
            lines.append(f'        name = "qsar_activity"')
            lines.append(f'        weight = {comp.get("weight", 0.6)}')
            lines.append("        [[stage.scoring.component.predictive_property.endpoint]]")
            lines.append('          name = "model"')
            lines.append(f'          path = "{model_path}"')
            lines.append('          scikit-learn = true')
            lines.append("")

    # Always include QED
    qed_weight = next(
        (c.get("weight", 0.3) for c in scoring_config.get("components", []) if c.get("type") == "qed"),
        0.3
    )
    lines.append("    [[stage.scoring.component]]")
    lines.append("      [stage.scoring.component.qed_score]")
    lines.append('        name = "qed"')
    lines.append(f"        weight = {qed_weight}")
    lines.append("")

    # Always include SA score
    sa_weight = next(
        (c.get("weight", 0.1) for c in scoring_config.get("components", []) if c.get("type") == "sa_score"),
        0.1
    )
    lines.append("    [[stage.scoring.component]]")
    lines.append("      [stage.scoring.component.sa_score]")
    lines.append('        name = "sa_score"')
    lines.append(f"        weight = {sa_weight}")

    return "\n".join(lines)


def run_reinvent4(toml_path: Path, exec_path: str) -> Path:
    """Stub — implemented in Task 4."""
    raise NotImplementedError("run_reinvent4 not yet implemented")


def parse_results(csv_path: Path, top_n: int = 50) -> List[Dict[str, Any]]:
    """Stub — implemented in Task 4."""
    raise NotImplementedError("parse_results not yet implemented")


def _safe_float(val) -> float:
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def _safe_int(val) -> int:
    try:
        return int(val) if val is not None else 0
    except (ValueError, TypeError):
        return 0
