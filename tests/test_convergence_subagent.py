"""Unit tests for ConvergenceSubagent."""

import json
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.convergence_subagent import ConvergenceSubagent


def _make_claude_response(json_dict: dict) -> MagicMock:
    """Build a mock Anthropic Messages response returning the given dict as text."""
    block = MagicMock()
    block.text = json.dumps(json_dict)
    response = MagicMock()
    response.content = [block]
    return response


@pytest.fixture
def mock_client():
    client = MagicMock()
    return client


@pytest.fixture
def subagent(mock_client):
    return ConvergenceSubagent(client=mock_client)


@pytest.fixture
def improving_metrics():
    return {
        "iteration": 2,
        "mean_score": 0.65,
        "top10_score": 0.80,
        "internal_diversity": 0.60,
        "n_molecules": 450,
    }


@pytest.fixture
def plateau_history():
    return [
        {"iteration": 1, "mean_score": 0.60, "top10_score": 0.74, "internal_diversity": 0.65},
        {"iteration": 2, "mean_score": 0.61, "top10_score": 0.75, "internal_diversity": 0.58},
    ]


class TestConvergenceSubagentInterface:
    def test_analyze_returns_dict(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving",
            "action": "continue",
            "rationale": "Scores are rising steadily.",
            "suggested_adjustments": {},
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert isinstance(result, dict)

    def test_analyze_calls_messages_create_once(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "converged", "action": "stop", "rationale": "done", "suggested_adjustments": {}
        })
        subagent.analyze(improving_metrics, plateau_history)
        mock_client.messages.create.assert_called_once()

    def test_result_has_status_field(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving", "action": "continue", "rationale": "ok", "suggested_adjustments": {}
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert "status" in result

    def test_result_has_action_field(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "plateau", "action": "escape", "rationale": "stuck", "suggested_adjustments": {"sigma": 120}
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert "action" in result

    def test_result_has_suggested_adjustments_field(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "low_diversity", "action": "reweight", "rationale": "collapsed",
            "suggested_adjustments": {"diversity_filter": "ScaffoldSimilarity"}
        })
        result = subagent.analyze(improving_metrics, plateau_history)
        assert "suggested_adjustments" in result


class TestConvergenceSubagentFallback:
    def test_returns_continue_on_bad_json(self, subagent, mock_client, improving_metrics, plateau_history):
        """When Claude returns unparseable JSON, default to continue."""
        block = MagicMock()
        block.text = "NOT VALID JSON {{{{"
        mock_client.messages.create.return_value = MagicMock(content=[block])
        result = subagent.analyze(improving_metrics, plateau_history)
        assert result["action"] == "continue"

    def test_passes_metrics_and_history_in_message(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving", "action": "continue", "rationale": "ok", "suggested_adjustments": {}
        })
        subagent.analyze(improving_metrics, plateau_history)
        call_kwargs = mock_client.messages.create.call_args
        user_message = call_kwargs.kwargs["messages"][0]["content"]
        payload = json.loads(user_message)
        assert payload["metrics"]["iteration"] == improving_metrics["iteration"]
        assert len(payload["history"]) == len(plateau_history)

    def test_uses_correct_max_tokens(self, subagent, mock_client, improving_metrics, plateau_history):
        mock_client.messages.create.return_value = _make_claude_response({
            "status": "improving", "action": "continue", "rationale": "ok", "suggested_adjustments": {}
        })
        subagent.analyze(improving_metrics, plateau_history)
        call_kwargs = mock_client.messages.create.call_args
        assert call_kwargs.kwargs["max_tokens"] == 1024
