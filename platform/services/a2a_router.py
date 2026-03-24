# services/a2a_router.py
import asyncio
import json
import httpx
import uuid
from typing import Dict, List, Optional, Callable, Set
from datetime import datetime
from models.message import A2AMessage, MessageType, MessagePriority
from dataclasses import dataclass, field


@dataclass
class AgentCard:
    """
    Agent 能力卡片 - 兼容 Google A2A Protocol.
    """
    agent_id: str
    name: str
    description: str
    version: str = "1.0.0"
    endpoint: str = ""
    capabilities: List[str] = field(default_factory=list)
    supported_modalities: List[str] = field(default_factory=lambda: ["text"])
    skills: List[str] = field(default_factory=list)
    status: str = "available"

    def to_json(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "url": self.endpoint,
            "capabilities": self.capabilities,
            "modalities": self.supported_modalities,
            "skills": self.skills,
            "status": self.status,
        }


class MessageStore:
    """消息持久化存储"""
    from pathlib import Path
    BASE_DIR = None

    def __init__(self, agent_id: Optional[str] = None):
        from pathlib import Path
        self.agent_id = agent_id
        self.BASE_DIR = Path("~/.openclaw/a2a/chatrooms").expanduser()

    async def save(self, message: A2AMessage):
        """存储消息"""
        from pathlib import Path
        # 1. 存储到聊天室目录（如有 room_id）
        if message.room_id:
            self._save_to_room(message.room_id, message)

        # 2. 存储到发送者个人目录
        if message.sender_id:
            self._save_to_agent(message.sender_id, message)

        # 3. 存储到接收者个人目录
        if message.recipient_id:
            self._save_to_agent(message.recipient_id, message)

    def get_messages(self, room_id: str, limit: int = 50,
                     before: Optional[datetime] = None) -> List[A2AMessage]:
        from pathlib import Path
        msg_dir = Path("~/.openclaw/a2a/chatrooms").expanduser() / room_id / "messages"
        if not msg_dir.exists():
            return []

        messages = []
        for f in sorted(msg_dir.glob("*.json"), reverse=True):
            with open(f) as fh:
                data = json.load(fh)
                msg = A2AMessage.from_dict(data)
                if before and msg.created_at >= before:
                    continue
                messages.append(msg)
                if len(messages) >= limit:
                    break

        return list(reversed(messages))

    def _save_to_room(self, room_id: str, message: A2AMessage):
        from pathlib import Path
        msg_dir = Path("~/.openclaw/a2a/chatrooms").expanduser() / room_id / "messages"
        msg_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{message.created_at.strftime('%Y%m%d_%H%M%S')}_{message.id}.json"
        with open(msg_dir / filename, "w") as f:
            json.dump(message.to_dict(), f, indent=2, ensure_ascii=False)

    def _save_to_agent(self, agent_id: str, message: A2AMessage):
        from pathlib import Path
        chat_dir = Path(f"~/.openclaw/agents/{agent_id}/chats").expanduser()
        chat_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{message.created_at.strftime('%Y%m%d_%H%M%S')}_{message.id}.json"
        with open(chat_dir / filename, "w") as f:
            json.dump(message.to_dict(), f, indent=2, ensure_ascii=False)


