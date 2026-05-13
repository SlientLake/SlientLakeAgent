# api/dashboard.py
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

import httpx
from aiohttp import web

from services.mcp_manager import MCPRegistry
from services.task_chain_store import TaskChainStore


class DashboardAPI:
    """架构视图 API"""

    def __init__(self, topology_manager, heartbeat_monitor, report_engine, task_store=None, mcp_registry=None):
        self.topology = topology_manager
        self.heartbeat = heartbeat_monitor
        self.reports = report_engine
        self.task_store = task_store or TaskChainStore()
        self.mcp_registry = mcp_registry or MCPRegistry()

    def register(self, app: web.Application):
        app.router.add_get("/api/v1/dashboard/overview", self.overview)
        app.router.add_get("/api/v1/dashboard/agent/{agent_id}", self.agent_detail)
        app.router.add_get("/api/v1/dashboard/task-chains", self.task_chains)
        app.router.add_post("/api/v1/dashboard/task-chains", self.create_task_chain)
        app.router.add_get("/api/v1/dashboard/task-chains/{task_id}", self.task_chain_detail)
        app.router.add_put("/api/v1/dashboard/task-chains/{task_id}", self.update_task_chain)
        app.router.add_post("/api/v1/dashboard/task-chains/{task_id}/messages", self.task_chain_message)
        app.router.add_post("/api/v1/dashboard/task-chains/{task_id}/reports", self.task_chain_report)
        app.router.add_get("/api/v1/dashboard/topology", self.topology_view)
        app.router.add_put("/api/v1/dashboard/agent/{agent_id}/permissions", self.update_permissions)
        app.router.add_get("/api/v1/dashboard/agent/{agent_id}/permissions", self.get_agent_permissions)
        app.router.add_get("/api/v1/mcp/servers", self.mcp_servers)
        app.router.add_post("/api/v1/mcp/servers", self.mcp_upsert)
        app.router.add_get("/api/v1/mcp/servers/{name}", self.mcp_server_detail)
        app.router.add_put("/api/v1/mcp/servers/{name}", self.mcp_server_update)
        app.router.add_delete("/api/v1/mcp/servers/{name}", self.mcp_server_delete)
        app.router.add_post("/api/v1/mcp/servers/{name}/toggle", self.mcp_server_toggle)
        app.router.add_get("/api/v1/mcp/agents/{agent_id}", self.mcp_agent_servers)
        app.router.add_post("/api/v1/mcp/toggle", self.mcp_toggle)
        app.router.add_get("/api/v1/kb/list", self.kb_list)
        app.router.add_post("/api/v1/kb/create", self.kb_create)
        app.router.add_delete("/api/v1/kb/{kb_id}", self.kb_delete)
        app.router.add_post("/api/v1/heartbeat", self.heartbeat_register)

    async def overview(self, request: web.Request) -> web.Response:
        """全局总览"""
        viewer_id = request.query.get("viewer")
        topo = self._load_topology()

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

            last_hb = self.heartbeat.agent_heartbeats.get(agent_id)
            status = "online"
            if not last_hb:
                status = "offline"
            elif datetime.utcnow() - last_hb > timedelta(seconds=180):
                status = "offline"

            agent_info = await self._get_agent_runtime_info(agent_id)

            agents_data.append(
                {
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
                }
            )

        return web.json_response(
            {
                "agents": agents_data,
                "total": len(agents_data),
                "online": sum(1 for agent in agents_data if agent["status"] == "online"),
            }
        )

    async def agent_detail(self, request: web.Request) -> web.Response:
        """Agent 详细信息（上级查看下级）"""
        agent_id = request.match_info["agent_id"]
        viewer_id = request.query.get("viewer")

        if viewer_id:
            topo = self._load_topology()
            subs = topo.get_all_subordinates(viewer_id)
            if agent_id not in subs and agent_id != viewer_id:
                return web.json_response({"error": "permission denied"}, status=403)

        info = await self._get_agent_runtime_info(agent_id)
        reports = self.reports.get_reports_for_agent(agent_id, include_subordinates=False)

        return web.json_response(
            {
                "agent_id": agent_id,
                "runtime": info,
                "recent_reports": [report.to_dict() for report in reports[:10]],
                "permissions": await self._get_permissions(agent_id),
            }
        )

    async def task_chains(self, request: web.Request) -> web.Response:
        """多 Agent 任务链视图"""
        viewer_id = request.query.get("viewer")
        chains = await self._build_task_chains(viewer_id)
        return web.json_response({"chains": chains})

    async def create_task_chain(self, request: web.Request) -> web.Response:
        data = await request.json()
        created = self.task_store.create(data)
        return web.json_response(created)

    async def task_chain_detail(self, request: web.Request) -> web.Response:
        task_id = request.match_info["task_id"]
        chain = self.task_store.get(task_id)
        if not chain:
            return web.json_response({"error": "task not found"}, status=404)
        await self._sync_reports_into_store({task_id})
        return web.json_response(self.task_store.get(task_id))

    async def update_task_chain(self, request: web.Request) -> web.Response:
        task_id = request.match_info["task_id"]
        payload = await request.json()
        updated = self.task_store.update(task_id, payload)
        if not updated:
            return web.json_response({"error": "task not found"}, status=404)
        return web.json_response(updated)

    async def task_chain_message(self, request: web.Request) -> web.Response:
        task_id = request.match_info["task_id"]
        payload = await request.json()
        updated = self.task_store.append_message(task_id, payload)
        if not updated:
            return web.json_response({"error": "task not found"}, status=404)
        return web.json_response(updated)

    async def task_chain_report(self, request: web.Request) -> web.Response:
        task_id = request.match_info["task_id"]
        payload = await request.json()
        payload.setdefault("type", "ad_hoc")
        payload.setdefault("status", "submitted")
        updated = self.task_store.append_report(task_id, payload)
        if not updated:
            return web.json_response({"error": "task not found"}, status=404)
        return web.json_response(updated)

    async def topology_view(self, request: web.Request) -> web.Response:
        """拓扑数据（前端 D3.js 渲染用）"""
        topo = self._load_topology()

        nodes = []
        links = []

        for node in topo.nodes.values():
            last_hb = self.heartbeat.agent_heartbeats.get(node.agent_id)
            if last_hb:
                delta = (datetime.utcnow() - last_hb).total_seconds()
                status = "online" if delta < 180 else "offline"
            else:
                status = "offline"

            nodes.append({"id": node.agent_id, "type": node.agent_type, "group": node.group or "default", "status": status})

            if node.parent_id:
                links.append({"source": node.agent_id, "target": node.parent_id, "type": "reports_to"})

            for collaborator in node.collaborators:
                links.append({"source": node.agent_id, "target": collaborator, "type": "collaborates"})

        return web.json_response({"nodes": nodes, "links": links})

    async def update_permissions(self, request: web.Request) -> web.Response:
        """更新 Agent 权限（iOS 开关风格）"""
        agent_id = request.match_info["agent_id"]
        body = await request.json()

        perm_path = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/permissions.json").expanduser()
        perm_path.parent.mkdir(parents=True, exist_ok=True)

        if perm_path.exists():
            with open(perm_path) as handle:
                permissions = json.load(handle)
        else:
            permissions = self._default_permissions()

        for key, value in body.items():
            if key in permissions:
                permissions[key] = value

        with open(perm_path, "w") as handle:
            json.dump(permissions, handle, indent=2)

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
                    response = await client.get(f"http://localhost:{port}/api/v1/status", timeout=3)
                    if response.status_code == 200:
                        return response.json()
        except Exception:
            pass
        return {"status": "unknown"}

    async def _build_task_chains(self, viewer_id: Optional[str]) -> list:
        await self._sync_reports_into_store()
        chains = self.task_store.list()
        if not viewer_id:
            return chains
        return [
            chain
            for chain in chains
            if viewer_id in {chain.get("origin_agent"), chain.get("owner_agent")} or viewer_id in chain.get("participants", [])
        ]

    async def _sync_reports_into_store(self, only_task_ids: Optional[Set[str]] = None):
        report_engine = getattr(self, "reports", None)
        if not report_engine or not hasattr(report_engine, "get_reports_for_agent"):
            return

        seen_report_ids: Set[str] = set()
        for agent_id in self._iter_topology_agent_ids():
            try:
                reports = report_engine.get_reports_for_agent(agent_id, include_subordinates=False)
            except Exception:
                continue
            for report in reports:
                report_id = getattr(report, "id", None)
                if not report_id or report_id in seen_report_ids:
                    continue
                seen_report_ids.add(report_id)
                for task_id in getattr(report, "related_tasks", []) or []:
                    if only_task_ids and task_id not in only_task_ids:
                        continue
                    chain = self.task_store.get(task_id)
                    if not chain:
                        continue
                    if report_id in {item.get("id") for item in chain.get("reports", [])}:
                        continue
                    summary = getattr(report, "raw_content", "") or getattr(report, "expected_outcome", "") or getattr(report, "background", "")
                    self.task_store.append_report(
                        task_id,
                        {
                            "id": report_id,
                            "reporter": getattr(report, "reporter_id", chain.get("owner_agent")),
                            "recipient": getattr(report, "recipient_id", chain.get("origin_agent")),
                            "type": getattr(getattr(report, "report_type", None), "value", "ad_hoc"),
                            "status": getattr(getattr(report, "status", None), "value", "submitted"),
                            "created_at": getattr(report, "created_at", datetime.now(UTC).replace(tzinfo=None)).isoformat(),
                            "summary": summary or "收到汇报",
                            "background": getattr(report, "background", ""),
                            "approach": getattr(report, "approach", ""),
                            "expected_outcome": getattr(report, "expected_outcome", ""),
                            "step_title": "自动同步汇报",
                        },
                    )

    def _iter_topology_agent_ids(self) -> Iterable[str]:
        topo = self._load_topology()
        return list(topo.nodes.keys())

    def _load_topology(self):
        if hasattr(self.topology, "load"):
            return self.topology.load()
        return self.topology

    async def _get_permissions(self, agent_id: str) -> dict:
        perm_path = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/permissions.json").expanduser()
        if perm_path.exists():
            with open(perm_path) as handle:
                return json.load(handle)
        return self._default_permissions()

    async def mcp_servers(self, request: web.Request) -> web.Response:
        """列出所有 MCP Server"""
        try:
            category = request.query.get("category")
            search = (request.query.get("search") or "").strip().lower()
            servers = await self.mcp_registry.describe_servers()
            if category:
                servers = [server for server in servers if server.get("category") == category]
            if search:
                servers = [
                    server
                    for server in servers
                    if search
                    in " ".join(
                        [
                            str(server.get("name", "")),
                            str(server.get("description", "")),
                            str(server.get("category", "")),
                            " ".join(server.get("tags", [])),
                        ]
                    ).lower()
                ]
            return web.json_response({"servers": servers})
        except Exception as exc:
            return web.json_response({"servers": [], "error": str(exc)}, status=500)

    async def mcp_server_detail(self, request: web.Request) -> web.Response:
        try:
            name = request.match_info["name"]
            payload = await self.mcp_registry.describe_server(name)
            return web.json_response(payload)
        except KeyError:
            return web.json_response({"error": "server not found"}, status=404)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    async def mcp_upsert(self, request: web.Request) -> web.Response:
        try:
            payload = await request.json()
            config = self.mcp_registry.upsert(payload)
            return web.json_response(await self.mcp_registry.describe_server(config.name))
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    async def mcp_server_update(self, request: web.Request) -> web.Response:
        try:
            name = request.match_info["name"]
            payload = await request.json()
            payload["name"] = name
            self.mcp_registry.upsert(payload)
            return web.json_response(await self.mcp_registry.describe_server(name))
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    async def mcp_server_delete(self, request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not self.mcp_registry.get(name):
            return web.json_response({"error": "server not found"}, status=404)
        self.mcp_registry.unregister(name)
        return web.json_response({"ok": True})

    async def mcp_server_toggle(self, request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not self.mcp_registry.get(name):
            return web.json_response({"error": "server not found"}, status=404)
        payload = await request.json()
        enabled = bool(payload.get("enabled", False))
        if enabled:
            self.mcp_registry.enable(name)
        else:
            self.mcp_registry.disable(name)
        return web.json_response(await self.mcp_registry.describe_server(name))

    async def mcp_agent_servers(self, request: web.Request) -> web.Response:
        agent_id = request.match_info["agent_id"]
        return web.json_response({"servers": self.mcp_registry.get_servers_for_agent(agent_id)})

    async def mcp_toggle(self, request: web.Request) -> web.Response:
        """兼容旧切换 MCP Server 启用状态接口"""
        try:
            data = await request.json()
            name = data.get("name")
            enabled = bool(data.get("enabled", False))
            if not name or not self.mcp_registry.get(name):
                return web.json_response({"error": "server not found"}, status=404)
            if enabled:
                self.mcp_registry.enable(name)
            else:
                self.mcp_registry.disable(name)
            return web.json_response({"ok": True, "name": name, "enabled": enabled})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    async def kb_list(self, request: web.Request) -> web.Response:
        """列出知识库"""
        try:
            from knowledge.kb_manager import KnowledgeBaseManager

            mgr = KnowledgeBaseManager()
            kbs = mgr.list_all()
            return web.json_response({"kbs": [kb.__dict__ for kb in kbs]})
        except Exception as exc:
            return web.json_response({"kbs": [], "error": str(exc)})

    async def kb_create(self, request: web.Request) -> web.Response:
        """创建知识库"""
        try:
            data = await request.json()
            from knowledge.kb_manager import KnowledgeBaseManager
            from models.knowledge_base import KBType, KnowledgeBase

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
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    async def kb_delete(self, request: web.Request) -> web.Response:
        """删除知识库"""
        try:
            kb_id = request.match_info["kb_id"]
            from knowledge.kb_manager import KnowledgeBaseManager

            mgr = KnowledgeBaseManager()
            mgr.delete(kb_id)
            return web.json_response({"ok": True})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    async def heartbeat_register(self, request: web.Request) -> web.Response:
        """接收 openclaw 进程心跳注册"""
        try:
            data = await request.json()
            agent_id = data.get("agent_id", "unknown")
            self.heartbeat.agent_heartbeats[agent_id] = datetime.utcnow()
            return web.json_response({"ok": True, "agent_id": agent_id})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)
