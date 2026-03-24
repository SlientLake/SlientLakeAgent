# skills/cli_agents/claude_code.py
import json
from skills.cli_agents.base import CLIAgentSkill
from core.skill_interface import SkillResult


class ClaudeCodeSkill(CLIAgentSkill):
    """
    Claude Code CLI 包装。
    使用 Headless 模式 (-p) 执行，支持 JSON 输出和会话续接。
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.model = config.get("model", "claude-sonnet-4-6")
        self.max_turns = config.get("max_turns", 10)
        self.session_id = config.get("session_id")  # 会话续接

    def name(self) -> str:
        return "claude-code"

    def description(self) -> str:
        return (
            "Invoke Claude Code as an autonomous coding agent. "
            "It can read/write files, execute commands, search code, "
            "run tests, and make git commits in a specified working directory."
        )

    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Task description for Claude Code to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Working directory for the task"
                },
                "allowed_tools": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Allowed tools (e.g., ['Bash', 'Read', 'Write', 'Edit'])"
                },
                "session_id": {
                    "type": "string",
                    "description": "Resume a previous session by ID"
                },
                "max_turns": {
                    "type": "integer",
                    "description": "Maximum agent loop turns",
                    "default": 10
                },
            },
            "required": ["prompt"]
        }

    def _build_command(self, prompt: str, **kwargs) -> list:
        cmd = [
            "claude",
            "-p", prompt,
            "--output-format", "json",
            "--model", self.model,
            "--max-turns", str(kwargs.get("max_turns", self.max_turns)),
        ]

        # 会话续接
        session = kwargs.get("session_id", self.session_id)
        if session:
            cmd.extend(["--session-id", session])

        # 允许的工具
        allowed = kwargs.get("allowed_tools")
        if allowed:
            cmd.extend(["--allowedTools", ",".join(allowed)])

        return cmd

    def _parse_output(self, stdout: str, stderr: str) -> dict:
        """解析 Claude Code JSON 输出"""
        try:
            result = json.loads(stdout)
            return {
                "response": result.get("result", ""),
                "session_id": result.get("session_id", ""),
                "cost": result.get("cost_usd", 0),
                "turns": result.get("num_turns", 0),
                "is_error": result.get("is_error", False),
            }
        except json.JSONDecodeError:
            return {"response": stdout, "raw": True}


def create(config: dict) -> ClaudeCodeSkill:
    return ClaudeCodeSkill(config)
