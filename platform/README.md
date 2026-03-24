# OpenClaw Platform

Multi-Agent Orchestration System — v1.0

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize platform
python main.py platform init

# Create your first agent
python main.py agent create --id agent-root --template manager --name "Root Agent"
python main.py agent create --id agent-worker --template worker --reports-to agent-root

# Start the platform
python main.py platform start
```

## Architecture

```
~/.openclaw/
├── organization.yaml     # Agent topology
├── platform.yaml         # Platform config
├── agents/               # Per-agent data
│   └── <agent-id>/
│       ├── identity.yaml
│       ├── .openclaw/config.json
│       ├── workspace/
│       ├── memory/
│       ├── reports/
│       └── chats/
├── skills/registry.yaml
├── mcp/registry.yaml
└── knowledge-bases/
```

## CLI Reference

```
openclaw agent create   --id <id> [--template worker|manager] [--reports-to <id>]
openclaw agent list
openclaw agent info     <id>
openclaw agent delete   <id>
openclaw platform init
openclaw platform start [--port 18789]
openclaw platform deploy
openclaw mcp list
openclaw mcp enable     <name>
openclaw skill list
openclaw topology show
openclaw topology mermaid
```

## License

MIT
