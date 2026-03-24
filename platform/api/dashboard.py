# api/dashboard.py
import json
import httpx
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List
from aiohttp import web


class DashboardAPI:
    """架构视图 API"""

    def __init__(self, topology_manager, heartbeat_monitor, report_engine):
        self.topology = topology_manager
        self.heartbeat = heartbeat_monitor
        self.reports = report_engine

    def register(self, app: web.Application):
        app.router.add_get("/api/v1/dashboard/overview", self.overview)
        app.router.add_get("/api/v1/dashboard/agent/{agent_id}", self.agent_detail)
        app.router.add_get("/api/v1/dashboard/task-chains", self.task_chains)
        app.router.add_get("/api/v1/dashboard/topology", self.topology_view)
        app.router.add_put("/api/v1/dashboard/agent/{agent_id}/permissions", self.update_permissions)
        app.router.add_get("/api/v1/dashboard/agent/{agent_id}/permissions", self.get_agent_permissions)
        # MCP Server management
        app.router.add_get("/api/v1/mcp/servers", self.mcp_servers)
        app.router.add_post("/api/v1/mcp/toggle", self.mcp_toggle)
        # Knowledge base management
        app.router.add_get("/api/v1/kb/list", self.kb_list)
        app.router.add_post("/api/v1/kb/create", self.kb_create)
        app.router.add_delete("/api/v1/kb/{kb_id}", self.kb_delete)
        # Heartbeat registration
        app.router.add_post("/api/v1/heartbeat", self.heartbeat_register)

    async def overview(self, request: web.Request) -> web.Response:
        """全局总览"""
        viewer_id = request.query.get("viewer")
        topo = self.topology.load()

        # 权限检查：只能看到自己和下级
        if viewer_id:
            viewable = topo.get_all_subordinates(viewer_id)
            viewable.add(viewer_id)
        else:
            viewable = set(topo.nodes.keys())

        agents_data = []
        for agent_id in viewable:
            node = topo.nodes.get(agent_id)
            if not node:
                continue

            # 获取心跳状态
            last_hb = self.heartbeat.agent_heartbeats.get(agent_id)
            status = "online"
            if not last_hb:
                status = "offline"
            elif datetime.utcnow() - last_hb > timedelta(seconds=180):
                status = "offline"

            # 获取运行信息
            agent_info = await self._get_agent_runtime_info(agent_id)

            agents_data.append({
                "id": agent_id,
                "type": node.agent_type,
                "group": node.group,
                "parent": node.parent_id,
                "children": node.children_ids,
                "status": status,
                "last_heartbeat": last_hb.isoformat() if last_hb else None,
                "current_task": agent_info.get("current_task"),
                "token_usage_today": agent_info.get("token_usage_today", 0),
                "tasks_completed_today": agent_info.get("tasks_completed", 0),
            })

        return web.json_response({
            "agents": agents_data,
            "total": len(agents_data),
            "online": sum(1 for a in agents_data if a["status"] == "online"),
        })

    async def agent_detail(self, request: web.Request) -> web.Response:
        """Agent 详细信息（上级查看下级）"""
        agent_id = request.match_info["agent_id"]
        viewer_id = request.query.get("viewer")

        # 权限检查
        if viewer_id:
            topo = self.topology.load()
            subs = topo.get_all_subordinates(viewer_id)
            if agent_id not in subs and agent_id != viewer_id:
                return web.json_response({"error": "permission denied"}, status=403)

        info = await self._get_agent_runtime_info(agent_id)
        reports = self.reports.get_reports_for_agent(agent_id, include_subordinates=False)

        return web.json_response({
            "agent_id": agent_id,
            "runtime": info,
            "recent_reports": [r.to_dict() for r in reports[:10]],
            "permissions": await self._get_permissions(agent_id),
        })

    async def task_chains(self, request: web.Request) -> web.Response:
        """多 Agent 任务链视图"""
        viewer_id = request.query.get("viewer")
        chains = await self._build_task_chains(viewer_id)
        return web.json_response({"chains": chains})

    async def topology_view(self, request: web.Request) -> web.Response:
        """拓扑数据（前端 D3.js 渲染用）"""
        topo = self.topology.load()

        nodes = []
        links = []

        for node in topo.nodes.values():
            # 获取状态
            last_hb = self.heartbeat.agent_heartbeats.get(node.agent_id)
            if last_hb:
                delta = (datetime.utcnow() - last_hb).total_seconds()
                status = "online" if delta < 180 else "offline"
            else:
                status = "offline"

            nodes.append({
                "id": node.agent_id,
                "type": node.agent_type,
                "group": node.group or "default",
                "status": status,
            })

            if node.parent_id:
                links.append({
                    "source": node.agent_id,
                    "target": node.parent_id,
                    "type": "reports_to",
                })

            for collab in node.collaborators:
                links.append({
                    "source": node.agent_id,
                    "target": collab,
                    "type": "collaborates",
                })

        return web.json_response({"nodes": nodes, "links": links})

    async def update_permissions(self, request: web.Request) -> web.Response:
        """更新 Agent 权限（iOS 开关风格）"""
        agent_id = request.match_info["agent_id"]
        body = await request.json()

        perm_path = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/permissions.json").expanduser()
        perm_path.parent.mkdir(parents=True, exist_ok=True)

        # 加载现有权限
        if perm_path.exists():
            with open(perm_path) as f:
                permissions = json.load(f)
        else:
            permissions = self._default_permissions()

        # 更新
        for key, value in body.items():
            if key in permissions:
                permissions[key] = value

        with open(perm_path, "w") as f:
            json.dump(permissions, f, indent=2)

        return web.json_response(permissions)

    async def get_agent_permissions(self, request: web.Request) -> web.Response:
        agent_id = request.match_info["agent_id"]
        perms = await self._get_permissions(agent_id)
        return web.json_response(perms)

    def _default_permissions(self) -> dict:
        return {
            "can_execute_shell": True,
            "can_access_network": True,
            "can_modify_files": True,
            "can_send_messages": True,
            "can_create_tasks": True,
            "can_access_knowledge_base": True,
            "can_delegate_tasks": True,
            "can_report_to_parent": True,
            "max_token_per_day": 1000000,
            "max_api_calls_per_hour": 100,
        }

    async def _get_agent_runtime_info(self, agent_id: str) -> dict:
        """获取 Agent 运行时信息"""
        try:
            from core.port_manager import PortManager
            port = PortManager().get_port(agent_id)
            if port:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"http://localhost:{port}/api/v1/status",
                        timeout=3,
                    )
                    if resp.status_code == 200:
                        return resp.json()
        except Exception:
            pass
        return {"status": "unknown"}

    async def _build_task_chains(self, viewer_id: str) -> list:
        """构建多 Agent 任务链"""
        # 从各 Agent 的 chats 和 reports 中重建任务链
        chains = []
        # TODO: implement task chain tracking logic
        return chains

    async def _get_permissions(self, agent_id: str) -> dict:
        perm_path = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/permissions.json").expanduser()
        if perm_path.exists():
            with open(perm_path) as f:
                return json.load(f)
        return self._default_permissions()

    # ── MCP Server Management ───────────────────────────────────────────────

    async def mcp_servers(self, request: web.Request) -> web.Response:
        """列出所有 MCP Server"""
        try:
            from services.mcp_manager import MCPRegistry
            registry = MCPRegistry()
            servers = [
                {
                    "name": cfg.name,
                    "description": cfg.description,
                    "category": cfg.category,
                    "transport": cfg.transport,
                    "enabled": cfg.enabled,
                    "auto_start": cfg.auto_start,
                    "command": cfg.command,
                    "url": cfg.url,
                }
                for cfg in registry.servers.values()
            ]
            return web.json_response({"servers": servers})
        except Exception as e:
            return web.json_response({"servers": [], "error": str(e)})

    async def mcp_toggle(self, request: web.Request) -> web.Response:
        """切换 MCP Server 启用状态"""
        try:
            data = await request.json()
            name = data.get("name")
            enabled = bool(data.get("enabled", False))
            from services.mcp_manager import MCPRegistry
            registry = MCPRegistry()
            if name not in registry.servers:
                return web.json_response({"error": "server not found"}, status=404)
            registry.servers[name].enabled = enabled
            registry._save_registry()
            return web.json_response({"ok": True, "name": name, "enabled": enabled})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    # ── Knowledge Base Management ───────────────────────────────────────────

    async def kb_list(self, request: web.Request) -> web.Response:
        """列出知识库"""
        try:
            from knowledge.kb_manager import KnowledgeBaseManager
            mgr = KnowledgeBaseManager()
            kbs = mgr.list_all()
            return web.json_response({"kbs": [kb.__dict__ for kb in kbs]})
        except Exception as e:
            return web.json_response({"kbs": [], "error": str(e)})

    async def kb_create(self, request: web.Request) -> web.Response:
        """创建知识库"""
        try:
            data = await request.json()
            from knowledge.kb_manager import KnowledgeBaseManager
            from models.knowledge_base import KnowledgeBase, KBType
            mgr = KnowledgeBaseManager()
            kb = KnowledgeBase(
                kb_id=data["id"],
                name=data.get("name", data["id"]),
                kb_type=KBType(data.get("type", "shared")),
                description=data.get("description", ""),
                owner_agent_id=data.get("owner"),
            )
            mgr.create(kb)
            return web.json_response({"ok": True, "id": kb.kb_id})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    async def kb_delete(self, request: web.Request) -> web.Response:
        """删除知识库"""
        try:
            kb_id = request.match_info["kb_id"]
            from knowledge.kb_manager import KnowledgeBaseManager
            mgr = KnowledgeBaseManager()
            mgr.delete(kb_id)
            return web.json_response({"ok": True})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    # ── Heartbeat Registration ──────────────────────────────────────────────

    async def heartbeat_register(self, request: web.Request) -> web.Response:
        """接收 openclaw 进程心跳注册"""
        try:
            data = await request.json()
            agent_id = data.get("agent_id", "unknown")
            from datetime import datetime
            self.heartbeat.agent_heartbeats[agent_id] = datetime.utcnow()
            return web.json_response({"ok": True, "agent_id": agent_id})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
