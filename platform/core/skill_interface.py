# core/skill_interface.py
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class SkillResult:
    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class SkillInterface(ABC):
    """所有 Skill 必须实现此接口"""

    @abstractmethod
    def name(self) -> str:
        """Skill 唯一名称"""
        pass

    @abstractmethod
    def description(self) -> str:
        """Skill 描述（供 LLM 理解）"""
        pass

    @abstractmethod
    def parameters_schema(self) -> dict:
        """JSON Schema 格式的参数定义"""
        pass

    @abstractmethod
    async def execute(self, params: dict) -> SkillResult:
        """执行 Skill"""
        pass

    def to_tool_definition(self) -> dict:
        """转换为 LLM Tool Call 格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name(),
                "description": self.description(),
                "parameters": self.parameters_schema()
            }
        }
