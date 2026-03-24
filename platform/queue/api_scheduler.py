# queue/api_scheduler.py
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class RateLimitConfig:
    requests_per_minute: int = 60
    requests_per_second: int = 5
    concurrent_limit: int = 10


class APIScheduler:
    """
    API 调度器：管理多 Agent 对同一 API 的并发访问。
    支持限流时自动排队，非限流时并行执行。
    """

    def __init__(self):
        self.rate_limits: Dict[str, RateLimitConfig] = {}
        self.semaphores: Dict[str, asyncio.Semaphore] = {}
        self.request_counts: Dict[str, list] = {}  # 滑动窗口计数

    def register_api(self, api_name: str, config: RateLimitConfig):
        """注册 API 及其限流配置"""
        self.rate_limits[api_name] = config
        self.semaphores[api_name] = asyncio.Semaphore(config.concurrent_limit)
        self.request_counts[api_name] = []

    async def execute(self, api_name: str, coroutine_func, *args, **kwargs) -> Any:
        """
        通过调度器执行 API 调用。
        自动处理限流和排队。
        """
        config = self.rate_limits.get(api_name)
        if not config:
            # 未注册的 API，直接执行
            return await coroutine_func(*args, **kwargs)

        # 等待信号量（控制并发数）
        async with self.semaphores[api_name]:
            # 检查速率限制
            await self._wait_for_rate_limit(api_name, config)

            # 记录请求
            self.request_counts[api_name].append(datetime.utcnow().timestamp())

            # 执行
            return await coroutine_func(*args, **kwargs)

    async def _wait_for_rate_limit(self, api_name: str, config: RateLimitConfig):
        """等待直到不超过速率限制"""
        while True:
            now = datetime.utcnow().timestamp()
            # 清理超过 1 分钟的记录
            self.request_counts[api_name] = [
                t for t in self.request_counts[api_name]
                if now - t < 60
            ]

            recent = self.request_counts[api_name]

            # 检查每分钟限制
            if len(recent) >= config.requests_per_minute:
                await asyncio.sleep(1)
                continue

            # 检查每秒限制
            recent_1s = [t for t in recent if now - t < 1]
            if len(recent_1s) >= config.requests_per_second:
                await asyncio.sleep(0.2)
                continue

            break  # 未超限，可以执行


# 全局 API 调度器实例
api_scheduler = APIScheduler()

# 预注册常用 API
api_scheduler.register_api("openai", RateLimitConfig(
    requests_per_minute=500,
    requests_per_second=10,
    concurrent_limit=20,
))
api_scheduler.register_api("anthropic", RateLimitConfig(
    requests_per_minute=300,
    requests_per_second=5,
    concurrent_limit=10,
))
api_scheduler.register_api("brave_search", RateLimitConfig(
    requests_per_minute=100,
    requests_per_second=2,
    concurrent_limit=5,
))
