# models/report.py
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List
from enum import Enum
import uuid


class ReportType(Enum):
    DAILY = "daily"             # 日报
    TASK_COMPLETE = "task"      # 任务完成汇报
    ESCALATION = "escalation"   # 上报/升级
    AD_HOC = "ad_hoc"           # 临时汇报


class ReportStatus(Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    ACKNOWLEDGED = "acknowledged"
    ACTION_REQUIRED = "action_required"


@dataclass
class Report:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    reporter_id: str = ""           # 汇报人
    recipient_id: str = ""          # 接收人
    report_type: ReportType = ReportType.AD_HOC
    status: ReportStatus = ReportStatus.DRAFT
    created_at: datetime = field(default_factory=datetime.utcnow)

    # 内容（结构化格式：问题背景 → 处理方案 → 预计结果）
    background: str = ""            # 问题背景
    approach: str = ""              # 处理方案
    expected_outcome: str = ""      # 预计结果
    raw_content: str = ""           # 原始自然语言内容

    # 元数据
    related_tasks: List[str] = field(default_factory=list)
    related_agents: List[str] = field(default_factory=list)
    attachments: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "reporter": self.reporter_id,
            "recipient": self.recipient_id,
            "type": self.report_type.value,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "content": {
                "background": self.background,
                "approach": self.approach,
                "expected_outcome": self.expected_outcome,
                "raw": self.raw_content,
            },
            "related_tasks": self.related_tasks,
            "related_agents": self.related_agents,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Report":
        content = data.get("content", {})
        return cls(
            id=data.get("id", str(uuid.uuid4())[:8]),
            reporter_id=data.get("reporter", ""),
            recipient_id=data.get("recipient", ""),
            report_type=ReportType(data.get("type", "ad_hoc")),
            status=ReportStatus(data.get("status", "draft")),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.utcnow(),
            background=content.get("background", ""),
            approach=content.get("approach", ""),
            expected_outcome=content.get("expected_outcome", ""),
            raw_content=content.get("raw", ""),
            related_tasks=data.get("related_tasks", []),
            related_agents=data.get("related_agents", []),
        )
