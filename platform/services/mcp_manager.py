# services/mcp_manager.py
import json
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, List, Optional

import httpx
import yaml


@dataclass
class MCPServerConfig:
    """MCP Server 配置"""

    name: str
    description: str
    category: str
    transport: str = "stdio"
    command: Optional[str] = None
    args: List[str] = field(default_factory=list)
    url: Optional[str] = None
    env: Dict[str, str] = field(default_factory=dict)
    config: Dict = field(default_factory=dict)
    enabled: bool = False
    auto_start: bool = False
    version: Optional[str] = None
    owner: Optional[str] = None
    docs_url: Optional[str] = None
    allowed_agents: List[str] = field(default_factory=list)
    allowed_groups: List[str] = field(default_factory=list)
    enabled_agents: List[str] = field(default_factory=list)
    enabled_groups: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    dependency_names: List[str] = field(default_factory=list)
    health_status: Optional[str] = None
    health_message: Optional[str] = None
    last_checked_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "transport": self.transport,
            "command": self.command,
            "args": self.args,
            "url": self.url,
            "env": self.env,
            "config": self.config,
            "enabled": self.enabled,
            "auto_start": self.auto_start,
            "version": self.version,
            "owner": self.owner,
            "docs_url": self.docs_url,
            "allowed_agents": self.allowed_agents,
            "allowed_groups": self.allowed_groups,
            "enabled_agents": self.enabled_agents,
            "enabled_groups": self.enabled_groups,
            "tags": self.tags,
            "dependency_names": self.dependency_names,
            "health_status": self.health_status,
            "health_message": self.health_message,
            "last_checked_at": self.last_checked_at,
        }


