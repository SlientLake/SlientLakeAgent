#!/usr/bin/env python3
# main.py — OpenClaw Platform CLI entry point
"""
OpenClaw Platform - Multi-Agent Orchestration System

Usage:
    openclaw agent create --id my-agent --template worker
    openclaw agent list
    openclaw platform start
    openclaw platform deploy
    openclaw mcp list
    openclaw mcp enable filesystem
    openclaw skill list
"""

import click
import yaml
import json
from pathlib import Path
from datetime import datetime


# ─── Helpers ─────────────────────────────────────────────────────────────

def ensure_openclaw_dir():
    base = Path("~/.openclaw").expanduser()
    for subdir in ["agents", "templates", "mcp", "knowledge-bases", "a2a"]:
        (base / subdir).mkdir(parents=True, exist_ok=True)
    return base


# ─── CLI Groups ──────────────────────────────────────────────────────────

@click.group()
@click.version_option(version="1.0.0", prog_name="openclaw")
def cli():
    """OpenClaw Platform - Multi-Agent Orchestration System"""
    pass


# ─── Agent Commands ──────────────────────────────────────────────────────

@cli.group()
def agent():
    """Agent management commands"""
    pass


@agent.command("create")
@click.option("--id", "agent_id", required=True, help="Agent unique identifier")
@click.option("--template", default="worker", help="Agent template to use")
@click.option("--name", default=None, help="Display name")
@click.option("--role", default=None, help="Role description")
@click.option("--reports-to", default=None, help="Parent Agent ID")
@click.option("--type", "agent_type", default="independent",
              type=click.Choice(["independent", "dependent"]),
              help="Agent type")
def agent_create(agent_id, template, name, role, reports_to, agent_type):
    """Create a new Agent instance"""
    ensure_openclaw_dir()

    from core.scaffolder import AgentScaffolder
    scaffolder = AgentScaffolder()

    try:
        result = scaffolder.create_agent(
            agent_id=agent_id,
            template=template,
            display_name=name,
            role=role,
            reports_to=reports_to,
            agent_type=agent_type,
        )
        click.echo(click.style(f"Agent created successfully!", fg="green"))
        click.echo(f"  ID:        {result['agent_id']}")
        click.echo(f"  Directory: {result['directory']}")
        click.echo(f"  Port:      {result['port']}")
        click.echo(f"  Type:      {result['type']}")
        if result['skills']:
            click.echo(f"  Skills:    {', '.join(result['skills'])}")
        click.echo(f"\n  API Key:   {result['api_key']}")
        click.echo(click.style("  (Save the API key - it won't be shown again)", fg="yellow"))
    except Exception as e:
        click.echo(click.style(f"Error: {e}", fg="red"), err=True)
        raise SystemExit(1)


@agent.command("list")
def agent_list():
    """List all registered Agents"""
    base = Path("~/.openclaw/agents").expanduser()
    if not base.exists():
        click.echo("No agents found. Create one with: openclaw agent create --id <id>")
        return

    agents_found = False
    for agent_dir in sorted(base.iterdir()):
        if agent_dir.is_dir():
            identity_path = agent_dir / "identity.yaml"
            if identity_path.exists():
                agents_found = True
                with open(identity_path) as f:
                    identity = yaml.safe_load(f) or {}
                a = identity.get("agent", {})
                agent_type = a.get("type", "?")
                role = a.get("role", "")[:40]
                click.echo(
                    f"  {a.get('id', '?'):20s}  "
                    f"[{agent_type:12s}]  "
                    f"{role}"
                )

    if not agents_found:
        click.echo("No agents found.")


