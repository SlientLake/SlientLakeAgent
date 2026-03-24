# core/skill_loader.py
import importlib
import yaml
from pathlib import Path
from typing import Dict, List, Optional


class NodeSkillProxy:
    """Proxy for Node.js-based skills"""
    def __init__(self, entrypoint: str, config: Optional[dict] = None):
        self.entrypoint = entrypoint
        self.config = config or {}


class DockerSkillProxy:
    """Proxy for Docker-based skills"""
    def __init__(self, entrypoint: str, config: Optional[dict] = None):
        self.entrypoint = entrypoint
        self.config = config or {}


class BinarySkillProxy:
    """Proxy for binary-based skills"""
    def __init__(self, entrypoint: str, config: Optional[dict] = None):
        self.entrypoint = entrypoint
        self.config = config or {}


class SkillLoader:
    """Skill 动态加载器"""

    def __init__(self, registry_path: str = "~/.openclaw/skills/registry.yaml"):
        self.registry_path = Path(registry_path).expanduser()
        self.loaded_skills: Dict[str, object] = {}
        self.registry = self._load_registry()

    def _load_registry(self) -> dict:
        if not self.registry_path.exists():
            return {"skills": []}
        with open(self.registry_path) as f:
            return yaml.safe_load(f) or {"skills": []}

    def resolve_dependencies(self, skill_names: List[str]) -> List[str]:
        """拓扑排序解析依赖"""
        resolved = []
        visited = set()

        def _resolve(name: str):
            if name in visited:
                return
            visited.add(name)
            skill_def = self._find_skill(name)
            if not skill_def:
                raise ValueError(f"Skill not found: {name}")
            for dep in skill_def.get("dependencies", []):
                _resolve(dep)
            resolved.append(name)

        for name in skill_names:
            _resolve(name)
        return resolved

    def load_skill(self, name: str, config: Optional[dict] = None) -> object:
        """加载单个 Skill"""
        if name in self.loaded_skills:
            return self.loaded_skills[name]

        skill_def = self._find_skill(name)
        if not skill_def:
            raise ValueError(f"Skill not found: {name}")

        runtime = skill_def.get("runtime", "python")

        if runtime == "python":
            entrypoint = skill_def["entrypoint"]
            # Convert path to module: skills/core/web_search.py -> skills.core.web_search
            module_path = entrypoint.replace("/", ".").replace(".py", "")
            module = importlib.import_module(module_path)
            instance = module.create(config or {})
        elif runtime == "node":
            instance = NodeSkillProxy(skill_def["entrypoint"], config)
        elif runtime == "docker":
            instance = DockerSkillProxy(skill_def["entrypoint"], config)
        elif runtime == "binary":
            instance = BinarySkillProxy(skill_def["entrypoint"], config)
        else:
            raise ValueError(f"Unknown runtime: {runtime}")

        self.loaded_skills[name] = instance
        return instance

    def load_skills_for_agent(self, agent_id: str) -> Dict[str, object]:
        """根据 Agent 配置加载所有 Skill"""
        agent_config = self._load_agent_config(agent_id)
        skill_names = agent_config.get("skills", [])

        # 解析依赖
        ordered = self.resolve_dependencies(skill_names)

        # 逐个加载
        result = {}
        for name in ordered:
            agent_skill_config = agent_config.get("skill_configs", {}).get(name, {})
            result[name] = self.load_skill(name, agent_skill_config)

        return result

    def _find_skill(self, name: str) -> Optional[dict]:
        for skill in self.registry.get("skills", []):
            if skill["name"] == name:
                return skill
        return None

    def _load_agent_config(self, agent_id: str) -> dict:
        config_path = Path(f"~/.openclaw/agents/{agent_id}/identity.yaml").expanduser()
        if not config_path.exists():
            return {}
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        agent = data.get("agent", {})
        caps = agent.get("capabilities", {})
        return {
            "skills": caps.get("skills", []),
            "skill_configs": caps.get("skill_configs", {}),
        }
