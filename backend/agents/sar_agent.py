"""
SAR Agent
Performs structure-activity relationship analysis by ranking R-group substituents
against a target property. Uses Claude to generate medicinal chemistry insights.
"""

import json
import re
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.rank_rgroup_vs_property import rank_rgroup_vs_property


class SARAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "SARAgent"

    @property
    def description(self) -> str:
        return (
            "Performs SAR analysis by ranking R-group substituents against a target property. "
            "Identifies best/worst substituents, computes ANOVA F-scores for position importance, "
            "and generates medicinal chemistry SAR hypotheses."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "rank_rgroup_vs_property",
                "description": (
                    "Rank R-group substituents at each position by their effect on a property. "
                    "Returns ranked lists, statistical summaries, and ANOVA F-scores per position."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "decomposition": {
                            "type": "array",
                            "description": "List of R-group decomposition records (from rgroup_decompose_series)",
                        },
                        "property_name": {
                            "type": "string",
                            "description": "Name of the property column to rank by",
                        },
                        "higher_is_better": {
                            "type": "boolean",
                            "description": "True if higher property values are preferred (default: true)",
                        },
                        "min_count": {
                            "type": "integer",
                            "description": "Minimum number of observations per substituent (default: 2)",
                        },
                    },
                    "required": ["decomposition", "property_name"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "rank_rgroup_vs_property":
            return rank_rgroup_vs_property(
                tool_input["decomposition"],
                tool_input["property_name"],
                higher_is_better=tool_input.get("higher_is_better", True),
                min_count=tool_input.get("min_count", 2),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_ranking(
        self,
        decomp_result: Dict[str, Any],
        property_name: str,
        higher_is_better: bool = True,
    ) -> Dict[str, Any]:
        """
        Rank R-groups and generate SAR narrative.
        """
        self._emit_progress(f"Ranking R-groups vs {property_name}...")

        decomposition = decomp_result.get("decomposition", [])
        if not decomposition:
            return {"error": "No decomposition data available"}

        ranking = rank_rgroup_vs_property(
            decomposition,
            property_name,
            higher_is_better=higher_is_better,
        )

        # Generate SAR narrative with Claude
        best_subs = ranking.get("best_substituents", {})
        worst_subs = ranking.get("worst_substituents", {})
        position_importance = ranking.get("position_importance", {})
        global_stats = ranking.get("global_property_stats", {})

        if not best_subs:
            ranking["llm_sar_narrative"] = "Insufficient data for SAR analysis."
            return ranking

        # Prepare concise summary for LLM
        summary_lines = []
        for pos, best_smi in best_subs.items():
            worst_smi = worst_subs.get(pos, "N/A")
            analyses = ranking.get("rgroup_analyses", {}).get(pos, {})
            best_mean = analyses.get(best_smi, {}).get("mean", "?")
            worst_mean = analyses.get(worst_smi, {}).get("mean", "?") if worst_smi in analyses else "?"
            importance = position_importance.get(pos, 0)
            summary_lines.append(
                f"  {pos}: best={best_smi} (mean={best_mean}), worst={worst_smi} (mean={worst_mean}), importance={importance:.0%}"
            )

        task = f"""SAR analysis results for property: {property_name}
Global mean: {global_stats.get('mean', '?')}, range: [{global_stats.get('min', '?')}, {global_stats.get('max', '?')}]
Higher is {'better' if higher_is_better else 'worse'}.

R-group position summary:
{chr(10).join(summary_lines)}

Generate a concise SAR narrative (3-5 sentences) that:
1. Identifies the most influential R-group position
2. Describes the key structural features that drive {property_name}
3. Suggests a design hypothesis for the next optimization cycle

Return JSON: {{"sar_narrative": "...", "key_finding": "...", "design_hypothesis": "..."}}"""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=600,
                system=self.build_system_prompt(),
                messages=[{"role": "user", "content": task}],
            )
            text = response.content[0].text if response.content else ""
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                llm_out = json.loads(m.group())
                ranking["llm_sar_narrative"] = llm_out.get("sar_narrative")
                ranking["llm_key_finding"] = llm_out.get("key_finding")
                ranking["llm_design_hypothesis"] = llm_out.get("design_hypothesis")
        except Exception as e:
            ranking["llm_error"] = str(e)

        return ranking
