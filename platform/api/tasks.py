# api/tasks.py
import json
import asyncio
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
from aiohttp import web
from fastapi import FastAPI
from fastapi.responses import StreamingResponse


class TaskStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    STREAMING = "streaming"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class LongTaskProgress:
    task_id: str
    status: TaskStatus
    progress_pct: float = 0.0
    current_step: str = ""
    output_so_far: str = ""
    error: Optional[str] = None


class LongTaskManager:
    """长任务管理器 — 支持流式进度输出"""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = None
        self.redis_url = redis_url
        self.tasks: Dict[str, LongTaskProgress] = {}

    async def connect(self):
        try:
            import redis.asyncio as aioredis
            self.redis = aioredis.from_url(self.redis_url)
        except ImportError:
            pass  # Redis optional

    async def submit_task(self, task_id: str, agent_id: str,
                           coroutine_func, *args, **kwargs):
        """提交长任务"""
        progress = LongTaskProgress(
            task_id=task_id,
            status=TaskStatus.QUEUED,
        )
        self.tasks[task_id] = progress
        await self._publish_progress(agent_id, progress)

        # 异步执行
        asyncio.create_task(
            self._run_task(task_id, agent_id, coroutine_func, *args, **kwargs)
        )

    async def _run_task(self, task_id: str, agent_id: str,
                         func, *args, **kwargs):
        progress = self.tasks[task_id]
        progress.status = TaskStatus.RUNNING
        await self._publish_progress(agent_id, progress)

        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, progress_callback=self._make_callback(task_id, agent_id), **kwargs)
                progress.status = TaskStatus.COMPLETED
                progress.progress_pct = 100
                progress.output_so_far = str(result)
            else:
                result = func(*args, **kwargs)
                progress.status = TaskStatus.COMPLETED
                progress.progress_pct = 100

        except Exception as e:
            progress.status = TaskStatus.FAILED
            progress.error = str(e)

        await self._publish_progress(agent_id, progress)

    def _make_callback(self, task_id: str, agent_id: str):
        """创建进度回调函数"""
        async def callback(pct: float, step: str, partial_output: str = ""):
            progress = self.tasks[task_id]
            progress.progress_pct = pct
            progress.current_step = step
            progress.output_so_far = partial_output
            progress.status = TaskStatus.STREAMING
            await self._publish_progress(agent_id, progress)
        return callback

    async def _publish_progress(self, agent_id: str, progress: LongTaskProgress):
        """通过 Redis Pub/Sub 发布进度"""
        if self.redis:
            await self.redis.publish(
                f"agent:task_progress:{agent_id}",
                json.dumps({
                    "task_id": progress.task_id,
                    "status": progress.status.value,
                    "progress": progress.progress_pct,
                    "step": progress.current_step,
                    "output": progress.output_so_far,
                    "error": progress.error,
                })
            )

    async def get_progress(self, task_id: str) -> Optional[LongTaskProgress]:
        return self.tasks.get(task_id)

    async def cancel_task(self, task_id: str) -> bool:
        progress = self.tasks.get(task_id)
        if progress and progress.status in (TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.STREAMING):
            progress.status = TaskStatus.CANCELLED
            return True
        return False


class TaskRoutes:
    """任务 API 路由"""

    def __init__(self, task_manager: LongTaskManager):
        self.task_manager = task_manager

    def register(self, app: web.Application):
        app.router.add_get("/api/v1/tasks/{task_id}", self.get_task)
        app.router.add_delete("/api/v1/tasks/{task_id}", self.cancel_task)
        app.router.add_get("/api/v1/tasks", self.list_tasks)

    async def get_task(self, request: web.Request) -> web.Response:
        task_id = request.match_info["task_id"]
        progress = await self.task_manager.get_progress(task_id)
        if not progress:
            return web.json_response({"error": "task not found"}, status=404)
        return web.json_response({
            "task_id": progress.task_id,
            "status": progress.status.value,
            "progress": progress.progress_pct,
            "step": progress.current_step,
            "output": progress.output_so_far,
            "error": progress.error,
        })

    async def cancel_task(self, request: web.Request) -> web.Response:
        task_id = request.match_info["task_id"]
        success = await self.task_manager.cancel_task(task_id)
        if success:
            return web.json_response({"status": "cancelled"})
        return web.json_response({"error": "task not found or cannot be cancelled"}, status=400)

    async def list_tasks(self, request: web.Request) -> web.Response:
        tasks = []
        for task_id, progress in self.task_manager.tasks.items():
            tasks.append({
                "task_id": task_id,
                "status": progress.status.value,
                "progress": progress.progress_pct,
            })
        return web.json_response({"tasks": tasks})
