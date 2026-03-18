"""
HTML report generator for pipeline runs.
Produces a fully self-contained HTML file — no external CDN dependencies.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_STYLE = """
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       background: #0d1117; color: #e6edf3; margin: 0; padding: 0; }
.container { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 1.4rem; margin-bottom: 4px; color: #e6edf3; }
h2 { font-size: 1rem; margin: 24px 0 10px; color: #e6edf3; border-bottom: 1px solid #30363d; padding-bottom: 6px; }
h3 { font-size: 0.85rem; margin: 16px 0 8px; color: #8b949e; }
.meta { font-size: 0.75rem; color: #8b949e; margin-bottom: 20px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.68rem;
         font-weight: 600; margin-right: 6px; }
.badge-green { background: rgba(74,222,128,0.1); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.badge-cyan  { background: rgba(0,196,212,0.1);  color: #00c4d4; border: 1px solid rgba(0,196,212,0.3); }
.mol-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.mol-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px;
            padding: 8px; text-align: center; width: 110px; }
.mol-label { font-size: 0.65rem; color: #8b949e; margin-top: 4px;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 20px; }
th { background: #161b22; padding: 6px 10px; text-align: left; color: #8b949e;
     font-weight: 500; border-bottom: 1px solid #30363d; }
td { padding: 5px 10px; border-bottom: 1px solid #21262d; color: #e6edf3; }
tr:nth-child(even) { background: #0d1117; }
.section { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
           padding: 16px; margin-bottom: 16px; }
.no-data { color: #8b949e; font-size: 0.78rem; font-style: italic; }
"""


class ReportGenerator:
    """Generate a self-contained HTML report for a completed pipeline run."""

    def generate(self, session_data: Dict[str, Any], results: Dict[str, Any]) -> str:
        """
        Build and return a complete HTML string for the given session + results.

        Args:
            session_data: The session dict from ``_sessions[sid]``.
            results:      The pipeline results dict from the orchestrator.

        Returns:
            A self-contained HTML string (no external dependencies).
        """
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        num_molecules = len(session_data.get("smiles", []))
        fmt = session_data.get("source_format", "unknown").upper()
        strategy = results.get("strategy", "unknown")
        agents_run: List[str] = results.get("agents_run", [])

        sections: List[str] = []

        # ── Header ───────────────────────────────────────────────────────────
        sections.append(f"""
<div class="section">
  <h1>R-Group Analysis Report</h1>
  <div class="meta">
    Generated: {timestamp}
    &nbsp;·&nbsp;
    <span class="badge badge-cyan">{fmt} · {num_molecules} molecules</span>
    <span class="badge badge-green">{strategy}</span>
  </div>
  <div>
    <strong style="font-size:0.8rem;color:#8b949e;">Agents run:</strong>
    {' '.join(f'<span class="badge badge-cyan">{a}</span>' for a in agents_run) or '<span class="no-data">none</span>'}
  </div>
</div>
""")

        # ── Molecule grid (up to 50) ──────────────────────────────────────────
        smiles_list = session_data.get("smiles", [])
        labels_list = session_data.get("labels", [])
        render_n = min(50, len(smiles_list))
        mol_cards = self._render_mol_grid(smiles_list[:render_n], labels_list[:render_n])
        overflow_note = (
            f'<p class="no-data">Showing first 50 of {len(smiles_list)} molecules.</p>'
            if len(smiles_list) > 50 else ""
        )
        sections.append(f"""
<div class="section">
  <h2>Molecule Preview</h2>
  {overflow_note}
  <div class="mol-grid">{mol_cards}</div>
</div>
""")

        # ── Property summary ──────────────────────────────────────────────────
        prop_cols: List[str] = session_data.get("property_columns", [])
        properties: Dict[str, List] = session_data.get("properties", {})
        if prop_cols:
            rows_html = self._render_property_table(
                labels_list, prop_cols, properties, max_rows=20
            )
            sections.append(f"""
<div class="section">
  <h2>Property Summary</h2>
  {rows_html}
</div>
""")

        # ── Core / R-group ────────────────────────────────────────────────────
        core = results.get("core", {})
        if core:
            mcs = core.get("mcs_smarts") or core.get("scaffold_smarts", "")
            sections.append(f"""
<div class="section">
  <h2>Core Detection</h2>
  <table><tr><th>MCS SMARTS</th><td><code style="font-size:0.75rem;">{mcs or "—"}</code></td></tr></table>
</div>
""")

        # ── SAR ranking ───────────────────────────────────────────────────────
        sar = results.get("sar_ranking", {})
        sar_table = self._dict_to_table(sar, label="SAR Ranking")
        sections.append(f'<div class="section"><h2>SAR Ranking</h2>{sar_table}</div>')

        # ── MMP transforms ────────────────────────────────────────────────────
        mmp = results.get("mmp_transforms", {})
        mmp_table = self._dict_to_table(mmp, label="MMP Transforms")
        sections.append(f'<div class="section"><h2>MMP Transforms</h2>{mmp_table}</div>')

        # ── Activity cliffs ───────────────────────────────────────────────────
        cliffs = results.get("activity_cliffs", {})
        cliff_table = self._dict_to_table(cliffs, label="Activity Cliffs")
        sections.append(f'<div class="section"><h2>Activity Cliffs</h2>{cliff_table}</div>')

        # ── Generative results ────────────────────────────────────────────────
        generative = results.get("generative")
        if generative and not generative.get("error"):
            top_mols = generative.get("top_molecules", [])
            gen_cards = self._render_mol_grid(
                [m.get("smiles", "") for m in top_mols[:20]],
                [f"score={m.get('score', '?')}" for m in top_mols[:20]],
            )
            sections.append(f"""
<div class="section">
  <h2>Generative Design Results</h2>
  <p style="font-size:0.78rem;color:#8b949e;">{len(top_mols)} molecules generated</p>
  <div class="mol-grid">{gen_cards}</div>
</div>
""")

        body = "\n".join(sections)
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>R-Group Analysis Report — {timestamp}</title>
<style>{_STYLE}</style>
</head>
<body>
<div class="container">
{body}
</div>
</body>
</html>"""

    # ── Private helpers ───────────────────────────────────────────────────────

    def _render_mol_grid(self, smiles_list: List[str], labels: List[str]) -> str:
        from backend.utils.mol_utils import mol_to_svg
        cards = []
        for smi, lbl in zip(smiles_list, labels):
            svg = mol_to_svg(smi, width=100, height=80)
            svg_html = svg if svg else '<div style="width:100px;height:80px;background:#0d1117;"></div>'
            safe_lbl = lbl[:16] + "…" if len(lbl) > 16 else lbl
            cards.append(
                f'<div class="mol-card">{svg_html}<div class="mol-label">{safe_lbl}</div></div>'
            )
        return "".join(cards)

    def _render_property_table(
        self,
        labels: List[str],
        prop_cols: List[str],
        properties: Dict[str, List],
        max_rows: int = 20,
    ) -> str:
        headers = ["Label"] + prop_cols
        header_html = "".join(f"<th>{h}</th>" for h in headers)
        rows_html = []
        for i, label in enumerate(labels[:max_rows]):
            cells = f"<td>{label}</td>"
            for col in prop_cols:
                val = properties.get(col, [None] * (i + 1))
                v = val[i] if i < len(val) else None
                cells += f"<td>{v if v is not None else '—'}</td>"
            rows_html.append(f"<tr>{cells}</tr>")
        overflow = (
            f'<p class="no-data">Showing first {max_rows} of {len(labels)} rows.</p>'
            if len(labels) > max_rows else ""
        )
        return f"<table><tr>{header_html}</tr>{''.join(rows_html)}</table>{overflow}"

    def _dict_to_table(self, data: Any, label: str = "") -> str:
        if not data:
            return f'<p class="no-data">No {label.lower()} data.</p>'
        if isinstance(data, dict):
            if not data:
                return f'<p class="no-data">No {label.lower()} data.</p>'
            rows = "".join(
                f"<tr><td>{k}</td><td>{v}</td></tr>"
                for k, v in list(data.items())[:30]
            )
            return f"<table><tr><th>Key</th><th>Value</th></tr>{rows}</table>"
        return f'<p class="no-data">{str(data)[:200]}</p>'
