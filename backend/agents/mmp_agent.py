"""
MMP Agent
Mines matched molecular pairs and uses Claude to identify the most
impactful chemical transformations for a target property.
"""

import json
import re
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.mine_mmp_transforms import mine_mmp_transforms


class MMPAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "MMPAgent"

    @property
    def description(self) -> str:
        return (
            "Mines matched molecular pairs (MMPs) to identify chemical transformations "
            "that consistently improve or reduce a target property. Ranks transforms "
            "by effect size and provides medicinal chemistry interpretation."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "mine_mmp_transforms",
                "description": (
                    "Find all matched molecular pairs in a compound set. "
                    "For each pair, compute property deltas for all available properties. "
                    "Returns ranked transforms by mean property effect."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of SMILES",
                        },
                        "properties": {
                            "type": "object",
                            "description": "Dict of {property_name: [float values]}",
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "max_fragment_heavy_atoms": {
                            "type": "integer",
                            "description": "Max size of variable fragment (default: 13)",
                        },
                    },
                    "required": ["smiles_list"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "mine_mmp_transforms":
            return mine_mmp_transforms(
                tool_input["smiles_list"],
                properties=tool_input.get("properties"),
                labels=tool_input.get("labels"),
                max_fragment_heavy_atoms=tool_input.get("max_fragment_heavy_atoms", 13),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_mmp(
        self,
        smiles_list: List[str],
        labels: List[str],
        properties: Optional[Dict[str, List]] = None,
    ) -> Dict[str, Any]:
        """
        Run MMP mining and generate transform insights.
        """
        self._emit_progress("Mining MMP transforms...")

        result = mine_mmp_transforms(
            smiles_list,
            properties=properties,
            labels=labels,
        )

        num_pairs = result.get("num_pairs", 0)
        if num_pairs == 0:
            result["llm_insights"] = "No matched molecular pairs found. Try a more diverse compound set."
            return result

        # Summarize top transforms for LLM interpretation
        top_transforms = {}
        for prop_name, ranked in result.get("top_transforms_by_property", {}).items():
            top_transforms[prop_name] = ranked[:5]  # Top 5 per property

        task = f"""MMP Analysis Results:
Total matched pairs: {num_pairs}
Properties analyzed: {result.get('property_names', [])}

Top transforms by property effect:
{json.dumps(top_transforms, indent=2)}

Provide:
1. A 2-3 sentence interpretation of the most impactful transforms found
2. Identify any consistent SAR trends (e.g., "halogen walk shows Cl > F for potency")
3. Flag any surprising or counter-intuitive results

Return JSON: {{
  "key_transforms": ["transform description 1", "transform description 2"],
  "sar_trends": "...",
  "surprises": "..." or null,
  "actionable_recommendation": "..."
}}"""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=700,
                system=self.build_system_prompt(),
                messages=[{"role": "user", "content": task}],
            )
            text = response.content[0].text if response.content else ""
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                llm_out = json.loads(m.group())
                result["llm_insights"] = llm_out
        except Exception as e:
            result["llm_error"] = str(e)

        return result
