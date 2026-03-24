# skills/cli_agents/codex.py
import json
from skills.cli_agents.base import CLIAgentSkill


class CodexCLISkill(CLIAgentSkill):
    """
    OpenAI Codex CLI 包装。
    使用 `codex exec` 非交互模式执行。
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.model = config.get("model", "gpt-5.4")
        self.approval_mode = config.get("approval_mode", "full-auto")

    def name(self) -> str:
        return "codex-cli"

    def description(self) -> str:
        return (
            "Invoke OpenAI Codex CLI as an autonomous coding agent. "
            "It can read files, write code, run commands, and iterate "
            "on errors autonomously."
        )

    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Task description for Codex to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Working directory for the task"
                },
                "approval_mode": {
                    "type": "string",
                    "enum": ["suggest", "auto-edit", "full-auto"],
                    "default": "full-auto",
                    "description": "Approval mode for file changes"
                },
            },
            "required": ["prompt"]
        }

    def _build_command(self, prompt: str, **kwargs) -> list:
        mode = kwargs.get("approval_mode", self.approval_mode)
        cmd = [
            "codex", "exec",
            "--approval-mode", mode,
            "--model", self.model,
            prompt,
        ]
        return cmd

    def _parse_output(self, stdout: str, stderr: str) -> dict:
        return {
            "response": stdout.strip(),
            "stderr": stderr.strip() if stderr else None,
        }


def create(config: dict) -> CodexCLISkill:
    return CodexCLISkill(config)
