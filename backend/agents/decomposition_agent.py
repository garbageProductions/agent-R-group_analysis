"""
Decomposition Agent
Runs R-group decomposition and uses Claude to interpret the result,
identify important R-group positions, and flag structural outliers.
"""

import json
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.rgroup_decompose_series import rgroup_decompose_series


class DecompositionAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "DecompositionAgent"

    @property
    def description(self) -> str:
        return (
            "Decomposes a series of compounds into a common core plus R-group substituents. "
            "Identifies the number of variable positions, R-group diversity, and "
            "compounds that fall outside the common scaffold."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "rgroup_decompose",
                "description": (
                    "Decompose compounds into core + R-groups using RDKit RGroupDecomposition. "
                    "Returns a table with Core, R1, R2, ... columns for each matched molecule."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "SMILES to decompose",
                        },
                        "core_smarts": {
                            "type": "string",
                            "description": "SMARTS of the common core (with [*:n] attachment points)",
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Molecule identifiers",
                        },
                    },
                    "required": ["smiles_list"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "rgroup_decompose":
            return rgroup_decompose_series(
                tool_input["smiles_list"],
                core_smarts=tool_input.get("core_smarts"),
                labels=tool_input.get("labels"),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_decomposition(
        self,
        smiles_list: List[str],
        labels: List[str],
        core_smarts: Optional[str],
        properties: Optional[Dict[str, List]] = None,
    ) -> Dict[str, Any]:
        """
        Run decomposition using the tool-use loop.
        """
        self._emit_progress("Running R-group decomposition...")

        result = rgroup_decompose_series(
            smiles_list,
            core_smarts=core_smarts,
            labels=labels,
            properties=properties,
        )

        # LLM annotation
        if result.get("num_matched", 0) > 0:
            freq = result.get("rgroup_frequency", {})
            positions = list(freq.keys())
            task = f"""R-group decomposition results:
Core: {result.get('core_smarts')}
Matched: {result.get('num_matched')}/{len(smiles_list)} molecules ({result.get('success_rate', 0):.0%})
R-group positions: {positions}
Substituents per position: {{{', '.join(f'{k}: {len(v)} unique' for k, v in freq.items())}}}

Provide a brief medicinal chemistry commentary (2-3 sentences) on:
1. Whether the decomposition looks chemically sensible
2. Which positions have the most diversity
3. Any concerns about unmatched molecules

Return JSON: {{"commentary": "...", "most_diverse_position": "Rn", "concern_level": "none"|"low"|"high"}}"""

            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=400,
                    system=self.build_system_prompt(),
                    messages=[{"role": "user", "content": task}],
                )
                text = response.content[0].text if response.content else ""
                import re
                m = re.search(r'\{.*\}', text, re.DOTALL)
                if m:
                    annotation = json.loads(m.group())
                    result["llm_commentary"] = annotation.get("commentary")
                    result["most_diverse_position"] = annotation.get("most_diverse_position")
                    result["concern_level"] = annotation.get("concern_level", "none")
            except Exception as e:
                result["llm_error"] = str(e)

        return result
