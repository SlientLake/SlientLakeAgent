# api/reports.py
from aiohttp import web
from services.report_engine import Report, ReportType, ReportStatus


class ReportRoutes:
    """汇报相关 API"""

    def __init__(self, report_engine, perm_checker, topology_manager):
        self.engine = report_engine
        self.perm = perm_checker
        self.topology = topology_manager

    def register(self, app: web.Application):
        app.router.add_get("/api/v1/reports", self.list_reports)
        app.router.add_get("/api/v1/reports/{report_id}", self.get_report)
        app.router.add_post("/api/v1/reports", self.create_report)
        app.router.add_get("/api/v1/topology", self.get_topology)
        app.router.add_get("/api/v1/topology/mermaid", self.get_topology_mermaid)

    async def list_reports(self, request: web.Request) -> web.Response:
        viewer_id = request.query.get("viewer")
        include_subs = request.query.get("include_subordinates", "true") == "true"

        if not viewer_id:
            return web.json_response({"error": "viewer parameter required"}, status=400)

        reports = self.engine.get_reports_for_agent(viewer_id, include_subs)
        filtered = [r for r in reports if self.perm.can_view_report(viewer_id, r)]

        return web.json_response([r.to_dict() for r in filtered])

    async def get_report(self, request: web.Request) -> web.Response:
        report_id = request.match_info["report_id"]
        viewer_id = request.query.get("viewer")

        # Search for the report across all accessible agents
        if viewer_id:
            reports = self.engine.get_reports_for_agent(viewer_id, include_subordinates=True)
            for report in reports:
                if report.id == report_id:
                    if not viewer_id or self.perm.can_view_report(viewer_id, report):
                        return web.json_response(report.to_dict())
                    else:
                        return web.json_response({"error": "permission denied"}, status=403)

        return web.json_response({"error": "report not found"}, status=404)

    async def create_report(self, request: web.Request) -> web.Response:
        body = await request.json()
        report = Report(
            reporter_id=body["reporter"],
            recipient_id=body["recipient"],
            report_type=ReportType(body.get("type", "ad_hoc")),
            background=body.get("background", ""),
            approach=body.get("approach", ""),
            expected_outcome=body.get("expected_outcome", ""),
            raw_content=body.get("content", ""),
        )
        try:
            await self.engine.submit_report(report)
            return web.json_response(report.to_dict(), status=201)
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

    async def get_topology(self, request: web.Request) -> web.Response:
        topology = self.topology.load()
        nodes = []
        for node in topology.nodes.values():
            nodes.append({
                "id": node.agent_id,
                "type": node.agent_type,
                "parent": node.parent_id,
                "children": node.children_ids,
                "group": node.group,
            })
        return web.json_response({"nodes": nodes})

    async def get_topology_mermaid(self, request: web.Request) -> web.Response:
        from core.topology_manager import TopologyManager
        mermaid = TopologyManager().export_mermaid()
        return web.Response(text=mermaid, content_type="text/plain")