@agent.command("info")
@click.argument("agent_id")
def agent_info(agent_id):
    """Show detailed information about an Agent"""
    identity_path = Path(f"~/.openclaw/agents/{agent_id}/identity.yaml").expanduser()
    config_path = Path(f"~/.openclaw/agents/{agent_id}/.openclaw/config.json").expanduser()

    if not identity_path.exists():
        click.echo(click.style(f"Agent '{agent_id}' not found.", fg="red"), err=True)
        raise SystemExit(1)

    with open(identity_path) as f:
        identity = yaml.safe_load(f) or {}

    click.echo(yaml.dump(identity, allow_unicode=True, default_flow_style=False))

    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
        click.echo("Runtime config:")
        click.echo(json.dumps(config, indent=2, ensure_ascii=False))


@agent.command("add-skill")
@click.argument("agent_id")
@click.argument("skill_name")
def agent_add_skill(agent_id, skill_name):
    """Add a Skill to an Agent"""
    from core.scaffolder import AgentScaffolder
    try:
        AgentScaffolder().add_skill_to_agent(agent_id, skill_name)
        click.echo(click.style(f"Skill '{skill_name}' added to {agent_id}", fg="green"))
    except FileNotFoundError as e:
        click.echo(click.style(str(e), fg="red"), err=True)


@agent.command("delete")
@click.argument("agent_id")
@click.option("--yes", is_flag=True, help="Skip confirmation")
def agent_delete(agent_id, yes):
    """Delete an Agent instance"""
    import shutil
    agent_dir = Path(f"~/.openclaw/agents/{agent_id}").expanduser()
    if not agent_dir.exists():
        click.echo(click.style(f"Agent '{agent_id}' not found.", fg="red"), err=True)
        raise SystemExit(1)

    if not yes:
        click.confirm(f"Delete agent '{agent_id}' and all its data?", abort=True)

    shutil.rmtree(agent_dir)

    # Release port
    from core.port_manager import PortManager
    PortManager().release(agent_id)

    click.echo(click.style(f"Agent '{agent_id}' deleted.", fg="green"))


# ─── Platform Commands ───────────────────────────────────────────────────

@cli.group()
def platform():
    """Platform management commands"""
    pass


@platform.command("start")
@click.option("--port", default=18789, help="Main platform port")
@click.option("--host", default="0.0.0.0", help="Host to bind")
@click.option("--debug", is_flag=True, help="Enable debug mode")
def platform_start(port, host, debug):
    """Start the OpenClaw platform server"""
    import asyncio
    from aiohttp import web

    async def run_platform():
        ensure_openclaw_dir()

        app = web.Application()

        # Setup heartbeat monitor
        from services.heartbeat import HeartbeatMonitor
        heartbeat_monitor = HeartbeatMonitor()

        # Setup topology manager
        from core.topology_manager import TopologyManager
        topology_manager = TopologyManager()

        # Setup report engine
        from services.report_engine import ReportEngine, ReportPermissionChecker
        topo = topology_manager.load()
        report_engine = ReportEngine(topo)
        perm_checker = ReportPermissionChecker(topo)

        # Register dashboard routes
        from api.dashboard import DashboardAPI
        dashboard = DashboardAPI(topology_manager, heartbeat_monitor, report_engine)
        dashboard.register(app)

        # Register report routes
        from api.reports import ReportRoutes
        report_routes = ReportRoutes(report_engine, perm_checker, topology_manager)
        report_routes.register(app)

        # Heartbeat endpoint
        async def handle_heartbeat(request):
            body = await request.json()
            await heartbeat_monitor.receive_heartbeat(
                body["agent_id"], body["timestamp"]
            )
            return web.json_response({"status": "ok"})

        app.router.add_post("/api/v1/heartbeat", handle_heartbeat)

        # Agents card endpoints
        async def handle_agents_cards(request):
            base = Path("~/.openclaw/agents").expanduser()
            agents = []
            if base.exists():
                for agent_dir in base.iterdir():
                    if not agent_dir.is_dir():
                        continue
                    identity_path = agent_dir / "identity.yaml"
                    if identity_path.exists():
                        with open(identity_path) as f:
                            identity = yaml.safe_load(f) or {}
                        a = identity.get("agent", {})
                        from core.port_manager import PortManager
                        port_val = PortManager().get_port(a.get("id", ""))
                        agents.append({
                            "agent_id": a.get("id", ""),
                            "name": a.get("display_name", a.get("id", "")),
                            "description": a.get("role", ""),
                            "url": f"http://localhost:{port_val}" if port_val else "",
                            "skills": a.get("capabilities", {}).get("skills", []),
                        })
            return web.json_response({"agents": agents})

        app.router.add_get("/api/v1/agents/cards", handle_agents_cards)

        # Serve static frontend
        frontend_path = Path(__file__).parent / "frontend"
        if frontend_path.exists():
            app.router.add_static("/static", frontend_path / "static")
            async def serve_index(request):
                index_path = frontend_path / "index.html"
                if index_path.exists():
                    return web.FileResponse(index_path)
                return web.Response(text="OpenClaw Platform API", content_type="text/plain")
            app.router.add_get("/", serve_index)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, host, port)
        await site.start()

        click.echo(click.style(f"OpenClaw Platform started!", fg="green"))
        click.echo(f"  API:       http://{host}:{port}")
        click.echo(f"  Dashboard: http://{host}:{port}/")
        click.echo("  Press Ctrl+C to stop")

        try:
            while True:
                await asyncio.sleep(3600)
        except asyncio.CancelledError:
            pass
        finally:
            await runner.cleanup()

    try:
        asyncio.run(run_platform())
    except KeyboardInterrupt:
        click.echo("\nPlatform stopped.")


