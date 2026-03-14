"""
Report Agent
Synthesizes all analysis results into a coherent medicinal chemistry report.
Uses Claude to generate natural language summaries, key findings, and
actionable recommendations for the next design cycle.
"""

import json
import re
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent


class ReportAgent(BaseAgent):

    @property
    def name(self) -> str:
        return "ReportAgent"

    @property
    def description(self) -> str:
        return (
            "Synthesizes all R-group analysis results into a comprehensive medicinal chemistry "
            "report. Generates executive summary, key findings, and actionable next-step "
            "recommendations for compound optimization."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return []

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        return {}

    def run_report(
        self,
        pipeline_results: Dict[str, Any],
        property_of_interest: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate the final analysis report from all pipeline results.
        """
        self._emit_progress("Generating analysis report...")

        # Extract key metrics for the report
        strategy = pipeline_results.get("strategy", "unknown")
        agents_run = pipeline_results.get("agents_run", [])

        std = pipeline_results.get("standardization", {})
        core = pipeline_results.get("core_detection", {})
        decomp = pipeline_results.get("rgroup_decomposition", {})
        sar = pipeline_results.get("sar_ranking", {})
        mmp = pipeline_results.get("mmp_analysis", {})
        cliffs = pipeline_results.get("activity_cliffs", {})
        scaffold = pipeline_results.get("scaffold_analysis", {})
        diversity = pipeline_results.get("diversity_analysis", {})
        enum_result = pipeline_results.get("enumeration", {})

        report_data = {
            "num_molecules": std.get("num_molecules", "?"),
            "num_valid": std.get("num_success", "?"),
            "strategy_used": strategy,
            "agents_run": agents_run,
        }

        # Build concise summary for LLM
        sections = []

        sections.append(f"Dataset: {std.get('num_success', '?')} valid molecules (of {std.get('num_molecules', '?')} uploaded)")
        sections.append(f"Analysis strategy: {strategy}")
        sections.append(f"Core SMARTS: {core.get('mcs_smarts', 'N/A')}")
        sections.append(f"MCS coverage: {core.get('mean_mcs_coverage', 0):.0%}")

        if decomp.get("num_matched"):
            sections.append(f"R-group decomposition: {decomp['num_matched']} matched, {decomp.get('num_unmatched', 0)} unmatched")
            positions = decomp.get("rgroup_columns", [])
            sections.append(f"R-group positions: {positions}")

        if sar.get("llm_key_finding"):
            sections.append(f"SAR key finding: {sar['llm_key_finding']}")
        if sar.get("llm_design_hypothesis"):
            sections.append(f"Design hypothesis: {sar['llm_design_hypothesis']}")

        if mmp.get("num_pairs"):
            sections.append(f"MMP pairs found: {mmp['num_pairs']}")

        if cliffs.get("num_cliff_pairs"):
            sections.append(f"Activity cliffs: {cliffs['num_cliff_pairs']} cliff pairs")
            sections.append(f"Cliff sensitivity: {cliffs.get('cliff_sensitivity', 'N/A')}")

        if scaffold.get("scaffold_tree", {}).get("num_unique_scaffolds"):
            sections.append(f"Unique scaffolds: {scaffold['scaffold_tree']['num_unique_scaffolds']}")

        if diversity.get("diversity_score"):
            sections.append(f"Diversity score: {diversity['diversity_score']:.2f} (0=identical, 1=maximally diverse)")

        if enum_result.get("num_passing_filters"):
            sections.append(f"Enumerated virtual library: {enum_result['num_passing_filters']} compounds")

        context_str = "\n".join(f"- {s}" for s in sections)

        task = f"""Generate a comprehensive R-group analysis report based on these results:

{context_str}

Property of interest: {property_of_interest or 'not specified'}

Write a professional medicinal chemistry analysis report with these sections:
1. Executive Summary (3-4 sentences)
2. Key Findings (bullet points, 4-6 items)
3. SAR Insights (2-3 sentences)
4. Recommended Next Steps (3-5 actionable items)
5. Risks/Limitations (2-3 sentences)

Return JSON:
{{
  "executive_summary": "...",
  "key_findings": ["finding 1", "finding 2", ...],
  "sar_insights": "...",
  "next_steps": ["step 1", "step 2", ...],
  "risks_and_limitations": "...",
  "report_title": "R-Group Analysis Report: [dataset description]"
}}"""

        report_result = {**report_data}

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1500,
                system=self.build_system_prompt(),
                messages=[{"role": "user", "content": task}],
            )
            text = response.content[0].text if response.content else ""
            m = re.search(r'\{.*\}', text, re.DOTALL)
            if m:
                llm_report = json.loads(m.group())
                report_result.update(llm_report)
            else:
                report_result["raw_report"] = text
        except Exception as e:
            report_result["error"] = str(e)

        return report_result
