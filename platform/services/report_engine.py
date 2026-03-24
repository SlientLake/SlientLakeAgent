# services/report_engine.py
import json
import uuid
import yaml
import httpx
from pathlib import Path
from datetime import datetime
from typing import List, Optional
from enum import Enum
from dataclasses import dataclass, field


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

    # 内容
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


class ReportEngine:
    """汇报流程引擎"""

    def __init__(self, topology):
        self.topology = topology

    async def submit_report(self, report: Report) -> bool:
        """提交汇报"""
        # 1. 验证汇报关系
        if not self._validate_reporting_relation(report.reporter_id, report.recipient_id):
            raise ValueError(
                f"{report.reporter_id} does not report to {report.recipient_id}"
            )

        # 2. 持久化汇报（存储在 reporter 目录）
        self._save_report(report, report.reporter_id)

        # 3. 同时存储在 recipient 目录（便于上级查看）
        self._save_report_reference(report, report.recipient_id)

        # 4. 发送通知给接收人
        await self._notify_recipient(report)

        # 5. 更新状态
        report.status = ReportStatus.SUBMITTED
        return True

    async def generate_report(self, agent_id: str, report_type: ReportType,
                               template_name: str = "default") -> Report:
        """生成汇报（由 Agent 的 LLM 生成内容）"""
        # 获取汇报对象
        node = self.topology.nodes.get(agent_id)
        if not node or not node.parent_id:
            raise ValueError(f"Agent {agent_id} has no reporting target")

        # 加载汇报模板
        template = self._load_template(template_name)

        # 收集汇报素材
        context = await self._collect_report_context(agent_id)

        # 构建汇报
        report = Report(
            reporter_id=agent_id,
            recipient_id=node.parent_id,
            report_type=report_type,
        )

        return report  # 内容由调用者（Agent LLM）填充

    def get_reports_for_agent(self, agent_id: str,
                              include_subordinates: bool = False) -> List[Report]:
        """获取 Agent 可查看的汇报"""
        reports = []

        # 自己的汇报
        reports.extend(self._load_reports(agent_id))

        # 下级汇报
        if include_subordinates:
            subordinates = self.topology.get_all_subordinates(agent_id)
            for sub_id in subordinates:
                reports.extend(self._load_reports(sub_id))

        # 按时间排序
        reports.sort(key=lambda r: r.created_at, reverse=True)
        return reports

    def _validate_reporting_relation(self, reporter: str, recipient: str) -> bool:
        """验证汇报关系是否合法"""
        chain = self.topology.get_reporting_chain(reporter)
        return recipient in chain

    def _save_report(self, report: Report, agent_id: str):
        """存储汇报到 Agent 目录"""
        reports_dir = Path(f"~/.openclaw/agents/{agent_id}/reports").expanduser()
        reports_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{report.created_at.strftime('%Y%m%d_%H%M%S')}_{report.id}.json"
        report_path = reports_dir / filename

        with open(report_path, "w") as f:
            json.dump(report.to_dict(), f, indent=2, ensure_ascii=False)

    def _save_report_reference(self, report: Report, recipient_id: str):
        """在接收人目录保存汇报引用"""
        inbox_dir = Path(f"~/.openclaw/agents/{recipient_id}/reports/inbox").expanduser()
        inbox_dir.mkdir(parents=True, exist_ok=True)

        ref = {
            "report_id": report.id,
            "reporter": report.reporter_id,
            "type": report.report_type.value,
            "created_at": report.created_at.isoformat(),
            "source_path": str(
                Path(f"~/.openclaw/agents/{report.reporter_id}/reports/")
            )
        }

        ref_path = inbox_dir / f"{report.id}.json"
        with open(ref_path, "w") as f:
            json.dump(ref, f, indent=2)

    async def _notify_recipient(self, report: Report):
        """通知接收人有新汇报"""
        from core.port_manager import PortManager
        recipient_port = PortManager().get_port(report.recipient_id)
        if recipient_port:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        f"http://localhost:{recipient_port}/api/v1/a2a/message",
                        json={
                            "sender_agent": report.reporter_id,
                            "content": f"[汇报通知] 来自 {report.reporter_id} 的{report.report_type.value}汇报",
                            "metadata": {"report_id": report.id, "type": "report_notification"}
                        },
                        timeout=5,
                    )
            except Exception:
                pass

    def _load_template(self, template_name: str) -> dict:
        template_path = Path(f"~/.openclaw/templates/reports/{template_name}.yaml").expanduser()
        if template_path.exists():
            with open(template_path) as f:
                return yaml.safe_load(f)
        return {"format": "background → approach → expected_outcome"}

    def _load_reports(self, agent_id: str) -> List[Report]:
        reports_dir = Path(f"~/.openclaw/agents/{agent_id}/reports").expanduser()
        reports = []
        if reports_dir.exists():
            for f in reports_dir.glob("*.json"):
                try:
                    with open(f) as fh:
                        data = json.load(fh)
                        report = Report(
                            id=data["id"],
                            reporter_id=data["reporter"],
                            recipient_id=data["recipient"],
                            report_type=ReportType(data["type"]),
                            status=ReportStatus(data["status"]),
                            created_at=datetime.fromisoformat(data["created_at"]),
                            background=data["content"]["background"],
                            approach=data["content"]["approach"],
                            expected_outcome=data["content"]["expected_outcome"],
                            raw_content=data["content"].get("raw", ""),
                        )
                        reports.append(report)
                except Exception:
                    pass
        return reports

    async def _collect_report_context(self, agent_id: str) -> dict:
        """收集汇报所需的上下文信息"""
        agent_dir = Path(f"~/.openclaw/agents/{agent_id}").expanduser()
        return {
            "recent_memory": self._read_recent_memory(agent_dir),
            "recent_chats": self._read_recent_chats(agent_dir),
        }

    def _read_recent_memory(self, agent_dir: Path) -> list:
        memory_dir = agent_dir / "memory"
        items = []
        if memory_dir.exists():
            for f in sorted(memory_dir.glob("*.json"), reverse=True)[:5]:
                try:
                    with open(f) as fh:
                        items.append(json.load(fh))
                except Exception:
                    pass
        return items

    def _read_recent_chats(self, agent_dir: Path) -> list:
        chats_dir = agent_dir / "chats"
        items = []
        if chats_dir.exists():
            for f in sorted(chats_dir.glob("*.json"), reverse=True)[:10]:
                try:
                    with open(f) as fh:
                        items.append(json.load(fh))
                except Exception:
                    pass
        return items


