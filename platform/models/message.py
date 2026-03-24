# models/message.py
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
import uuid


class MessageType(Enum):
    TEXT = "text"                     # 文本消息
    TASK_REQUEST = "task_request"     # 任务请求
    TASK_RESULT = "task_result"       # 任务结果
    REPORT = "report"                 # 汇报
    SYSTEM = "system"                 # 系统消息
    NOTIFICATION = "notification"     # 通知
    STREAM = "stream"                 # 流式输出片段
    APPROVAL_REQUEST = "approval"     # 审批请求
    APPROVAL_RESPONSE = "approval_response"


class MessagePriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    URGENT = 3


@dataclass
class A2AMessage:
    """Agent 间通信消息"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str = ""          # 所属会话/聊天室 ID
    sender_id: str = ""                # 发送者 Agent ID
    recipient_id: Optional[str] = None # 接收者（None = 广播）
    room_id: Optional[str] = None      # 聊天室 ID（群组消息）

    message_type: MessageType = MessageType.TEXT
    priority: MessagePriority = MessagePriority.NORMAL
    content: str = ""                  # 消息内容
    metadata: Dict[str, Any] = field(default_factory=dict)

    # 上下文
    reply_to: Optional[str] = None     # 回复某条消息
    thread_id: Optional[str] = None    # 所属线程
    related_task_id: Optional[str] = None

    # 时间
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None

    # 附件
    attachments: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "room_id": self.room_id,
            "type": self.message_type.value,
            "priority": self.priority.value,
            "content": self.content,
            "metadata": self.metadata,
            "reply_to": self.reply_to,
            "thread_id": self.thread_id,
            "created_at": self.created_at.isoformat(),
            "attachments": self.attachments,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "A2AMessage":
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            conversation_id=data.get("conversation_id", ""),
            sender_id=data.get("sender_id", ""),
            recipient_id=data.get("recipient_id"),
            room_id=data.get("room_id"),
            message_type=MessageType(data.get("type", "text")),
            priority=MessagePriority(data.get("priority", 1)),
            content=data.get("content", ""),
            metadata=data.get("metadata", {}),
            reply_to=data.get("reply_to"),
            thread_id=data.get("thread_id"),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.utcnow(),
            attachments=data.get("attachments", []),
        )
