import importlib.util
import json
import sys
import types
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "httpx" not in sys.modules:
    sys.modules["httpx"] = types.SimpleNamespace(AsyncClient=None)

if "aiohttp" not in sys.modules:
    class _FakeResponse:
        def __init__(self, payload, status=200):
            self.text = json.dumps(payload)
            self.status = status

    class _FakeApplication:
        def __init__(self):
            self.router = types.SimpleNamespace(
                add_get=lambda *args, **kwargs: None,
                add_post=lambda *args, **kwargs: None,
                add_put=lambda *args, **kwargs: None,
                add_delete=lambda *args, **kwargs: None,
            )

    fake_web = types.SimpleNamespace(
        Application=_FakeApplication,
        Request=object,
        Response=_FakeResponse,
        json_response=lambda payload, status=200: _FakeResponse(payload, status=status),
    )
    sys.modules["aiohttp"] = types.SimpleNamespace(web=fake_web)

TASK_STORE_PATH = ROOT / "services" / "task_chain_store.py"
TASK_SPEC = importlib.util.spec_from_file_location("task_chain_store_module", TASK_STORE_PATH)
TASK_MODULE = importlib.util.module_from_spec(TASK_SPEC)
assert TASK_SPEC and TASK_SPEC.loader
TASK_SPEC.loader.exec_module(TASK_MODULE)
TaskChainStore = TASK_MODULE.TaskChainStore

MCP_PATH = ROOT / "services" / "mcp_manager.py"
MCP_SPEC = importlib.util.spec_from_file_location("mcp_manager_module", MCP_PATH)
MCP_MODULE = importlib.util.module_from_spec(MCP_SPEC)
assert MCP_SPEC and MCP_SPEC.loader
MCP_SPEC.loader.exec_module(MCP_MODULE)
MCPRegistry = MCP_MODULE.MCPRegistry

services_pkg = types.ModuleType("services")
services_pkg.task_chain_store = TASK_MODULE
services_pkg.mcp_manager = MCP_MODULE
sys.modules["services"] = services_pkg
sys.modules["services.task_chain_store"] = TASK_MODULE
sys.modules["services.mcp_manager"] = MCP_MODULE

DASHBOARD_PATH = ROOT / "api" / "dashboard.py"
DASH_SPEC = importlib.util.spec_from_file_location("dashboard_module", DASHBOARD_PATH)
DASH_MODULE = importlib.util.module_from_spec(DASH_SPEC)
assert DASH_SPEC and DASH_SPEC.loader
DASH_SPEC.loader.exec_module(DASH_MODULE)
DashboardAPI = DASH_MODULE.DashboardAPI

TOPOLOGY_PATH = ROOT / "models" / "topology.py"
TOPOLOGY_SPEC = importlib.util.spec_from_file_location("topology_module", TOPOLOGY_PATH)
TOPOLOGY_MODULE = importlib.util.module_from_spec(TOPOLOGY_SPEC)
assert TOPOLOGY_SPEC and TOPOLOGY_SPEC.loader
TOPOLOGY_SPEC.loader.exec_module(TOPOLOGY_MODULE)
OrganizationTopology = TOPOLOGY_MODULE.OrganizationTopology


class FakeRequest:
    def __init__(self, match_info=None, query=None, payload=None):
        self.match_info = match_info or {}
        self.query = query or {}
        self._payload = payload or {}

    async def json(self):
        return self._payload


class FakeTopologyManager:
    def __init__(self):
        topology = OrganizationTopology()
        topology.add_agent("001", agent_type="independent", group="product")
        topology.add_agent("002", reports_to="001", agent_type="dependent", group="design")
        self._topology = topology

    def load(self):
        return self._topology


class FakeHeartbeat:
    def __init__(self):
        self.agent_heartbeats = {
            "001": datetime.now(UTC).replace(tzinfo=None),
            "002": datetime.now(UTC).replace(tzinfo=None),
        }


class FakeReport:
    def __init__(self):
        self.id = "rpt-sync"
        self.reporter_id = "002"
        self.recipient_id = "001"
        self.report_type = type("ReportType", (), {"value": "task"})()
        self.status = type("ReportStatus", (), {"value": "submitted"})()
        self.created_at = datetime.now(UTC).replace(tzinfo=None)
        self.related_tasks = ["task-verify"]
        self.background = "背景"
        self.approach = "方案"
        self.expected_outcome = "结果"
        self.raw_content = "阻塞解除，继续联调。"

    def to_dict(self):
        return {
          "id": self.id,
          "reporter": self.reporter_id,
          "recipient": self.recipient_id,
          "related_tasks": self.related_tasks,
        }


