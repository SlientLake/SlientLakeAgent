# models/skill.py
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


class SkillType(Enum):
    TOOL = "tool"           # 工具类（搜索、执行等）
    MCP = "mcp"             # MCP Server 封装
    KNOWLEDGE = "knowledge" # 知识库类
    WORKFLOW = "workflow"    # 工作流类
    CLI_AGENT = "cli_agent" # CLI Agent 封装（Claude Code等）


@dataclass
class SkillManifest:
    """Skill 清单定义"""
    name: str                              # 唯一标识
    version: str                           # 语义化版本
    display_name: str                      # 显示名
    description: str                       # 描述
    type: SkillType                        # 类型
    author: str = ""                       # 作者

    # 能力声明
    capabilities: List[str] = field(default_factory=list)

    # 依赖
    dependencies: List[str] = field(default_factory=list)  # 其他 Skill
    system_requirements: List[str] = field(default_factory=list)  # 系统依赖

    # 配置 schema
    config_schema: Dict[str, Any] = field(default_factory=dict)

    # 资源需求
    requires_gateway: bool = False
    requires_network: bool = False
    requires_filesystem: bool = False

    # 入口
    entrypoint: str = ""                   # 入口文件/命令
    runtime: str = "python"               # python | node | binary | docker
