# services/heartbeat.py
import asyncio
import json
import httpx
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional


class HeartbeatService:
    """Agent 心跳检测服务"""

    def __init__(self, agent_id: str, interval: int = 60):
        self.agent_id = agent_id
        self.interval = interval  # 秒
        self.running = False
        self.state_file = Path(
            f"~/.openclaw/agents/{agent_id}/.openclaw/heartbeat.json"
        ).expanduser()

    async def start(self):
        self.running = True
        while self.running:
            await self._beat()
            await asyncio.sleep(self.interval)

    async def _beat(self):
        """发送心跳"""
        state = {
            "agent_id": self.agent_id,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "alive",
            "memory_usage_mb": self._get_memory_usage(),
            "active_tasks": self._get_active_task_count(),
        }

        # 写入本地状态文件
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(state, indent=2))

        # 通知平台管理器
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "http://localhost:18789/api/v1/heartbeat",
                    json=state,
                    timeout=5
                )
        except Exception:
            pass  # 平台不可达时静默失败

    def stop(self):
        self.running = False

    def _get_memory_usage(self) -> float:
        try:
            import psutil
            import os
            process = psutil.Process(os.getpid())
            return process.memory_info().rss / 1024 / 1024
        except ImportError:
            return 0.0

    def _get_active_task_count(self) -> int:
        return len(asyncio.all_tasks()) - 1  # 排除自身


class HeartbeatMonitor:
    """平台级心跳监控器（运行在主服务上）"""

    def __init__(self, timeout_seconds: int = 180):
        self.timeout = timedelta(seconds=timeout_seconds)
        self.agent_heartbeats: Dict[str, datetime] = {}

    async def receive_heartbeat(self, agent_id: str, timestamp: str):
        self.agent_heartbeats[agent_id] = datetime.fromisoformat(timestamp)

    def get_unhealthy_agents(self) -> list:
        now = datetime.utcnow()
        unhealthy = []
        for agent_id, last_beat in self.agent_heartbeats.items():
            if now - last_beat > self.timeout:
                unhealthy.append(agent_id)
        return unhealthy

    def is_healthy(self, agent_id: str) -> bool:
        last_beat = self.agent_heartbeats.get(agent_id)
        if not last_beat:
            return False
        return datetime.utcnow() - last_beat <= self.timeout