@platform.command("deploy")
@click.option("--org-file", default="~/.openclaw/organization.yaml",
              help="Organization YAML file path")
def platform_deploy(org_file):
    """Deploy all Agents from organization.yaml"""
    from core.deployer import PlatformDeployer
    try:
        deployer = PlatformDeployer()
        results = deployer.deploy_from_organization(org_file)
        click.echo(click.style(f"Deployed {len(results)} agents:", fg="green"))
        for r in results:
            click.echo(f"  {r['agent_id']:20s} port={r['port']} type={r['type']}")
    except FileNotFoundError as e:
        click.echo(click.style(str(e), fg="red"), err=True)


@platform.command("init")
def platform_init():
    """Initialize the OpenClaw platform directory structure"""
    base = ensure_openclaw_dir()

    # Create default platform.yaml
    platform_config_path = base / "platform.yaml"
    if not platform_config_path.exists():
        platform_config = {
            "platform": {
                "version": "1.0.0",
                "port_range": {"start": 18789, "end": 18900},
                "redis_url": "redis://localhost:6379",
            }
        }
        with open(platform_config_path, "w") as f:
            yaml.dump(platform_config, f, allow_unicode=True, default_flow_style=False)

    # Create default organization.yaml
    org_path = base / "organization.yaml"
    if not org_path.exists():
        org = {"organization": {"topology": {"agents": [], "groups": []}}}
        with open(org_path, "w") as f:
            yaml.dump(org, f, allow_unicode=True, default_flow_style=False)

    # Create default skill registry
    skill_registry_dir = base / "skills"
    skill_registry_dir.mkdir(parents=True, exist_ok=True)
    skill_registry_path = skill_registry_dir / "registry.yaml"
    if not skill_registry_path.exists():
        registry = {
            "skills": [
                {
                    "name": "web-search",
                    "version": "1.0.0",
                    "type": "tool",
                    "runtime": "python",
                    "entrypoint": "skills/core/web_search.py",
                    "config_schema": {
                        "provider": {"type": "enum", "values": ["brave", "perplexity", "serper"], "default": "brave"},
                        "api_key": {"type": "secret", "required": True},
                    }
                },
                {
                    "name": "shell-execute",
                    "version": "1.0.0",
                    "type": "tool",
                    "runtime": "python",
                    "entrypoint": "skills/core/shell_execute.py",
                    "config_schema": {
                        "allowed_commands": {"type": "list", "default": ["*"]},
                        "sandbox": {"type": "boolean", "default": True},
                        "timeout": {"type": "integer", "default": 30},
                    }
                },
                {
                    "name": "claude-code",
                    "version": "1.0.0",
                    "type": "cli_agent",
                    "runtime": "python",
                    "entrypoint": "skills/cli_agents/claude_code.py",
                },
                {
                    "name": "codex-cli",
                    "version": "1.0.0",
                    "type": "cli_agent",
                    "runtime": "python",
                    "entrypoint": "skills/cli_agents/codex.py",
                },
                {
                    "name": "opencode",
                    "version": "1.0.0",
                    "type": "cli_agent",
                    "runtime": "python",
                    "entrypoint": "skills/cli_agents/opencode.py",
                },
            ]
        }
        with open(skill_registry_path, "w") as f:
            yaml.dump(registry, f, allow_unicode=True, default_flow_style=False)

    click.echo(click.style("OpenClaw platform initialized!", fg="green"))
    click.echo(f"  Config dir: {base}")