class A2ACommunicationManager:
    """Agent 间通信管理器"""

    def __init__(self, agent_id: str, port: int):
        self.agent_id = agent_id
        self.port = port
        self.message_handlers: Dict[MessageType, List[Callable]] = {}
        self.agent_registry: Dict[str, AgentCard] = {}
        self.pending_tasks: Dict[str, dict] = {}

    # ─── 发送消息 ───

    async def send_message(self, recipient_id: str, content: str,
                            message_type: MessageType = MessageType.TEXT,
                            **kwargs) -> A2AMessage:
        """向指定 Agent 发送消息"""
        message = A2AMessage(
            sender_id=self.agent_id,
            recipient_id=recipient_id,
            message_type=message_type,
            content=content,
            **kwargs,
        )

        # 查找接收者端点
        recipient_card = self.agent_registry.get(recipient_id)
        if not recipient_card:
            await self._discover_agent(recipient_id)
            recipient_card = self.agent_registry.get(recipient_id)

        if not recipient_card:
            raise ValueError(f"Agent {recipient_id} not found")

        # 发送到接收者的 Gateway
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{recipient_card.endpoint}/api/v1/a2a/message",
                json=message.to_dict(),
                headers={"X-Sender-Agent": self.agent_id},
                timeout=30,
            )
            resp.raise_for_status()

        # 持久化到本地
        await self._persist_message(message)

        return message

    async def send_to_room(self, room_id: str, content: str,
                            message_type: MessageType = MessageType.TEXT,
                            **kwargs) -> A2AMessage:
        """向聊天室发送消息（群组通信）"""
        message = A2AMessage(
            sender_id=self.agent_id,
            room_id=room_id,
            message_type=message_type,
            content=content,
            **kwargs,
        )

        # 获取聊天室成员并广播
        room = await self._get_room(room_id)
        tasks = []
        for member_id in room.get("members", []):
            if member_id != self.agent_id:
                tasks.append(self._forward_to_agent(member_id, message))

        # 并发发送
        await asyncio.gather(*tasks, return_exceptions=True)

        # 持久化
        await self._persist_message(message)

        return message

    async def broadcast(self, content: str, **kwargs) -> A2AMessage:
        """全局广播"""
        message = A2AMessage(
            sender_id=self.agent_id,
            message_type=MessageType.SYSTEM,
            content=content,
            **kwargs,
        )
        for agent_id, card in self.agent_registry.items():
            if agent_id != self.agent_id:
                await self._forward_to_agent(agent_id, message)
        await self._persist_message(message)
        return message

    # ─── 任务委托 ───

    async def delegate_task(self, target_agent: str, task_description: str,
                             context: dict = None) -> str:
        """委托任务给其他 Agent"""
        task_id = str(uuid.uuid4())[:8]
        message = await self.send_message(
            recipient_id=target_agent,
            content=task_description,
            message_type=MessageType.TASK_REQUEST,
            metadata={
                "task_id": task_id,
                "context": context or {},
                "delegator": self.agent_id,
            }
        )
        self.pending_tasks[task_id] = {
            "target": target_agent,
            "status": "submitted",
            "submitted_at": datetime.utcnow().isoformat(),
        }
        return task_id

    async def report_task_result(self, task_id: str, result: str,
                                  delegator_id: str):
        """汇报任务结果"""
        await self.send_message(
            recipient_id=delegator_id,
            content=result,
            message_type=MessageType.TASK_RESULT,
            metadata={"task_id": task_id}
        )

    # ─── Agent 发现 ───

    async def _discover_agent(self, agent_id: str):
        """发现 Agent（查询平台注册表）"""
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    f"http://localhost:18789/api/v1/agents/{agent_id}/card",
                    timeout=5,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    self.agent_registry[agent_id] = AgentCard(
                        agent_id=agent_id,
                        name=data["name"],
                        description=data["description"],
                        endpoint=data["url"],
                        capabilities=data.get("capabilities", []),
                        skills=data.get("skills", []),
                    )
            except Exception:
                pass

    async def discover_all_agents(self):
        """发现所有在线 Agent"""
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    "http://localhost:18789/api/v1/agents/cards",
                    timeout=5,
                )
                if resp.status_code == 200:
                    for data in resp.json().get("agents", []):
                        self.agent_registry[data["agent_id"]] = AgentCard(
                            agent_id=data["agent_id"],
                            name=data["name"],
                            description=data["description"],
                            endpoint=data["url"],
                        )
            except Exception:
                pass

    # ─── 消息接收 ───

    def on_message(self, message_type: MessageType, handler: Callable):
        """注册消息处理器"""
        if message_type not in self.message_handlers:
            self.message_handlers[message_type] = []
        self.message_handlers[message_type].append(handler)

    async def handle_incoming(self, message_data: dict):
        """处理收到的消息"""
        message = A2AMessage.from_dict(message_data)
        handlers = self.message_handlers.get(message.message_type, [])
        for handler in handlers:
            await handler(message)

    # ─── 内部方法 ───

    async def _forward_to_agent(self, agent_id: str, message: A2AMessage):
        card = self.agent_registry.get(agent_id)
        if card:
            async with httpx.AsyncClient() as client:
                try:
                    await client.post(
                        f"{card.endpoint}/api/v1/a2a/message",
                        json=message.to_dict(),
                        timeout=10,
                    )
                except Exception:
                    pass  # 记录日志，不阻塞其他发送

    async def _persist_message(self, message: A2AMessage):
        """持久化消息"""
        store = MessageStore(self.agent_id)
        await store.save(message)

    async def _get_room(self, room_id: str) -> dict:
        """获取聊天室信息"""
        from pathlib import Path
        room_path = Path(f"~/.openclaw/a2a/chatrooms/{room_id}/room.json").expanduser()
        if room_path.exists():
            with open(room_path) as f:
                return json.load(f)
        return {"members": []}