class ReportPermissionChecker:
    """汇报查看权限检查"""

    def __init__(self, topology):
        self.topology = topology

    def can_view_report(self, viewer_id: str, report: Report) -> bool:
        """判断 viewer 是否有权查看该汇报"""

        # 1. 汇报人本人可查看
        if viewer_id == report.reporter_id:
            return True

        # 2. 接收人可查看
        if viewer_id == report.recipient_id:
            return True

        # 3. 上级可查看所有下级汇报（跨级）
        subordinates = self.topology.get_all_subordinates(viewer_id)
        if report.reporter_id in subordinates:
            return True

        # 4. 相关协作方可查看
        if viewer_id in report.related_agents:
            return True

        return False

    def get_viewable_agents(self, viewer_id: str) -> set:
        """获取 viewer 可查看汇报的所有 Agent"""
        viewable = {viewer_id}  # 自己
        viewable.update(self.topology.get_all_subordinates(viewer_id))  # 所有下级

        # 协作关系
        node = self.topology.nodes.get(viewer_id)
        if node:
            viewable.update(node.collaborators)

        return viewable


class ReportTrigger:
    """汇报触发器 — 在特定事件发生时自动触发汇报"""

    def __init__(self, report_engine: ReportEngine, topology):
        self.engine = report_engine
        self.topology = topology

    async def on_task_complete(self, agent_id: str, task_info: dict):
        """任务完成时触发汇报"""
        node = self.topology.nodes.get(agent_id)
        if node and node.parent_id:
            report = Report(
                reporter_id=agent_id,
                recipient_id=node.parent_id,
                report_type=ReportType.TASK_COMPLETE,
                background=f"任务 {task_info.get('name', '')} 已完成",
                approach=task_info.get("summary", ""),
                expected_outcome=task_info.get("result", ""),
            )
            await self.engine.submit_report(report)

    async def on_error(self, agent_id: str, error_info: dict):
        """错误发生时触发上报"""
        node = self.topology.nodes.get(agent_id)
        if node and node.parent_id:
            report = Report(
                reporter_id=agent_id,
                recipient_id=node.parent_id,
                report_type=ReportType.ESCALATION,
                background=f"执行过程中遇到错误: {error_info.get('error', '')}",
                approach="等待上级指示",
                expected_outcome="需要上级审批或指导",
            )
            await self.engine.submit_report(report)

    async def on_approval_needed(self, agent_id: str, approval_info: dict):
        """需要审批时触发上报"""
        node = self.topology.nodes.get(agent_id)
        if node and node.parent_id:
            report = Report(
                reporter_id=agent_id,
                recipient_id=node.parent_id,
                report_type=ReportType.ESCALATION,
                background=approval_info.get("context", ""),
                approach=approval_info.get("proposed_action", ""),
                expected_outcome="请审批",
            )
            await self.engine.submit_report(report)
