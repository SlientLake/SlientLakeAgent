import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "services" / "task_chain_store.py"
SPEC = importlib.util.spec_from_file_location("task_chain_store_module", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)
TaskChainStore = MODULE.TaskChainStore


class TaskChainStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp_root = Path("/tmp/silentlake-platform-tests/task-store")
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        self.store_path = self.tmp_root / "task_chains.json"
        if self.store_path.exists():
            self.store_path.unlink()
        self.patch = patch.object(TaskChainStore, "STORE_PATH", self.store_path)
        self.patch.start()
        self.store = TaskChainStore()

    def tearDown(self):
        self.patch.stop()
        if self.store_path.exists():
            self.store_path.unlink()

    def test_tracks_status_messages_and_reports(self):
        task = self.store.create(
            {
                "title": "收口任务链",
                "description": "把任务状态、消息和汇报都沉淀下来。",
                "origin_agent": "001",
                "owner_agent": "002",
                "participants": ["001", "002", "002"],
                "source_room_id": "room-product",
                "due_at": "2099-04-20T18:00:00",
            }
        )

        self.assertEqual(task["participants"], ["001", "002"])
        self.assertEqual(task["status_history"][0]["to_status"], "todo")

        updated = self.store.update(
            task["task_id"],
            {
                "status": "blocked",
                "blocked_reason": "等待设计资源同步",
                "updated_by": "pm-console",
                "status_note": "设计资源尚未准备完成。",
            },
        )
        self.assertEqual(updated["status"], "blocked")
        self.assertEqual(updated["blocked_reason"], "等待设计资源同步")
        self.assertEqual(updated["status_history"][-1]["to_status"], "blocked")

        updated = self.store.append_message(
            task["task_id"],
            {
                "sender": "002",
                "content": "设计资源已同步到任务链。",
                "room_id": "room-product",
                "create_step": True,
                "step_title": "同步设计资源",
            },
        )
        self.assertEqual(updated["messages"][-1]["content"], "设计资源已同步到任务链。")
        self.assertEqual(updated["steps"][-1]["title"], "同步设计资源")

        updated = self.store.append_report(
            task["task_id"],
            {
                "reporter": "002",
                "recipient": "001",
                "summary": "阻塞已解除，准备进入联调阶段。",
                "step_title": "提交阶段汇报",
            },
        )
        self.assertEqual(updated["reports"][-1]["summary"], "阻塞已解除，准备进入联调阶段。")
        self.assertEqual(updated["steps"][-1]["title"], "提交阶段汇报")

        persisted = self.store.get(task["task_id"])
        self.assertEqual(persisted["latest_activity_summary"], "收到 002 的任务汇报")
        self.assertEqual(len(self.store.list()), 1)


if __name__ == "__main__":
    unittest.main()