# ─── MCP Commands ────────────────────────────────────────────────────────

@cli.group()
def mcp():
    """MCP Server management commands"""
    pass


@mcp.command("list")
@click.option("--category", default=None, help="Filter by category")
def mcp_list(category):
    """List all registered MCP Servers"""
    from services.mcp_manager import MCPRegistry
    registry = MCPRegistry()

    if not registry.servers:
        click.echo("No MCP servers registered.")
        return

    if category:
        servers = {k: v for k, v in registry.servers.items() if v.category == category}
    else:
        servers = registry.servers

    current_category = None
    for name, config in sorted(servers.items(), key=lambda x: (x[1].category, x[0])):
        if config.category != current_category:
            current_category = config.category
            click.echo(click.style(f"\n[{current_category}]", fg="blue"))
        status = click.style("enabled", fg="green") if config.enabled else click.style("disabled", fg="red")
        click.echo(f"  {name:20s} {status:12s}  {config.description}")


@mcp.command("enable")
@click.argument("name")
@click.option("--agent", default=None, help="Enable for specific Agent only")
def mcp_enable(name, agent):
    """Enable an MCP Server"""
    from services.mcp_manager import MCPRegistry
    registry = MCPRegistry()
    if name not in registry.servers:
        click.echo(click.style(f"MCP Server '{name}' not found.", fg="red"), err=True)
        raise SystemExit(1)
    registry.enable(name, agent)
    target = f"agent '{agent}'" if agent else "globally"
    click.echo(click.style(f"Enabled '{name}' {target}.", fg="green"))


@mcp.command("disable")
@click.argument("name")
@click.option("--agent", default=None, help="Disable for specific Agent only")
def mcp_disable(name, agent):
    """Disable an MCP Server"""
    from services.mcp_manager import MCPRegistry
    registry = MCPRegistry()
    registry.disable(name, agent)
    target = f"agent '{agent}'" if agent else "globally"
    click.echo(f"Disabled '{name}' {target}.")


@mcp.command("status")
def mcp_status():
    """Show MCP Server runtime status"""
    from services.mcp_manager import MCPRegistry, MCPManager
    registry = MCPRegistry()
    manager = MCPManager(registry)
    status = manager.get_status()

    if not status:
        click.echo("No MCP servers found.")
        return

    click.echo(f"{'Name':20s} {'Category':15s} {'Transport':12s} {'Enabled':8s} {'Running':8s}")
    click.echo("-" * 65)
    for name, info in sorted(status.items()):
        enabled = click.style("yes", fg="green") if info["enabled"] else click.style("no", fg="red")
        running = click.style("yes", fg="green") if info["running"] else "no"
        click.echo(f"{name:20s} {info['category']:15s} {info['transport']:12s} {enabled:15s} {running}")


