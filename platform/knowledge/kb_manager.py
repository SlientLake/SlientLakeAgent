# knowledge/kb_manager.py
import yaml
import json
from pathlib import Path
from typing import List, Optional
from models.knowledge_base import KnowledgeBase, KBType, KBSourceType


class KnowledgeBaseManager:
    """知识库生命周期管理"""

    KB_DIR = Path("~/.openclaw/knowledge-bases").expanduser()

    def __init__(self):
        self.KB_DIR.mkdir(parents=True, exist_ok=True)

    def create_kb(self, kb: KnowledgeBase) -> KnowledgeBase:
        """创建知识库"""
        kb_dir = self.KB_DIR / kb.kb_type.value / kb.id
        kb_dir.mkdir(parents=True, exist_ok=True)
        (kb_dir / "documents").mkdir(exist_ok=True)
        (kb_dir / "vectors").mkdir(exist_ok=True)

        kb.documents_path = str(kb_dir / "documents")

        # 保存配置
        with open(kb_dir / "config.yaml", "w") as f:
            yaml.dump(self._kb_to_dict(kb), f, allow_unicode=True)

        return kb

    def get_accessible_kbs(self, agent_id: str, group: Optional[str] = None) -> List[KnowledgeBase]:
        """获取 Agent 可访问的所有知识库"""
        accessible = []

        for kb_type_dir in self.KB_DIR.iterdir():
            if not kb_type_dir.is_dir():
                continue
            for kb_dir in kb_type_dir.iterdir():
                config_path = kb_dir / "config.yaml"
                if not config_path.exists():
                    continue

                with open(config_path) as f:
                    data = yaml.safe_load(f)

                kb = self._dict_to_kb(data)

                # 访问控制检查
                if kb.accessible_by_all:
                    accessible.append(kb)
                elif agent_id in kb.accessible_by:
                    accessible.append(kb)
                elif group and group in kb.accessible_by:
                    accessible.append(kb)
                elif kb.owner == agent_id:
                    accessible.append(kb)

        return accessible

    def inject_context(self, agent_id: str, group: Optional[str] = None) -> str:
        """
        为 Agent 注入知识库上下文。
        在 Agent 启动时调用，将知识库内容作为 context 注入。
        """
        kbs = self.get_accessible_kbs(agent_id, group)
        context_parts = []

        for kb in kbs:
            docs_path = Path(kb.documents_path)
            if docs_path.exists():
                for doc_file in docs_path.glob("*.md"):
                    try:
                        content = doc_file.read_text()
                        context_parts.append(
                            f"--- Knowledge Base: {kb.name} / {doc_file.name} ---\n"
                            f"{content}\n"
                        )
                    except Exception:
                        pass

        return "\n".join(context_parts)

    def add_document(self, kb_id: str, kb_type: str, filename: str, content: str):
        """向知识库添加文档"""
        doc_path = self.KB_DIR / kb_type / kb_id / "documents" / filename
        doc_path.parent.mkdir(parents=True, exist_ok=True)
        doc_path.write_text(content)

        # 触发向量化
        self._vectorize_document(kb_id, kb_type, doc_path)

    def _vectorize_document(self, kb_id: str, kb_type: str, doc_path: Path):
        """文档向量化（增量）"""
        # 读取知识库配置
        config_path = self.KB_DIR / kb_type / kb_id / "config.yaml"
        if not config_path.exists():
            return

        with open(config_path) as f:
            config = yaml.safe_load(f)

        vector_store = config.get("vector_store", "qdrant")

        # 分块
        content = doc_path.read_text()
        chunks = self._chunk_text(content, chunk_size=500, overlap=50)

        # 向量化并存储
        if vector_store == "qdrant":
            self._store_in_qdrant(kb_id, chunks, doc_path.name)
        elif vector_store == "pgvector":
            self._store_in_pgvector(kb_id, chunks, doc_path.name)

    def _chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """文本分块"""
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - overlap
        return chunks

    def _store_in_qdrant(self, kb_id: str, chunks: List[str], source: str):
        """存储到 Qdrant 向量数据库"""
        try:
            from qdrant_client import QdrantClient
            # client = QdrantClient(host="localhost", port=6333)
            # ... 向量化 + 存储
        except ImportError:
            pass  # Qdrant not installed

    def _store_in_pgvector(self, kb_id: str, chunks: List[str], source: str):
        """存储到 pgvector"""
        pass  # Implementation depends on database setup

    def search(self, query: str, kb_id: str, kb_type: str, top_k: int = 5) -> List[dict]:
        """语义搜索知识库"""
        # Placeholder: full vector search implementation
        return []

    def _kb_to_dict(self, kb: KnowledgeBase) -> dict:
        return {
            "id": kb.id, "name": kb.name, "description": kb.description,
            "type": kb.kb_type.value, "owner": kb.owner,
            "documents_path": kb.documents_path,
            "accessible_by": kb.accessible_by,
            "accessible_by_all": kb.accessible_by_all,
            "vector_store": kb.vector_store,
            "embedding_model": kb.embedding_model,
        }

    def _dict_to_kb(self, data: dict) -> KnowledgeBase:
        return KnowledgeBase(
            id=data["id"], name=data["name"],
            description=data.get("description", ""),
            kb_type=KBType(data.get("type", "shared")),
            owner=data.get("owner"),
            documents_path=data.get("documents_path", ""),
            accessible_by=data.get("accessible_by", []),
            accessible_by_all=data.get("accessible_by_all", False),
            vector_store=data.get("vector_store", "qdrant"),
            embedding_model=data.get("embedding_model", "text-embedding-3-small"),
        )
