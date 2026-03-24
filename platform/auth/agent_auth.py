# auth/agent_auth.py
import secrets
import hashlib
import json
from pathlib import Path
from datetime import datetime
from typing import Optional
from aiohttp import web


class AgentAuthManager:
    """Agent API 鉴权管理"""

    def generate_key(self, agent_id: str) -> str:
        """为 Agent 生成 64 位 hex API Key"""
        key = secrets.token_hex(32)  # 64 字符

        # 存储 key 的 hash（不存原文）
        key_hash = hashlib.sha256(key.encode()).hexdigest()

        cred_dir = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/credentials").expanduser()
        cred_dir.mkdir(parents=True, exist_ok=True)

        with open(cred_dir / "api_key_hash", "w") as f:
            json.dump({
                "hash": key_hash,
                "created_at": datetime.utcnow().isoformat(),
                "agent_id": agent_id,
            }, f)

        # 原文只返回给用户一次
        return key

    def validate_key(self, agent_id: str, provided_key: str) -> bool:
        """验证 API Key"""
        cred_path = Path(
            f"~/.openclaw/agents/{agent_id}/.openclaw/credentials/api_key_hash"
        ).expanduser()

        if not cred_path.exists():
            # Fall back to plaintext key check
            plain_path = Path(
                f"~/.openclaw/agents/{agent_id}/.openclaw/credentials/api_key"
            ).expanduser()
            if plain_path.exists():
                return plain_path.read_text().strip() == provided_key
            return False

        with open(cred_path) as f:
            data = json.load(f)

        provided_hash = hashlib.sha256(provided_key.encode()).hexdigest()
        return provided_hash == data["hash"]

    def rotate_key(self, agent_id: str) -> str:
        """轮换 API Key"""
        return self.generate_key(agent_id)

    def revoke_key(self, agent_id: str):
        """吊销 API Key"""
        cred_dir = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/credentials").expanduser()
        for key_file in ["api_key", "api_key_hash"]:
            key_path = cred_dir / key_file
            if key_path.exists():
                key_path.unlink()


# Gateway 鉴权中间件
@web.middleware
async def auth_middleware(request: web.Request, handler):
    """Gateway 鉴权中间件"""
    # 健康检查不需要鉴权
    if request.path == "/api/v1/health":
        return await handler(request)

    # 内部 Agent 通信使用 sender header
    if request.path.startswith("/api/v1/a2a/"):
        sender = request.headers.get("X-Sender-Agent")
        if sender:
            # TODO: 验证 sender 是合法 Agent
            return await handler(request)

    # 外部访问需要 API Key
    api_key = request.headers.get("X-Agent-Key")
    if not api_key:
        return web.json_response({"error": "API key required"}, status=401)

    agent_id = request.app.get("agent_id", "")
    auth = AgentAuthManager()
    if not auth.validate_key(agent_id, api_key):
        return web.json_response({"error": "Invalid API key"}, status=403)

    return await handler(request)
