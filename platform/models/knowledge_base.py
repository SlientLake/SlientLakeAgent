# models/knowledge_base.py
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from enum import Enum
from pathlib import Path


class KBType(Enum):
    SHARED = "shared"       # 全局共享
    GROUP = "group"         # 分组共享
    PRIVATE = "private"     # Agent 私有


class KBSourceType(Enum):
    FILE = "file"           # 本地文件
    URL = "url"             # 网页抓取
    API = "api"             # API 数据源


@dataclass
class KnowledgeBase:
    id: str
    name: str
    description: str
    kb_type: KBType = KBType.SHARED
    owner: Optional[str] = None          # 归属 Agent 或 Group

    # 内容
    documents_path: str = ""             # 文档存储路径
    document_count: int = 0

    # 访问控制
    accessible_by: List[str] = field(default_factory=list)  # Agent IDs 或 Group names
    accessible_by_all: bool = False      # 是否对所有 Agent 开放

    # 自动更新
    auto_update: bool = False
    update_sources: List[Dict] = field(default_factory=list)
    update_schedule: Optional[str] = None  # cron 表达式

    # 向量化
    embedding_model: str = "text-embedding-3-small"
    vector_store: str = "qdrant"         # qdrant | pgvector | chroma
