# skills/cli_agents/opencode.py
import json
from skills.cli_agents.base import CLIAgentSkill


class OpenCodeSkill(CLIAgentSkill):
    """
    OpenCode CLI 包装。
    使用 -p (非交互) + -f json (JSON输出) + -q (静默) 模式。
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.provider = config.get("provider", "anthropic")
        self.model = config.get("model", "claude-sonnet-4-6")

    def name(self) -> str:
        return "opencode"

    def description(self) -> str:
        return (
            "Invoke OpenCode as an autonomous coding agent. "
            "Supports 75+ LLM providers, LSP integration, "
            "and declarative YAML subagent workflows."
        )

    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Task description for OpenCode to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Working directory"
                },
                "provider": {
                    "type": "string",
                    "description": "LLM provider (anthropic, openai, google, etc.)"
                },
                "model": {
                    "type": "string",
                    "description": "Model to use"
                },
            },
            "required": ["prompt"]
        }

    def _build_command(self, prompt: str, **kwargs) -> list:
        cmd = [
            "opencode",
            "-p", prompt,
            "-f", "json",
            "-q",
        ]
        return cmd

    def _parse_output(self, stdout: str, stderr: str) -> dict:
        try:
            result = json.loads(stdout)
            return result
        except json.JSONDecodeError:
            return {"response": stdout.strip()}


def create(config: dict) -> OpenCodeSkill:
    return OpenCodeSkill(config)