class MCPRegistry:
    """MCP Server 注册表管理"""

    REGISTRY_PATH = Path("~/.openclaw/mcp/registry.yaml").expanduser()
    CONFIGS_DIR = Path("~/.openclaw/mcp/configs").expanduser()
    AGENTS_ROOT = Path("~/.openclaw/agents").expanduser()

    def __init__(self):
        self.CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
        self.servers: Dict[str, MCPServerConfig] = {}
        self._load_registry()

    def _load_registry(self):
        if self.REGISTRY_PATH.exists():
            with open(self.REGISTRY_PATH) as f:
                data = yaml.safe_load(f) or {}
            for server_data in data.get("servers", []):
                try:
                    config = MCPServerConfig(**server_data)
                    self.servers[config.name] = config
                except TypeError:
                    pass

    def _save_registry(self):
        data = {"servers": []}
        for config in self.servers.values():
            data["servers"].append(config.to_dict())
        self.REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(self.REGISTRY_PATH, "w") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    def register(self, config: MCPServerConfig):
        self.servers[config.name] = config
        self._save_registry()

    def unregister(self, name: str):
        if name in self.servers:
            del self.servers[name]
            self._save_registry()

    def get(self, name: str) -> Optional[MCPServerConfig]:
        return self.servers.get(name)

    def upsert(self, payload: dict) -> MCPServerConfig:
        normalized = {
            "name": payload["name"],
            "description": payload.get("description", ""),
            "category": payload.get("category", "other"),
            "transport": payload.get("transport", "stdio"),
            "command": payload.get("command"),
            "args": payload.get("args", []),
            "url": payload.get("url"),
            "env": payload.get("env", {}),
            "config": payload.get("config", {}),
            "enabled": bool(payload.get("enabled", False)),
            "auto_start": bool(payload.get("auto_start", False)),
            "version": payload.get("version"),
            "owner": payload.get("owner"),
            "docs_url": payload.get("docs_url"),
            "allowed_agents": payload.get("allowed_agents", []),
            "allowed_groups": payload.get("allowed_groups", []),
            "enabled_agents": payload.get("enabled_agents", []),
            "enabled_groups": payload.get("enabled_groups", []),
            "tags": payload.get("tags", []),
            "dependency_names": payload.get("dependency_names", []),
            "health_status": payload.get("health_status"),
            "health_message": payload.get("health_message"),
            "last_checked_at": payload.get("last_checked_at"),
        }
        config = MCPServerConfig(**normalized)
        self.servers[config.name] = config
        self._save_registry()
        return config

    def enable(self, name: str, agent_id: Optional[str] = None):
        if agent_id:
            agent_mcp_path = self._agent_mcp_path(agent_id)
            agent_mcp_path.parent.mkdir(parents=True, exist_ok=True)
            agent_mcp = json.loads(agent_mcp_path.read_text()) if agent_mcp_path.exists() else {"servers": []}
            if name not in agent_mcp["servers"]:
                agent_mcp["servers"].append(name)
            agent_mcp_path.write_text(json.dumps(agent_mcp, indent=2, ensure_ascii=False))
        elif name in self.servers:
            self.servers[name].enabled = True
            self._save_registry()

    def disable(self, name: str, agent_id: Optional[str] = None):
        if agent_id:
            agent_mcp_path = self._agent_mcp_path(agent_id)
            if agent_mcp_path.exists():
                agent_mcp = json.loads(agent_mcp_path.read_text())
                agent_mcp["servers"] = [server for server in agent_mcp.get("servers", []) if server != name]
                agent_mcp_path.write_text(json.dumps(agent_mcp, indent=2, ensure_ascii=False))
        elif name in self.servers:
            self.servers[name].enabled = False
            self._save_registry()

    def get_agent_servers(self, agent_id: str) -> List[MCPServerConfig]:
        agent_mcp_path = self._agent_mcp_path(agent_id)
        if not agent_mcp_path.exists():
            return []

        agent_mcp = json.loads(agent_mcp_path.read_text())
        result = []
        for name in agent_mcp.get("servers", []):
            if name in self.servers:
                result.append(self.servers[name])
        return result

    def list_by_category(self) -> Dict[str, List[MCPServerConfig]]:
        categories: Dict[str, List[MCPServerConfig]] = {}
        for config in self.servers.values():
            categories.setdefault(config.category, []).append(config)
        return categories

    async def describe_servers(self) -> List[dict]:
        described = []
        for config in self.servers.values():
            described.append(await self.describe_server(config.name))
        described.sort(key=lambda item: (item.get("category") or "", item["name"]))
        return described

    async def describe_server(self, name: str) -> dict:
        config = self.get(name)
        if not config:
            raise KeyError(name)
        health = await self._evaluate_health(config)
        missing_dependencies = [dependency for dependency in config.dependency_names if dependency not in self.servers]
        if missing_dependencies:
            dependency_message = f"缺失依赖服务：{', '.join(missing_dependencies)}"
            if health.get("health_status") == "healthy":
                health["health_status"] = "degraded"
            health["health_message"] = f"{health.get('health_message', '')}；{dependency_message}".strip("；")
        enabled_agents = self._resolve_enabled_agents(config.name)
        payload = config.to_dict()
        payload.update(health)
        payload["enabled_agents"] = sorted(set(payload.get("enabled_agents", []) + enabled_agents))
        payload["enabled_groups"] = payload.get("enabled_groups") or config.allowed_groups
        return payload

    def get_servers_for_agent(self, agent_id: str) -> List[str]:
        return [config.name for config in self.get_agent_servers(agent_id)]

    def _agent_mcp_path(self, agent_id: str) -> Path:
        return self.AGENTS_ROOT / agent_id / ".openclaw" / "mcp.json"

    def _resolve_enabled_agents(self, name: str) -> List[str]:
        if not self.AGENTS_ROOT.exists():
            return []
        enabled = []
        for agent_dir in self.AGENTS_ROOT.iterdir():
            mcp_path = agent_dir / ".openclaw" / "mcp.json"
            if not mcp_path.exists():
                continue
            try:
                data = json.loads(mcp_path.read_text())
            except Exception:
                continue
            if name in data.get("servers", []):
                enabled.append(agent_dir.name)
        return enabled

    async def _evaluate_health(self, config: MCPServerConfig) -> dict:
        checked_at = datetime.now(UTC).replace(tzinfo=None).isoformat()
        if config.transport == "stdio":
            if not config.command:
                return {
                    "health_status": "missing",
                    "health_message": "未配置 stdio 启动命令",
                    "last_checked_at": checked_at,
                }
            command = Path(config.command).expanduser()
            resolved = str(command) if command.exists() else shutil.which(config.command)
            if resolved:
                probe_args = config.config.get("probe_args") if isinstance(config.config, dict) else None
                if isinstance(probe_args, list) and probe_args:
                    try:
                        completed = subprocess.run(
                            [resolved, *probe_args],
                            env={**dict(os.environ), **config.env},
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            timeout=3,
                            check=False,
                        )
                        if completed.returncode == 0:
                            return {
                                "health_status": "healthy",
                                "health_message": f"命令存在且探测成功：{resolved} {' '.join(probe_args)}",
                                "last_checked_at": checked_at,
                            }
                        return {
                            "health_status": "degraded",
                            "health_message": f"命令可执行，但探测失败：{resolved} {' '.join(probe_args)}",
                            "last_checked_at": checked_at,
                        }
                    except Exception as exc:
                        return {
                            "health_status": "degraded",
                            "health_message": f"命令可执行，但探测异常：{exc}",
                            "last_checked_at": checked_at,
                        }
                return {
                    "health_status": "healthy",
                    "health_message": f"可执行文件已找到：{resolved}",
                    "last_checked_at": checked_at,
                }
            return {
                "health_status": "missing",
                "health_message": f"命令不存在：{config.command}",
                "last_checked_at": checked_at,
            }

        if not config.url:
            return {
                "health_status": "missing",
                "health_message": "未配置 HTTP 地址",
                "last_checked_at": checked_at,
            }

        endpoints = []
        if isinstance(config.config, dict):
            explicit_health_url = config.config.get("health_url")
            if explicit_health_url:
                endpoints.append(str(explicit_health_url))
            health_path = config.config.get("health_path")
            if health_path:
                endpoints.append(f"{config.url.rstrip('/')}/{str(health_path).lstrip('/')}")
        endpoints.extend([f"{config.url.rstrip('/')}/health", config.url])
        last_error = "未收到可用响应"
        async with httpx.AsyncClient() as client:
            for endpoint in endpoints:
                try:
                    response = await client.get(endpoint, timeout=3)
                    if response.status_code < 400:
                        return {
                            "health_status": "healthy",
                            "health_message": f"HTTP 健康检查通过：{endpoint}",
                            "last_checked_at": checked_at,
                        }
                except Exception as exc:
                    last_error = str(exc)
                    continue
        return {
            "health_status": "degraded",
            "health_message": f"健康检查失败：{last_error}",
            "last_checked_at": checked_at,
        }


class MCPServerProcess:
    """单个 MCP Server 进程管理"""

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None

    async def start(self):
        if self.config.transport == "stdio":
            env = {**dict(os.environ), **self.config.env}
            cmd = [self.config.command] + self.config.args if self.config.command else []
            if not cmd:
                return
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
            )
        elif self.config.transport == "streamable-http" and self.config.url:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.config.url.rstrip('/')}/health", timeout=5)
                if response.status_code >= 400:
                    raise RuntimeError(f"MCP Server {self.config.name} not reachable at {self.config.url}")

    async def stop(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None

    @property
    def is_running(self) -> bool:
        if self.config.transport == "stdio":
            return self.process is not None and self.process.poll() is None
        return False
