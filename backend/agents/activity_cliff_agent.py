"""
Activity Cliff Agent
Detects and interprets activity cliffs: structurally similar compound pairs
with unexpectedly large differences in biological activity.
"""

import json
import re
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.detect_activity_cliffs import detect_activity_cliffs


class ActivityCliffAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "ActivityCliffAgent"

    @property
    def description(self) -> str:
        return (
            "Detects activity cliffs using SALI (Structure-Activity Landscape Index). "
            "Identifies pairs of similar compounds with large activity differences, "
            "flags the most sensitive SAR regions, and interprets cliffs for med-chem."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "detect_activity_cliffs",
                "description": (
                    "Find activity cliffs using pairwise Tanimoto similarity and SALI. "
                    "Returns cliff pairs sorted by SALI score, similarity threshold analysis, "
                    "and most promiscuous cliff molecules."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "activity_values": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "Activity values (e.g., pIC50)",
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "similarity_threshold": {
                            "type": "number",
                            "description": "Tanimoto cutoff for 'similar' (default: 0.7)",
                        },
                        "activity_diff_threshold": {
                            "type": "number",
                            "description": "Min activity difference to call a cliff (default: 1.0 log units)",
                        },
                    },
                    "required": ["smiles_list", "activity_values"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "detect_activity_cliffs":
            return detect_activity_cliffs(
                tool_input["smiles_list"],
                tool_input["activity_values"],
                labels=tool_input.get("labels"),
                similarity_threshold=tool_input.get("similarity_threshold", 0.7),
                activity_diff_threshold=tool_input.get("activity_diff_threshold", 1.0),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_cliff_detection(
        self,
        smiles_list: List[str],
        activity_values: List[float],
        labels: Optional[List[str]] = None,
        similarity_threshold: float = 0.7,
        activity_diff_threshold: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Detect cliffs and generate medicinal chemistry interpretation.
        """
        self._emit_progress("Detecting activity cliffs...")

        result = detect_activity_cliffs(
            smiles_list,
            activity_values,
            labels=labels,
            similarity_threshold=similarity_threshold,
            activity_diff_threshold=activity_diff_threshold,
        )

        num_cliffs = result.get("num_cliff_pairs", 0)
        if num_cliffs == 0:
            result["llm_interpretation"] = "No activity cliffs detected at the given thresholds. The SAR landscape appears smooth."
            return result

        # Get top 5 cliffs for LLM interpretation
        top_cliffs = result.get("cliff_pairs", [])[:5]
        cliff_summaries = [
            f"  {c['mol_a_label']} ({c['mol_a_activity']}) vs {c['mol_b_label']} ({c['mol_b_activity']}): "
            f"Tanimoto={c['tanimoto_similarity']:.2f}, ΔACT={c['activity_diff']:.2f}, SALI={c['sali']:.1f}"
            for c in top_cliffs
        ]

        landscape_stats = result.get("activity_landscape_stats", {})
        promiscuous = result.get("most_promiscuous_cliffs", [])[:3]

        task = f"""Activity Cliff Analysis:
Total cliff pairs: {num_cliffs} (Tanimoto ≥ {similarity_threshold}, |ΔActivity| ≥ {activity_diff_threshold})
Cliff fraction of similar pairs: {landscape_stats.get('cliff_fraction', 0):.0%}

Top cliff pairs:
{chr(10).join(cliff_summaries)}

Most cliff-prone molecules: {[p['label'] for p in promiscuous]}

Interpret these activity cliffs for a medicinal chemist:
1. What do the cliffs suggest about the SAR sensitivity?
2. Which structural change is most likely responsible?
3. How should this guide the next round of optimization?

Return JSON: {{
  "interpretation": "...",
  "cliff_sensitivity": "high"|"medium"|"low",
  "sar_implication": "...",
  "optimization_guidance": "..."
}}"""

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
                result["llm_interpretation"] = llm_out.get("interpretation")
                result["cliff_sensitivity"] = llm_out.get("cliff_sensitivity")
                result["sar_implication"] = llm_out.get("sar_implication")
                result["optimization_guidance"] = llm_out.get("optimization_guidance")
        except Exception as e:
            result["llm_error"] = str(e)

        return result
