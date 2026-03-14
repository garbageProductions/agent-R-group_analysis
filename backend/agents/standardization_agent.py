"""
Standardization Agent
Cleans and normalizes a compound set using Claude to flag anomalies,
handle edge cases, and make intelligent decisions about ambiguous structures.
"""

import json
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.standardize_molecule import standardize_molecules_batch


class StandardizationAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "StandardizationAgent"

    @property
    def description(self) -> str:
        return (
            "Standardizes molecular representations: removes salts, normalizes "
            "tautomers, neutralizes charges, computes canonical SMILES and InChIKeys. "
            "Flags structural anomalies and quality issues."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "standardize_batch",
                "description": "Standardize a batch of SMILES strings. Returns standardized SMILES, InChIKeys, and computed molecular properties for each molecule.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of SMILES strings to standardize",
                        },
                        "remove_salts": {
                            "type": "boolean",
                            "description": "Remove salt fragments (default: true)",
                        },
                        "normalize": {
                            "type": "boolean",
                            "description": "Normalize functional groups (default: true)",
                        },
                        "neutralize": {
                            "type": "boolean",
                            "description": "Neutralize charges (default: true)",
                        },
                    },
                    "required": ["smiles_list"],
                },
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "standardize_batch":
            return standardize_molecules_batch(
                tool_input["smiles_list"],
                remove_salts=tool_input.get("remove_salts", True),
                normalize=tool_input.get("normalize", True),
                neutralize=tool_input.get("neutralize", True),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_standardize(
        self,
        smiles_list: List[str],
        labels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Direct standardization without LLM overhead for large batches.
        Falls back to LLM-guided for small sets with anomalies.
        """
        self._emit_progress("Standardizing molecules...")

        # Run standardization directly (no LLM needed for bulk operation)
        batch_result = standardize_molecules_batch(smiles_list)

        # Add labels to results
        results = batch_result.get("results", [])
        if labels:
            for i, rec in enumerate(results):
                rec["label"] = labels[i] if i < len(labels) else f"Mol_{i}"

        # Flag anything that needs attention
        issues = []
        for i, rec in enumerate(results):
            if not rec["success"]:
                issues.append({"index": i, "issue": "parse_failure", "detail": rec.get("error")})
            elif rec.get("warnings"):
                issues.append({"index": i, "issue": "warnings", "detail": rec["warnings"]})

        batch_result["issues_flagged"] = issues
        batch_result["num_issues"] = len(issues)

        return batch_result
