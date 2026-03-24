# services/mcp_manager.py
import subprocess
import asyncio
import json
import yaml
import httpx
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class MCPServerConfig:
    """MCP Server 配置"""
    name: str
    description: str
    category: str
    transport: str = "stdio"           # stdio | streamable-http
    command: Optional[str] = None      # stdio 模式的命令
    args: List[str] = field(default_factory=list)
    url: Optional[str] = None          # HTTP 模式的 URL
    env: Dict[str, str] = field(default_factory=dict)
    config: Dict = field(default_factory=dict)
    enabled: bool = False
    auto_start: bool = False           # 是否自动启动（默认否，按需启动）


class MCPRegistry:
    """MCP Server 注册表管理"""

    REGISTRY_PATH = Path("~/.openclaw/mcp/registry.yaml").expanduser()
    CONFIGS_DIR = Path("~/.openclaw/mcp/configs").expanduser()

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
            data["servers"].append({
                "name": config.name,
                "description": config.description,
                "category": config.category,
                "transport": config.transport,
                "command": config.command,
                "args": config.args,
                "url": config.url,
                "env": config.env,
                "config": config.config,
                "enabled": config.enabled,
                "auto_start": config.auto_start,
            })
        self.REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(self.REGISTRY_PATH, "w") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    def register(self, config: MCPServerConfig):
        """注册 MCP Server"""
        self.servers[config.name] = config
        self._save_registry()

    def unregister(self, name: str):
        """注销 MCP Server"""
        if name in self.servers:
            del self.servers[name]
            self._save_registry()

    def enable(self, name: str, agent_id: Optional[str] = None):
        """启用 MCP Server（全局或 Agent 级别）"""
        if agent_id:
            # Agent 级别启用
            agent_mcp_path = Path(
                f"~/.openclaw/agents/{agent_id}/.openclaw/mcp.json"
            ).expanduser()
            agent_mcp = json.loads(agent_mcp_path.read_text()) if agent_mcp_path.exists() else {"servers": []}
            if name not in agent_mcp["servers"]:
                agent_mcp["servers"].append(name)
            agent_mcp_path.write_text(json.dumps(agent_mcp, indent=2))
        else:
            # 全局启用
            if name in self.servers:
                self.servers[name].enabled = True
                self._save_registry()

    def disable(self, name: str, agent_id: Optional[str] = None):
        """禁用 MCP Server"""
        if agent_id:
            agent_mcp_path = Path(
                f"~/.openclaw/agents/{agent_id}/.openclaw/mcp.json"
            ).expanduser()
            if agent_mcp_path.exists():
                agent_mcp = json.loads(agent_mcp_path.read_text())
                agent_mcp["servers"] = [s for s in agent_mcp["servers"] if s != name]
                agent_mcp_path.write_text(json.dumps(agent_mcp, indent=2))
        else:
            if name in self.servers:
                self.servers[name].enabled = False
                self._save_registry()

    def get_agent_servers(self, agent_id: str) -> List[MCPServerConfig]:
        """获取 Agent 配置的所有 MCP Server"""
        agent_mcp_path = Path(
            f"~/.openclaw/agents/{agent_id}/.openclaw/mcp.json"
        ).expanduser()

        if not agent_mcp_path.exists():
            return []

        agent_mcp = json.loads(agent_mcp_path.read_text())
        result = []
        for name in agent_mcp.get("servers", []):
            if name in self.servers:
                result.append(self.servers[name])
        return result

    def list_by_category(self) -> Dict[str, List[MCPServerConfig]]:
        """按分类列出所有已注册的 MCP Server"""
        categories: Dict[str, List[MCPServerConfig]] = {}
        for config in self.servers.values():
            if config.category not in categories:
                categories[config.category] = []
            categories[config.category].append(config)
        return categories


class MCPServerProcess:
    """单个 MCP Server 进程管理"""

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None

    async def start(self):
        """启动 MCP Server"""
        if self.config.transport == "stdio":
            import os
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
        elif self.config.transport == "streamable-http":
            # HTTP 模式：验证 URL 可达
            if self.config.url:
                async with httpx.AsyncClient() as client:
                    try:
                        resp = await client.get(f"{self.config.url}/health", timeout=5)
                        if resp.status_code != 200:
                            raise RuntimeError(f"MCP Server {self.config.name} not reachable at {self.config.url}")
                    except Exception as e:
                        raise RuntimeError(f"MCP Server {self.config.name} not reachable: {e}")

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
        return True  # HTTP 模式假设远端可用


class MCPManager:
    """全平台 MCP Server 管理器"""

    def __init__(self, registry: MCPRegistry):
        self.registry = registry
        self.running: Dict[str, MCPServerProcess] = {}

    async def start_server(self, name: str):
        """按需启动单个 MCP Server"""
        config = self.registry.servers.get(name)
        if not config:
            raise ValueError(f"MCP Server '{name}' not found in registry")

        if name in self.running and self.running[name].is_running:
            return  # 已在运行

        process = MCPServerProcess(config)
        await process.start()
        self.running[name] = process

    async def stop_server(self, name: str):
        if name in self.running:
            await self.running[name].stop()
            del self.running[name]

    async def start_for_agent(self, agent_id: str):
        """为 Agent 启动其配置的所有 MCP Server"""
        servers = self.registry.get_agent_servers(agent_id)
        for config in servers:
            await self.start_server(config.name)

    async def stop_all(self):
        for name in list(self.running.keys()):
            await self.stop_server(name)

    def get_status(self) -> Dict[str, dict]:
        """获取所有 MCP Server 状态"""
        status = {}
        for name, config in self.registry.servers.items():
            is_running = name in self.running and self.running[name].is_running
            status[name] = {
                "name": name,
                "category": config.category,
                "transport": config.transport,
                "enabled": config.enabled,
                "running": is_running,
            }
        return status


class OnDemandLoader:
    """
    按需加载器 — 不采用开机自启动。
    用户手动启用 MCP/Skill 后，在 Agent 需要时自动启动。
    """

    def __init__(self, mcp_manager: MCPManager, skill_loader):
        self.mcp_manager = mcp_manager
        self.skill_loader = skill_loader

    async def ensure_mcp_available(self, server_name: str):
        """确保 MCP Server 可用（按需启动）"""
        if server_name not in self.mcp_manager.running:
            await self.mcp_manager.start_server(server_name)

    async def ensure_skill_loaded(self, skill_name: str, agent_id: str):
        """确保 Skill 已加载"""
        if skill_name not in self.skill_loader.loaded_skills:
            self.skill_loader.load_skill(skill_name)

    async def resolve_dependencies(self, server_name: str):
        """解析并启动 MCP Server 的依赖"""
        config = self.mcp_manager.registry.servers.get(server_name)
        if not config:
            return

        deps = config.config.get("dependencies", [])
        for dep in deps:
            await self.ensure_mcp_available(dep)
