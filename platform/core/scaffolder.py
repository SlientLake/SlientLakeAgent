# core/scaffolder.py
import os
import yaml
import secrets
from pathlib import Path
from typing import Optional


class AgentScaffolder:
    """Agent 实例创建脚手架"""

    BASE_DIR = Path("~/.openclaw").expanduser()

    def __init__(self):
        from core.skill_loader import SkillLoader
        from core.port_manager import PortManager
        self.skill_loader = SkillLoader()
        self.port_manager = PortManager()

    def create_agent(
        self,
        agent_id: str,
        template: str = "worker",
        display_name: Optional[str] = None,
        role: Optional[str] = None,
        reports_to: Optional[str] = None,
        agent_type: str = "independent"
    ) -> dict:
        """创建新 Agent 实例"""

        # 1. 加载模板
        try:
            template_config = self._load_template(template)
        except FileNotFoundError:
            template_config = self._default_template_config(template)

        # 2. 创建目录结构
        agent_dir = self.BASE_DIR / "agents" / agent_id
        self._create_directories(agent_dir, agent_type, template_config)

        # 3. 生成身份配置
        identity = self._generate_identity(
            agent_id, template, display_name, role,
            reports_to, agent_type, template_config
        )
        self._write_yaml(agent_dir / "identity.yaml", identity)

        # 4. 生成运行时配置
        runtime_config = self._generate_runtime_config(
            agent_id, agent_type, template_config
        )
        self._write_yaml(
            agent_dir / ".openclaw" / "config.json",
            runtime_config
        )

        # 5. 生成 API Key
        api_key = secrets.token_hex(32)  # 64位hex
        self._store_credential(agent_dir, "api_key", api_key)

        # 6. 分配端口（独立Agent）
        port = None
        if agent_type == "independent":
            port = self.port_manager.allocate(agent_id)

        # 7. 注册到组织拓扑
        self._register_in_topology(agent_id, reports_to)

        return {
            "agent_id": agent_id,
            "directory": str(agent_dir),
            "port": port,
            "api_key": api_key,
            "skills": template_config.get("default_skills", []),
            "type": agent_type
        }

    def _create_directories(self, agent_dir: Path, agent_type: str, template: dict):
        """创建 Agent 目录结构"""
        dirs = [
            agent_dir / "workspace",
            agent_dir / ".openclaw",
            agent_dir / "memory",
            agent_dir / "reports",
            agent_dir / "chats",
        ]

        if agent_type == "independent":
            dirs.extend([
                agent_dir / ".openclaw" / "cron",
                agent_dir / ".openclaw" / "credentials",
            ])

        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)

    def _generate_identity(self, agent_id, template, display_name,
                           role, reports_to, agent_type, template_config) -> dict:
        return {
            "agent": {
                "id": agent_id,
                "display_name": display_name or agent_id,
                "role": role or template_config.get("description", ""),
                "template": template,
                "type": agent_type,
                "reports_to": reports_to,
                "persona": {
                    "communication_style": "concise",
                    "language": "zh-CN",
                    "custom_prompt": ""
                },
                "capabilities": {
                    "skills": template_config.get("default_skills", []),
                    "mcp_servers": template_config.get("default_mcp", []),
                    "knowledge_bases": []
                }
            }
        }

    def _generate_runtime_config(self, agent_id, agent_type, template_config) -> dict:
        resources = template_config.get("resources", {})
        return {
            "agent_id": agent_id,
            "type": agent_type,
            "gateway": {
                "enabled": resources.get("gateway", agent_type == "independent"),
                "port": None  # 由 PortManager 填充
            },
            "channel": {
                "enabled": resources.get("channel", agent_type == "independent")
            },
            "cron": {
                "enabled": resources.get("cron", False),
                "jobs": []
            },
            "heartbeat": {
                "enabled": resources.get("heartbeat", True),
                "interval_seconds": 60
            },
            "memory": {
                "enabled": resources.get("memory", True),
                "backend": "local"  # local | redis | postgres
            }
        }

    def _load_template(self, template_name: str) -> dict:
        # 先搜索自定义模板，再搜索内置模板
        for search_dir in ["custom", ""]:
            path = self.BASE_DIR / "templates" / search_dir / f"{template_name}.yaml"
            if path.exists():
                with open(path) as f:
                    data = yaml.safe_load(f)
                    return data.get("template", data)
        raise FileNotFoundError(f"Template not found: {template_name}")

    def _default_template_config(self, template_name: str) -> dict:
        """Return a default template config when file is missing"""
        defaults = {
            "worker": {
                "description": "Worker Agent",
                "default_skills": ["web-search", "shell-execute"],
                "default_mcp": [],
                "resources": {
                    "gateway": True,
                    "channel": False,
                    "cron": False,
                    "heartbeat": True,
                    "memory": True,
                }
            },
            "manager": {
                "description": "Manager Agent",
                "default_skills": ["web-search"],
                "default_mcp": [],
                "resources": {
                    "gateway": True,
                    "channel": True,
                    "cron": True,
                    "heartbeat": True,
                    "memory": True,
                }
            },
        }
        return defaults.get(template_name, defaults["worker"])

    def _store_credential(self, agent_dir: Path, key: str, value: str):
        cred_dir = agent_dir / ".openclaw" / "credentials"
        cred_dir.mkdir(parents=True, exist_ok=True)
        (cred_dir / key).write_text(value)
        os.chmod(cred_dir / key, 0o600)

    def _register_in_topology(self, agent_id: str, reports_to: Optional[str]):
        org_path = self.BASE_DIR / "organization.yaml"
        if org_path.exists():
            with open(org_path) as f:
                org = yaml.safe_load(f) or {}
        else:
            org = {"organization": {"topology": {"agents": []}}}

        agents = org["organization"]["topology"]["agents"]
        # Avoid duplicates
        existing_ids = [a["id"] for a in agents]
        if agent_id not in existing_ids:
            agents.append({"id": agent_id, "reports_to": reports_to})

        with open(org_path, "w") as f:
            yaml.dump(org, f, allow_unicode=True, default_flow_style=False)

    def _write_yaml(self, path: Path, data: dict):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    def add_skill_to_agent(self, agent_id: str, skill_name: str):
        """为 Agent 添加 Skill"""
        identity_path = self.BASE_DIR / "agents" / agent_id / "identity.yaml"
        if not identity_path.exists():
            raise FileNotFoundError(f"Agent {agent_id} not found")

        with open(identity_path) as f:
            identity = yaml.safe_load(f)

        skills = identity["agent"]["capabilities"]["skills"]
        if skill_name not in skills:
            skills.append(skill_name)

        self._write_yaml(identity_path, identity)