class FakeReportEngine:
    def get_reports_for_agent(self, agent_id, include_subordinates=False):
        if agent_id == "002":
            return [FakeReport()]
        return []


class DashboardAPITest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp_root = Path("/tmp/silentlake-platform-tests/dashboard")
        self.task_store_path = self.tmp_root / "task_chains.json"
        self.registry_path = self.tmp_root / "registry.yaml"
        self.configs_dir = self.tmp_root / "configs"
        self.agents_root = self.tmp_root / "agents"
        self.configs_dir.mkdir(parents=True, exist_ok=True)
        self.agents_root.mkdir(parents=True, exist_ok=True)
        if self.task_store_path.exists():
            self.task_store_path.unlink()
        if self.registry_path.exists():
            self.registry_path.unlink()
        self.patches = [
            patch.object(TaskChainStore, "STORE_PATH", self.task_store_path),
            patch.object(MCPRegistry, "REGISTRY_PATH", self.registry_path),
            patch.object(MCPRegistry, "CONFIGS_DIR", self.configs_dir),
            patch.object(MCPRegistry, "AGENTS_ROOT", self.agents_root),
        ]
        for active_patch in self.patches:
            active_patch.start()
        self.api = DashboardAPI(FakeTopologyManager(), FakeHeartbeat(), FakeReportEngine())

    def tearDown(self):
        for active_patch in reversed(self.patches):
            active_patch.stop()

    async def test_task_chain_crud_and_report_sync(self):
        created = await self.api.create_task_chain(
            FakeRequest(
                payload={
                    "task_id": "task-verify",
                    "title": "推进 2.1.0 收口",
                    "description": "任务链需要闭环验证。",
                    "origin_agent": "001",
                    "owner_agent": "002",
                    "participants": ["001", "002"],
                    "source_room_id": "room-product",
                }
            )
        )
        created_payload = json.loads(created.text)
        self.assertEqual(created_payload["task_id"], "task-verify")

        updated = await self.api.update_task_chain(
            FakeRequest(
                match_info={"task_id": "task-verify"},
                payload={"status": "blocked", "blocked_reason": "等待联调", "updated_by": "pm-console"},
            )
        )
        updated_payload = json.loads(updated.text)
        self.assertEqual(updated_payload["status"], "blocked")

        await self.api.task_chain_message(
            FakeRequest(
                match_info={"task_id": "task-verify"},
                payload={"sender": "002", "content": "联调窗口已约好。", "room_id": "room-product", "create_step": True},
            )
        )

        chains_response = await self.api.task_chains(FakeRequest())
        chains_payload = json.loads(chains_response.text)
        self.assertEqual(len(chains_payload["chains"]), 1)
        chain = chains_payload["chains"][0]
        self.assertEqual(chain["messages"][-1]["content"], "联调窗口已约好。")
        self.assertEqual(chain["reports"][-1]["id"], "rpt-sync")
        self.assertEqual(chain["reports"][-1]["summary"], "阻塞解除，继续联调。")

    async def test_mcp_crud_and_agent_lookup(self):
        created = await self.api.mcp_upsert(
            FakeRequest(
                payload={
                    "name": "design-hub",
                    "description": "设计资产服务",
                    "category": "design",
                    "transport": "stdio",
                    "command": "/bin/echo",
                    "allowed_agents": ["001", "002"],
                    "allowed_groups": ["design"],
                    "enabled": True,
                    "config": {"probe_args": ["health"]},
                }
            )
        )
        created_payload = json.loads(created.text)
        self.assertEqual(created_payload["name"], "design-hub")

        agent_dir = self.agents_root / "002" / ".openclaw"
        agent_dir.mkdir(parents=True, exist_ok=True)
        (agent_dir / "mcp.json").write_text(json.dumps({"servers": ["design-hub"]}))

        detail = await self.api.mcp_server_detail(FakeRequest(match_info={"name": "design-hub"}))
        detail_payload = json.loads(detail.text)
        self.assertEqual(detail_payload["health_status"], "healthy")
        self.assertIn("探测成功", detail_payload["health_message"])

        toggle = await self.api.mcp_server_toggle(FakeRequest(match_info={"name": "design-hub"}, payload={"enabled": False}))
        toggle_payload = json.loads(toggle.text)
        self.assertFalse(toggle_payload["enabled"])

        lookup = await self.api.mcp_agent_servers(FakeRequest(match_info={"agent_id": "002"}))
        lookup_payload = json.loads(lookup.text)
        self.assertEqual(lookup_payload["servers"], ["design-hub"])


if __name__ == "__main__":
    unittest.main()
