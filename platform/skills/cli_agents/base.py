# skills/cli_agents/base.py
import subprocess
import json
import asyncio
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from pathlib import Path
from core.skill_interface import SkillInterface, SkillResult


class CLIAgentSkill(SkillInterface, ABC):
    """CLI Agent Skill 基类"""

    def __init__(self, config: dict):
        self.working_dir = config.get("working_dir", ".")
        self.timeout = config.get("timeout", 300)  # 5 分钟
        self.env_vars = config.get("env", {})

    @abstractmethod
    def _build_command(self, prompt: str, **kwargs) -> list:
        """构建 CLI 命令"""
        pass

    @abstractmethod
    def _parse_output(self, stdout: str, stderr: str) -> dict:
        """解析 CLI 输出"""
        pass

    async def execute(self, params: dict) -> SkillResult:
        """执行 CLI Agent"""
        prompt = params["prompt"]
        cwd = params.get("working_dir", self.working_dir)

        cmd = self._build_command(prompt, **params)
        import os
        env = {**dict(os.environ), **self.env_vars}

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=self.timeout,
            )

            stdout_str = stdout.decode("utf-8", errors="replace")
            stderr_str = stderr.decode("utf-8", errors="replace")

            if proc.returncode == 0:
                parsed = self._parse_output(stdout_str, stderr_str)
                return SkillResult(success=True, data=parsed)
            else:
                return SkillResult(
                    success=False,
                    error=f"Process exited with code {proc.returncode}: {stderr_str[:500]}"
                )

        except asyncio.TimeoutError:
            return SkillResult(success=False, error=f"Timeout after {self.timeout}s")
        except FileNotFoundError:
            return SkillResult(success=False, error=f"CLI tool not found: {cmd[0]}")
