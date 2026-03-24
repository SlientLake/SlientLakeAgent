#!/bin/bash
# create-agent.sh - 创建新 Agent 的脚手架脚本
# 用法: ./create-agent.sh <agent-id> <display-name> [port]
# 示例: ./create-agent.sh 010 "数据分析师" 18798

set -e

AGENT_ID="$1"
DISPLAY_NAME="$2"
PORT="${3:-18799}"
BASE_DIR="$HOME/.openclaw/agents/${AGENT_ID}"
WORKSPACE_DIR="$HOME/.openclaw/workspace-agent-${AGENT_ID}"

if [ -z "$AGENT_ID" ] || [ -z "$DISPLAY_NAME" ]; then
  echo "用法: $0 <agent-id> <display-name> [port]"
  echo "示例: $0 010 '数据分析师' 18798"
  exit 1
fi

echo "创建 Agent: ${AGENT_ID} (${DISPLAY_NAME}) 端口: ${PORT}"

# 创建 agent 基础目录结构
mkdir -p "${BASE_DIR}/.openclaw/cron"
mkdir -p "${BASE_DIR}/.openclaw/credentials"
mkdir -p "${BASE_DIR}/memory"
mkdir -p "${BASE_DIR}/reports"
mkdir -p "${BASE_DIR}/chats"

# 创建 workspace 目录
mkdir -p "${WORKSPACE_DIR}/memory"

# 创建 IDENTITY.md
cat > "${WORKSPACE_DIR}/IDENTITY.md" << EOF
# IDENTITY.md - Who Am I?

- **Name:** ${DISPLAY_NAME}
- **ID:** ${AGENT_ID}
- **Creature:** AI Assistant
- **Vibe:** Professional, helpful, proactive
- **Emoji:** 🐾
EOF

# 复制标准 SOUL.md（从 main agent 继承）
if [ -f "$HOME/.openclaw/workspace/SOUL.md" ]; then
  cp "$HOME/.openclaw/workspace/SOUL.md" "${WORKSPACE_DIR}/SOUL.md"
  echo "  ✓ SOUL.md 已从 main 复制"
fi

# 复制标准 AGENTS.md
if [ -f "$HOME/.openclaw/workspace/AGENTS.md" ]; then
  cp "$HOME/.openclaw/workspace/AGENTS.md" "${WORKSPACE_DIR}/AGENTS.md"
  echo "  ✓ AGENTS.md 已从 main 复制"
fi

# 创建 identity.yaml
cat > "${BASE_DIR}/identity.yaml" << EOF
agent:
  id: "${AGENT_ID}"
  display_name: "${DISPLAY_NAME}"
  port: ${PORT}
  workspace: "${WORKSPACE_DIR}"
  template: "worker"

  capabilities:
    skills: ["web-search", "shell-execute", "feishu-toolkit"]
    mcp_servers: []
    knowledge_bases: []

  resources:
    gateway: true
    cron: true
    heartbeat: true
    memory: true

  persona:
    language: "zh-CN"
    communication_style: "concise"
EOF

echo ""
echo "✅ Agent ${AGENT_ID} 创建完成:"
echo "   目录: ${BASE_DIR}"
echo "   工作区: ${WORKSPACE_DIR}"
echo ""
echo "下一步：在 ~/.openclaw/openclaw.json 的 agents.list 中添加此 agent 配置"
