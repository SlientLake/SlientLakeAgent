# skills/__init__.py
from skills.core.web_search import WebSearchSkill
from skills.core.shell_execute import ShellExecuteSkill

__all__ = [
    "WebSearchSkill",
    "ShellExecuteSkill",
]
