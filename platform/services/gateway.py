# services/gateway.py
import asyncio
import json
from datetime import datetime
from pathlib import Path
from aiohttp import web
from typing import Dict, Callable, Optional


class AgentGateway:
    """独立 Agent 消息网关"""

    def __init__(self, agent_id: str, port: int):
        self.agent_id = agent_id
        self.port = port
        self.app = web.Application()
        self.message_handler: Optional[Callable] = None
        self.websocket_clients: Dict[str, web.WebSocketResponse] = {}
        self._setup_routes()

    def _setup_routes(self):
        self.app.router.add_post("/api/v1/message", self.handle_message)
        self.app.router.add_get("/api/v1/status", self.handle_status)
        self.app.router.add_get("/api/v1/ws", self.handle_websocket)
        self.app.router.add_post("/api/v1/a2a/message", self.handle_a2a_message)
        self.app.router.add_get("/api/v1/health", self.handle_health)

    async def handle_message(self, request: web.Request) -> web.Response:
        """处理外部消息（用户 → Agent）"""
        body = await request.json()
        api_key = request.headers.get("X-Agent-Key")

        # 鉴权
        if not self._validate_key(api_key):
            return web.json_response({"error": "unauthorized"}, status=401)

        # 入队处理
        message = {
            "type": "user_message",
            "content": body.get("content"),
            "sender": body.get("sender", "user"),
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": body.get("metadata", {})
        }

        # 异步处理
        asyncio.create_task(self._process_message(message))

        return web.json_response({
            "status": "accepted",
            "message_id": message.get("id")
        })

    async def handle_a2a_message(self, request: web.Request) -> web.Response:
        """处理 Agent 间消息"""
        body = await request.json()

        message = {
            "type": "a2a_message",
            "content": body.get("content"),
            "sender_agent": body.get("sender_agent"),
            "conversation_id": body.get("conversation_id"),
            "timestamp": datetime.utcnow().isoformat(),
        }

        asyncio.create_task(self._process_message(message))
        return web.json_response({"status": "accepted"})

    async def handle_status(self, request: web.Request) -> web.Response:
        """返回 Agent 状态"""
        from core.agent_lifecycle import AgentStateManager
        state = AgentStateManager.get(self.agent_id)
        return web.json_response({
            "agent_id": self.agent_id,
            "status": state.status.value,
            "current_task": state.current_task,
            "last_heartbeat": state.last_heartbeat.isoformat() if state.last_heartbeat else None,
        })

    async def handle_websocket(self, request: web.Request) -> web.WebSocketResponse:
        """WebSocket 长连接（用于实时通信和流式输出）"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        client_id = request.query.get("client_id", "default")
        self.websocket_clients[client_id] = ws

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    await self._process_message(data)
                elif msg.type == web.WSMsgType.ERROR:
                    break
        finally:
            self.websocket_clients.pop(client_id, None)

        return ws

    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response({"status": "healthy", "agent_id": self.agent_id})

    async def broadcast_to_ws(self, message: dict):
        """向所有 WebSocket 客户端广播消息"""
        for client_id, ws in list(self.websocket_clients.items()):
            if not ws.closed:
                await ws.send_json(message)

    async def _process_message(self, message: dict):
        """消息处理（交给 Agent 核心逻辑）"""
        if self.message_handler:
            await self.message_handler(message)

    def _validate_key(self, key: Optional[str]) -> bool:
        if not key:
            return False
        # 从 credentials 读取验证
        cred_path = Path(f"~/.openclaw/agents/{self.agent_id}/.openclaw/credentials/api_key")
        try:
            expected = cred_path.expanduser().read_text().strip()
            return key == expected
        except FileNotFoundError:
            return False

    async def start(self):
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", self.port)
        await site.start()
        self._runner = runner

    async def stop(self):
        if hasattr(self, "_runner"):
            await self._runner.cleanup()
        await self.app.shutdown()
