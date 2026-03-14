"""
Enumeration Agent
Enumerates a virtual compound library by swapping substituents on the core scaffold.
Uses Claude to select the most relevant R-group library based on observed SAR.
"""

import json
import re
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.enumerate_substituent_swaps import enumerate_substituent_swaps, DEFAULT_RGROUP_LIBRARY


class EnumerationAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "EnumerationAgent"

    @property
    def description(self) -> str:
        return (
            "Generates a virtual compound library by systematically replacing R-group "
            "substituents on the common core scaffold. Uses SAR-informed R-group selection "
            "and filters by drug-likeness constraints."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "enumerate_substituent_swaps",
                "description": (
                    "Generate virtual compounds by swapping R-groups on a core scaffold. "
                    "Supports built-in medicinal chemistry R-group libraries or custom lists."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "core_smarts": {
                            "type": "string",
                            "description": "Core SMARTS with [*:1], [*:2], etc. attachment points",
                        },
                        "builtin_library_categories": {
                            "type": "array",
                            "items": {"type": "string", "enum": ["aromatic", "aliphatic", "polar", "halogens"]},
                            "description": "Built-in R-group categories to use",
                        },
                        "rgroup_library": {
                            "type": "object",
                            "description": "Custom {position_int: [smiles_list]} R-group library",
                        },
                        "constraints": {
                            "type": "object",
                            "description": "Filters: {max_mw, max_logp, require_lipinski, min_heavy_atoms, max_heavy_atoms}",
                        },
                        "max_compounds": {
                            "type": "integer",
                            "description": "Hard cap on library size (default: 10000)",
                        },
                    },
                    "required": ["core_smarts"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "enumerate_substituent_swaps":
            return enumerate_substituent_swaps(
                tool_input["core_smarts"],
                rgroup_library=tool_input.get("rgroup_library"),
                builtin_library_categories=tool_input.get("builtin_library_categories"),
                constraints=tool_input.get("constraints"),
                max_compounds=tool_input.get("max_compounds", 10000),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_enumeration(
        self,
        core_smarts: str,
        rgroup_frequency: Dict[str, Dict[str, int]],
        constraints: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Enumerate virtual library, using observed R-groups from the SAR data
        to seed the enumeration library.
        """
        self._emit_progress("Enumerating substituent swaps...")

        # Build R-group library from observed substituents
        observed_rgroups: Dict[int, List[str]] = {}
        for pos_str, sub_counts in rgroup_frequency.items():
            # Extract position number
            try:
                pos_num = int(pos_str.replace("R", ""))
                # Use observed + built-in
                observed = list(sub_counts.keys())
                combined = observed + DEFAULT_RGROUP_LIBRARY["aromatic"] + DEFAULT_RGROUP_LIBRARY["aliphatic"]
                # Deduplicate
                seen = set()
                unique = []
                for s in combined:
                    if s not in seen:
                        seen.add(s)
                        unique.append(s)
                observed_rgroups[pos_num] = unique[:50]  # cap per position
            except (ValueError, AttributeError):
                pass

        result = enumerate_substituent_swaps(
            core_smarts,
            rgroup_library=observed_rgroups if observed_rgroups else None,
            constraints=constraints or {"max_mw": 600, "max_logp": 6},
            max_compounds=5000,
        )

        # LLM commentary
        task = f"""Virtual library enumeration results:
Core: {core_smarts}
Attachment points: {result.get('num_attachment_points')}
Theoretical library size: {result.get('theoretical_library_size')}
Enumerated (filter-passing): {result.get('num_passing_filters')} / {result.get('num_enumerated')} compounds

Provide a brief commentary (2-3 sentences) on the library quality and suggestions for
prioritizing compounds for synthesis/purchase.

Return JSON: {{"commentary": "...", "priority_strategy": "..."}}"""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=400,
                system=self.build_system_prompt(),
                messages=[{"role": "user", "content": task}],
            )
            text = response.content[0].text if response.content else ""
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                llm_out = json.loads(m.group())
                result["llm_commentary"] = llm_out.get("commentary")
                result["llm_priority_strategy"] = llm_out.get("priority_strategy")
        except Exception as e:
            result["llm_error"] = str(e)

        return result
