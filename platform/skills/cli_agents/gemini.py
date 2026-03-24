# skills/cli_agents/gemini.py
import json
from skills.cli_agents.base import CLIAgentSkill
from core.skill_interface import SkillResult


class GeminiCLISkill(CLIAgentSkill):
    """
    Google Gemini CLI 包装。
    使用 `gemini -p` 非交互模式执行，支持 JSON 输出。
    安装: npm install -g @google/gemini-cli
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.model = config.get("model", "gemini-2.5-pro")
        self.sandbox = config.get("sandbox", False)

    def name(self) -> str:
        return "gemini-cli"

    def description(self) -> str:
        return (
            "Invoke Google Gemini CLI as an autonomous coding agent. "
            "Supports file read/write, shell execution, web search via "
            "Google Search grounding, and multi-turn reasoning."
        )

    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Task description for Gemini to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Working directory for the task"
                },
                "model": {
                    "type": "string",
                    "description": "Gemini model to use (e.g. gemini-2.5-pro, gemini-2.5-flash)",
                    "default": "gemini-2.5-pro"
                },
                "sandbox": {
                    "type": "boolean",
                    "description": "Run in sandbox mode (restricted file/network access)",
                    "default": False
                },
                "yolo": {
                    "type": "boolean",
                    "description": "Auto-approve all actions without prompting",
                    "default": True
                },
            },
            "required": ["prompt"]
        }

    def _build_command(self, prompt: str, **kwargs) -> list:
        model = kwargs.get("model", self.model)
        yolo = kwargs.get("yolo", True)

        cmd = [
            "gemini",
            "-p", prompt,
            "--model", model,
        ]

        if yolo:
            cmd.append("--yolo")

        if kwargs.get("sandbox", self.sandbox):
            cmd.append("--sandbox")

        return cmd

    def _parse_output(self, stdout: str, stderr: str) -> dict:
        # Gemini CLI 输出为纯文本，尝试解析 JSON，否则返回原文
        try:
            return json.loads(stdout)
        except json.JSONDecodeError:
            return {
                "response": stdout.strip(),
                "stderr": stderr.strip() if stderr.strip() else None,
            }


def create(config: dict) -> GeminiCLISkill:
    return GeminiCLISkill(config)
