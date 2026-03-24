# models/agent_card.py
from dataclasses import dataclass, field
from typing import List


@dataclass
class AgentCard:
    """
    Agent 能力卡片 - 兼容 Google A2A Protocol。
    其他 Agent 通过读取 Agent Card 了解该 Agent 的能力。
    """
    agent_id: str
    name: str
    description: str
    version: str = "1.0.0"
    endpoint: str = ""                   # http://localhost:{port}
    capabilities: List[str] = field(default_factory=list)
    supported_modalities: List[str] = field(default_factory=lambda: ["text"])
    skills: List[str] = field(default_factory=list)
    status: str = "available"

    def to_json(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "url": self.endpoint,
            "capabilities": self.capabilities,
            "modalities": self.supported_modalities,
            "skills": self.skills,
            "status": self.status,
        }
