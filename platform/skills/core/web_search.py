# skills/core/web_search.py
import httpx
from core.skill_interface import SkillInterface, SkillResult


class WebSearchSkill(SkillInterface):
    def __init__(self, config: dict):
        self.provider = config.get("provider", "brave")
        self.api_key = config.get("api_key", "")

    def name(self) -> str:
        return "web-search"

    def description(self) -> str:
        return "Search the web for current information. Returns relevant results with titles, URLs, and snippets."

    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                },
                "num_results": {
                    "type": "integer",
                    "default": 5,
                    "description": "Number of results"
                }
            },
            "required": ["query"]
        }

    async def execute(self, params: dict) -> SkillResult:
        query = params["query"]
        num = params.get("num_results", 5)

        if self.provider == "brave":
            return await self._brave_search(query, num)
        elif self.provider == "perplexity":
            return await self._perplexity_search(query, num)
        elif self.provider == "serper":
            return await self._serper_search(query, num)
        else:
            return SkillResult(success=False, error=f"Unknown provider: {self.provider}")

    async def _brave_search(self, query: str, num: int) -> SkillResult:
        if not self.api_key:
            return SkillResult(success=False, error="Brave API key not configured")
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": num},
                headers={"X-Subscription-Token": self.api_key}
            )
            resp.raise_for_status()
            results = resp.json().get("web", {}).get("results", [])
            return SkillResult(
                success=True,
                data=[{
                    "title": r["title"],
                    "url": r["url"],
                    "snippet": r.get("description", "")
                } for r in results]
            )

    async def _perplexity_search(self, query: str, num: int) -> SkillResult:
        if not self.api_key:
            return SkillResult(success=False, error="Perplexity API key not configured")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "sonar",
                    "messages": [{"role": "user", "content": query}],
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return SkillResult(success=True, data={"answer": content})

    async def _serper_search(self, query: str, num: int) -> SkillResult:
        if not self.api_key:
            return SkillResult(success=False, error="Serper API key not configured")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": self.api_key, "Content-Type": "application/json"},
                json={"q": query, "num": num},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            organic = data.get("organic", [])
            return SkillResult(
                success=True,
                data=[{
                    "title": r.get("title", ""),
                    "url": r.get("link", ""),
                    "snippet": r.get("snippet", ""),
                } for r in organic[:num]]
            )


def create(config: dict) -> WebSearchSkill:
    return WebSearchSkill(config)
