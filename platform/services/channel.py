# services/channel.py
import json
from abc import ABC, abstractmethod
from typing import Optional
import httpx


class ChannelAdapter(ABC):
    """消息平台适配器抽象基类"""

    @abstractmethod
    async def send_message(self, target: str, content: str, **kwargs):
        pass

    @abstractmethod
    async def receive_webhook(self, request: dict) -> dict:
        pass

    @abstractmethod
    async def start(self):
        pass

    @abstractmethod
    async def stop(self):
        pass


class FeishuChannel(ChannelAdapter):
    """飞书通道"""

    def __init__(self, app_id: str, app_secret: str, bot_name: str = ""):
        self.app_id = app_id
        self.app_secret = app_secret
        self.bot_name = bot_name
        self.access_token: Optional[str] = None

    async def send_message(self, target: str, content: str, **kwargs):
        await self._ensure_token()
        msg_type = kwargs.get("msg_type", "text")
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://open.feishu.cn/open-apis/im/v1/messages",
                headers={"Authorization": f"Bearer {self.access_token}"},
                json={
                    "receive_id": target,
                    "msg_type": msg_type,
                    "content": json.dumps({"text": content}),
                },
                params={"receive_id_type": "chat_id"},
            )

    async def receive_webhook(self, request: dict) -> dict:
        event = request.get("event", {})
        return {
            "sender": event.get("sender", {}).get("sender_id", {}).get("open_id"),
            "content": json.loads(event.get("message", {}).get("content", "{}")).get("text", ""),
            "chat_id": event.get("message", {}).get("chat_id"),
            "message_id": event.get("message", {}).get("message_id"),
        }

    async def _ensure_token(self):
        if not self.access_token:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                    json={"app_id": self.app_id, "app_secret": self.app_secret},
                )
                self.access_token = resp.json()["tenant_access_token"]

    async def start(self):
        pass  # Webhook 模式无需主动启动

    async def stop(self):
        pass


class TelegramChannel(ChannelAdapter):
    """Telegram 通道"""

    def __init__(self, bot_token: str, **kwargs):
        self.bot_token = bot_token

    async def send_message(self, target: str, content: str, **kwargs):
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{self.bot_token}/sendMessage",
                json={"chat_id": target, "text": content},
            )

    async def receive_webhook(self, request: dict) -> dict:
        msg = request.get("message", {})
        return {
            "sender": str(msg.get("from", {}).get("id", "")),
            "content": msg.get("text", ""),
            "chat_id": str(msg.get("chat", {}).get("id", "")),
        }

    async def start(self):
        pass

    async def stop(self):
        pass


class SlackChannel(ChannelAdapter):
    """Slack 通道（stub）"""

    def __init__(self, **kwargs):
        pass

    async def send_message(self, target: str, content: str, **kwargs):
        pass

    async def receive_webhook(self, request: dict) -> dict:
        return {}

    async def start(self):
        pass

    async def stop(self):
        pass


class ChannelFactory:
    _adapters = {
        "feishu": FeishuChannel,
        "telegram": TelegramChannel,
        "slack": SlackChannel,
    }

    @classmethod
    def create(cls, platform: str, config: dict) -> ChannelAdapter:
        adapter_class = cls._adapters.get(platform)
        if not adapter_class:
            raise ValueError(f"Unsupported platform: {platform}")
        return adapter_class(**config)
