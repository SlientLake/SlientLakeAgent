# core/topology_manager.py
import yaml
from pathlib import Path
from typing import Optional
from models.topology import OrganizationTopology, TopologyNode


class TopologyManager:
    """组织拓扑持久化管理"""

    def __init__(self, org_path: str = "~/.openclaw/organization.yaml"):
        self.org_path = Path(org_path).expanduser()

    def load(self) -> OrganizationTopology:
        """从 YAML 加载拓扑"""
        if not self.org_path.exists():
            return OrganizationTopology()

        with open(self.org_path) as f:
            data = yaml.safe_load(f) or {}

        topology = OrganizationTopology()
        agents = data.get("organization", {}).get("topology", {}).get("agents", [])
        groups = data.get("organization", {}).get("topology", {}).get("groups", [])

        # 构建分组映射
        group_map = {}
        for group in groups:
            for member in group.get("members", []):
                group_map[member] = group["name"]

        # 添加节点
        for agent_def in agents:
            topology.add_agent(
                agent_id=agent_def["id"],
                reports_to=agent_def.get("reports_to"),
                agent_type=agent_def.get("type", "independent"),
                group=group_map.get(agent_def["id"]),
            )

        return topology

    def save(self, topology: OrganizationTopology):
        """保存拓扑到 YAML"""
        agents = []
        for node in topology.nodes.values():
            agent_def = {
                "id": node.agent_id,
                "type": node.agent_type,
            }
            if node.parent_id:
                agent_def["reports_to"] = node.parent_id
            agents.append(agent_def)

        data = {"organization": {"topology": {"agents": agents}}}
        self.org_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.org_path, "w") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    def add_reporting_relation(self, from_agent: str, to_agent: str):
        """添加汇报关系"""
        topology = self.load()
        node = topology.nodes.get(from_agent)
        if node:
            node.parent_id = to_agent
            if to_agent in topology.nodes:
                topology.nodes[to_agent].children_ids.append(from_agent)
        self.save(topology)

    def export_mermaid(self) -> str:
        """导出为 Mermaid 图表（可视化）"""
        topology = self.load()
        lines = ["graph TD"]
        for node in topology.nodes.values():
            label = f'{node.agent_id}["{node.agent_id}"]'
            lines.append(f"    {label}")
            if node.parent_id:
                lines.append(f"    {node.agent_id} -->|reports to| {node.parent_id}")
            for collab in node.collaborators:
                lines.append(f"    {node.agent_id} -.->|collaborates| {collab}")
        return "\n".join(lines)
