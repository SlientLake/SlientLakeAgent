# 🌊 SilentLake — 多 Agent 协作平台

<p align="center">
  <img src="https://raw.githubusercontent.com/SlientLake/SlientLakeAgent/main/assets/silentlake-banner.png" alt="SilentLake" width="560">
</p>

<p align="center">
  <strong>9 Agent · 多级组织 · 实时协作 · 本地优先</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/基于-OpenClaw-ff6b35?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyeiIvPjwvc3ZnPg==" alt="Based on OpenClaw">
  <img src="https://img.shields.io/badge/版本-2026.4.19-4fc3f7?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/npm-silentlake-cb3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm silentlake">
  <img src="https://img.shields.io/badge/Node-22%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 22+">
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776ab?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License">
</p>

---

**SilentLake** 是基于 [OpenClaw](https://github.com/openclaw/openclaw) 的多 Agent 协作平台二开版本。

在 OpenClaw 单助手能力的基础上，SilentLake 构建了一套 **9 Agent 多级组织架构**：总指挥统筹全局，各职能 Agent 分工协作，通过实时 A2A 消息通道、拓扑可视化和知识库共享，形成一个完整的 AI 团队。

> 如果说 OpenClaw 是"你的个人 AI 助手"，SilentLake 就是"你的 AI 团队"。

---

## 组织架构

```
总指挥 (Commander)
├── 首席执行官 (CEO)
│   ├── 产品经理 (PM)
│   ├── 工程师 (Engineer)
│   └── 设计师 (Designer)
├── 首席运营官 (COO)
│   ├── 运营专员 (Operations)
│   └── 数据分析师 (Analyst)
└── 首席内容官 (CCO)
    └── 内容创作者 (Creator)
```

每个 Agent 可独立配置模型、Coding Skill、工作优先级，并通过 A2A 通道互相汇报和协作。

---

## 相对上游新增功能

### 🖥️ UI 前端

| 功能                   | 说明                                                         |
| ---------------------- | ------------------------------------------------------------ |
| **聊天室**             | 飞书风格多房间聊天，支持 @mention Agent、实时 WebSocket 推送 |
| **组织拓扑图**         | SVG 力导向图，可视化 9 Agent 层级与协作关系，可拖拽节点      |
| **MCP 管理**           | 查看已注册 MCP Server，按 category 分组，一键启用/禁用       |
| **知识库管理**         | 创建/删除知识库，支持 vector/doc/graph 多种类型              |
| **per-Agent 模型配置** | 每个 Agent 独立选择主模型和 fallback 模型                    |
| **zh-CN 完整翻译**     | 全 UI 中英双语，默认中文，语言选择器随时切换                 |

### ⌨️ CLI 命令

```bash
# 查看组织拓扑（表格 / Mermaid / JSON）
silentlake topology
silentlake topology --mermaid
silentlake topology --json

# 查看 Agent 汇报记录
silentlake report list
silentlake report list <agent-id> --limit 20

# 知识库管理
silentlake kb list
silentlake kb create --id my-kb --name "研发知识库" --type vector
silentlake kb delete <id>

# Coding Skill 管理（per-Agent）
silentlake skills coding list
silentlake skills coding set claude-code
```

### 🔗 平台集成

| 模块                     | 说明                                                            |
| ------------------------ | --------------------------------------------------------------- |
| **A2A 消息通道**         | `A2AChannel` 类，REST + WebSocket 持久化 Agent 间通信           |
| **心跳注册**             | Gateway 启动时自动注册到 Python 平台，每 60 秒心跳              |
| **Python 平台 REST API** | 新增 MCP/KB/心跳/A2A 路由，aiohttp 实现                         |
| **CLI 中文化**           | `OPENCLAW_LANG=zh-CN` 启用中文终端输出，banner 显示中文 tagline |

### 🧩 Skills 占位

| Skill            | 状态 | 说明                                |
| ---------------- | ---- | ----------------------------------- |
| `kimi-code` 🌙   | 占位 | 月之暗面 Kimi Code CLI 发布后激活   |
| `doubao-code` 🫘 | 占位 | 字节跳动 Doubao Code CLI 发布后激活 |

---

## 安装

### npm 安装（推荐）

```bash
npm install -g silentlake
# 或
pnpm add -g silentlake
```

安装后运行引导向导：

```bash
silentlake onboard --install-daemon
```

---

## 快速开始

### 环境要求

- Node.js 22+
- Python 3.10+
- pnpm 8+

### 1. 启动 Python 平台

```bash
cd platform
pip install -e .

# 启动 Dashboard（http://localhost:18800）
oc-platform platform start
```

### 2. 构建并启动 SilentLake

```bash
cd SlientLake

# 安装依赖
pnpm install

# 构建 UI
cd ui && pnpm build && cd ..

# 构建 CLI
pnpm build

# 启动 Gateway（自动注册到 Python 平台）
silentlake gateway --port 18789
```

### 3. 打开控制台

浏览器访问 `http://localhost:18789` 即可看到 SilentLake 控制台，包含聊天室、拓扑图、MCP 管理、知识库等所有新功能。

---

## 前端开发

```bash
cd SlientLake/ui

# 热重载开发
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm tsgo
```

---

## 目录结构（二开关键路径）

```
silentlake/                        ← 仓库根目录
├── platform/                      ← Python 平台（oc-platform）
│   ├── api/                       #   REST API（Dashboard、MCP、KB、A2A、心跳）
│   ├── core/                      #   核心调度逻辑
│   ├── services/                  #   MCP / A2A / KB 服务
│   ├── knowledge/                 #   知识库管理
│   ├── main.py                    #   平台入口
│   └── requirements.txt
├── src/
│   ├── cli/
│   │   ├── topology-cli.ts        # openclaw topology 命令
│   │   ├── report-cli.ts          # openclaw report 命令
│   │   ├── kb-cli.ts              # openclaw kb 命令
│   │   └── skills-cli.ts          # openclaw skills coding 命令（扩展）
│   ├── platform/
│   │   ├── register.ts            # Gateway 心跳注册
│   │   └── a2a-channel.ts         # A2A Agent 间消息通道
│   └── terminal/
│       └── locale.ts              # CLI 中文化（tt() / getTerminalLocale()）
├── ui/src/ui/
│   ├── views/
│   │   ├── chatroom.ts            # 聊天室 UI
│   │   ├── topology.ts            # 拓扑图 UI
│   │   ├── mcp-manager.ts         # MCP 管理 UI
│   │   └── kb-manager.ts          # 知识库管理 UI
│   └── navigation.ts              # 导航 tab 注册
├── skills/
│   ├── kimi-code/SKILL.md         # Kimi Code 占位 skill
│   └── doubao-code/SKILL.md       # Doubao Code 占位 skill
└── SILENTLAKE.md                  # 本文件
```

---

## 配置 CLI 中文

```bash
# 临时
OPENCLAW_LANG=zh-CN openclaw topology

# 永久（写入 ~/.profile 或 ~/.bashrc）
export OPENCLAW_LANG=zh-CN
```

---

## 二开计划文档

详细任务说明和完成记录见：

```
二开v1版本/04_二开承接指引手册_v1.0.md
```

---

## 上游项目

SilentLake 基于 [OpenClaw](https://github.com/openclaw/openclaw) 构建，保留全部上游能力（多渠道消息、插件体系、模型切换等）。

上游文档：[docs.openclaw.ai](https://docs.openclaw.ai)

---

<p align="center">
  🌊 SilentLake · 多 Agent 协作，静水流深
</p>
