"""
Orchestrator Agent
The master controller that:
1. Standardizes the input compound set
2. Analyzes its structure to determine the best analysis strategy
3. Dispatches to the appropriate sub-agents
4. Aggregates results into a unified response

Strategy decision logic:
- Strong common core (MCS coverage >60%)  → R-group pipeline
- Multiple scaffold families              → Scaffold family pipeline
- Low structural convergence              → MMP pipeline
All datasets run: standardization, activity cliff detection, diversity analysis, report
"""

import json
import logging
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent
from .standardization_agent import StandardizationAgent
from .core_detection_agent import CoreDetectionAgent
from .decomposition_agent import DecompositionAgent
from .sar_agent import SARAgent
from .mmp_agent import MMPAgent
from .enumeration_agent import EnumerationAgent
from .activity_cliff_agent import ActivityCliffAgent
from .scaffold_agent import ScaffoldAgent
from .report_agent import ReportAgent

logger = logging.getLogger(__name__)


class OrchestratorAgent(BaseAgent):
    """
    Top-level orchestrator that routes compound sets through the appropriate
    analysis pipeline based on structural characteristics.
    """

    @property
    def name(self) -> str:
        return "OrchestratorAgent"

    @property
    def description(self) -> str:
        return (
            "Master orchestrator for R-group analysis. Determines the best "
            "analytical strategy for a compound set and dispatches to specialized agents."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        # The orchestrator calls sub-agents directly, not molecular tools
        return []

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        return {}

    def run_full_pipeline(
        self,
        smiles: List[str],
        labels: List[str],
        properties: Dict[str, List],
        property_of_interest: Optional[str] = None,
        run_enumeration: bool = False,
        core_smarts: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the full analysis pipeline.

        Args:
            smiles:               List of SMILES strings
            labels:               Molecule identifiers
            properties:           {prop_name: [values]}
            property_of_interest: Which property to rank R-groups by
            run_enumeration:      Whether to enumerate virtual library
            core_smarts:          User-supplied core SMARTS (optional)

        Returns:
            Full analysis results dict
        """
        pipeline_results: Dict[str, Any] = {
            "pipeline": [],
            "strategy": None,
            "agents_run": [],
        }

        def emit(msg: str):
            self._emit_progress(msg)
            logger.info(f"[Orchestrator] {msg}")

        # ── 1. Standardization ──────────────────────────────────────────────
        emit("Step 1/7: Standardizing molecules...")
        std_agent = StandardizationAgent(self.client, progress_callback=self.progress_callback)
        std_result = std_agent.run_standardize(smiles, labels)
        pipeline_results["standardization"] = std_result
        pipeline_results["agents_run"].append("StandardizationAgent")

        # Use standardized SMILES for all downstream steps
        std_smiles = [
            r.get("standardized_smiles") or r.get("canonical_smiles") or s
            for r, s in zip(std_result.get("results", []), smiles)
        ]

        # ── 2. Core Detection (strategy selection) ──────────────────────────
        emit("Step 2/7: Detecting series core and selecting strategy...")
        core_agent = CoreDetectionAgent(self.client, progress_callback=self.progress_callback)
        core_result = core_agent.run_detection(std_smiles, user_core_smarts=core_smarts)
        pipeline_results["core_detection"] = core_result
        pipeline_results["agents_run"].append("CoreDetectionAgent")

        strategy = core_result.get("recommended_approach", "mmp")
        if core_smarts:
            strategy = "rgroup"  # User override
        pipeline_results["strategy"] = strategy
        emit(f"Selected strategy: {strategy.upper()}")

        # ── 3. Strategy-specific pipeline ───────────────────────────────────
        if strategy == "rgroup":
            detected_core = core_smarts or core_result.get("mcs_smarts")

            emit("Step 3/7: Running R-group decomposition...")
            decomp_agent = DecompositionAgent(self.client, progress_callback=self.progress_callback)
            decomp_result = decomp_agent.run_decomposition(
                std_smiles, labels, detected_core, properties
            )
            pipeline_results["rgroup_decomposition"] = decomp_result
            pipeline_results["agents_run"].append("DecompositionAgent")

            if property_of_interest:
                emit("Step 4/7: Ranking R-groups vs property...")
                sar_agent = SARAgent(self.client, progress_callback=self.progress_callback)
                sar_result = sar_agent.run_ranking(decomp_result, property_of_interest)
                pipeline_results["sar_ranking"] = sar_result
                pipeline_results["agents_run"].append("SARAgent")

            if run_enumeration and detected_core:
                emit("Step 4b: Enumerating substituent swaps...")
                enum_agent = EnumerationAgent(self.client, progress_callback=self.progress_callback)
                enum_result = enum_agent.run_enumeration(
                    detected_core,
                    decomp_result.get("rgroup_frequency", {}),
                )
                pipeline_results["enumeration"] = enum_result
                pipeline_results["agents_run"].append("EnumerationAgent")

        elif strategy == "scaffold_family":
            emit("Step 3/7: Running scaffold family analysis...")
            scaffold_agent = ScaffoldAgent(self.client, progress_callback=self.progress_callback)
            scaffold_result = scaffold_agent.run_scaffold_analysis(
                std_smiles, labels, properties
            )
            pipeline_results["scaffold_analysis"] = scaffold_result
            pipeline_results["agents_run"].append("ScaffoldAgent")

            # Also run MMP within scaffold families
            emit("Step 4/7: Mining MMP transforms...")
            mmp_agent = MMPAgent(self.client, progress_callback=self.progress_callback)
            mmp_result = mmp_agent.run_mmp(std_smiles, labels, properties)
            pipeline_results["mmp_analysis"] = mmp_result
            pipeline_results["agents_run"].append("MMPAgent")

        else:  # mmp
            emit("Step 3/7: Running MMP transform mining...")
            mmp_agent = MMPAgent(self.client, progress_callback=self.progress_callback)
            mmp_result = mmp_agent.run_mmp(std_smiles, labels, properties)
            pipeline_results["mmp_analysis"] = mmp_result
            pipeline_results["agents_run"].append("MMPAgent")

            # Also scaffold analysis for MMP sets
            emit("Step 4/7: Running scaffold analysis...")
            scaffold_agent = ScaffoldAgent(self.client, progress_callback=self.progress_callback)
            scaffold_result = scaffold_agent.run_scaffold_analysis(
                std_smiles, labels, properties
            )
            pipeline_results["scaffold_analysis"] = scaffold_result
            pipeline_results["agents_run"].append("ScaffoldAgent")

        # ── 4. Activity Cliff Detection (always runs) ────────────────────────
        if property_of_interest and property_of_interest in properties:
            emit("Step 5/7: Detecting activity cliffs...")
            cliff_agent = ActivityCliffAgent(self.client, progress_callback=self.progress_callback)
            cliff_result = cliff_agent.run_cliff_detection(
                std_smiles,
                properties[property_of_interest],
                labels,
            )
            pipeline_results["activity_cliffs"] = cliff_result
            pipeline_results["agents_run"].append("ActivityCliffAgent")

        # ── 5. Diversity Analysis (always runs) ──────────────────────────────
        emit("Step 6/7: Analyzing chemical diversity...")
        from .scaffold_agent import ScaffoldAgent as _SA
        from backend.tools.diversity_analysis import diversity_analysis
        div_result = diversity_analysis(
            std_smiles,
            labels=labels,
            n_diverse=min(10, len(std_smiles)),
        )
        pipeline_results["diversity_analysis"] = div_result
        pipeline_results["agents_run"].append("DiversityAnalysis")

        # ── 6. Report Generation ─────────────────────────────────────────────
        emit("Step 7/7: Generating analysis report...")
        report_agent = ReportAgent(self.client, progress_callback=self.progress_callback)
        report_result = report_agent.run_report(pipeline_results, property_of_interest)
        pipeline_results["report"] = report_result
        pipeline_results["agents_run"].append("ReportAgent")

        emit("Pipeline complete!")
        return pipeline_results
