"""
Core Detection Agent
Uses Claude to intelligently interpret MCS/scaffold analysis results and
make a justified strategy recommendation for the compound set.
"""

import json
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.detect_series_core import detect_series_core


class CoreDetectionAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "CoreDetectionAgent"

    @property
    def description(self) -> str:
        return (
            "Analyzes a compound set to identify its common structural core "
            "and recommends the best analysis strategy: R-group decomposition, "
            "scaffold family analysis, or matched molecular pair mining."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "detect_series_core",
                "description": (
                    "Compute MCS (Maximum Common Substructure) and Murcko scaffold "
                    "distribution for a compound set, and get a strategy recommendation."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of standardized SMILES",
                        },
                        "mcs_timeout": {
                            "type": "integer",
                            "description": "Seconds before MCS times out (default: 15)",
                        },
                    },
                    "required": ["smiles_list"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "detect_series_core":
            return detect_series_core(
                tool_input["smiles_list"],
                mcs_timeout=tool_input.get("mcs_timeout", 15),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_detection(
        self,
        smiles_list: List[str],
        user_core_smarts: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run core detection. Uses LLM to interpret and justify strategy.
        """
        self._emit_progress("Detecting series core...")

        # Run the detection tool
        raw_result = detect_series_core(smiles_list)

        # If user supplied a core, override the recommendation
        if user_core_smarts:
            raw_result["user_supplied_core"] = user_core_smarts
            raw_result["recommended_approach"] = "rgroup"
            raw_result["recommendation_reason"] = "User-supplied core SMARTS; using R-group decomposition."
            raw_result["mcs_smarts"] = user_core_smarts
            return raw_result

        # Use Claude to provide richer interpretation for borderline cases
        n_mols = len(smiles_list)
        if n_mols <= 3:
            return raw_result  # Skip LLM for trivial cases

        task = f"""Analyze this compound series structural data and provide a medicinal chemistry
interpretation of the recommended analysis strategy.

Dataset: {n_mols} molecules
MCS coverage: {raw_result.get('mean_mcs_coverage', 0):.0%}
Molecules matching MCS: {raw_result.get('molecules_matching_mcs', 0)}/{n_mols}
Unique Murcko scaffolds: {raw_result.get('num_unique_scaffolds', 0)}
Dominant scaffold fraction: {raw_result.get('dominant_scaffold_fraction', 0):.0%}
Algorithm recommendation: {raw_result.get('recommended_approach', 'mmp')}
Reason: {raw_result.get('recommendation_reason', '')}

Confirm or adjust the strategy recommendation with a 1-2 sentence medicinal chemistry rationale.
Return JSON: {{"recommended_approach": "rgroup"|"scaffold_family"|"mmp", "rationale": "...", "confidence": "high"|"medium"|"low"}}"""

        messages = [{"role": "user", "content": task}]
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=512,
                system=self.build_system_prompt(),
                messages=messages,
            )
            text = response.content[0].text if response.content else ""
            import re
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                llm_judgment = json.loads(m.group())
                raw_result["llm_rationale"] = llm_judgment.get("rationale")
                raw_result["llm_confidence"] = llm_judgment.get("confidence")
                # Only override if LLM strongly disagrees
                if llm_judgment.get("recommended_approach") != raw_result["recommended_approach"]:
                    if llm_judgment.get("confidence") == "high":
                        raw_result["recommended_approach"] = llm_judgment["recommended_approach"]
                        raw_result["recommendation_reason"] = llm_judgment.get("rationale", raw_result["recommendation_reason"])
        except Exception as e:
            raw_result["llm_error"] = str(e)

        return raw_result
