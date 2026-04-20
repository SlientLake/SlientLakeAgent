import json
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, List, Optional


class TaskChainStore:
    """任务链持久化存储"""

    STORE_PATH = Path("~/.openclaw/tasks/task_chains.json").expanduser()

    def __init__(self):
        self.STORE_PATH.parent.mkdir(parents=True, exist_ok=True)

    def list(self) -> List[dict]:
        data = self._load()
        chains = [self._normalize_chain(item) for item in data.get("chains", [])]
        chains.sort(
            key=lambda item: item.get("latest_activity_at") or item.get("updated_at") or "",
            reverse=True,
        )
        return chains

    def get(self, task_id: str) -> Optional[dict]:
        for chain in self.list():
            if chain.get("task_id") == task_id:
                return chain
        return None

    def create(self, payload: Dict) -> dict:
        now = self._now()
        task_id = payload.get("task_id") or f"task-{uuid.uuid4().hex[:8]}"
        origin_agent = payload.get("origin_agent", "001")
        owner_agent = payload.get("owner_agent", origin_agent)
        participants = self._dedupe_list(payload.get("participants", [origin_agent, owner_agent]))
        created_by = payload.get("created_by", "dashboard")
        status = payload.get("status", "todo")

        chain = {
            "task_id": task_id,
            "title": payload.get("title", task_id),
            "description": payload.get("description", ""),
            "status": status,
            "priority": payload.get("priority", "medium"),
            "origin_agent": origin_agent,
            "owner_agent": owner_agent,
            "participants": participants,
            "created_at": now,
            "updated_at": now,
            "due_at": payload.get("due_at"),
            "source_room_id": payload.get("source_room_id") or payload.get("room_id"),
            "blocked_reason": payload.get("blocked_reason"),
            "latest_activity_at": now,
            "latest_activity_summary": f"任务由 {created_by} 创建。",
            "status_history": [
                {
                    "id": f"hist-{uuid.uuid4().hex[:6]}",
                    "from_status": None,
                    "to_status": status,
                    "by": created_by,
                    "at": now,
                    "note": payload.get("creation_note", "任务进入任务池，等待负责人推进。"),
                }
            ],
            "steps": payload.get("steps", []),
            "messages": payload.get("messages", []),
            "reports": payload.get("reports", []),
        }
        chain.setdefault("steps", []).append(
            {
                "id": f"step-{uuid.uuid4().hex[:6]}",
                "title": "任务创建",
                "status": status,
                "owner_agent": owner_agent,
                "updated_at": now,
                "note": payload.get("creation_note", "任务由控制台创建并进入待处理队列。"),
            }
        )
        chain.setdefault("messages", []).append(
            {
                "id": f"msg-{uuid.uuid4().hex[:6]}",
                "sender": created_by,
                "content": f"任务 {chain['title']} 已创建，负责人为 {owner_agent}。",
                "ts": now,
                "room_id": chain.get("source_room_id"),
                "type": "system",
            }
        )
        chain = self._normalize_chain(chain)

        data = self._load()
        data.setdefault("chains", []).append(chain)
        self._save(data)
        return chain

    def update(self, task_id: str, payload: Dict) -> Optional[dict]:
        data = self._load()
        chains = data.get("chains", [])
        for index, item in enumerate(chains):
            chain = self._normalize_chain(item)
            if chain.get("task_id") != task_id:
                continue

            previous = deepcopy(chain)
            for key in (
                "title",
                "description",
                "status",
                "priority",
                "origin_agent",
                "owner_agent",
                "due_at",
                "source_room_id",
                "blocked_reason",
            ):
                if key in payload:
                    chain[key] = payload[key]

            if "room_id" in payload and not chain.get("source_room_id"):
                chain["source_room_id"] = payload.get("room_id")

            participants = payload.get("participants")
            if participants is not None:
                chain["participants"] = self._dedupe_list(participants)

            if "steps" in payload:
                chain["steps"] = payload["steps"]
            if "messages" in payload:
                chain["messages"] = payload["messages"]
            if "reports" in payload:
                chain["reports"] = payload["reports"]

            now = payload.get("updated_at") or self._now()
            chain["updated_at"] = now

            status_note = payload.get("status_note", "由控制台更新任务状态。")
            if previous.get("status") != chain.get("status"):
                chain.setdefault("status_history", []).append(
                    {
                        "id": f"hist-{uuid.uuid4().hex[:6]}",
                        "from_status": previous.get("status"),
                        "to_status": chain.get("status"),
                        "by": payload.get("updated_by", "dashboard"),
                        "at": now,
                        "note": status_note,
                    }
                )
                chain.setdefault("steps", []).append(
                    {
                        "id": f"step-{uuid.uuid4().hex[:6]}",
                        "title": f"状态更新为 {chain['status']}",
                        "status": chain["status"],
                        "owner_agent": chain["owner_agent"],
                        "updated_at": now,
                        "note": status_note,
                    }
                )
                chain.setdefault("messages", []).append(
                    {
                        "id": f"msg-{uuid.uuid4().hex[:6]}",
                        "sender": payload.get("updated_by", "dashboard"),
                        "content": f"任务状态从 {previous.get('status')} 更新为 {chain.get('status')}。",
                        "ts": now,
                        "room_id": chain.get("source_room_id"),
                        "type": "status",
                    }
                )
                chain["latest_activity_summary"] = f"状态更新为 {chain['status']}"

            if payload.get("blocked_reason") and chain.get("status") == "blocked":
                chain["latest_activity_summary"] = f"阻塞原因：{payload['blocked_reason']}"

            if payload.get("latest_activity_summary"):
                chain["latest_activity_summary"] = payload["latest_activity_summary"]

            chain["latest_activity_at"] = payload.get("latest_activity_at", now)
            chains[index] = self._normalize_chain(chain)
            self._save(data)
            return chains[index]
        return None

    def append_message(self, task_id: str, payload: Dict) -> Optional[dict]:
        data = self._load()
        chains = data.get("chains", [])
        for index, item in enumerate(chains):
            chain = self._normalize_chain(item)
            if chain.get("task_id") != task_id:
                continue

            now = payload.get("ts") or self._now()
            message = {
                "id": payload.get("id") or f"msg-{uuid.uuid4().hex[:6]}",
                "sender": payload.get("sender", "dashboard"),
                "content": payload.get("content", "").strip(),
                "ts": now,
                "room_id": payload.get("room_id") or chain.get("source_room_id"),
                "type": payload.get("type", "note"),
            }
            if not message["content"]:
                return chain

            chain.setdefault("messages", []).append(message)
            if payload.get("create_step"):
                chain.setdefault("steps", []).append(
                    {
                        "id": f"step-{uuid.uuid4().hex[:6]}",
                        "title": payload.get("step_title", "新增协作记录"),
                        "status": chain.get("status"),
                        "owner_agent": payload.get("owner_agent", chain.get("owner_agent")),
                        "updated_at": now,
                        "note": message["content"],
                    }
                )

            chain["updated_at"] = now
            chain["latest_activity_at"] = now
            chain["latest_activity_summary"] = f"{message['sender']}: {message['content'][:80]}"
            chains[index] = self._normalize_chain(chain)
            self._save(data)
            return chains[index]
        return None

    def append_report(self, task_id: str, payload: Dict) -> Optional[dict]:
        data = self._load()
        chains = data.get("chains", [])
        for index, item in enumerate(chains):
            chain = self._normalize_chain(item)
            if chain.get("task_id") != task_id:
                continue

            now = payload.get("created_at") or self._now()
            report = {
                "id": payload.get("id") or f"rpt-{uuid.uuid4().hex[:6]}",
                "reporter": payload.get("reporter", chain.get("owner_agent")),
                "recipient": payload.get("recipient", chain.get("origin_agent")),
                "type": payload.get("type", "ad_hoc"),
                "status": payload.get("status", "submitted"),
                "created_at": now,
                "summary": payload.get("summary", "").strip(),
                "background": payload.get("background", "").strip(),
                "approach": payload.get("approach", "").strip(),
                "expected_outcome": payload.get("expected_outcome", "").strip(),
            }
            if not report["summary"]:
                return chain

            chain.setdefault("reports", []).append(report)
            chain.setdefault("steps", []).append(
                {
                    "id": f"step-{uuid.uuid4().hex[:6]}",
                    "title": payload.get("step_title", "新增任务汇报"),
                    "status": chain.get("status"),
                    "owner_agent": report["reporter"],
                    "updated_at": now,
                    "note": report["summary"],
                }
            )
            chain["updated_at"] = now
            chain["latest_activity_at"] = now
            chain["latest_activity_summary"] = f"收到 {report['reporter']} 的任务汇报"
            chains[index] = self._normalize_chain(chain)
            self._save(data)
            return chains[index]
        return None

    def _normalize_chain(self, chain: dict) -> dict:
        normalized = deepcopy(chain)
        normalized.setdefault("description", "")
        normalized.setdefault("status", "todo")
        normalized.setdefault("priority", "medium")
        normalized.setdefault("origin_agent", "001")
        normalized.setdefault("owner_agent", normalized.get("origin_agent", "001"))
        normalized["participants"] = self._dedupe_list(
            normalized.get("participants", [normalized["origin_agent"], normalized["owner_agent"]])
        )
        normalized.setdefault("created_at", self._now())
        normalized.setdefault("updated_at", normalized["created_at"])
        normalized.setdefault("due_at", None)
        normalized.setdefault("source_room_id", None)
        normalized.setdefault("blocked_reason", None)
        normalized.setdefault("steps", [])
        normalized.setdefault("messages", [])
        normalized.setdefault("reports", [])
        normalized.setdefault("status_history", [])
        normalized.setdefault("latest_activity_at", normalized.get("updated_at"))
        normalized.setdefault("latest_activity_summary", "等待更新")
        normalized["is_overdue"] = False
        due_at = normalized.get("due_at")
        if due_at and normalized.get("status") not in {"completed", "failed"}:
            try:
                normalized["is_overdue"] = datetime.fromisoformat(str(due_at)) < datetime.now(UTC).replace(tzinfo=None)
            except ValueError:
                normalized["is_overdue"] = False
        return normalized

    def _dedupe_list(self, values: List[str]) -> List[str]:
        return [value for value in dict.fromkeys(values) if value]

    def _load(self) -> dict:
        if not self.STORE_PATH.exists():
            return {"chains": []}
        try:
            return json.loads(self.STORE_PATH.read_text())
        except Exception:
            return {"chains": []}

    def _save(self, data: dict):
        self.STORE_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    def _now(self) -> str:
        return datetime.now(UTC).replace(tzinfo=None).isoformat()
