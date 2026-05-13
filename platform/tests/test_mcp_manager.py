import asyncio
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if "httpx" not in sys.modules:
    sys.modules["httpx"] = types.SimpleNamespace(AsyncClient=None)

MODULE_PATH = ROOT / "services" / "mcp_manager.py"
SPEC = importlib.util.spec_from_file_location("mcp_manager_module", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)
MCPRegistry = MODULE.MCPRegistry


class MCPRegistryTest(unittest.TestCase):
    def setUp(self):
        self.tmp_root = Path("/tmp/silentlake-platform-tests/mcp-registry")
        self.registry_path = self.tmp_root / "registry.yaml"
        self.configs_dir = self.tmp_root / "configs"
        self.agents_root = self.tmp_root / "agents"
        self.configs_dir.mkdir(parents=True, exist_ok=True)
        self.agents_root.mkdir(parents=True, exist_ok=True)
        if self.registry_path.exists():
            self.registry_path.unlink()
        self.patches = [
            patch.object(MCPRegistry, "REGISTRY_PATH", self.registry_path),
            patch.object(MCPRegistry, "CONFIGS_DIR", self.configs_dir),
            patch.object(MCPRegistry, "AGENTS_ROOT", self.agents_root),
        ]
        for active_patch in self.patches:
            active_patch.start()
        self.registry = MCPRegistry()

    def tearDown(self):
        for active_patch in reversed(self.patches):
            active_patch.stop()

    def test_tracks_health_dependencies_and_enabled_agents(self):
        agent_dir = self.agents_root / "002" / ".openclaw"
        agent_dir.mkdir(parents=True, exist_ok=True)
        (agent_dir / "mcp.json").write_text(json.dumps({"servers": ["design-hub"]}))

        self.registry.upsert(
            {
                "name": "design-hub",
                "description": "设计资源中心",
                "category": "design",
                "transport": "stdio",
                "command": "/bin/echo",
                "allowed_agents": ["001", "002"],
                "allowed_groups": ["product", "design"],
                "dependency_names": ["asset-index"],
                "config": {"probe_args": ["health"]},
                "enabled": True,
            }
        )

        payload = asyncio.run(self.registry.describe_server("design-hub"))

        self.assertEqual(payload["health_status"], "degraded")
        self.assertIn("缺失依赖服务：asset-index", payload["health_message"])
        self.assertIn("002", payload["enabled_agents"])
        self.assertEqual(payload["allowed_groups"], ["product", "design"])

    def test_enable_disable_for_agent(self):
        self.registry.upsert(
            {
                "name": "deploy-hub",
                "description": "发布中心",
                "category": "ops",
                "transport": "stdio",
                "command": "/bin/echo",
            }
        )

        self.registry.enable("deploy-hub", "009")
        self.assertEqual(self.registry.get_servers_for_agent("009"), ["deploy-hub"])

        self.registry.disable("deploy-hub", "009")
        self.assertEqual(self.registry.get_servers_for_agent("009"), [])


if __name__ == "__main__":
    unittest.main()
