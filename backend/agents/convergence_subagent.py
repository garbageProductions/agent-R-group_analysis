"""
ConvergenceSubagent: single-turn Claude call to analyze REINVENT4 iteration metrics.

This is NOT a BaseAgent subclass. It makes exactly one client.messages.create()
call per invocation — no tool loop, no multi-turn cycle.
"""

import json
import logging
from typing import Any, Dict, List

import anthropic

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-4-6"

CONVERGENCE_SYSTEM_PROMPT = """You are an expert in generative chemistry optimization analysis.

You will receive JSON containing:
- "metrics": current iteration statistics (mean_score, top10_score, internal_diversity, n_molecules, iteration)
- "history": list of previous iteration statistics

Your job is to analyze whether the REINVENT4 scaffold decoration optimization is:
- improving: scores rising, diversity healthy — action: "continue"
- plateau: mean score barely changing (<~0.02 delta) for 2+ iterations — action: "escape"
- low_diversity: internal Tanimoto diversity below ~0.3 — action: "reweight"
- converged: top-10 score is stable and high (>0.75) — action: "stop"

Respond ONLY with valid JSON in this exact format:
{
  "status": "improving" | "plateau" | "low_diversity" | "converged",
  "action": "continue" | "escape" | "reweight" | "stop",
  "rationale": "<one sentence explanation>",
  "suggested_adjustments": {
    "sigma": <int, optional — increase for escape>,
    "diversity_filter": "<string, optional>",
    "qsar_weight": <float, optional>,
    "qed_weight": <float, optional>,
    "sa_score_weight": <float, optional>
  }
}

No explanation outside the JSON. No markdown fences. Raw JSON only."""


class ConvergenceSubagent:
    """
    Analyzes per-iteration REINVENT4 metrics and recommends the next action.
    Makes a single Claude API call per invocation.
    """

    def __init__(self, client: anthropic.Anthropic, model: str = DEFAULT_MODEL):
        self.client = client
        self.model = model

    def analyze(
        self,
        metrics: Dict[str, Any],
        history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Analyze convergence for the current iteration.

        Args:
            metrics:  Current iteration stats dict
            history:  List of previous iteration stats dicts

        Returns:
            Dict with keys: status, action, rationale, suggested_adjustments
            Falls back to {"action": "continue", ...} if Claude returns unparseable JSON.
        """
        payload = json.dumps({"metrics": metrics, "history": history})

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=CONVERGENCE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": payload}],
            )
            text = response.content[0].text
            return json.loads(text)
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"ConvergenceSubagent returned unparseable response: {e}. Defaulting to continue.")
            return {
                "status": "improving",
                "action": "continue",
                "rationale": "Could not parse convergence analysis — defaulting to continue.",
                "suggested_adjustments": {},
            }
