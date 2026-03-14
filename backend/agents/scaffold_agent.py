"""
Scaffold Agent
Builds Murcko scaffold hierarchies and performs scaffold-based SAR analysis.
Identifies dominant scaffolds, scaffold-property relationships, and coverage gaps.
"""

import json
import re
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from backend.tools.scaffold_tree import build_scaffold_tree
from backend.tools.diversity_analysis import diversity_analysis


class ScaffoldAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "ScaffoldAgent"

    @property
    def description(self) -> str:
        return (
            "Builds hierarchical Murcko scaffold trees, computes scaffold frequency "
            "distributions, and identifies property trends across scaffold families. "
            "Helps navigate chemical space systematically."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "build_scaffold_tree",
                "description": (
                    "Build a Murcko scaffold hierarchy for a compound set. "
                    "Returns scaffold frequencies, property profiles per scaffold, "
                    "and a hierarchical tree."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "properties": {
                            "type": "object",
                            "description": "Dict of {prop_name: [float values]}",
                        },
                    },
                    "required": ["smiles_list"],
                },
            },
            {
                "name": "diversity_analysis",
                "description": (
                    "Analyze chemical diversity using Morgan fingerprints. "
                    "Returns clustering, mean Tanimoto, and a MaxMin diverse subset."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles_list": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "n_diverse": {
                            "type": "integer",
                            "description": "Number of diverse compounds to select",
                        },
                        "cluster_cutoff": {
                            "type": "number",
                            "description": "Tanimoto cutoff for clustering (default: 0.65)",
                        },
                    },
                    "required": ["smiles_list"],
                },
            },
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        if tool_name == "build_scaffold_tree":
            return build_scaffold_tree(
                tool_input["smiles_list"],
                labels=tool_input.get("labels"),
                properties=tool_input.get("properties"),
            )
        if tool_name == "diversity_analysis":
            return diversity_analysis(
                tool_input["smiles_list"],
                labels=tool_input.get("labels"),
                n_diverse=tool_input.get("n_diverse", 10),
                cluster_cutoff=tool_input.get("cluster_cutoff", 0.65),
            )
        return {"error": f"Unknown tool: {tool_name}"}

    def run_scaffold_analysis(
        self,
        smiles_list: List[str],
        labels: List[str],
        properties: Optional[Dict[str, List]] = None,
    ) -> Dict[str, Any]:
        """
        Run scaffold tree construction and diversity analysis.
        """
        self._emit_progress("Building scaffold tree...")

        scaffold_result = build_scaffold_tree(
            smiles_list, labels=labels, properties=properties
        )

        self._emit_progress("Analyzing chemical diversity...")
        diversity_result = diversity_analysis(
            smiles_list,
            labels=labels,
            n_diverse=min(10, len(smiles_list)),
        )

        combined = {
            "scaffold_tree": scaffold_result,
            "diversity": diversity_result,
        }

        # LLM interpretation
        top_scaffolds = scaffold_result.get("scaffold_list", [])[:5]
        scaffold_summary = [
            f"  {s['scaffold_smiles'][:50]}... ({s['count']} mols, {s['fraction']:.0%})"
            for s in top_scaffolds
        ]

        task = f"""Scaffold analysis results:
{scaffold_result.get('num_molecules')} molecules
{scaffold_result.get('num_unique_scaffolds')} unique Murcko scaffolds
Diversity score (1-mean_Tanimoto): {diversity_result.get('diversity_score', 'N/A')}
Clusters (Tanimoto > 0.65): {diversity_result.get('num_clusters', 'N/A')}

Top 5 scaffolds:
{chr(10).join(scaffold_summary)}

Provide a brief (2-3 sentence) medicinal chemistry interpretation:
1. Is this a focused or diverse set?
2. Is there a dominant scaffold that should be prioritized?
3. Are there under-explored scaffold families worth investigating?

Return JSON: {{
  "interpretation": "...",
  "dataset_type": "focused"|"diverse"|"mixed",
  "scaffold_recommendation": "..."
}}"""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=500,
                system=self.build_system_prompt(),
                messages=[{"role": "user", "content": task}],
            )
            text = response.content[0].text if response.content else ""
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                llm_out = json.loads(m.group())
                combined["llm_interpretation"] = llm_out.get("interpretation")
                combined["dataset_type"] = llm_out.get("dataset_type")
                combined["scaffold_recommendation"] = llm_out.get("scaffold_recommendation")
        except Exception as e:
            combined["llm_error"] = str(e)

        return combined
