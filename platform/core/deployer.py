# core/deployer.py
import yaml
import asyncio
from pathlib import Path
from typing import List


class PlatformDeployer:
    """平台一键部署"""

    def deploy_from_organization(self, org_path: str = "~/.openclaw/organization.yaml") -> List[dict]:
        """根据 organization.yaml 部署所有 Agent"""
        from core.scaffolder import AgentScaffolder

        org_path = Path(org_path).expanduser()
        with open(org_path) as f:
            org = yaml.safe_load(f)

        agents = org["organization"]["topology"]["agents"]
        scaffolder = AgentScaffolder()

        results = []
        for agent_def in agents:
            result = scaffolder.create_agent(
                agent_id=agent_def["id"],
                template=agent_def.get("template", "worker"),
                display_name=agent_def.get("display_name"),
                role=agent_def.get("role"),
                reports_to=agent_def.get("reports_to"),
                agent_type=agent_def.get("type", "independent"),
            )
            results.append(result)

        return results

    def start_all(self):
        """启动所有 Agent 的 Gateway 和服务"""
        agents_dir = Path("~/.openclaw/agents").expanduser()
        if not agents_dir.exists():
            return
        for agent_dir in agents_dir.iterdir():
            config_path = agent_dir / ".openclaw" / "config.json"
            if config_path.exists():
                self._start_agent(agent_dir)

    def _start_agent(self, agent_dir: Path):
        """启动单个 Agent 的所有服务"""
        # 1. 启动 Gateway
        # 2. 启动 Heartbeat
        # 3. 注册 Cron Jobs
        # 4. 加载 Skills
        import json
        config_path = agent_dir / ".openclaw" / "config.json"
        with open(config_path) as f:
            config = json.load(f)

        agent_id = config.get("agent_id")
        if not agent_id:
            return

        print(f"[Deployer] Starting agent: {agent_id}")
        # Actual startup is handled by AgentRunner in services layer

    async def start_all_async(self):
        """Async version: start all agents"""
        agents_dir = Path("~/.openclaw/agents").expanduser()
        if not agents_dir.exists():
            return

        tasks = []
        for agent_dir in agents_dir.iterdir():
            config_path = agent_dir / ".openclaw" / "config.json"
            if config_path.exists():
                tasks.append(self._start_agent_async(agent_dir))

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _start_agent_async(self, agent_dir: Path):
        """Async agent startup"""
        import json
        config_path = agent_dir / ".openclaw" / "config.json"
        with open(config_path) as f:
            config = json.load(f)

        agent_id = config.get("agent_id")
        if not agent_id:
            return

        from core.agent_lifecycle import AgentStateManager, AgentStatus
        AgentStateManager.update(agent_id, AgentStatus.STARTING)
        print(f"[Deployer] Agent {agent_id} started (async)")