# ─── Skill Commands ──────────────────────────────────────────────────────

@cli.group()
def skill():
    """Skill management commands"""
    pass


@skill.command("list")
def skill_list():
    """List all available Skills"""
    from core.skill_loader import SkillLoader
    loader = SkillLoader()
    skills = loader.registry.get("skills", [])

    if not skills:
        click.echo("No skills registered.")
        return

    click.echo(f"{'Name':20s} {'Type':12s} {'Runtime':10s} {'Version':8s}")
    click.echo("-" * 52)
    for s in skills:
        click.echo(f"{s.get('name', ''):20s} {s.get('type', ''):12s} {s.get('runtime', ''):10s} {s.get('version', ''):8s}")


# ─── KB Commands ─────────────────────────────────────────────────────────

@cli.group()
def kb():
    """Knowledge Base management commands"""
    pass


@kb.command("create")
@click.option("--id", "kb_id", required=True, help="Knowledge base ID")
@click.option("--name", required=True, help="Display name")
@click.option("--type", "kb_type", default="shared",
              type=click.Choice(["shared", "group", "private"]))
@click.option("--description", default="", help="Description")
@click.option("--owner", default=None, help="Owner Agent ID (for private/group)")
def kb_create(kb_id, name, kb_type, description, owner):
    """Create a new Knowledge Base"""
    from knowledge.kb_manager import KnowledgeBaseManager
    from models.knowledge_base import KnowledgeBase, KBType

    manager = KnowledgeBaseManager()
    kb_obj = KnowledgeBase(
        id=kb_id,
        name=name,
        description=description,
        kb_type=KBType(kb_type),
        owner=owner,
        accessible_by_all=(kb_type == "shared"),
    )
    result = manager.create_kb(kb_obj)
    click.echo(click.style(f"Knowledge base '{kb_id}' created!", fg="green"))
    click.echo(f"  Documents path: {result.documents_path}")


@kb.command("list")
def kb_list():
    """List all Knowledge Bases"""
    from knowledge.kb_manager import KnowledgeBaseManager
    manager = KnowledgeBaseManager()

    kb_dir = manager.KB_DIR
    if not kb_dir.exists():
        click.echo("No knowledge bases found.")
        return

    found = False
    for type_dir in kb_dir.iterdir():
        if not type_dir.is_dir():
            continue
        for kb_dir_item in type_dir.iterdir():
            config_path = kb_dir_item / "config.yaml"
            if config_path.exists():
                found = True
                with open(config_path) as f:
                    data = yaml.safe_load(f)
                click.echo(f"  {data.get('id', ''):20s} [{data.get('type', ''):8s}]  {data.get('name', '')}")

    if not found:
        click.echo("No knowledge bases found.")


# ─── Topology Commands ───────────────────────────────────────────────────

@cli.group()
def topology():
    """Topology management commands"""
    pass


@topology.command("show")
def topology_show():
    """Show the current organization topology"""
    from core.topology_manager import TopologyManager
    tm = TopologyManager()
    topo = tm.load()

    if not topo.nodes:
        click.echo("No topology found. Create agents first.")
        return

    errors = topo.validate()
    if errors:
        click.echo(click.style("Topology validation errors:", fg="red"))
        for e in errors:
            click.echo(f"  - {e}")

    click.echo("\nOrganization Topology:")
    for agent_id, node in topo.nodes.items():
        parent = f"→ {node.parent_id}" if node.parent_id else "(root)"
        children = f"  children: [{', '.join(node.children_ids)}]" if node.children_ids else ""
        click.echo(f"  {agent_id:20s} {parent} {children}")


@topology.command("mermaid")
def topology_mermaid():
    """Export topology as Mermaid diagram"""
    from core.topology_manager import TopologyManager
    mermaid = TopologyManager().export_mermaid()
    click.echo(mermaid)


# ─── Entry Point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli()
