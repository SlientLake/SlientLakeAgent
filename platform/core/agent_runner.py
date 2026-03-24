# core/agent_runner.py
import asyncio
import json
import yaml
from pathlib import Path
from typing import Optional

from core.agent_lifecycle import AgentStatus, AgentState
from services.gateway import AgentGateway
from services.channel import ChannelFactory
from services.cron import AgentCron
from services.heartbeat import HeartbeatService


class AgentStateManager:
    """全局 Agent 状态管理"""
    _states: dict = {}

    @classmethod
    def get(cls, agent_id: str) -> AgentState:
        return cls._states.get(agent_id, AgentState(agent_id=agent_id, status=AgentStatus.STOPPED))

    @classmethod
    def update(cls, agent_id: str, status: AgentStatus, **kwargs):
        state = cls._states.get(agent_id, AgentState(agent_id=agent_id, status=status))
        state.status = status
        for k, v in kwargs.items():
            setattr(state, k, v)
        cls._states[agent_id] = state


class AgentRunner:
    """Agent 完整运行时，整合所有独立服务"""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.agent_dir = Path(f"~/.openclaw/agents/{agent_id}").expanduser()
        self.config = self._load_config()
        self.identity = self._load_identity()

        self.gateway: Optional[AgentGateway] = None
        self.channel = None
        self.cron: Optional[AgentCron] = None
        self.heartbeat: Optional[HeartbeatService] = None
        self.skill_loader = None

    def _load_config(self) -> dict:
        config_path = self.agent_dir / ".openclaw" / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                return json.load(f)
        return {
            "type": "independent",
            "gateway": {"enabled": True, "port": 18799},
            "channel": {"enabled": False},
            "cron": {"enabled": True},
            "heartbeat": {"enabled": True, "interval_seconds": 60},
            "memory": {"enabled": True}
        }

    def _load_identity(self) -> dict:
        identity_path = self.agent_dir / "identity.yaml"
        if identity_path.exists():
            with open(identity_path) as f:
                return yaml.safe_load(f)
        return {"agent": {"id": self.agent_id}}

    async def start(self):
        """启动 Agent 所有服务"""
        AgentStateManager.update(self.agent_id, AgentStatus.STARTING)
        agent_type = self.config.get("type", "independent")

        try:
            # 1. 加载 Skills
            from core.skill_loader import SkillLoader
            self.skill_loader = SkillLoader()

            # 2. 启动 Gateway（仅独立Agent）
            if agent_type == "independent" and self.config.get("gateway", {}).get("enabled", True):
                port = self.config["gateway"].get("port", 18799)
                self.gateway = AgentGateway(self.agent_id, port)
                self.gateway.message_handler = self._handle_message
                await self.gateway.start()
                print(f"[{self.agent_id}] Gateway started on port {port}")

            # 3. 启动 Channel（如果配置了）
            if self.config.get("channel", {}).get("enabled", False):
                channel_config = self.config.get("channel_config", {})
                platform = channel_config.get("platform", "feishu")
                self.channel = ChannelFactory.create(platform, channel_config)
                await self.channel.start()

            # 4. 启动 Cron
            if self.config.get("cron", {}).get("enabled", True):
                self.cron = AgentCron(self.agent_id)
                self.cron.start()
                print(f"[{self.agent_id}] Cron scheduler started")

            # 5. 启动 Heartbeat
            if self.config.get("heartbeat", {}).get("enabled", True):
                interval = self.config["heartbeat"].get("interval_seconds", 60)
                self.heartbeat = HeartbeatService(self.agent_id, interval)
                asyncio.create_task(self.heartbeat.start())

            AgentStateManager.update(self.agent_id, AgentStatus.RUNNING)
            print(f"[{self.agent_id}] Agent running")

        except Exception as e:
            AgentStateManager.update(self.agent_id, AgentStatus.ERROR, error_message=str(e))
            raise

    async def stop(self):
        """停止所有服务"""
        if self.heartbeat:
            self.heartbeat.stop()
        if self.cron:
            self.cron.stop()
        if self.channel:
            await self.channel.stop()
        if self.gateway:
            await self.gateway.stop()
        AgentStateManager.update(self.agent_id, AgentStatus.STOPPED)
        print(f"[{self.agent_id}] Agent stopped")

    async def _handle_message(self, message: dict):
        """核心消息处理逻辑"""
        print(f"[{self.agent_id}] Message: {message.get('content', '')[:100]}")
        AgentStateManager.update(self.agent_id, AgentStatus.BUSY,
                                  current_task=message.get("content", "")[:50])
        try:
            # TODO: 接入 LLM 调用逻辑
            # 1. 构建系统提示词
            # 2. 加载上下文（Memory + Knowledge Base）
            # 3. 调用 LLM
            # 4. 处理 Tool Calls
            # 5. 持久化到 Memory
            # 6. 回复到 Channel
            pass
        finally:
            AgentStateManager.update(self.agent_id, AgentStatus.RUNNING, current_task=None)

    def _build_system_prompt(self) -> str:
        identity = self.identity.get("agent", {})
        persona = identity.get("persona", {})
        return f"""你是 {identity.get('display_name', self.agent_id)}。
角色：{identity.get('role', '')}
{persona.get('custom_prompt', '')}"""
