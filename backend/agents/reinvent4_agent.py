"""
Reinvent4Agent: supervisory loop for REINVENT4 scaffold decoration.

Inherits BaseAgent but overrides run() with a custom typed signature.
Implements its own Claude tool-use loop (same pattern as BaseAgent)
with max_iterations=40 to accommodate multi-iteration RL runs.
"""

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import anthropic

from .base import BaseAgent, DEFAULT_MODEL
from .convergence_subagent import ConvergenceSubagent
from backend.utils.qsar_trainer import QSARTrainer, QSARTrainingFailed
from backend.utils import reinvent4_utils
from backend.utils.reinvent4_utils import Reinvent4RunFailed

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 40  # Total Claude tool-call turns budget


class Reinvent4Agent(BaseAgent):
    """
    Supervisory agent for REINVENT4 scaffold decoration.
    Drives an iterative optimization loop, detecting convergence/minima
    and adapting scoring strategy via Claude reasoning.
    """

    @property
    def name(self) -> str:
        return "Reinvent4Agent"

    @property
    def description(self) -> str:
        return (
            "Supervisory agent for REINVENT4 scaffold decoration. "
            "Iterates REINVENT4 runs, detects convergence or local minima, "
            "and adapts scoring weights to find optimal R-group variants."
        )

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "train_qsar_model",
                "description": "Train a QSAR model on activity data. Returns model_path, cv_r2, and scoring_component_config.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "smiles": {"type": "array", "items": {"type": "string"}, "description": "Training SMILES"},
                        "activity": {"type": "array", "items": {"type": "number"}, "description": "Activity values"},
                    },
                    "required": ["smiles", "activity"],
                },
            },
            {
                "name": "build_toml_config",
                "description": "Write the REINVENT4 TOML config file for scaffold decoration. Returns toml_path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "scaffold_smarts": {"type": "string", "description": "Scaffold SMARTS with attachment points [*:N]"},
                        "scoring_config": {
                            "type": "object",
                            "description": "Scoring config dict with 'components' list",
                        },
                        "n_steps": {"type": "integer", "description": "Number of REINVENT4 sampling steps"},
                        "sigma": {"type": "integer", "description": "Exploitation sharpness sigma (default 100)"},
                        "diversity_filter": {"type": "string", "description": "Diversity filter name (default IdenticalMurckoScaffold)"},
                    },
                    "required": ["scaffold_smarts", "scoring_config", "n_steps"],
                },
            },
            {
                "name": "run_reinvent4",
                "description": "Run REINVENT4 via subprocess. Returns output_csv_path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "toml_path": {"type": "string", "description": "Path to the REINVENT4 TOML config file"},
                    },
                    "required": ["toml_path"],
                },
            },
            {
                "name": "parse_results",
                "description": "Parse REINVENT4 output CSV. Returns top-N molecules sorted by score.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "csv_path": {"type": "string", "description": "Path to REINVENT4 output CSV"},
                        "top_n": {"type": "integer", "description": "Max results to return (default 50)"},
                    },
                    "required": ["csv_path"],
                },
            },
            {
                "name": "analyze_convergence",
                "description": "Analyze iteration metrics and return convergence recommendation (status, action, suggested_adjustments).",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "metrics": {
                            "type": "object",
                            "description": "Current iteration stats: {iteration, mean_score, top10_score, internal_diversity, n_molecules}",
                        },
                        "history": {
                            "type": "array",
                            "description": "List of previous iteration stats dicts",
                        },
                    },
                    "required": ["metrics", "history"],
                },
            },
            {
                "name": "adjust_config",
                "description": "Apply suggested_adjustments to rebuild the TOML config. Returns new toml_path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "current_toml_path": {"type": "string"},
                        "suggested_adjustments": {"type": "object", "description": "Dict of adjustment keys (sigma, diversity_filter, qsar_weight, qed_weight, sa_score_weight, n_steps)"},
                        "scaffold_smarts": {"type": "string"},
                        "current_scoring_config": {"type": "object"},
                        "n_steps": {"type": "integer"},
                    },
                    "required": ["current_toml_path", "suggested_adjustments", "scaffold_smarts", "current_scoring_config", "n_steps"],
                },
            },
            {
                "name": "get_iteration_summary",
                "description": "Return a compact summary of all iterations so far.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        ]

    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        """Dispatch tool calls to their implementations."""
        if tool_name == "train_qsar_model":
            return self._tool_train_qsar(tool_input)
        elif tool_name == "build_toml_config":
            return self._tool_build_toml(tool_input)
        elif tool_name == "run_reinvent4":
            return self._tool_run_reinvent4(tool_input)
        elif tool_name == "parse_results":
            return self._tool_parse_results(tool_input)
        elif tool_name == "analyze_convergence":
            return self._tool_analyze_convergence(tool_input)
        elif tool_name == "adjust_config":
            return self._tool_adjust_config(tool_input)
        elif tool_name == "get_iteration_summary":
            return self._tool_get_iteration_summary()
        return {"error": f"Unknown tool: {tool_name}"}

    # ── Custom run() ─────────────────────────────────────────────────────────

    def run(
        self,
        core_smarts: str,
        sar_data: Dict[str, Any],
        properties: Dict[str, List],
        property_of_interest: Optional[str],
        generative_config,  # GenerativeConfig instance
    ) -> Dict[str, Any]:
        """
        Execute the REINVENT4 scaffold decoration loop.
        Does NOT call super().run() — implements its own tool-use loop
        with max_iterations=40.
        """
        # Fail fast if REINVENT4 is not configured
        exec_path = os.environ.get("REINVENT4_EXEC", "")
        if not exec_path:
            return {
                "error": f"REINVENT4_EXEC not configured or not found: '{exec_path}'. "
                         "Set the REINVENT4_EXEC environment variable to the reinvent executable path."
            }

        self._exec_path = exec_path
        self._generative_config = generative_config
        self._iteration_history: List[Dict] = []
        self._work_dir = Path(tempfile.mkdtemp(prefix="reinvent4_"))
        self._convergence_subagent = ConvergenceSubagent(client=self.client, model=self.model)

        # Build the task prompt for Claude
        task = self._build_task_prompt(core_smarts, sar_data, properties, property_of_interest, generative_config)
        system = self.build_system_prompt()
        tools = self.get_tools()
        messages = [{"role": "user", "content": task}]

        self._emit_progress("Reinvent4Agent: starting scaffold decoration loop")

        iterations = 0
        while iterations < MAX_ITERATIONS:
            iterations += 1

            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    system=system,
                    tools=tools,
                    messages=messages,
                )
            except anthropic.APIError as e:
                logger.error(f"Claude API error in Reinvent4Agent: {e}")
                return {"error": str(e), "agent": self.name}

            if response.stop_reason == "end_turn":
                text_blocks = [b.text for b in response.content if hasattr(b, "text")]
                final_text = "\n".join(text_blocks)
                self._emit_progress("Reinvent4Agent: complete")
                try:
                    import re
                    # Try markdown-fenced JSON first
                    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", final_text, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group(1))
                    # Try bare JSON (entire text is JSON)
                    stripped = final_text.strip()
                    if stripped.startswith("{"):
                        return json.loads(stripped)
                    # Fall back to finding first { ... last }
                    start = final_text.find("{")
                    end = final_text.rfind("}") + 1
                    if start >= 0 and end > start:
                        return json.loads(final_text[start:end])
                except (json.JSONDecodeError, ValueError):
                    pass
                return {"result": final_text, "agent": self.name}

            if response.stop_reason == "tool_use":
                tool_results = []
                messages.append({"role": "assistant", "content": response.content})
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    self._emit_progress(f"Reinvent4Agent: calling tool {block.name}")
                    try:
                        result = self.execute_tool(block.name, block.input)
                        content = json.dumps(result, default=str)
                    except Exception as e:
                        logger.error(f"Tool {block.name} failed: {e}", exc_info=True)
                        content = json.dumps({"error": str(e), "tool": block.name})
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content,
                    })
                messages.append({"role": "user", "content": tool_results})
            else:
                logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
                break

        return {"error": "Max iterations reached", "agent": self.name}

    # ── Tool implementations ──────────────────────────────────────────────────

    def _tool_train_qsar(self, inp: Dict) -> Dict:
        try:
            trainer = QSARTrainer()
            result = trainer.train(
                smiles=inp["smiles"],
                activity=inp["activity"],
                output_dir=self._work_dir,
            )
            result["model_path"] = str(result["model_path"])
            return result
        except QSARTrainingFailed as e:
            logger.warning(f"QSAR training failed: {e} — falling back to physico-only")
            return {"error": str(e), "fallback": "physico"}

    def _tool_build_toml(self, inp: Dict) -> Dict:
        path = reinvent4_utils.build_toml(
            scaffold_smarts=inp["scaffold_smarts"],
            scoring_config=inp.get("scoring_config", {"components": []}),
            n_steps=inp.get("n_steps", self._generative_config.n_steps),
            output_dir=self._work_dir,
            sigma=inp.get("sigma", 100),
            diversity_filter=inp.get("diversity_filter", "IdenticalMurckoScaffold"),
        )
        return {"toml_path": str(path)}

    def _tool_run_reinvent4(self, inp: Dict) -> Dict:
        try:
            csv_path = reinvent4_utils.run_reinvent4(
                toml_path=Path(inp["toml_path"]),
                exec_path=self._exec_path,
            )
            return {"csv_path": str(csv_path)}
        except Reinvent4RunFailed as e:
            return {"error": str(e), "stderr": e.stderr}

    def _tool_parse_results(self, inp: Dict) -> Dict:
        results = reinvent4_utils.parse_results(
            csv_path=Path(inp["csv_path"]),
            top_n=inp.get("top_n", 50),
        )
        return {"molecules": results, "n_molecules": len(results)}

    def _tool_analyze_convergence(self, inp: Dict) -> Dict:
        recommendation = self._convergence_subagent.analyze(
            metrics=inp["metrics"],
            history=inp.get("history", []),
        )
        # Track iteration history
        metrics = inp["metrics"]
        self._iteration_history.append({
            "iteration": metrics.get("iteration"),
            "mean_score": metrics.get("mean_score"),
            "top10_score": metrics.get("top10_score"),
            "internal_diversity": metrics.get("internal_diversity"),
            "action_taken": recommendation.get("action"),
        })
        return recommendation

    def _tool_adjust_config(self, inp: Dict) -> Dict:
        adj = inp.get("suggested_adjustments", {})
        scoring_config = inp.get("current_scoring_config", {"components": []})

        # Apply weight adjustments
        for comp in scoring_config.get("components", []):
            if "qsar_weight" in adj and comp.get("type") == "qsar_activity":
                comp["weight"] = adj["qsar_weight"]
            if "qed_weight" in adj and comp.get("type") == "qed":
                comp["weight"] = adj["qed_weight"]
            if "sa_score_weight" in adj and comp.get("type") == "sa_score":
                comp["weight"] = adj["sa_score_weight"]

        path = reinvent4_utils.build_toml(
            scaffold_smarts=inp["scaffold_smarts"],
            scoring_config=scoring_config,
            n_steps=adj.get("n_steps", inp.get("n_steps", self._generative_config.n_steps)),
            output_dir=self._work_dir,
            sigma=adj.get("sigma", 100),
            diversity_filter=adj.get("diversity_filter", "IdenticalMurckoScaffold"),
        )
        return {"toml_path": str(path)}

    def _tool_get_iteration_summary(self) -> Dict:
        return {
            "total_iterations": len(self._iteration_history),
            "history": self._iteration_history,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _build_task_prompt(
        self,
        core_smarts: str,
        sar_data: Dict,
        properties: Dict,
        property_of_interest: Optional[str],
        config,
    ) -> str:
        activity_data = []
        if property_of_interest and property_of_interest in properties:
            activity_data = properties[property_of_interest]

        has_activity = len(activity_data) >= 10
        scoring_mode = config.scoring_mode

        smiles_list = list(properties.get("smiles", []))

        return f"""You are running REINVENT4 scaffold decoration to generate novel R-group variants.

CORE SCAFFOLD: {core_smarts}
SCORING MODE: {scoring_mode}
MAX ITERATIONS: {config.n_iterations}
STEPS PER ITERATION: {config.n_steps}
HAS ACTIVITY DATA: {has_activity}
PROPERTY OF INTEREST: {property_of_interest or "None"}

SAR SUMMARY: {json.dumps(sar_data, indent=2)[:2000]}

INSTRUCTIONS:
1. {"Call train_qsar_model first with the activity data." if scoring_mode in ("qsar", "both") and has_activity else "Skip QSAR training (physico-only mode or insufficient data)."}
2. Call build_toml_config to create the initial REINVENT4 config.
   - For scoring_config, include {"a qsar_activity component (use model_path from train_qsar_model) plus " if scoring_mode in ("qsar", "both") and has_activity else ""}QED and SA score components.
3. Run the iteration loop (max {config.n_iterations} iterations):
   a. Call run_reinvent4 with the current toml_path.
   b. Call parse_results with the returned csv_path.
   c. Compute metrics: mean_score = average composite_score, top10_score = mean of top 10%,
      n_molecules = total parsed. Estimate internal_diversity as 0.5 if unknown.
   d. Call analyze_convergence with the metrics and iteration history.
   e. Act on the recommendation:
      - "continue": proceed to next iteration
      - "escape": call adjust_config with suggested_adjustments, then continue
      - "reweight": call adjust_config with suggested_adjustments, then continue
      - "stop": exit the loop and return results
4. After the loop (or on stop), return a JSON result:
{{
  "top_molecules": [<top 20 molecules from all iterations, sorted by composite_score>],
  "iteration_history": [<from get_iteration_summary>],
  "converged_status": "converged" | "budget_exhausted" | "error",
  "scoring_mode_used": "{scoring_mode}"
}}

ACTIVITY DATA (first 20 values): {json.dumps(list(zip(smiles_list[:20], activity_data[:20])))}

Begin now. Use tools only — never fabricate molecular scores."""
