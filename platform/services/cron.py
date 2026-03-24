# services/cron.py
import yaml
import asyncio
import httpx
from pathlib import Path
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger


class AgentCron:
    """Agent 独立定时任务调度器"""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.scheduler = AsyncIOScheduler()
        self.cron_dir = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/cron").expanduser()

    def load_jobs(self):
        """从配置目录加载所有 cron job"""
        if not self.cron_dir.exists():
            return

        for job_file in self.cron_dir.glob("*.yaml"):
            with open(job_file) as f:
                job_config = yaml.safe_load(f)

            self.scheduler.add_job(
                self._execute_job,
                CronTrigger.from_crontab(job_config["schedule"]),
                id=job_config["id"],
                name=job_config.get("name", job_config["id"]),
                kwargs={"job_config": job_config}
            )

    async def _execute_job(self, job_config: dict):
        """执行定时任务"""
        job_type = job_config.get("type", "message")

        if job_type == "message":
            # 向自己的 Gateway 发送消息
            await self._send_self_message(job_config["content"])
        elif job_type == "report":
            # 触发汇报
            await self._trigger_report(job_config)
        elif job_type == "skill":
            # 执行 Skill
            await self._execute_skill(job_config["skill"], job_config.get("params", {}))

    async def _send_self_message(self, content: str):
        """向自己发送消息（触发 Agent 处理逻辑）"""
        from core.port_manager import PortManager
        async with httpx.AsyncClient() as client:
            port = PortManager().get_port(self.agent_id)
            if port:
                try:
                    await client.post(
                        f"http://localhost:{port}/api/v1/message",
                        json={"content": content, "sender": "cron"},
                        headers={"X-Agent-Key": self._get_api_key()},
                        timeout=10,
                    )
                except Exception as e:
                    print(f"[Cron] Failed to send self message: {e}")

    async def _trigger_report(self, job_config: dict):
        """触发定时汇报"""
        reports_to = job_config.get("reports_to")
        if reports_to:
            await self._send_self_message(
                f"[SYSTEM] 触发定时汇报，向 {reports_to} 提交工作汇报"
            )

    async def _execute_skill(self, skill_name: str, params: dict):
        """执行 Skill"""
        from core.skill_loader import SkillLoader
        loader = SkillLoader()
        skill = loader.load_skill(skill_name)
        if skill:
            result = await skill.execute(params)
            print(f"[Cron] Skill {skill_name} result: {result}")

    def start(self):
        self.load_jobs()
        self.scheduler.start()

    def stop(self):
        self.scheduler.shutdown()

    def add_job(self, job_id: str, schedule: str, job_type: str, **kwargs):
        """动态添加任务"""
        job_config = {
            "id": job_id,
            "schedule": schedule,
            "type": job_type,
            **kwargs
        }
        # 持久化
        self.cron_dir.mkdir(parents=True, exist_ok=True)
        job_path = self.cron_dir / f"{job_id}.yaml"
        with open(job_path, "w") as f:
            yaml.dump(job_config, f, allow_unicode=True)

        # 添加到调度器
        self.scheduler.add_job(
            self._execute_job,
            CronTrigger.from_crontab(schedule),
            id=job_id,
            kwargs={"job_config": job_config}
        )

    def remove_job(self, job_id: str):
        """移除任务"""
        job_path = self.cron_dir / f"{job_id}.yaml"
        if job_path.exists():
            job_path.unlink()

        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

    def _get_api_key(self) -> str:
        cred_path = Path(f"~/.openclaw/agents/{self.agent_id}/.openclaw/credentials/api_key").expanduser()
        if cred_path.exists():
            return cred_path.read_text().strip()
        return ""
