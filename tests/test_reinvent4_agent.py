"""Integration tests for Reinvent4Agent. All REINVENT4 subprocess calls are mocked."""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

from backend.agents.reinvent4_agent import Reinvent4Agent
from backend.api.routes.analyze import GenerativeConfig


def _tool_response(tool_name: str, tool_id: str, result: dict) -> dict:
    """Build a mock tool-result message."""
    return {
        "role": "user",
        "content": [{
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": json.dumps(result),
        }],
    }


def _tool_use_block(name: str, tool_id: str, input_dict: dict) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.name = name
    block.id = tool_id
    block.input = input_dict
    return block


def _end_turn_response(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.stop_reason = "end_turn"
    response.content = [block]
    return response


def _tool_use_response(blocks: list) -> MagicMock:
    response = MagicMock()
    response.stop_reason = "tool_use"
    response.content = blocks
    return response


@pytest.fixture
def mock_client():
    return MagicMock()


@pytest.fixture
def config():
    return GenerativeConfig(scoring_mode="physico", n_iterations=2, n_steps=100)


@pytest.fixture
def agent(mock_client):
    return Reinvent4Agent(client=mock_client)


@pytest.fixture
def sample_sar_data():
    return {"positions": {"R1": {"top_substituents": ["F", "Cl"]}}}


def _run_converging_agent(agent, mock_client, sample_sar_data, config, tmp_path) -> dict:
    """Run agent through a single-iteration converging mock sequence. Returns the result dict."""
    toml_path = tmp_path / "config.toml"
    toml_path.write_text("")
    csv_path = tmp_path / "results" / "scaffold_decoration.csv"
    csv_path.parent.mkdir()
    csv_path.write_text("SMILES,Score,Step\nCCO,0.9,1\n")

    # Claude sequence: build_toml → run_reinvent4 → parse_results → analyze_convergence → end_turn
    mock_client.messages.create.side_effect = [
        _tool_use_response([_tool_use_block("build_toml_config", "t1", {
            "scaffold_smarts": "[*:1]c1ccccc1", "scoring_config": {"components": []}, "n_steps": 100,
        })]),
        _tool_use_response([_tool_use_block("run_reinvent4", "t2", {"toml_path": str(toml_path)})]),
        _tool_use_response([_tool_use_block("parse_results", "t3", {"csv_path": str(csv_path)})]),
        _tool_use_response([_tool_use_block("analyze_convergence", "t4", {
            "metrics": {"iteration": 1, "mean_score": 0.9, "top10_score": 0.9,
                        "internal_diversity": 0.5, "n_molecules": 1},
            "history": [],
        })]),
        _end_turn_response(json.dumps({
            "top_molecules": [{"smiles": "CCO", "composite_score": 0.9}],
            "iteration_history": [{"iteration": 1, "mean_score": 0.9, "action_taken": "stop"}],
            "converged_status": "converged",
            "scoring_mode_used": "physico",
        })),
    ]

    with patch.dict(os.environ, {"REINVENT4_EXEC": "/fake/reinvent"}):
        with patch("backend.utils.reinvent4_utils.build_toml", return_value=toml_path):
            with patch("backend.utils.reinvent4_utils.run_reinvent4", return_value=csv_path):
                with patch("backend.utils.reinvent4_utils.parse_results", return_value=[
                    {"smiles": "CCO", "canonical_smiles": "CCO", "composite_score": 0.9}
                ]):
                    with patch("backend.agents.convergence_subagent.ConvergenceSubagent.analyze",
                               return_value={"status": "converged", "action": "stop",
                                             "rationale": "done", "suggested_adjustments": {}}):
                        return agent.run(
                            core_smarts="[*:1]c1ccccc1",
                            sar_data=sample_sar_data,
                            properties={},
                            property_of_interest=None,
                            generative_config=config,
                        )


class TestReinvent4AgentValidation:
    def test_fails_fast_when_reinvent4_exec_not_set(self, agent, sample_sar_data, config):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("REINVENT4_EXEC", None)
            result = agent.run(
                core_smarts="[*:1]c1ccccc1",
                sar_data=sample_sar_data,
                properties={},
                property_of_interest=None,
                generative_config=config,
            )
        assert "error" in result
        assert "REINVENT4_EXEC" in result["error"]

    def test_returns_dict(self, agent, mock_client, sample_sar_data, config, tmp_path):
        result = _run_converging_agent(agent, mock_client, sample_sar_data, config, tmp_path)
        assert isinstance(result, dict)

    def test_result_contains_top_molecules(self, agent, mock_client, sample_sar_data, config, tmp_path):
        result = _run_converging_agent(agent, mock_client, sample_sar_data, config, tmp_path)
        assert "top_molecules" in result
