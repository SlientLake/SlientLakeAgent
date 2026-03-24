# core/port_manager.py
import yaml
import json
from pathlib import Path
from typing import Optional


class PortManager:
    """动态端口分配管理"""

    def __init__(self, config_path: str = "~/.openclaw/platform.yaml"):
        self.config_path = Path(config_path).expanduser()
        self.allocation_file = self.config_path.parent / ".port_allocations.json"
        self._load()

    def _load(self):
        if self.config_path.exists():
            with open(self.config_path) as f:
                config = yaml.safe_load(f) or {}
        else:
            config = {}
        port_config = config.get("platform", {}).get("port_range", {})
        self.start = port_config.get("start", 18789)
        self.end = port_config.get("end", 18900)

        if self.allocation_file.exists():
            with open(self.allocation_file) as f:
                self.allocations = json.load(f)
        else:
            self.allocations = {"main": self.start}

    def allocate(self, agent_id: str) -> int:
        """为 Agent 分配端口"""
        if agent_id in self.allocations:
            return self.allocations[agent_id]

        used = set(self.allocations.values())
        for port in range(self.start + 1, self.end + 1):
            if port not in used:
                self.allocations[agent_id] = port
                self._save()
                return port
        raise RuntimeError("No available ports")

    def release(self, agent_id: str):
        """释放端口"""
        if agent_id in self.allocations:
            del self.allocations[agent_id]
            self._save()

    def get_port(self, agent_id: str) -> Optional[int]:
        """获取已分配端口"""
        return self.allocations.get(agent_id)

    def _save(self):
        self.allocation_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.allocation_file, "w") as f:
            json.dump(self.allocations, f, indent=2)
