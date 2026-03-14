"""
Base agent class with Claude tool-use loop.
All specialized agents inherit from this.
"""

import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

import anthropic

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-4-6"
DEFAULT_MAX_TOKENS = 8192


class BaseAgent(ABC):
    """
    Base class for all R-group analysis agents.
    Implements the standard Claude tool-use agentic loop.
    """

    def __init__(
        self,
        client: anthropic.Anthropic,
        model: str = DEFAULT_MODEL,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        progress_callback=None,
    ):
        self.client = client
        self.model = model
        self.max_tokens = max_tokens
        self.progress_callback = progress_callback  # async callable for WebSocket updates

    @property
    @abstractmethod
    def name(self) -> str:
        """Agent display name."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """What this agent does."""
        ...

    @abstractmethod
    def get_tools(self) -> List[Dict[str, Any]]:
        """Return list of tool definitions for Claude."""
        ...

    @abstractmethod
    def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        """Execute a tool call and return JSON-serializable result."""
        ...

    def build_system_prompt(self) -> str:
        return f"""You are the {self.name}, a specialized computational chemistry agent.
{self.description}

When you need to perform calculations or analysis, use the provided tools.
Always use tools to compute results — never fabricate molecular data.
Return your final answer as structured JSON in the last message.
Be concise in your reasoning between tool calls."""

    def _emit_progress(self, message: str, data: Any = None):
        if self.progress_callback:
            try:
                self.progress_callback({"agent": self.name, "message": message, "data": data})
            except Exception:
                pass

    def run(
        self,
        task: str,
        context: Optional[Dict[str, Any]] = None,
        system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the agent's agentic tool-use loop.

        Args:
            task:          Natural language task description with embedded data
            context:       Additional structured context (appended to task)
            system_prompt: Override the default system prompt

        Returns:
            dict with agent result
        """
        if context:
            task_with_context = f"{task}\n\nContext:\n{json.dumps(context, indent=2)}"
        else:
            task_with_context = task

        messages = [{"role": "user", "content": task_with_context}]
        system = system_prompt or self.build_system_prompt()
        tools = self.get_tools()

        self._emit_progress(f"Starting {self.name}")
        max_iterations = 20
        iterations = 0

        while iterations < max_iterations:
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
                logger.error(f"Claude API error in {self.name}: {e}")
                return {"error": str(e), "agent": self.name}

            # Check stop reason
            if response.stop_reason == "end_turn":
                # Extract final text response
                text_blocks = [b.text for b in response.content if hasattr(b, "text")]
                final_text = "\n".join(text_blocks)
                self._emit_progress(f"{self.name} complete")

                # Try to parse JSON from the final response
                try:
                    import re
                    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", final_text, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group(1))
                    # Try bare JSON
                    start = final_text.rfind("{")
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

                    tool_name = block.name
                    tool_input = block.input
                    self._emit_progress(f"Calling tool: {tool_name}")
                    logger.info(f"[{self.name}] Tool call: {tool_name}")

                    try:
                        tool_result = self.execute_tool(tool_name, tool_input)
                        result_content = json.dumps(tool_result, default=str)
                    except Exception as e:
                        logger.error(f"Tool {tool_name} failed: {e}", exc_info=True)
                        result_content = json.dumps({"error": str(e), "tool": tool_name})

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_content,
                    })

                messages.append({"role": "user", "content": tool_results})
            else:
                # Unexpected stop reason
                logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
                break

        return {"error": "Max iterations reached", "agent": self.name}
