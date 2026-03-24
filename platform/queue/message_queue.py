# queue/message_queue.py
import json
import asyncio
from typing import Callable, Optional


class AgentMessageQueue:
    """基于 Redis Stream 的 Agent 消息队列"""

    def __init__(self, agent_id: str, redis_url: str = "redis://localhost:6379"):
        self.agent_id = agent_id
        self.stream_key = f"agent:{agent_id}:messages"
        self.redis_url = redis_url
        self.redis = None

    async def connect(self):
        try:
            import redis.asyncio as aioredis
            self.redis = aioredis.from_url(self.redis_url)
        except ImportError:
            raise RuntimeError("redis package required: pip install redis")

    async def enqueue(self, message: dict, priority: int = 1):
        """消息入队"""
        if self.redis is None:
            raise RuntimeError("Not connected to Redis. Call connect() first.")
        await self.redis.xadd(
            self.stream_key,
            {
                "data": json.dumps(message),
                "priority": str(priority),
            },
            maxlen=10000,  # 保留最近 10000 条
        )

    async def process_serial(self, handler: Callable):
        """
        串行消费消息。
        保持消息处理的顺序性，避免并发导致的混乱。
        """
        if self.redis is None:
            raise RuntimeError("Not connected to Redis. Call connect() first.")

        last_id = "0"
        while True:
            # 读取一条消息
            results = await self.redis.xread(
                {self.stream_key: last_id},
                count=1,
                block=5000,  # 阻塞等待 5 秒
            )

            if results:
                stream_name, entries = results[0]
                for entry_id, entry_data in entries:
                    message = json.loads(entry_data[b"data"])
                    try:
                        await handler(message)
                    except Exception as e:
                        # 错误处理：记录日志，继续处理下一条
                        await self._handle_error(entry_id, message, e)

                    # 确认消费
                    last_id = entry_id

    async def _handle_error(self, entry_id, message, error):
        """错误处理 — 记录到死信队列"""
        dlq_key = f"agent:{self.agent_id}:dlq"
        if self.redis:
            await self.redis.xadd(dlq_key, {
                "original_id": entry_id,
                "data": json.dumps(message),
                "error": str(error),
            })

    async def disconnect(self):
        if self.redis:
            await self.redis.close()
            self.redis = None
