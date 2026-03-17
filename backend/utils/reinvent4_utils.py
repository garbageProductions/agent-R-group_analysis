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
    """
    Invoke the REINVENT4 CLI subprocess.

    Args:
        toml_path:  Path to the REINVENT4 TOML config file
        exec_path:  Path to the reinvent executable (from REINVENT4_EXEC env var)

    Returns:
        Path to the output CSV file

    Raises:
        Reinvent4RunFailed: on non-zero subprocess exit
    """
    toml_path = Path(toml_path)
    result = subprocess.run(
        [exec_path, "-i", str(toml_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise Reinvent4RunFailed(stderr=result.stderr, returncode=result.returncode)

    output_csv = toml_path.parent / "results" / "scaffold_decoration.csv"
    logger.info(f"REINVENT4 completed. Output: {output_csv}")
    return output_csv


def parse_results(csv_path: Path, top_n: int = 50) -> List[Dict[str, Any]]:
    """
    Parse REINVENT4 output CSV into a deduplicated, sorted list.

    Columns expected: SMILES, Score, [optional: per-component scores], Step

    Args:
        csv_path:  Path to REINVENT4 output CSV
        top_n:     Maximum number of results to return (by composite Score)

    Returns:
        List of dicts sorted by composite_score descending, deduplicated by
        canonical SMILES.  Each dict: {smiles, canonical_smiles, composite_score,
        qsar_score, qed, sa_score, step, iteration}
    """
    csv_path = Path(csv_path)
    rows = []

    with csv_path.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            smiles = row.get("SMILES", "").strip()
            if not smiles:
                continue
            mol = Chem.MolFromSmiles(smiles)
            canonical = Chem.MolToSmiles(mol) if mol else smiles

            try:
                score = float(row.get("Score", 0.0))
            except (ValueError, TypeError):
                score = 0.0

            rows.append({
                "smiles": smiles,
                "canonical_smiles": canonical,
                "composite_score": score,
                "qsar_score": _safe_float(row.get("predictive_property") or row.get("qsar_score")),
                "qed": _safe_float(row.get("qed_score") or row.get("qed")),
                "sa_score": _safe_float(row.get("sa_score")),
                "step": _safe_int(row.get("Step")),
                "iteration": None,  # Filled in by Reinvent4Agent after parse
            })

    # Deduplicate by canonical SMILES — keep highest score
    seen: Dict[str, Dict] = {}
    for row in rows:
        key = row["canonical_smiles"]
        if key not in seen or row["composite_score"] > seen[key]["composite_score"]:
            seen[key] = row

    sorted_results = sorted(seen.values(), key=lambda r: r["composite_score"], reverse=True)
    return sorted_results[:top_n]


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
