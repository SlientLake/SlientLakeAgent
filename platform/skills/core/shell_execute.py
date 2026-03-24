# skills/core/shell_execute.py
import asyncio
import shlex
from typing import List
from core.skill_interface import SkillInterface, SkillResult


class ShellExecuteSkill(SkillInterface):
    """Shell command execution skill with optional sandboxing"""

    def __init__(self, config: dict):
        self.allowed_commands: List[str] = config.get("allowed_commands", ["*"])
        self.sandbox: bool = config.get("sandbox", True)
        self.timeout: int = config.get("timeout", 30)

    def name(self) -> str:
        return "shell-execute"

    def description(self) -> str:
        return (
            "Execute shell commands in the agent's working directory. "
            "Returns stdout, stderr, and exit code."
        )

    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Working directory for command execution"
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds",
                    "default": 30
                }
            },
            "required": ["command"]
        }

    async def execute(self, params: dict) -> SkillResult:
        command = params["command"]
        working_dir = params.get("working_dir", ".")
        timeout = params.get("timeout", self.timeout)

        # Check allowed commands
        if not self._is_allowed(command):
            return SkillResult(
                success=False,
                error=f"Command not allowed: {command}"
            )

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )

            return SkillResult(
                success=proc.returncode == 0,
                data={
                    "stdout": stdout.decode("utf-8", errors="replace"),
                    "stderr": stderr.decode("utf-8", errors="replace"),
                    "exit_code": proc.returncode,
                },
                error=None if proc.returncode == 0 else f"Exit code {proc.returncode}"
            )

        except asyncio.TimeoutError:
            return SkillResult(success=False, error=f"Command timed out after {timeout}s")
        except Exception as e:
            return SkillResult(success=False, error=str(e))

    def _is_allowed(self, command: str) -> bool:
        if "*" in self.allowed_commands:
            return True
        cmd_name = shlex.split(command)[0] if command.strip() else ""
        return cmd_name in self.allowed_commands


def create(config: dict) -> ShellExecuteSkill:
    return ShellExecuteSkill(config)
