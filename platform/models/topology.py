# models/topology.py
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Set
from enum import Enum


class RelationType(Enum):
    REPORTS_TO = "reports_to"       # 汇报关系
    COLLABORATES = "collaborates"   # 协作关系
    DELEGATES_TO = "delegates_to"   # 委托关系


@dataclass
class TopologyNode:
    agent_id: str
    agent_type: str                 # independent | dependent
    group: Optional[str] = None     # 所属分组
    parent_id: Optional[str] = None # 上级 Agent ID
    children_ids: List[str] = field(default_factory=list)
    collaborators: List[str] = field(default_factory=list)


@dataclass
class OrganizationTopology:
    """组织拓扑图"""
    nodes: Dict[str, TopologyNode] = field(default_factory=dict)

    def add_agent(self, agent_id: str, reports_to: Optional[str] = None,
                  agent_type: str = "independent", group: Optional[str] = None):
        node = TopologyNode(
            agent_id=agent_id,
            agent_type=agent_type,
            group=group,
            parent_id=reports_to,
        )
        self.nodes[agent_id] = node

        # 更新父节点的 children
        if reports_to and reports_to in self.nodes:
            self.nodes[reports_to].children_ids.append(agent_id)

    def get_reporting_chain(self, agent_id: str) -> List[str]:
        """获取完整汇报链（从当前到根）"""
        chain = []
        current = agent_id
        visited = set()
        while current:
            if current in visited:
                break  # 防止循环
            visited.add(current)
            chain.append(current)
            node = self.nodes.get(current)
            current = node.parent_id if node else None
        return chain

    def get_all_subordinates(self, agent_id: str) -> Set[str]:
        """获取所有下级（递归，含跨级）"""
        result = set()
        node = self.nodes.get(agent_id)
        if not node:
            return result
        for child_id in node.children_ids:
            result.add(child_id)
            result.update(self.get_all_subordinates(child_id))
        return result

    def get_direct_reports(self, agent_id: str) -> List[str]:
        """获取直接下级"""
        node = self.nodes.get(agent_id)
        return node.children_ids if node else []

    def validate(self) -> List[str]:
        """验证拓扑合法性"""
        errors = []
        # 检查环路
        for agent_id in self.nodes:
            chain = self.get_reporting_chain(agent_id)
            if len(chain) != len(set(chain)):
                errors.append(f"Cycle detected in reporting chain of {agent_id}")
        # 检查孤立节点（非根节点且无父节点）
        roots = [n for n in self.nodes.values() if n.parent_id is None]
        if len(roots) > 1:
            errors.append(f"Multiple root agents found: {[r.agent_id for r in roots]}")
        return errors
