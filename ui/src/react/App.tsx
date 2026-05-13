import { startTransition, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Activity,
  Bot,
  Boxes,
  Bug,
  Cable,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  FolderKanban,
  Gauge,
  Globe,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  Network,
  Plus,
  Radio,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
} from "lucide-react";
import {
  appendTaskMessage,
  appendTaskReport,
  createTaskChain,
  deleteMcpServer,
  extractGatewayChatEvent,
  fetchAgentMcp,
  fetchMcpServer,
  fetchMcpServers,
  fetchOverview,
  fetchTaskChains,
  fetchTopology,
  parseLogLine,
  rpcAgentsList,
  rpcApproveDevice,
  rpcCallMethod,
  rpcChannelsStatus,
  rpcChatAbort,
  rpcChatHistory,
  rpcChatSend,
  rpcConfigApply,
  rpcConfigGet,
  rpcConfigSchema,
  rpcConfigSet,
  rpcCronAdd,
  rpcCronJobs,
  rpcCronRemove,
  rpcCronRun,
  rpcCronRuns,
  rpcCronStatus,
  rpcCronUpdate,
  rpcDeleteSession,
  rpcHealth,
  rpcLastHeartbeat,
  rpcLoadDevices,
  rpcLogsTail,
  rpcModelsList,
  rpcNodesList,
  rpcPatchSession,
  rpcRejectDevice,
  rpcRevokeDeviceToken,
  rpcRotateDeviceToken,
  rpcRunUpdate,
  rpcSessionsList,
  rpcSkillsInstall,
  rpcSkillsStatus,
  rpcSkillsUpdate,
  rpcStartWhatsAppLogin,
  rpcStatus,
  rpcToolsCatalog,
  rpcUsageCost,
  rpcUsageSessions,
  rpcWaitWhatsAppLogin,
  rpcLogoutWhatsApp,
  saveMcpServer,
  toggleMcpServer,
  updateMcpServer,
  updateTaskChain,
} from "./api";
import { GatewayBrowserClient, type GatewayHelloOk } from "./lib/gateway";
import { loadSettings, persistSettings } from "./lib/storage";
import { generateUUID } from "./lib/uuid";
import type {
  AgentsListResult,
  ChannelsStatusSnapshot,
  ConfigSchemaResponse,
  ConfigSnapshot,
  CostUsageSummary,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  DashboardOverview,
  DevicePairingList,
  LogEntry,
  MCPServer,
  SessionsListResult,
  SessionsUsageResult,
  SkillStatusReport,
  TaskChain,
  TopologyResponse,
  ToolsCatalogResult,
} from "./types";

type TabKey =
  | "chat"
  | "chatroom"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "agents"
  | "skills"
  | "nodes"
  | "topology"
  | "tasks"
  | "mcp"
  | "config"
  | "communications"
  | "appearance"
  | "automation"
  | "infrastructure"
  | "aiAgents"
  | "debug"
  | "logs";

const TABS: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "chat", label: "会话聊天", icon: MessageCircle },
  { key: "chatroom", label: "协作聊天室", icon: MessageSquareText },
  { key: "overview", label: "总览", icon: LayoutDashboard },
  { key: "channels", label: "渠道", icon: Cable },
  { key: "instances", label: "实例", icon: Radio },
  { key: "sessions", label: "会话", icon: FolderKanban },
  { key: "usage", label: "用量", icon: Gauge },
  { key: "cron", label: "Cron", icon: Clock3 },
  { key: "agents", label: "Agents", icon: Users },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "nodes", label: "Nodes", icon: Cpu },
  { key: "topology", label: "组织拓扑", icon: Network },
  { key: "tasks", label: "任务看板", icon: Boxes },
  { key: "mcp", label: "MCP 注册中心", icon: ShieldCheck },
  { key: "config", label: "配置中心", icon: Globe },
  { key: "communications", label: "通信", icon: Send },
  { key: "appearance", label: "外观", icon: Sparkles },
  { key: "automation", label: "自动化", icon: TerminalSquare },
  { key: "infrastructure", label: "基础设施", icon: Globe },
  { key: "aiAgents", label: "AI Agents", icon: Bot },
  { key: "debug", label: "调试", icon: Bug },
  { key: "logs", label: "日志", icon: ScrollText },
];

const EMPTY_TASK_FORM = {
  title: "",
  description: "",
  owner_agent: "001",
  priority: "medium",
  due_at: "",
  source_room_id: "",
};

const EMPTY_MESSAGE_FORM = {
  sender: "pm-console",
  content: "",
  room_id: "",
};

const EMPTY_REPORT_FORM = {
  reporter: "pm-console",
  recipient: "001",
  summary: "",
  background: "",
  approach: "",
  expected_outcome: "",
};

const EMPTY_MCP_FORM = {
  name: "",
  description: "",
  category: "general",
  transport: "stdio",
  command: "",
  url: "",
  version: "",
  owner: "",
  docs_url: "",
  tags: "",
  dependency_names: "",
  allowed_agents: "",
  allowed_groups: "",
  enabled: false,
  auto_start: false,
  health_path: "",
};

function formatTime(value?: string | null): string {
  if (!value) {
    return "未设置";
  }
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function normalizeCsv(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const CONFIG_SECTION_KEYS: Record<
  "communications" | "appearance" | "automation" | "infrastructure" | "aiAgents",
  string[]
> = {
  communications: ["channels", "communications", "gateway", "webchat", "slack", "discord", "telegram", "whatsapp", "signal", "googleChat", "nostr", "imessage"],
  appearance: ["controlUi", "appearance", "ui", "theme", "terminal", "chat"],
  automation: ["hooks", "commands", "bindings", "approvals", "cron", "automation"],
  infrastructure: ["gateway", "web", "browser", "discovery", "media", "nodeHosts", "mcp", "infrastructure"],
  aiAgents: ["agents", "models", "skills", "aiAgents", "prompts"],
};

const CRON_TEMPLATE = `{
  "name": "daily-sync",
  "description": "Daily SilentLake sync",
  "enabled": true,
  "schedule": { "kind": "cron", "expr": "0 9 * * *" },
  "sessionTarget": "main",
  "wakeMode": "session",
  "payload": { "kind": "agentTurn", "text": "汇总今日任务并给出推进建议" }
}`;

function safeStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON 必须是对象");
  }
  return parsed as Record<string, unknown>;
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return parseJsonObject(raw);
  } catch {
    return null;
  }
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return String(message ?? "");
  }
  const record = message as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (Array.isArray(record.content)) {
    return record.content
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }
        const block = entry as Record<string, unknown>;
        if (typeof block.text === "string") {
          return block.text;
        }
        return typeof block.type === "string" ? `[${block.type}]` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function buildSectionDrafts(config: Record<string, unknown> | null): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const key of Object.values(CONFIG_SECTION_KEYS).flat()) {
    drafts[key] = safeStringify(config?.[key] ?? {});
  }
  return drafts;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [tasks, setTasks] = useState<TaskChain[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedMcpName, setSelectedMcpName] = useState<string>("");
  const [agentLookupId, setAgentLookupId] = useState("001");
  const [agentServers, setAgentServers] = useState<string[]>([]);
  const [taskFilter, setTaskFilter] = useState({
    search: "",
    status: "all",
    owner: "all",
    priority: "all",
  });
  const [mcpFilter, setMcpFilter] = useState({ search: "", category: "all" });
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [taskEdit, setTaskEdit] = useState<Record<string, string>>({});
  const [messageForm, setMessageForm] = useState(EMPTY_MESSAGE_FORM);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT_FORM);
  const [mcpForm, setMcpForm] = useState(EMPTY_MCP_FORM);
  const [banner, setBanner] = useState<string>("");
  const [loading, setLoading] = useState({ shell: true, tasks: false, mcp: false });
  const [settings, setSettings] = useState(() => loadSettings());
  const [password, setPassword] = useState("");
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [gatewayHello, setGatewayHello] = useState<GatewayHelloOk | null>(null);
  const [gatewayError, setGatewayError] = useState("");
  const [gatewayBusy, setGatewayBusy] = useState(false);

  const [agentsList, setAgentsList] = useState<AgentsListResult | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [toolsCatalog, setToolsCatalog] = useState<ToolsCatalogResult | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState("");

  const [sessionsResult, setSessionsResult] = useState<SessionsListResult | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsFilterActive, setSessionsFilterActive] = useState("60");
  const [sessionsFilterLimit, setSessionsFilterLimit] = useState("50");
  const [sessionsIncludeGlobal, setSessionsIncludeGlobal] = useState(true);
  const [sessionsIncludeUnknown, setSessionsIncludeUnknown] = useState(false);

  const [channelsSnapshot, setChannelsSnapshot] = useState<ChannelsStatusSnapshot | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState("");
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [whatsAppQr, setWhatsAppQr] = useState<string | null>(null);
  const [whatsAppConnected, setWhatsAppConnected] = useState<boolean | null>(null);

  const [logsEntries, setLogsEntries] = useState<LogEntry[]>([]);
  const [logsCursor, setLogsCursor] = useState<number | null>(null);
  const [logsFile, setLogsFile] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logsTruncated, setLogsTruncated] = useState(false);

  const [devicesList, setDevicesList] = useState<DevicePairingList | null>(null);
  const [devicesError, setDevicesError] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [nodes, setNodes] = useState<Array<Record<string, unknown>>>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState("");

  const [skillsReport, setSkillsReport] = useState<SkillStatusReport | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [skillsBusyKey, setSkillsBusyKey] = useState<string | null>(null);
  const [skillEdits, setSkillEdits] = useState<Record<string, string>>({});
  const [skillMessages, setSkillMessages] = useState<Record<string, { kind: "success" | "error"; message: string }>>({});

  const [usageStartDate, setUsageStartDate] = useState("");
  const [usageEndDate, setUsageEndDate] = useState("");
  const [usageResult, setUsageResult] = useState<SessionsUsageResult | null>(null);
  const [usageCost, setUsageCost] = useState<CostUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronRuns, setCronRuns] = useState<CronRunLogEntry[]>([]);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState("");
  const [cronEditorMode, setCronEditorMode] = useState<"create" | "update">("create");
  const [selectedCronJobId, setSelectedCronJobId] = useState("");
  const [cronEditorRaw, setCronEditorRaw] = useState(CRON_TEMPLATE);

  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [configSchema, setConfigSchema] = useState<ConfigSchemaResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [configRaw, setConfigRaw] = useState("{}");
  const [configDirty, setConfigDirty] = useState(false);
  const [configSectionDrafts, setConfigSectionDrafts] = useState<Record<string, string>>({});

  const [debugStatus, setDebugStatus] = useState<Record<string, unknown> | null>(null);
  const [debugHealth, setDebugHealth] = useState<Record<string, unknown> | null>(null);
  const [debugModels, setDebugModels] = useState<unknown[]>([]);
  const [debugHeartbeat, setDebugHeartbeat] = useState<Record<string, unknown> | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState("");
  const [debugCallMethod, setDebugCallMethod] = useState("status");
  const [debugCallParams, setDebugCallParams] = useState("{}");
  const [debugCallResult, setDebugCallResult] = useState("");

  const [chatMessages, setChatMessages] = useState<unknown[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatRunId, setChatRunId] = useState<string | null>(null);
  const [chatStream, setChatStream] = useState("");

  const clientRef = useRef<GatewayBrowserClient | null>(null);

  useEffect(() => {
    void reloadShell();
    void reloadTasks();
    void reloadMcp();
    if (typeof WebSocket !== "undefined") {
      connectGateway();
    } else {
      setGatewayError("当前环境不支持 WebSocket，旧控制台模块无法接入。");
    }
    return () => {
      clientRef.current?.stop();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      setSelectedTaskId(tasks[0].task_id);
    }
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    const selectedTask = tasks.find((task) => task.task_id === selectedTaskId);
    if (!selectedTask) {
      setTaskEdit({});
      setMessageForm(EMPTY_MESSAGE_FORM);
      setReportForm(EMPTY_REPORT_FORM);
      return;
    }
    setTaskEdit({
      title: selectedTask.title,
      description: selectedTask.description,
      owner_agent: selectedTask.owner_agent,
      priority: selectedTask.priority,
      due_at: selectedTask.due_at ?? "",
      source_room_id: selectedTask.source_room_id ?? "",
      blocked_reason: selectedTask.blocked_reason ?? "",
      participants: selectedTask.participants.join(", "),
    });
    setMessageForm({
      sender: "pm-console",
      content: "",
      room_id: selectedTask.source_room_id ?? "",
    });
    setReportForm({
      reporter: selectedTask.owner_agent,
      recipient: selectedTask.origin_agent,
      summary: "",
      background: "",
      approach: "",
      expected_outcome: "",
    });
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!selectedMcpName && mcpServers[0]) {
      setSelectedMcpName(mcpServers[0].name);
    }
  }, [mcpServers, selectedMcpName]);

  useEffect(() => {
    if (!selectedAgentId && agentsList?.agents?.[0]?.id) {
      setSelectedAgentId(agentsList.agents[0].id);
    }
  }, [agentsList, selectedAgentId]);

  useEffect(() => {
    if (!selectedCronJobId && cronJobs[0]?.id) {
      setSelectedCronJobId(cronJobs[0].id);
      setCronEditorMode("update");
      setCronEditorRaw(safeStringify(cronJobs[0]));
    }
  }, [cronJobs, selectedCronJobId]);

  useEffect(() => {
    if (gatewayConnected && activeTab === "agents" && selectedAgentId) {
      void loadTools(selectedAgentId);
    }
  }, [selectedAgentId, gatewayConnected, activeTab]);

  useEffect(() => {
    if (gatewayConnected && activeTab === "chat") {
      void loadChatHistory();
    }
  }, [settings.sessionKey, gatewayConnected, activeTab]);

  useEffect(() => {
    if (!gatewayConnected) {
      return;
    }
    switch (activeTab) {
      case "chat":
        void loadChatHistory();
        break;
      case "channels":
        void loadChannels(false);
        break;
      case "sessions":
        void loadSessions();
        break;
      case "usage":
        void loadUsage();
        break;
      case "cron":
        void loadCron();
        break;
      case "agents":
        void loadAgents();
        break;
      case "skills":
        void loadSkills();
        break;
      case "nodes":
        void loadNodesAndDevices();
        break;
      case "config":
      case "communications":
      case "appearance":
      case "automation":
      case "infrastructure":
      case "aiAgents":
        void loadConfig();
        break;
      case "debug":
      case "instances":
        void loadDebug();
        break;
      case "logs":
        void loadLogs(true);
        break;
      default:
        break;
    }
  }, [activeTab, gatewayConnected]);

  useEffect(() => {
    const selectedServer = mcpServers.find((server) => server.name === selectedMcpName);
    if (!selectedServer) {
      setMcpForm(EMPTY_MCP_FORM);
      return;
    }
    setMcpForm({
      name: selectedServer.name,
      description: selectedServer.description,
      category: selectedServer.category,
      transport: selectedServer.transport,
      command: selectedServer.command ?? "",
      url: selectedServer.url ?? "",
      version: selectedServer.version ?? "",
      owner: selectedServer.owner ?? "",
      docs_url: selectedServer.docs_url ?? "",
      tags: selectedServer.tags.join(", "),
      dependency_names: selectedServer.dependency_names.join(", "),
      allowed_agents: selectedServer.allowed_agents.join(", "),
      allowed_groups: selectedServer.allowed_groups.join(", "),
      enabled: selectedServer.enabled,
      auto_start: selectedServer.auto_start,
      health_path: String(selectedServer.config?.health_path ?? ""),
    });
  }, [selectedMcpName, mcpServers]);

  const selectedTask = tasks.find((task) => task.task_id === selectedTaskId) ?? null;
  const selectedMcp = mcpServers.find((server) => server.name === selectedMcpName) ?? null;

  const visibleTasks = tasks.filter((task) => {
    const searchTerm = taskFilter.search.trim().toLowerCase();
    const searchMatched =
      !searchTerm ||
      [task.title, task.description, task.latest_activity_summary, task.source_room_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm);
    const statusMatched = taskFilter.status === "all" || task.status === taskFilter.status;
    const ownerMatched = taskFilter.owner === "all" || task.owner_agent === taskFilter.owner;
    const priorityMatched = taskFilter.priority === "all" || task.priority === taskFilter.priority;
    return searchMatched && statusMatched && ownerMatched && priorityMatched;
  });

  const visibleMcp = mcpServers.filter((server) => {
    const searchTerm = mcpFilter.search.trim().toLowerCase();
    const searchMatched =
      !searchTerm ||
      [server.name, server.description, server.category, server.owner, server.tags.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm);
    const categoryMatched = mcpFilter.category === "all" || server.category === mcpFilter.category;
    return searchMatched && categoryMatched;
  });

  const ownerOptions = Array.from(new Set(tasks.map((task) => task.owner_agent))).sort();
  const categoryOptions = Array.from(new Set(mcpServers.map((server) => server.category))).sort();

  async function reloadShell() {
    setLoading((current) => ({ ...current, shell: true }));
    setBanner("");
    try {
      const [overviewPayload, topologyPayload] = await Promise.all([fetchOverview(), fetchTopology()]);
      setOverview(overviewPayload);
      setTopology(topologyPayload);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "总览加载失败");
    } finally {
      setLoading((current) => ({ ...current, shell: false }));
    }
  }

  async function reloadTasks() {
    setLoading((current) => ({ ...current, tasks: true }));
    try {
      setTasks(await fetchTaskChains());
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "任务链加载失败");
    } finally {
      setLoading((current) => ({ ...current, tasks: false }));
    }
  }

  async function reloadMcp() {
    setLoading((current) => ({ ...current, mcp: true }));
    try {
      setMcpServers(await fetchMcpServers());
      setAgentServers(await fetchAgentMcp(agentLookupId));
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "MCP 加载失败");
    } finally {
      setLoading((current) => ({ ...current, mcp: false }));
    }
  }

  async function handleCreateTask() {
    if (!taskForm.title.trim()) {
      setBanner("任务标题不能为空");
      return;
    }
    const created = await createTaskChain({
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      owner_agent: taskForm.owner_agent.trim(),
      origin_agent: "001",
      priority: taskForm.priority,
      due_at: taskForm.due_at || undefined,
      source_room_id: taskForm.source_room_id || undefined,
      participants: ["001", taskForm.owner_agent.trim()],
      created_by: "pm-console",
    });
    await reloadTasks();
    setSelectedTaskId(created.task_id);
    setTaskForm(EMPTY_TASK_FORM);
  }

  async function handleUpdateTask(status?: string) {
    if (!selectedTask) {
      return;
    }
    const payload: Record<string, unknown> = {
      title: taskEdit.title,
      description: taskEdit.description,
      owner_agent: taskEdit.owner_agent,
      priority: taskEdit.priority,
      due_at: taskEdit.due_at || null,
      source_room_id: taskEdit.source_room_id || null,
      blocked_reason: taskEdit.blocked_reason || null,
      participants: normalizeCsv(taskEdit.participants),
      updated_by: "pm-console",
      latest_activity_summary: "任务详情已更新。",
    };
    if (status) {
      payload.status = status;
      payload.status_note = status === "blocked" ? taskEdit.blocked_reason || "手动标记阻塞。" : "由产品控制台推进。";
    }
    const updated = await updateTaskChain(selectedTask.task_id, payload);
    await reloadTasks();
    setSelectedTaskId(updated.task_id);
  }

  async function handleTaskMessage() {
    if (!selectedTask || !messageForm.content.trim()) {
      return;
    }
    await appendTaskMessage(selectedTask.task_id, {
      sender: messageForm.sender.trim() || "pm-console",
      content: messageForm.content.trim(),
      room_id: messageForm.room_id || selectedTask.source_room_id || undefined,
      create_step: true,
      step_title: "协作记录补充",
    });
    await reloadTasks();
    setMessageForm((current) => ({ ...current, content: "" }));
  }

  async function handleTaskReport() {
    if (!selectedTask || !reportForm.summary.trim()) {
      return;
    }
    await appendTaskReport(selectedTask.task_id, {
      reporter: reportForm.reporter.trim() || selectedTask.owner_agent,
      recipient: reportForm.recipient.trim() || selectedTask.origin_agent,
      summary: reportForm.summary.trim(),
      background: reportForm.background.trim(),
      approach: reportForm.approach.trim(),
      expected_outcome: reportForm.expected_outcome.trim(),
    });
    await reloadTasks();
    setReportForm((current) => ({
      ...current,
      summary: "",
      background: "",
      approach: "",
      expected_outcome: "",
    }));
  }

  async function handleSaveMcp() {
    if (!mcpForm.name.trim()) {
      setBanner("MCP 服务名称不能为空");
      return;
    }
    const payload = {
      name: mcpForm.name.trim(),
      description: mcpForm.description.trim(),
      category: mcpForm.category.trim() || "general",
      transport: mcpForm.transport,
      command: mcpForm.command.trim() || null,
      url: mcpForm.url.trim() || null,
      version: mcpForm.version.trim() || null,
      owner: mcpForm.owner.trim() || null,
      docs_url: mcpForm.docs_url.trim() || null,
      tags: normalizeCsv(mcpForm.tags),
      dependency_names: normalizeCsv(mcpForm.dependency_names),
      allowed_agents: normalizeCsv(mcpForm.allowed_agents),
      allowed_groups: normalizeCsv(mcpForm.allowed_groups),
      enabled: mcpForm.enabled,
      auto_start: mcpForm.auto_start,
      config: mcpForm.health_path.trim() ? { health_path: mcpForm.health_path.trim() } : {},
    };
    const exists = Boolean(selectedMcp && selectedMcp.name === mcpForm.name.trim());
    if (exists) {
      await updateMcpServer(mcpForm.name.trim(), payload);
    } else {
      await saveMcpServer(payload);
      setSelectedMcpName(mcpForm.name.trim());
    }
    await reloadMcp();
  }

  async function handleDeleteMcp() {
    if (!selectedMcp) {
      return;
    }
    await deleteMcpServer(selectedMcp.name);
    await reloadMcp();
    setSelectedMcpName("");
  }

  async function handleToggleMcp(server: MCPServer) {
    await toggleMcpServer(server.name, !server.enabled);
    const detail = await fetchMcpServer(server.name);
    await reloadMcp();
    setSelectedMcpName(detail.name);
  }

  async function handleLookupAgent() {
    setAgentServers(await fetchAgentMcp(agentLookupId));
  }

  function currentClient(): GatewayBrowserClient | null {
    return clientRef.current;
  }

  async function connectGateway() {
    if ((typeof process !== "undefined" && process.env?.VITEST) || gatewayBusy) {
      return;
    }
    setGatewayBusy(true);
    setGatewayError("");
    clientRef.current?.stop();
    const client = new GatewayBrowserClient({
      url: settings.gatewayUrl,
      token: settings.token,
      password,
      clientVersion: "3.0.0",
      onHello: (hello) => {
        setGatewayConnected(true);
        setGatewayHello(hello);
        setGatewayError("");
      },
      onEvent: (frame) => {
        const chatEvent = extractGatewayChatEvent(frame);
        if (!chatEvent || chatEvent.sessionKey !== settings.sessionKey) {
          return;
        }
        if (chatEvent.runId) {
          setChatRunId(chatEvent.runId);
        }
        if (chatEvent.state === "error") {
          setChatError(chatEvent.errorMessage || "对话运行失败");
          setChatSending(false);
        }
        if (chatEvent.state === "aborted") {
          setChatSending(false);
          setChatRunId(null);
        }
        if (chatEvent.state === "delta") {
          setChatStream((current) => [current, messageText(chatEvent.message)].filter(Boolean).join(""));
        }
        if (chatEvent.state === "final") {
          const text = messageText(chatEvent.message);
          if (text) {
            setChatStream(text);
          }
          setChatSending(false);
          setTimeout(() => {
            void loadChatHistory();
          }, 0);
        }
      },
      onClose: ({ error, reason }) => {
        setGatewayConnected(false);
        setGatewayHello(null);
        if (error?.message) {
          setGatewayError(error.message);
        } else if (reason) {
          setGatewayError(reason);
        }
      },
    });
    clientRef.current = client;
    client.start();
    setGatewayBusy(false);
  }

  function disconnectGateway() {
    clientRef.current?.stop();
    clientRef.current = null;
    setGatewayConnected(false);
    setGatewayHello(null);
    setGatewayError("");
  }

  async function loadAgents() {
    const client = currentClient();
    if (!client) return;
    setAgentsLoading(true);
    setAgentsError("");
    try {
      const [agentsPayload, toolsPayload] = await Promise.all([
        rpcAgentsList(client),
        selectedAgentId ? rpcToolsCatalog(client, selectedAgentId) : Promise.resolve(null),
      ]);
      setAgentsList(agentsPayload);
      if (!selectedAgentId && agentsPayload.agents[0]?.id) {
        setSelectedAgentId(agentsPayload.agents[0].id);
      }
      setToolsCatalog((toolsPayload as ToolsCatalogResult | null) ?? null);
    } catch (error) {
      setAgentsError(error instanceof Error ? error.message : "Agents 加载失败");
    } finally {
      setAgentsLoading(false);
    }
  }

  async function loadTools(agentId = selectedAgentId) {
    const client = currentClient();
    if (!client || !agentId) return;
    try {
      setToolsCatalog(await rpcToolsCatalog(client, agentId));
    } catch (error) {
      setAgentsError(error instanceof Error ? error.message : "Tools 加载失败");
    }
  }

  async function loadSessions() {
    const client = currentClient();
    if (!client) return;
    setSessionsLoading(true);
    setSessionsError("");
    try {
      setSessionsResult(
        await rpcSessionsList(client, {
          activeWithinMinutes: Number(sessionsFilterActive),
          limit: Number(sessionsFilterLimit),
          includeGlobal: sessionsIncludeGlobal,
          includeUnknown: sessionsIncludeUnknown,
        }),
      );
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "会话加载失败");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function patchSession(key: string, patch: Record<string, unknown>) {
    const client = currentClient();
    if (!client) return;
    await rpcPatchSession(client, key, patch);
    await loadSessions();
  }

  async function deleteSession(key: string) {
    const client = currentClient();
    if (!client) return;
    await rpcDeleteSession(client, key);
    await loadSessions();
  }

  async function loadChannels(probe = false) {
    const client = currentClient();
    if (!client) return;
    setChannelsLoading(true);
    setChannelsError("");
    try {
      const payload = await rpcChannelsStatus(client, probe);
      setChannelsSnapshot(payload);
    } catch (error) {
      setChannelsError(error instanceof Error ? error.message : "渠道状态加载失败");
    } finally {
      setChannelsLoading(false);
    }
  }

  async function startWhatsAppLogin(force = false) {
    const client = currentClient();
    if (!client) return;
    try {
      const payload = await rpcStartWhatsAppLogin(client, force);
      setWhatsAppMessage(payload.message || "已启动 WhatsApp 登录流程");
      setWhatsAppQr(payload.qrDataUrl || null);
    } catch (error) {
      setWhatsAppMessage(error instanceof Error ? error.message : "WhatsApp 登录启动失败");
    }
  }

  async function waitWhatsAppLogin() {
    const client = currentClient();
    if (!client) return;
    try {
      const payload = await rpcWaitWhatsAppLogin(client);
      setWhatsAppMessage(payload.message || "已等待登录结果");
      setWhatsAppConnected(Boolean(payload.connected));
      await loadChannels(false);
    } catch (error) {
      setWhatsAppMessage(error instanceof Error ? error.message : "WhatsApp 登录等待失败");
    }
  }

  async function logoutWhatsApp() {
    const client = currentClient();
    if (!client) return;
    try {
      await rpcLogoutWhatsApp(client);
      setWhatsAppConnected(false);
      setWhatsAppMessage("已退出 WhatsApp 登录");
      setWhatsAppQr(null);
      await loadChannels(false);
    } catch (error) {
      setWhatsAppMessage(error instanceof Error ? error.message : "WhatsApp 退出失败");
    }
  }

  async function loadLogs(reset = false) {
    const client = currentClient();
    if (!client) return;
    setLogsLoading(true);
    setLogsError("");
    try {
      const payload = await rpcLogsTail(client, {
        cursor: reset ? null : logsCursor,
        limit: 150,
        reset,
      });
      const parsed = Array.isArray(payload.lines) ? payload.lines.map(parseLogLine) : [];
      setLogsEntries(reset ? parsed : [...logsEntries, ...parsed]);
      setLogsCursor(typeof payload.cursor === "number" ? payload.cursor : logsCursor);
      setLogsFile(payload.file ?? null);
      setLogsTruncated(Boolean(payload.truncated));
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : "日志加载失败");
    } finally {
      setLogsLoading(false);
    }
  }

  async function loadNodesAndDevices() {
    const client = currentClient();
    if (!client) return;
    setDevicesLoading(true);
    setNodesLoading(true);
    setDevicesError("");
    setNodesError("");
    try {
      const [devicesPayload, nodesPayload] = await Promise.all([
        rpcLoadDevices(client),
        rpcNodesList(client),
      ]);
      setDevicesList(devicesPayload);
      setNodes(nodesPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nodes 加载失败";
      setDevicesError(message);
      setNodesError(message);
    } finally {
      setDevicesLoading(false);
      setNodesLoading(false);
    }
  }

  async function approveDevice(requestId: string) {
    const client = currentClient();
    if (!client) return;
    await rpcApproveDevice(client, requestId);
    await loadNodesAndDevices();
  }

  async function rejectDevice(requestId: string) {
    const client = currentClient();
    if (!client) return;
    await rpcRejectDevice(client, requestId);
    await loadNodesAndDevices();
  }

  async function rotateDeviceToken(deviceId: string, role: string, scopes: string[] = []) {
    const client = currentClient();
    if (!client) return;
    await rpcRotateDeviceToken(client, { deviceId, role, scopes });
    await loadNodesAndDevices();
  }

  async function revokeDeviceToken(deviceId: string, role: string) {
    const client = currentClient();
    if (!client) return;
    await rpcRevokeDeviceToken(client, { deviceId, role });
    await loadNodesAndDevices();
  }

  async function loadSkills() {
    const client = currentClient();
    if (!client) return;
    setSkillsLoading(true);
    setSkillsError("");
    try {
      const payload = await rpcSkillsStatus(client);
      setSkillsReport(payload);
      const entries = [...(payload.skills ?? []), ...(payload.installed ?? []), ...(payload.available ?? [])];
      const nextEdits: Record<string, string> = {};
      for (const entry of entries) {
        if (entry?.skillKey) {
          nextEdits[entry.skillKey] = "";
        }
      }
      setSkillEdits((current) => ({ ...nextEdits, ...current }));
    } catch (error) {
      setSkillsError(error instanceof Error ? error.message : "技能加载失败");
    } finally {
      setSkillsLoading(false);
    }
  }

  async function updateSkillEnabled(skillKey: string, enabled: boolean) {
    const client = currentClient();
    if (!client) return;
    setSkillsBusyKey(skillKey);
    try {
      await rpcSkillsUpdate(client, { skillKey, enabled });
      setSkillMessages((current) => ({ ...current, [skillKey]: { kind: "success", message: enabled ? "已启用" : "已停用" } }));
      await loadSkills();
    } catch (error) {
      setSkillMessages((current) => ({ ...current, [skillKey]: { kind: "error", message: error instanceof Error ? error.message : "技能更新失败" } }));
    } finally {
      setSkillsBusyKey(null);
    }
  }

  async function saveSkillApiKey(skillKey: string) {
    const client = currentClient();
    if (!client) return;
    setSkillsBusyKey(skillKey);
    try {
      await rpcSkillsUpdate(client, { skillKey, apiKey: skillEdits[skillKey] ?? "" });
      setSkillMessages((current) => ({ ...current, [skillKey]: { kind: "success", message: "API Key 已保存" } }));
      await loadSkills();
    } catch (error) {
      setSkillMessages((current) => ({ ...current, [skillKey]: { kind: "error", message: error instanceof Error ? error.message : "API Key 保存失败" } }));
    } finally {
      setSkillsBusyKey(null);
    }
  }

  async function installSkill(skillKey: string) {
    const client = currentClient();
    if (!client) return;
    setSkillsBusyKey(skillKey);
    try {
      await rpcSkillsInstall(client, { skillKey });
      setSkillMessages((current) => ({ ...current, [skillKey]: { kind: "success", message: "安装完成" } }));
      await loadSkills();
    } catch (error) {
      setSkillMessages((current) => ({ ...current, [skillKey]: { kind: "error", message: error instanceof Error ? error.message : "安装失败" } }));
    } finally {
      setSkillsBusyKey(null);
    }
  }

  async function loadUsage() {
    const client = currentClient();
    if (!client) return;
    setUsageLoading(true);
    setUsageError("");
    try {
      const payload: Record<string, unknown> = {};
      if (usageStartDate) payload.startDate = usageStartDate;
      if (usageEndDate) payload.endDate = usageEndDate;
      const [sessionsPayload, costPayload] = await Promise.all([
        rpcUsageSessions(client, payload),
        rpcUsageCost(client, payload),
      ]);
      setUsageResult(sessionsPayload);
      setUsageCost(costPayload);
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : "用量加载失败");
    } finally {
      setUsageLoading(false);
    }
  }

  async function loadCron() {
    const client = currentClient();
    if (!client) return;
    setCronLoading(true);
    setCronError("");
    try {
      const [statusPayload, jobsPayload, runsPayload] = await Promise.all([
        rpcCronStatus(client),
        rpcCronJobs(client, { limit: 100, offset: 0 }),
        rpcCronRuns(client, { limit: 30, offset: 0 }),
      ]);
      setCronStatus(statusPayload);
      setCronJobs(jobsPayload.jobs ?? []);
      setCronRuns(runsPayload.runs ?? []);
    } catch (error) {
      setCronError(error instanceof Error ? error.message : "Cron 加载失败");
    } finally {
      setCronLoading(false);
    }
  }

  async function saveCronDraft() {
    const client = currentClient();
    if (!client) return;
    const payload = parseJsonObject(cronEditorRaw);
    if (cronEditorMode === "create") {
      await rpcCronAdd(client, payload);
    } else if (selectedCronJobId) {
      await rpcCronUpdate(client, selectedCronJobId, payload);
    }
    await loadCron();
  }

  async function toggleCronJob(id: string, enabled: boolean) {
    const client = currentClient();
    if (!client) return;
    await rpcCronUpdate(client, id, { enabled });
    await loadCron();
  }

  async function runCronJob(id: string) {
    const client = currentClient();
    if (!client) return;
    await rpcCronRun(client, id);
    await loadCron();
  }

  async function removeCronJob(id: string) {
    const client = currentClient();
    if (!client) return;
    await rpcCronRemove(client, id);
    setSelectedCronJobId("");
    setCronEditorMode("create");
    setCronEditorRaw(CRON_TEMPLATE);
    await loadCron();
  }

  async function loadConfig() {
    const client = currentClient();
    if (!client) return;
    setConfigLoading(true);
    setConfigError("");
    try {
      const [snapshot, schema] = await Promise.all([rpcConfigGet(client), rpcConfigSchema(client)]);
      setConfigSnapshot(snapshot);
      setConfigSchema(schema);
      setConfigRaw(snapshot.raw ?? safeStringify(snapshot.config ?? {}));
      setConfigSectionDrafts(buildSectionDrafts(snapshot.config ?? null));
      setConfigDirty(false);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "配置加载失败");
    } finally {
      setConfigLoading(false);
    }
  }

  function updateConfigSectionDraft(key: string, value: string) {
    setConfigSectionDrafts((current) => ({ ...current, [key]: value }));
    setConfigDirty(true);
  }

  async function saveConfig(rawOverride?: string) {
    const client = currentClient();
    if (!client) return;
    const raw = rawOverride ?? configRaw;
    await rpcConfigSet(client, raw, configSnapshot?.hash);
    await loadConfig();
  }

  async function applyConfig(rawOverride?: string) {
    const client = currentClient();
    if (!client) return;
    const raw = rawOverride ?? configRaw;
    await rpcConfigApply(client, raw, configSnapshot?.hash, settings.sessionKey);
    await loadConfig();
  }

  async function runUpdate() {
    const client = currentClient();
    if (!client) return;
    await rpcRunUpdate(client, settings.sessionKey);
  }

  async function loadDebug() {
    const client = currentClient();
    if (!client) return;
    setDebugLoading(true);
    setDebugError("");
    try {
      const [statusPayload, healthPayload, modelsPayload, heartbeatPayload] = await Promise.all([
        rpcStatus(client),
        rpcHealth(client),
        rpcModelsList(client),
        rpcLastHeartbeat(client),
      ]);
      setDebugStatus(statusPayload);
      setDebugHealth(healthPayload);
      setDebugModels(modelsPayload.models ?? []);
      setDebugHeartbeat(heartbeatPayload);
    } catch (error) {
      setDebugError(error instanceof Error ? error.message : "调试数据加载失败");
    } finally {
      setDebugLoading(false);
    }
  }

  async function callDebugMethod() {
    const client = currentClient();
    if (!client) return;
    try {
      const params = tryParseJsonObject(debugCallParams) ?? {};
      const result = await rpcCallMethod(client, debugCallMethod, params);
      setDebugCallResult(safeStringify(result));
    } catch (error) {
      setDebugCallResult(error instanceof Error ? error.message : "调用失败");
    }
  }

  async function loadChatHistory() {
    const client = currentClient();
    if (!client) return;
    setChatLoading(true);
    setChatError("");
    try {
      const payload = await rpcChatHistory(client, settings.sessionKey);
      setChatMessages(payload.messages ?? []);
      setChatStream("");
      setChatRunId(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "会话历史加载失败");
    } finally {
      setChatLoading(false);
    }
  }

  async function sendChatMessage() {
    const client = currentClient();
    if (!client || !chatMessage.trim()) return;
    setChatSending(true);
    setChatError("");
    setChatStream("");
    const pendingText = chatMessage.trim();
    setChatMessages((current) => [...current, { role: "user", text: pendingText, timestamp: Date.now() }]);
    setChatMessage("");
    try {
      await rpcChatSend(client, {
        sessionKey: settings.sessionKey,
        clientReqId: generateUUID(),
        message: { role: "user", content: [{ type: "text", text: pendingText }] },
      });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "发送失败");
      setChatSending(false);
    }
  }

  async function abortChatRun() {
    const client = currentClient();
    if (!client || !chatRunId) return;
    await rpcChatAbort(client, { sessionKey: settings.sessionKey, runId: chatRunId });
    setChatSending(false);
    setChatRunId(null);
  }

  async function refreshActiveView() {
    switch (activeTab) {
      case "overview":
      case "topology":
        await reloadShell();
        break;
      case "tasks":
      case "chatroom":
        await reloadTasks();
        break;
      case "mcp":
        await reloadMcp();
        break;
      case "chat":
        await loadChatHistory();
        break;
      case "channels":
        await loadChannels(true);
        break;
      case "sessions":
        await loadSessions();
        break;
      case "usage":
        await loadUsage();
        break;
      case "cron":
        await loadCron();
        break;
      case "agents":
        await loadAgents();
        break;
      case "skills":
        await loadSkills();
        break;
      case "nodes":
        await loadNodesAndDevices();
        break;
      case "config":
      case "communications":
      case "appearance":
      case "automation":
      case "infrastructure":
      case "aiAgents":
        await loadConfig();
        break;
      case "instances":
      case "debug":
        await loadDebug();
        break;
      case "logs":
        await loadLogs(true);
        break;
      default:
        break;
    }
  }

  return (
    <div className="min-h-screen bg-transparent px-4 py-4 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1560px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="panel flex flex-col gap-5 p-5">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">SilentLake</div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">控制中枢</h1>
            <p className="text-sm leading-6 text-slate-500">
              React + Tailwind 新主线。任务链、MCP 治理和协作流都在这里闭环。
            </p>
          </div>

          <nav className="space-y-1.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition",
                    activeTab === tab.key
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                  )}
                  onClick={() => {
                    startTransition(() => setActiveTab(tab.key));
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4" />
              当前状态
            </div>
            <ul className="space-y-2 text-xs leading-5">
              <li>前端主线：React + Tailwind</li>
              <li>任务闭环：状态、协作、汇报、聊天室挂接</li>
              <li>MCP：注册、治理、授权、健康探测</li>
              <li>知识库：本轮暂缓，不继续扩展</li>
            </ul>
          </div>
        </aside>

        <main className="space-y-4">
          <header className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                SilentLake 3.0.0
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                多 Agent 协作平台控制台
              </h2>
              <p className="text-sm text-slate-500">
                旧 OpenClaw 的控制、运维、协作功能都统一迁入到新的 SilentLake 控制台，并完成统一重设计。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="action-secondary gap-2" onClick={() => void refreshActiveView()}>
                <RefreshCw className="h-4 w-4" />
                刷新当前页
              </button>
              <button type="button" className="action-secondary gap-2" onClick={() => void reloadShell()}>
                <RefreshCw className="h-4 w-4" />
                刷新总览
              </button>
              <button type="button" className="action-secondary gap-2" onClick={() => void reloadTasks()}>
                <Boxes className="h-4 w-4" />
                刷新任务链
              </button>
              <button type="button" className="action-primary gap-2" onClick={() => void reloadMcp()}>
                <ShieldCheck className="h-4 w-4" />
                刷新 MCP
              </button>
            </div>
          </header>

          {banner ? (
            <div className="panel border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{banner}</div>
          ) : null}

          <GatewayStatusBar
            connected={gatewayConnected}
            hello={gatewayHello}
            error={gatewayError}
            busy={gatewayBusy}
            settings={settings}
            password={password}
            onSettingsChange={(key, value) => setSettings((current) => ({ ...current, [key]: value }))}
            onPasswordChange={setPassword}
            onConnect={() => void connectGateway()}
            onDisconnect={disconnectGateway}
          />

          {activeTab === "overview" ? (
            <OverviewTab overview={overview} topology={topology} tasks={tasks} mcpServers={mcpServers} loading={loading.shell} />
          ) : null}
          {activeTab === "chat" ? (
            <ChatTab
              connected={gatewayConnected}
              sessionKey={settings.sessionKey}
              messages={chatMessages}
              stream={chatStream}
              message={chatMessage}
              loading={chatLoading}
              sending={chatSending}
              error={chatError}
              onSessionKeyChange={(value) => setSettings((current) => ({ ...current, sessionKey: value }))}
              onMessageChange={setChatMessage}
              onReload={() => void loadChatHistory()}
              onSend={() => void sendChatMessage()}
              onAbort={() => void abortChatRun()}
            />
          ) : null}
          {activeTab === "topology" ? <TopologyTab topology={topology} loading={loading.shell} /> : null}
          {activeTab === "channels" ? (
            <ChannelsTab
              snapshot={channelsSnapshot}
              loading={channelsLoading}
              error={channelsError}
              whatsAppMessage={whatsAppMessage}
              whatsAppQr={whatsAppQr}
              whatsAppConnected={whatsAppConnected}
              onReload={(probe) => void loadChannels(probe)}
              onStartWhatsApp={(force) => void startWhatsAppLogin(force)}
              onWaitWhatsApp={() => void waitWhatsAppLogin()}
              onLogoutWhatsApp={() => void logoutWhatsApp()}
            />
          ) : null}
          {activeTab === "instances" ? (
            <InstancesTab
              status={debugStatus}
              health={debugHealth}
              models={debugModels}
              heartbeat={debugHeartbeat}
              loading={debugLoading}
              error={debugError}
              onReload={() => void loadDebug()}
            />
          ) : null}
          {activeTab === "sessions" ? (
            <SessionsTab
              result={sessionsResult}
              loading={sessionsLoading}
              error={sessionsError}
              activeWithin={sessionsFilterActive}
              limit={sessionsFilterLimit}
              includeGlobal={sessionsIncludeGlobal}
              includeUnknown={sessionsIncludeUnknown}
              onActiveWithinChange={setSessionsFilterActive}
              onLimitChange={setSessionsFilterLimit}
              onIncludeGlobalChange={setSessionsIncludeGlobal}
              onIncludeUnknownChange={setSessionsIncludeUnknown}
              onReload={() => void loadSessions()}
              onPatch={(key, patch) => void patchSession(key, patch)}
              onDelete={(key) => void deleteSession(key)}
            />
          ) : null}
          {activeTab === "usage" ? (
            <UsageTab
              startDate={usageStartDate}
              endDate={usageEndDate}
              result={usageResult}
              cost={usageCost}
              loading={usageLoading}
              error={usageError}
              onStartDateChange={setUsageStartDate}
              onEndDateChange={setUsageEndDate}
              onReload={() => void loadUsage()}
            />
          ) : null}
          {activeTab === "cron" ? (
            <CronTab
              status={cronStatus}
              jobs={cronJobs}
              runs={cronRuns}
              loading={cronLoading}
              error={cronError}
              editorMode={cronEditorMode}
              selectedJobId={selectedCronJobId}
              editorRaw={cronEditorRaw}
              onSelectJob={(job) => {
                setSelectedCronJobId(job.id);
                setCronEditorMode("update");
                setCronEditorRaw(safeStringify(job));
              }}
              onCreateNew={() => {
                setSelectedCronJobId("");
                setCronEditorMode("create");
                setCronEditorRaw(CRON_TEMPLATE);
              }}
              onEditorRawChange={setCronEditorRaw}
              onReload={() => void loadCron()}
              onSave={() => void saveCronDraft()}
              onToggle={(id, enabled) => void toggleCronJob(id, enabled)}
              onRun={(id) => void runCronJob(id)}
              onRemove={(id) => void removeCronJob(id)}
            />
          ) : null}
          {activeTab === "agents" ? (
            <AgentsTab
              agents={agentsList}
              selectedAgentId={selectedAgentId}
              toolsCatalog={toolsCatalog}
              loading={agentsLoading}
              error={agentsError}
              onSelectAgent={(agentId) => {
                setSelectedAgentId(agentId);
                void loadTools(agentId);
              }}
              onReload={() => void loadAgents()}
            />
          ) : null}
          {activeTab === "skills" ? (
            <SkillsTab
              report={skillsReport}
              loading={skillsLoading}
              error={skillsError}
              busyKey={skillsBusyKey}
              edits={skillEdits}
              messages={skillMessages}
              onEditChange={(key, value) => setSkillEdits((current) => ({ ...current, [key]: value }))}
              onReload={() => void loadSkills()}
              onToggle={(key, enabled) => void updateSkillEnabled(key, enabled)}
              onSaveKey={(key) => void saveSkillApiKey(key)}
              onInstall={(key) => void installSkill(key)}
            />
          ) : null}
          {activeTab === "nodes" ? (
            <NodesTab
              devices={devicesList}
              nodes={nodes}
              loading={devicesLoading || nodesLoading}
              error={devicesError || nodesError}
              onReload={() => void loadNodesAndDevices()}
              onApprove={(requestId) => void approveDevice(requestId)}
              onReject={(requestId) => void rejectDevice(requestId)}
              onRotate={(deviceId, role, scopes) => void rotateDeviceToken(deviceId, role, scopes)}
              onRevoke={(deviceId, role) => void revokeDeviceToken(deviceId, role)}
            />
          ) : null}
          {activeTab === "tasks" ? (
            <TasksTab
              tasks={visibleTasks}
              allTasks={tasks}
              selectedTask={selectedTask}
              ownerOptions={ownerOptions}
              taskFilter={taskFilter}
              taskForm={taskForm}
              taskEdit={taskEdit}
              messageForm={messageForm}
              reportForm={reportForm}
              loading={loading.tasks}
              onSelectTask={setSelectedTaskId}
              onFilterChange={(key, value) => setTaskFilter((current) => ({ ...current, [key]: value }))}
              onTaskFormChange={(key, value) => setTaskForm((current) => ({ ...current, [key]: value }))}
              onTaskEditChange={(key, value) => setTaskEdit((current) => ({ ...current, [key]: value }))}
              onMessageChange={(key, value) => setMessageForm((current) => ({ ...current, [key]: value }))}
              onReportChange={(key, value) => setReportForm((current) => ({ ...current, [key]: value }))}
              onCreateTask={() => void handleCreateTask()}
              onUpdateTask={(status) => void handleUpdateTask(status)}
              onAppendMessage={() => void handleTaskMessage()}
              onAppendReport={() => void handleTaskReport()}
            />
          ) : null}
          {activeTab === "mcp" ? (
            <McpTab
              servers={visibleMcp}
              allServers={mcpServers}
              selectedServer={selectedMcp}
              filter={mcpFilter}
              form={mcpForm}
              categoryOptions={categoryOptions}
              agentLookupId={agentLookupId}
              agentServers={agentServers}
              loading={loading.mcp}
              onSelectServer={setSelectedMcpName}
              onFilterChange={(key, value) => setMcpFilter((current) => ({ ...current, [key]: value }))}
              onFormChange={(key, value) => setMcpForm((current) => ({ ...current, [key]: value }))}
              onLookupAgentChange={setAgentLookupId}
              onLookupAgent={() => void handleLookupAgent()}
              onSave={() => void handleSaveMcp()}
              onDelete={() => void handleDeleteMcp()}
              onToggle={(server) => void handleToggleMcp(server)}
              onCreateNew={() => {
                setSelectedMcpName("");
                setMcpForm(EMPTY_MCP_FORM);
              }}
            />
          ) : null}
          {activeTab === "chatroom" ? (
            <ChatroomTab
              tasks={tasks}
              selectedTask={selectedTask}
              messageForm={messageForm}
              onSelectTask={setSelectedTaskId}
              onMessageChange={(key, value) => setMessageForm((current) => ({ ...current, [key]: value }))}
              onAppendMessage={() => void handleTaskMessage()}
            />
          ) : null}
          {activeTab === "config" ? (
            <ConfigTab
              snapshot={configSnapshot}
              schema={configSchema}
              loading={configLoading}
              error={configError}
              raw={configRaw}
              dirty={configDirty}
              onRawChange={(value) => {
                setConfigRaw(value);
                setConfigDirty(true);
              }}
              onReload={() => void loadConfig()}
              onSave={() => void saveConfig()}
              onApply={() => void applyConfig()}
              onRunUpdate={() => void runUpdate()}
            />
          ) : null}
          {activeTab === "communications" ? (
            <ConfigSectionTab
              title="通信配置"
              description="渠道、网关和对外通信相关的配置都在这里统一维护。"
              sectionKeys={CONFIG_SECTION_KEYS.communications}
              drafts={configSectionDrafts}
              loading={configLoading}
              error={configError}
              onReload={() => void loadConfig()}
              onDraftChange={updateConfigSectionDraft}
              onSave={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.communications) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await saveConfig(raw);
              }}
              onApply={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.communications) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await applyConfig(raw);
              }}
            />
          ) : null}
          {activeTab === "appearance" ? (
            <ConfigSectionTab
              title="外观配置"
              description="控制台主题、终端显示和聊天呈现相关设置。"
              sectionKeys={CONFIG_SECTION_KEYS.appearance}
              drafts={configSectionDrafts}
              loading={configLoading}
              error={configError}
              onReload={() => void loadConfig()}
              onDraftChange={updateConfigSectionDraft}
              onSave={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.appearance) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await saveConfig(raw);
              }}
              onApply={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.appearance) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await applyConfig(raw);
              }}
            />
          ) : null}
          {activeTab === "automation" ? (
            <ConfigSectionTab
              title="自动化配置"
              description="Hooks、绑定、命令、审批和 cron 相关配置。"
              sectionKeys={CONFIG_SECTION_KEYS.automation}
              drafts={configSectionDrafts}
              loading={configLoading}
              error={configError}
              onReload={() => void loadConfig()}
              onDraftChange={updateConfigSectionDraft}
              onSave={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.automation) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await saveConfig(raw);
              }}
              onApply={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.automation) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await applyConfig(raw);
              }}
            />
          ) : null}
          {activeTab === "infrastructure" ? (
            <ConfigSectionTab
              title="基础设施配置"
              description="浏览器、节点宿主、发现、媒体和 MCP 基础设施能力。"
              sectionKeys={CONFIG_SECTION_KEYS.infrastructure}
              drafts={configSectionDrafts}
              loading={configLoading}
              error={configError}
              onReload={() => void loadConfig()}
              onDraftChange={updateConfigSectionDraft}
              onSave={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.infrastructure) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await saveConfig(raw);
              }}
              onApply={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.infrastructure) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await applyConfig(raw);
              }}
            />
          ) : null}
          {activeTab === "aiAgents" ? (
            <ConfigSectionTab
              title="AI Agents 配置"
              description="Agent、模型、技能和 prompts 相关设置。"
              sectionKeys={CONFIG_SECTION_KEYS.aiAgents}
              drafts={configSectionDrafts}
              loading={configLoading}
              error={configError}
              onReload={() => void loadConfig()}
              onDraftChange={updateConfigSectionDraft}
              onSave={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.aiAgents) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await saveConfig(raw);
              }}
              onApply={async () => {
                const nextConfig = { ...(configSnapshot?.config ?? {}) } as Record<string, unknown>;
                for (const key of CONFIG_SECTION_KEYS.aiAgents) {
                  if (configSectionDrafts[key]) nextConfig[key] = parseJsonObject(configSectionDrafts[key]);
                }
                const raw = safeStringify(nextConfig);
                setConfigRaw(raw);
                await applyConfig(raw);
              }}
            />
          ) : null}
          {activeTab === "debug" ? (
            <DebugTab
              status={debugStatus}
              health={debugHealth}
              models={debugModels}
              heartbeat={debugHeartbeat}
              loading={debugLoading}
              error={debugError}
              callMethod={debugCallMethod}
              callParams={debugCallParams}
              callResult={debugCallResult}
              onCallMethodChange={setDebugCallMethod}
              onCallParamsChange={setDebugCallParams}
              onReload={() => void loadDebug()}
              onCall={() => void callDebugMethod()}
            />
          ) : null}
          {activeTab === "logs" ? (
            <LogsTab
              entries={logsEntries}
              file={logsFile}
              truncated={logsTruncated}
              loading={logsLoading}
              error={logsError}
              onReload={() => void loadLogs(true)}
              onMore={() => void loadLogs(false)}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function OverviewTab({
  overview,
  topology,
  tasks,
  mcpServers,
  loading,
}: {
  overview: DashboardOverview | null;
  topology: TopologyResponse | null;
  tasks: TaskChain[];
  mcpServers: MCPServer[];
  loading: boolean;
}) {
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const overdueCount = tasks.filter((task) => task.is_overdue).length;
  const healthyMcp = mcpServers.filter((server) => server.health_status === "healthy").length;
  const onlineRatio = overview ? `${overview.online}/${overview.total}` : "0/0";
  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="在线 Agent"
            value={onlineRatio}
            detail="基于平台心跳的在线判定"
            icon={<Bot className="h-5 w-5" />}
          />
          <MetricCard
            title="活跃任务链"
            value={String(tasks.length)}
            detail={`${blockedCount} 个阻塞，${overdueCount} 个逾期`}
            icon={<Boxes className="h-5 w-5" />}
          />
          <MetricCard
            title="MCP 服务"
            value={String(mcpServers.length)}
            detail={`${healthyMcp} 个健康，${mcpServers.filter((server) => server.enabled).length} 个全局启用`}
            icon={<ShieldCheck className="h-5 w-5" />}
          />
          <MetricCard
            title="协作消息"
            value={String(tasks.reduce((sum, task) => sum + task.messages.length, 0))}
            detail="已沉淀到任务链的沟通记录"
            icon={<MessageSquareText className="h-5 w-5" />}
          />
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">组织运行态</h3>
              <p className="text-sm text-slate-500">从组织视角看当前在线节点、任务压力和协作密度。</p>
            </div>
            {loading ? <span className="text-sm text-slate-400">刷新中</span> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(overview?.agents ?? []).map((agent) => (
              <div key={agent.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{agent.id}</div>
                    <div className="text-xs text-slate-500">
                      {agent.group || "未分组"} / {agent.type}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      agent.status === "online" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {agent.status === "online" ? "在线" : "离线"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="rounded-xl bg-slate-50 p-2">当前任务：{agent.current_task || "空闲"}</div>
                  <div className="rounded-xl bg-slate-50 p-2">今日完成：{agent.tasks_completed_today ?? 0}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="panel p-5">
          <h3 className="text-lg font-semibold text-slate-950">拓扑摘要</h3>
          <p className="mt-1 text-sm text-slate-500">汇报链路和协作链路都从这里快速检查。</p>
          <div className="mt-4 grid gap-3">
            <SummaryStrip label="节点数量" value={String(topology?.nodes.length ?? 0)} icon={<Radio className="h-4 w-4" />} />
            <SummaryStrip label="汇报关系" value={String(topology?.links.filter((link) => link.type === "reports_to").length ?? 0)} icon={<ChevronRight className="h-4 w-4" />} />
            <SummaryStrip label="协作关系" value={String(topology?.links.filter((link) => link.type === "collaborates").length ?? 0)} icon={<Activity className="h-4 w-4" />} />
            <SummaryStrip label="阻塞任务" value={String(blockedCount)} icon={<Clock3 className="h-4 w-4" />} />
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="text-lg font-semibold text-slate-950">最近活动</h3>
          <div className="mt-4 space-y-3">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.task_id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{task.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{task.latest_activity_summary}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {task.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TopologyTab({ topology, loading }: { topology: TopologyResponse | null; loading: boolean }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">组织节点</h3>
            <p className="text-sm text-slate-500">按 Agent 卡片查看当前层级与在线态。</p>
          </div>
          {loading ? <span className="text-sm text-slate-400">刷新中</span> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(topology?.nodes ?? []).map((node) => (
            <div key={node.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{node.id}</div>
                  <div className="text-xs text-slate-500">
                    {node.group || "未分组"} / {node.type}
                  </div>
                </div>
                <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", node.status === "online" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {node.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-5">
        <h3 className="text-lg font-semibold text-slate-950">链路清单</h3>
        <p className="mt-1 text-sm text-slate-500">当前汇报和协作关系以文本形式列出来，便于 PM 直接核对。</p>
        <div className="mt-4 space-y-3">
          {(topology?.links ?? []).map((link, index) => (
            <div key={`${link.source}-${link.target}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-sm">
              <div className="font-medium text-slate-900">{link.source}</div>
              <div className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="h-4 w-4" />
                <span>{link.type}</span>
              </div>
              <div className="font-medium text-slate-900">{link.target}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TasksTab(props: {
  tasks: TaskChain[];
  allTasks: TaskChain[];
  selectedTask: TaskChain | null;
  ownerOptions: string[];
  taskFilter: Record<string, string>;
  taskForm: typeof EMPTY_TASK_FORM;
  taskEdit: Record<string, string>;
  messageForm: typeof EMPTY_MESSAGE_FORM;
  reportForm: typeof EMPTY_REPORT_FORM;
  loading: boolean;
  onSelectTask: (taskId: string) => void;
  onFilterChange: (key: string, value: string) => void;
  onTaskFormChange: (key: keyof typeof EMPTY_TASK_FORM, value: string) => void;
  onTaskEditChange: (key: string, value: string) => void;
  onMessageChange: (key: keyof typeof EMPTY_MESSAGE_FORM, value: string) => void;
  onReportChange: (key: keyof typeof EMPTY_REPORT_FORM, value: string) => void;
  onCreateTask: () => void;
  onUpdateTask: (status?: string) => void;
  onAppendMessage: () => void;
  onAppendReport: () => void;
}) {
  const {
    tasks,
    allTasks,
    selectedTask,
    ownerOptions,
    taskFilter,
    taskForm,
    taskEdit,
    messageForm,
    reportForm,
    loading,
    onSelectTask,
    onFilterChange,
    onTaskFormChange,
    onTaskEditChange,
    onMessageChange,
    onReportChange,
    onCreateTask,
    onUpdateTask,
    onAppendMessage,
    onAppendReport,
  } = props;

  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">创建任务</h3>
              <p className="text-sm text-slate-500">新任务会直接进入任务链，后续的协作消息和汇报都沉淀在同一条链上。</p>
            </div>
            {loading ? <span className="text-sm text-slate-400">同步中</span> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="标题">
              <input className="field" value={taskForm.title} onChange={(event) => onTaskFormChange("title", event.target.value)} />
            </Field>
            <Field label="负责人">
              <input className="field" value={taskForm.owner_agent} onChange={(event) => onTaskFormChange("owner_agent", event.target.value)} />
            </Field>
            <Field label="优先级">
              <select className="field" value={taskForm.priority} onChange={(event) => onTaskFormChange("priority", event.target.value)}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </Field>
            <Field label="房间 ID">
              <input className="field" value={taskForm.source_room_id} onChange={(event) => onTaskFormChange("source_room_id", event.target.value)} />
            </Field>
            <Field label="截止时间">
              <input className="field" type="datetime-local" value={taskForm.due_at} onChange={(event) => onTaskFormChange("due_at", event.target.value)} />
            </Field>
            <Field label="说明">
              <textarea className="field min-h-[102px]" value={taskForm.description} onChange={(event) => onTaskFormChange("description", event.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" className="action-primary gap-2" onClick={onCreateTask}>
              <Plus className="h-4 w-4" />
              创建任务
            </button>
          </div>
        </div>

        <div className="panel p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="搜索">
              <input className="field" value={taskFilter.search} onChange={(event) => onFilterChange("search", event.target.value)} />
            </Field>
            <Field label="状态">
              <select className="field" value={taskFilter.status} onChange={(event) => onFilterChange("status", event.target.value)}>
                <option value="all">all</option>
                <option value="todo">todo</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
              </select>
            </Field>
            <Field label="负责人">
              <select className="field" value={taskFilter.owner} onChange={(event) => onFilterChange("owner", event.target.value)}>
                <option value="all">all</option>
                {ownerOptions.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="优先级">
              <select className="field" value={taskFilter.priority} onChange={(event) => onFilterChange("priority", event.target.value)}>
                <option value="all">all</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <button
                key={task.task_id}
                type="button"
                className={clsx(
                  "w-full rounded-2xl border p-4 text-left transition",
                  selectedTask?.task_id === task.task_id
                    ? "border-brand-400 bg-brand-50"
                    : "border-slate-200 bg-white hover:border-brand-200",
                )}
                onClick={() => onSelectTask(task.task_id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{task.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{task.latest_activity_summary}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{task.priority}</div>
                    <div className="mt-1 text-xs text-slate-500">{task.owner_agent}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill status={task.status} />
                  {task.is_overdue ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">逾期</span> : null}
                  {task.source_room_id ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{task.source_room_id}</span> : null}
                </div>
              </button>
            ))}
            {!tasks.length ? <EmptyState title="没有符合条件的任务" detail={`当前总任务数 ${allTasks.length}`} /> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="panel p-5">
          {selectedTask ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{selectedTask.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{selectedTask.description || "暂无补充说明"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-secondary" onClick={() => onUpdateTask("in_progress")}>
                    推进中
                  </button>
                  <button type="button" className="action-secondary" onClick={() => onUpdateTask("blocked")}>
                    阻塞
                  </button>
                  <button type="button" className="action-primary" onClick={() => onUpdateTask("completed")}>
                    完成
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="标题">
                  <input className="field" value={taskEdit.title ?? ""} onChange={(event) => onTaskEditChange("title", event.target.value)} />
                </Field>
                <Field label="负责人">
                  <input className="field" value={taskEdit.owner_agent ?? ""} onChange={(event) => onTaskEditChange("owner_agent", event.target.value)} />
                </Field>
                <Field label="优先级">
                  <select className="field" value={taskEdit.priority ?? "medium"} onChange={(event) => onTaskEditChange("priority", event.target.value)}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </Field>
                <Field label="截止时间">
                  <input className="field" type="datetime-local" value={taskEdit.due_at ?? ""} onChange={(event) => onTaskEditChange("due_at", event.target.value)} />
                </Field>
                <Field label="房间 ID">
                  <input className="field" value={taskEdit.source_room_id ?? ""} onChange={(event) => onTaskEditChange("source_room_id", event.target.value)} />
                </Field>
                <Field label="参与者">
                  <input className="field" value={taskEdit.participants ?? ""} onChange={(event) => onTaskEditChange("participants", event.target.value)} />
                </Field>
                <Field label="阻塞原因">
                  <textarea className="field min-h-[102px]" value={taskEdit.blocked_reason ?? ""} onChange={(event) => onTaskEditChange("blocked_reason", event.target.value)} />
                </Field>
                <Field label="详细说明">
                  <textarea className="field min-h-[102px]" value={taskEdit.description ?? ""} onChange={(event) => onTaskEditChange("description", event.target.value)} />
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" className="action-primary" onClick={() => onUpdateTask()}>
                  保存任务详情
                </button>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <SectionHeader title="协作记录" description="沉淀过程消息，并同步写入任务步骤。" />
                  <Field label="发送者">
                    <input className="field" value={messageForm.sender} onChange={(event) => onMessageChange("sender", event.target.value)} />
                  </Field>
                  <Field label="房间 ID">
                    <input className="field" value={messageForm.room_id} onChange={(event) => onMessageChange("room_id", event.target.value)} />
                  </Field>
                  <Field label="消息">
                    <textarea className="field min-h-[112px]" value={messageForm.content} onChange={(event) => onMessageChange("content", event.target.value)} />
                  </Field>
                  <div className="mt-3 flex justify-end">
                    <button type="button" className="action-secondary" onClick={onAppendMessage}>
                      写入任务消息
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <SectionHeader title="阶段汇报" description="背景、方案、预期结果会写入任务汇报和时间线。" />
                  <Field label="汇报人">
                    <input className="field" value={reportForm.reporter} onChange={(event) => onReportChange("reporter", event.target.value)} />
                  </Field>
                  <Field label="接收人">
                    <input className="field" value={reportForm.recipient} onChange={(event) => onReportChange("recipient", event.target.value)} />
                  </Field>
                  <Field label="汇总">
                    <textarea className="field min-h-[80px]" value={reportForm.summary} onChange={(event) => onReportChange("summary", event.target.value)} />
                  </Field>
                  <Field label="背景">
                    <textarea className="field min-h-[72px]" value={reportForm.background} onChange={(event) => onReportChange("background", event.target.value)} />
                  </Field>
                  <Field label="处理方案">
                    <textarea className="field min-h-[72px]" value={reportForm.approach} onChange={(event) => onReportChange("approach", event.target.value)} />
                  </Field>
                  <Field label="预期结果">
                    <textarea className="field min-h-[72px]" value={reportForm.expected_outcome} onChange={(event) => onReportChange("expected_outcome", event.target.value)} />
                  </Field>
                  <div className="mt-3 flex justify-end">
                    <button type="button" className="action-primary" onClick={onAppendReport}>
                      提交汇报
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <TimelineColumn title="状态历史" items={selectedTask.status_history.map((item) => `${formatTime(item.at)} · ${item.by} · ${item.to_status}${item.note ? ` · ${item.note}` : ""}`)} />
                <TimelineColumn title="步骤时间线" items={selectedTask.steps.map((step) => `${formatTime(step.updated_at)} · ${step.title}${step.note ? ` · ${step.note}` : ""}`)} />
                <TimelineColumn title="汇报与消息" items={[...selectedTask.reports.map((report) => `${formatTime(report.created_at)} · 汇报 · ${report.summary}`), ...selectedTask.messages.map((message) => `${formatTime(message.ts)} · ${message.sender} · ${message.content}`)]} />
              </div>
            </>
          ) : (
            <EmptyState title="请选择一个任务" detail="左侧任务卡片会在这里展开完整执行链。" />
          )}
        </div>
      </div>
    </section>
  );
}

function McpTab(props: {
  servers: MCPServer[];
  allServers: MCPServer[];
  selectedServer: MCPServer | null;
  filter: Record<string, string>;
  form: typeof EMPTY_MCP_FORM;
  categoryOptions: string[];
  agentLookupId: string;
  agentServers: string[];
  loading: boolean;
  onSelectServer: (name: string) => void;
  onFilterChange: (key: string, value: string) => void;
  onFormChange: (key: keyof typeof EMPTY_MCP_FORM, value: string | boolean) => void;
  onLookupAgentChange: (value: string) => void;
  onLookupAgent: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggle: (server: MCPServer) => void;
  onCreateNew: () => void;
}) {
  const {
    servers,
    allServers,
    selectedServer,
    filter,
    form,
    categoryOptions,
    agentLookupId,
    agentServers,
    loading,
    onSelectServer,
    onFilterChange,
    onFormChange,
    onLookupAgentChange,
    onLookupAgent,
    onSave,
    onDelete,
    onToggle,
    onCreateNew,
  } = props;

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">注册表</h3>
              <p className="text-sm text-slate-500">按服务类型和健康态管理 MCP，不再只是开关清单。</p>
            </div>
            <button type="button" className="action-primary gap-2" onClick={onCreateNew}>
              <Plus className="h-4 w-4" />
              新建服务
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="搜索">
              <input className="field" value={filter.search} onChange={(event) => onFilterChange("search", event.target.value)} />
            </Field>
            <Field label="分类">
              <select className="field" value={filter.category} onChange={(event) => onFilterChange("category", event.target.value)}>
                <option value="all">all</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 space-y-3">
            {servers.map((server) => (
              <div
                key={server.name}
                role="button"
                tabIndex={0}
                className={clsx(
                  "w-full rounded-2xl border p-4 text-left transition",
                  selectedServer?.name === server.name
                    ? "border-brand-400 bg-brand-50"
                    : "border-slate-200 bg-white hover:border-brand-200",
                )}
                onClick={() => onSelectServer(server.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectServer(server.name);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{server.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{server.description || "暂无描述"}</div>
                  </div>
                  <button
                    type="button"
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      server.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(server);
                    }}
                  >
                    {server.enabled ? "已启用" : "未启用"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <HealthPill status={server.health_status} />
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{server.category}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{server.transport}</span>
                </div>
              </div>
            ))}
            {!servers.length ? <EmptyState title="没有匹配的 MCP 服务" detail={`当前总服务数 ${allServers.length}`} /> : null}
          </div>
        </div>

        <div className="panel p-5">
          <SectionHeader title="Agent 启用关系" description="查看指定 Agent 当前挂载了哪些 MCP 服务。" />
          <div className="flex gap-3">
            <input className="field" value={agentLookupId} onChange={(event) => onLookupAgentChange(event.target.value)} />
            <button type="button" className="action-secondary" onClick={onLookupAgent}>
              查询
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {agentServers.map((name) => (
              <span key={name} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
                {name}
              </span>
            ))}
            {!agentServers.length ? <span className="text-sm text-slate-400">当前没有挂载的 MCP</span> : null}
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">治理详情</h3>
            <p className="text-sm text-slate-500">配置、授权、依赖、健康检查统一在这里维护。</p>
          </div>
          {loading ? <span className="text-sm text-slate-400">同步中</span> : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="名称">
            <input className="field" value={form.name} onChange={(event) => onFormChange("name", event.target.value)} />
          </Field>
          <Field label="分类">
            <input className="field" value={form.category} onChange={(event) => onFormChange("category", event.target.value)} />
          </Field>
          <Field label="传输">
            <select className="field" value={form.transport} onChange={(event) => onFormChange("transport", event.target.value)}>
              <option value="stdio">stdio</option>
              <option value="streamable-http">streamable-http</option>
            </select>
          </Field>
          <Field label="版本">
            <input className="field" value={form.version} onChange={(event) => onFormChange("version", event.target.value)} />
          </Field>
          <Field label="命令">
            <input className="field" value={form.command} onChange={(event) => onFormChange("command", event.target.value)} />
          </Field>
          <Field label="URL">
            <input className="field" value={form.url} onChange={(event) => onFormChange("url", event.target.value)} />
          </Field>
          <Field label="Owner">
            <input className="field" value={form.owner} onChange={(event) => onFormChange("owner", event.target.value)} />
          </Field>
          <Field label="文档地址">
            <input className="field" value={form.docs_url} onChange={(event) => onFormChange("docs_url", event.target.value)} />
          </Field>
          <Field label="标签">
            <input className="field" value={form.tags} onChange={(event) => onFormChange("tags", event.target.value)} />
          </Field>
          <Field label="依赖服务">
            <input className="field" value={form.dependency_names} onChange={(event) => onFormChange("dependency_names", event.target.value)} />
          </Field>
          <Field label="允许 Agent">
            <input className="field" value={form.allowed_agents} onChange={(event) => onFormChange("allowed_agents", event.target.value)} />
          </Field>
          <Field label="允许群组">
            <input className="field" value={form.allowed_groups} onChange={(event) => onFormChange("allowed_groups", event.target.value)} />
          </Field>
          <Field label="健康探测路径">
            <input className="field" value={form.health_path} onChange={(event) => onFormChange("health_path", event.target.value)} />
          </Field>
          <Field label="描述">
            <textarea className="field min-h-[104px]" value={form.description} onChange={(event) => onFormChange("description", event.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.enabled} onChange={(event) => onFormChange("enabled", event.target.checked)} />
            全局启用
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.auto_start} onChange={(event) => onFormChange("auto_start", event.target.checked)} />
            自动启动
          </label>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="action-secondary" onClick={onDelete} disabled={!selectedServer}>
            删除服务
          </button>
          <button type="button" className="action-primary" onClick={onSave}>
            保存配置
          </button>
        </div>

        {selectedServer ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <InfoPanel
              title="健康检查"
              items={[
                `状态：${selectedServer.health_status || "unknown"}`,
                `结果：${selectedServer.health_message || "暂无检查信息"}`,
                `最近检查：${formatTime(selectedServer.last_checked_at)}`,
              ]}
            />
            <InfoPanel
              title="授权与依赖"
              items={[
                `允许 Agent：${selectedServer.allowed_agents.join(", ") || "未限制"}`,
                `允许群组：${selectedServer.allowed_groups.join(", ") || "未限制"}`,
                `已启用 Agent：${selectedServer.enabled_agents.join(", ") || "暂无"}`,
                `依赖：${selectedServer.dependency_names.join(", ") || "无"}`,
              ]}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ChatroomTab(props: {
  tasks: TaskChain[];
  selectedTask: TaskChain | null;
  messageForm: typeof EMPTY_MESSAGE_FORM;
  onSelectTask: (taskId: string) => void;
  onMessageChange: (key: keyof typeof EMPTY_MESSAGE_FORM, value: string) => void;
  onAppendMessage: () => void;
}) {
  const { tasks, selectedTask, messageForm, onSelectTask, onMessageChange, onAppendMessage } = props;
  const rooms = Array.from(new Set(tasks.map((task) => task.source_room_id).filter(Boolean)));
  return (
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="panel p-5">
        <h3 className="text-lg font-semibold text-slate-950">聊天室绑定任务</h3>
        <p className="mt-1 text-sm text-slate-500">一个房间对应一个任务或一组任务时，消息会直接落回任务链。</p>
        <div className="mt-4 space-y-3">
          {tasks.map((task) => (
            <button
              key={task.task_id}
              type="button"
              className={clsx(
                "w-full rounded-2xl border p-4 text-left transition",
                selectedTask?.task_id === task.task_id
                  ? "border-brand-400 bg-brand-50"
                  : "border-slate-200 bg-white hover:border-brand-200",
              )}
              onClick={() => onSelectTask(task.task_id)}
            >
              <div className="text-sm font-semibold text-slate-950">{task.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                房间：{task.source_room_id || "未绑定"} · 消息 {task.messages.length} 条
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">当前房间清单</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {rooms.map((room) => (
              <span key={room} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                {room}
              </span>
            ))}
            {!rooms.length ? <span className="text-sm text-slate-400">还没有绑定房间的任务</span> : null}
          </div>
        </div>
      </div>

      <div className="panel p-5">
        {selectedTask ? (
          <>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-950">{selectedTask.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                当前房间：{selectedTask.source_room_id || "未绑定"}，消息会同时进入聊天室流和任务链消息列表。
              </p>
            </div>
            <div className="space-y-3">
              {selectedTask.messages.map((message) => (
                <div key={message.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold text-slate-950">{message.sender}</div>
                    <div className="text-xs text-slate-400">{formatTime(message.ts)}</div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{message.content}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <SectionHeader title="写入协作消息" description="这里发送的内容会直接沉淀进任务链消息和步骤时间线。" />
              <Field label="发送者">
                <input className="field" value={messageForm.sender} onChange={(event) => onMessageChange("sender", event.target.value)} />
              </Field>
              <Field label="房间 ID">
                <input className="field" value={messageForm.room_id} onChange={(event) => onMessageChange("room_id", event.target.value)} />
              </Field>
              <Field label="内容">
                <textarea className="field min-h-[112px]" value={messageForm.content} onChange={(event) => onMessageChange("content", event.target.value)} />
              </Field>
              <div className="mt-3 flex justify-end">
                <button type="button" className="action-primary" onClick={onAppendMessage}>
                  写入聊天室
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="请选择一个房间任务" detail="左侧选择任务后，可以直接查看并写入房间消息。" />
        )}
      </div>
    </section>
  );
}

function GatewayStatusBar(props: {
  connected: boolean;
  hello: GatewayHelloOk | null;
  error: string;
  busy: boolean;
  settings: { gatewayUrl: string; token: string; sessionKey: string };
  password: string;
  onSettingsChange: (key: "gatewayUrl" | "token" | "sessionKey", value: string) => void;
  onPasswordChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { connected, hello, error, busy, settings, password, onSettingsChange, onPasswordChange, onConnect, onDisconnect } = props;
  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Gateway 连接</h3>
          <p className="text-sm text-slate-500">旧 OpenClaw 的控制、会话、日志、Channels 和配置能力都通过这里接入新 UI。</p>
        </div>
        <div className="flex items-center gap-2">
          <HealthPill status={connected ? "healthy" : "missing"} />
          <span className="text-xs text-slate-500">{hello?.server?.version ? `server ${hello.server.version}` : "未握手"}</span>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Gateway URL">
          <input className="field" value={settings.gatewayUrl} onChange={(event) => onSettingsChange("gatewayUrl", event.target.value)} />
        </Field>
        <Field label="共享 Token">
          <input className="field" value={settings.token} onChange={(event) => onSettingsChange("token", event.target.value)} />
        </Field>
        <Field label="会话 Key">
          <input className="field" value={settings.sessionKey} onChange={(event) => onSettingsChange("sessionKey", event.target.value)} />
        </Field>
        <Field label="配对密码">
          <input className="field" type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="action-primary" onClick={onConnect} disabled={busy}>
          {connected ? "重连 Gateway" : "连接 Gateway"}
        </button>
        <button type="button" className="action-secondary" onClick={onDisconnect}>
          断开连接
        </button>
        <span className="text-xs text-slate-500">
          {connected
            ? `连接成功 · connId ${hello?.server?.connId ?? "unknown"}`
            : "未连接时，旧控制台模块会显示空态或错误态。"}
        </span>
      </div>
      {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    </section>
  );
}

function ChatTab(props: {
  connected: boolean;
  sessionKey: string;
  messages: unknown[];
  stream: string;
  message: string;
  loading: boolean;
  sending: boolean;
  error: string;
  onSessionKeyChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onReload: () => void;
  onSend: () => void;
  onAbort: () => void;
}) {
  const { connected, sessionKey, messages, stream, message, loading, sending, error, onSessionKeyChange, onMessageChange, onReload, onSend, onAbort } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">会话聊天</h3>
            <p className="text-sm text-slate-500">迁移自旧 Chat 页面，统一进新的 SilentLake 工作台。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新会话</button>
        </div>
        <Field label="Session Key">
          <input className="field" value={sessionKey} onChange={(event) => onSessionKeyChange(event.target.value)} />
        </Field>
        {error ? <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-4 space-y-3">
          {messages.map((entry, index) => {
            const record = entry as Record<string, unknown>;
            const role = String(record.role ?? "assistant");
            return (
              <div key={`${role}-${index}`} className={clsx("rounded-2xl border p-4", role === "user" ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white")}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{role}</span>
                  <span className="text-xs text-slate-400">{formatTime(typeof record.timestamp === "string" ? record.timestamp : null)}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{messageText(entry)}</div>
              </div>
            );
          })}
          {stream ? (
            <div className="rounded-2xl border border-brand-200 bg-white p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">streaming</div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{stream}</div>
            </div>
          ) : null}
          {!messages.length && !stream && !loading ? <EmptyState title="当前没有聊天记录" detail={connected ? "发送一条消息后会在这里看到历史。" : "先连接 Gateway，再查看会话历史。"} /> : null}
        </div>
      </div>
      <div className="panel p-5">
        <SectionHeader title="发送消息" description="支持发送、流式接收和主动中断。"/>
        <Field label="输入内容">
          <textarea className="field min-h-[180px]" value={message} onChange={(event) => onMessageChange(event.target.value)} />
        </Field>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="action-secondary" onClick={onAbort} disabled={!sending}>中断运行</button>
          <button type="button" className="action-primary" onClick={onSend} disabled={!connected || !message.trim() || sending}>发送消息</button>
        </div>
      </div>
    </section>
  );
}

function ChannelsTab(props: {
  snapshot: ChannelsStatusSnapshot | null;
  loading: boolean;
  error: string;
  whatsAppMessage: string;
  whatsAppQr: string | null;
  whatsAppConnected: boolean | null;
  onReload: (probe: boolean) => void;
  onStartWhatsApp: (force: boolean) => void;
  onWaitWhatsApp: () => void;
  onLogoutWhatsApp: () => void;
}) {
  const { snapshot, loading, error, whatsAppMessage, whatsAppQr, whatsAppConnected, onReload, onStartWhatsApp, onWaitWhatsApp, onLogoutWhatsApp } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">渠道总览</h3>
            <p className="text-sm text-slate-500">旧 OpenClaw 保留渠道页迁移到 React 后，统一成同一套列表和状态标签。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="action-secondary" onClick={() => onReload(false)}>刷新</button>
            <button type="button" className="action-secondary" onClick={() => onReload(true)}>主动探测</button>
          </div>
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {(snapshot?.channelOrder ?? []).map((channel) => {
            const accounts = snapshot?.channelAccounts?.[channel] ?? [];
            return (
              <div key={channel} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{snapshot?.channelLabels?.[channel] ?? channel}</div>
                    <div className="text-xs text-slate-500">{accounts.length} 个账号</div>
                  </div>
                  <span className="text-xs text-slate-400">{loading ? "刷新中" : channel}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {accounts.map((account) => (
                    <div key={account.accountId} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between">
                        <span>{account.name || account.accountId}</span>
                        <StatusPill status={account.running ? "running" : account.connected ? "connected" : "idle"} />
                      </div>
                    </div>
                  ))}
                  {!accounts.length ? <div className="text-sm text-slate-400">暂无账号</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel p-5">
        <h3 className="text-lg font-semibold text-slate-950">WhatsApp 登录流程</h3>
        <p className="mt-1 text-sm text-slate-500">把旧登录流程保留，同时重新做成统一操作面板。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="action-primary" onClick={() => onStartWhatsApp(false)}>开始登录</button>
          <button type="button" className="action-secondary" onClick={() => onStartWhatsApp(true)}>强制重置后登录</button>
          <button type="button" className="action-secondary" onClick={onWaitWhatsApp}>等待登录</button>
          <button type="button" className="action-secondary" onClick={onLogoutWhatsApp}>退出登录</button>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-700">状态：{whatsAppConnected === null ? "未知" : whatsAppConnected ? "已连接" : "未连接"}</div>
          <div className="mt-2 text-sm text-slate-500">{whatsAppMessage || "还未开始登录流程"}</div>
        </div>
        {whatsAppQr ? (
          <div className="mt-4 rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-950">二维码</div>
            <img src={whatsAppQr} alt="WhatsApp QR" className="mx-auto max-h-72 rounded-2xl border border-slate-200 bg-white p-3" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InstancesTab(props: {
  status: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  models: unknown[];
  heartbeat: Record<string, unknown> | null;
  loading: boolean;
  error: string;
  onReload: () => void;
}) {
  const { status, health, models, heartbeat, loading, error, onReload } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">实例态总览</h3>
            <p className="text-sm text-slate-500">迁移自旧 Instances / status 页面，用于快速看运行实例状态。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
        </div>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <InfoPanel title="状态摘要" items={[
          `status keys：${Object.keys(status ?? {}).length}`,
          `health keys：${Object.keys(health ?? {}).length}`,
          `models：${models.length}`,
          `heartbeat keys：${Object.keys(heartbeat ?? {}).length}`,
          loading ? "当前正在刷新实例态" : "实例态已加载",
        ]}/>
      </div>
      <div className="grid gap-4">
        <JsonPanel title="Status" value={status} />
        <JsonPanel title="Health" value={health} />
        <JsonPanel title="Models" value={models} />
        <JsonPanel title="Last Heartbeat" value={heartbeat} />
      </div>
    </section>
  );
}

function SessionsTab(props: {
  result: SessionsListResult | null;
  loading: boolean;
  error: string;
  activeWithin: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  onActiveWithinChange: (value: string) => void;
  onLimitChange: (value: string) => void;
  onIncludeGlobalChange: (value: boolean) => void;
  onIncludeUnknownChange: (value: boolean) => void;
  onReload: () => void;
  onPatch: (key: string, patch: Record<string, unknown>) => void;
  onDelete: (key: string) => void;
}) {
  const { result, loading, error, activeWithin, limit, includeGlobal, includeUnknown, onActiveWithinChange, onLimitChange, onIncludeGlobalChange, onIncludeUnknownChange, onReload, onPatch, onDelete } = props;
  const rows = result?.rows ?? [];
  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">会话管理</h3>
            <p className="text-sm text-slate-500">旧会话页迁移到新的工作台表格视图，可直接刷新、补丁更新和删除。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="活跃分钟">
            <input className="field" value={activeWithin} onChange={(event) => onActiveWithinChange(event.target.value)} />
          </Field>
          <Field label="结果上限">
            <input className="field" value={limit} onChange={(event) => onLimitChange(event.target.value)} />
          </Field>
          <label className="flex items-center gap-2 pt-7 text-sm text-slate-600">
            <input type="checkbox" checked={includeGlobal} onChange={(event) => onIncludeGlobalChange(event.target.checked)} />
            包含 global
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm text-slate-600">
            <input type="checkbox" checked={includeUnknown} onChange={(event) => onIncludeUnknownChange(event.target.checked)} />
            包含 unknown
          </label>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{row.label || row.key}</div>
                  <div className="mt-1 text-xs text-slate-500">agent {row.agentId || "unknown"} · model {row.model || "unknown"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-secondary" onClick={() => onPatch(row.key, { label: `${row.label || row.key} · 已更新` })}>补丁更新</button>
                  <button type="button" className="action-secondary" onClick={() => onDelete(row.key)}>删除</button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4 text-xs text-slate-500">
                <div>updatedAt：{formatTime(row.updatedAt || row.lastActivityAt || null)}</div>
                <div>thinking：{row.thinkingLevel || "default"}</div>
                <div>fastMode：{String(row.fastMode ?? false)}</div>
                <div>usage：{safeStringify(row.usage ?? {})}</div>
              </div>
            </div>
          ))}
          {!rows.length && !loading ? <EmptyState title="当前没有会话数据" detail="连接 Gateway 后刷新列表即可查看。" /> : null}
        </div>
      </div>
    </section>
  );
}

function UsageTab(props: {
  startDate: string;
  endDate: string;
  result: SessionsUsageResult | null;
  cost: CostUsageSummary | null;
  loading: boolean;
  error: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onReload: () => void;
}) {
  const { startDate, endDate, result, cost, loading, error, onStartDateChange, onEndDateChange, onReload } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">用量与成本</h3>
            <p className="text-sm text-slate-500">旧 usage 页迁移到新的统计工作台，统一展示 session 用量和成本摘要。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="开始日期">
            <input className="field" type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
          </Field>
          <Field label="结束日期">
            <input className="field" type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
          </Field>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MetricCard title="会话数" value={String(result?.sessions?.length ?? 0)} detail="当前筛选范围内的 session 使用量" icon={<FolderKanban className="h-5 w-5" />} />
          <MetricCard title="总成本" value={String(cost?.totalUsd ?? 0)} detail="usage.cost 返回的汇总金额" icon={<Gauge className="h-5 w-5" />} />
          <MetricCard title="Model 维度" value={String(cost?.byModel?.length ?? 0)} detail={loading ? "刷新中" : "按模型拆分成本"} icon={<Cpu className="h-5 w-5" />} />
        </div>
      </div>
      <div className="grid gap-4">
        <JsonPanel title="Session Usage" value={result} />
        <JsonPanel title="Cost Summary" value={cost} />
      </div>
    </section>
  );
}

function CronTab(props: {
  status: CronStatus | null;
  jobs: CronJob[];
  runs: CronRunLogEntry[];
  loading: boolean;
  error: string;
  editorMode: "create" | "update";
  selectedJobId: string;
  editorRaw: string;
  onSelectJob: (job: CronJob) => void;
  onCreateNew: () => void;
  onEditorRawChange: (value: string) => void;
  onReload: () => void;
  onSave: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRun: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { status, jobs, runs, loading, error, editorMode, selectedJobId, editorRaw, onSelectJob, onCreateNew, onEditorRawChange, onReload, onSave, onToggle, onRun, onRemove } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Cron Jobs</h3>
              <p className="text-sm text-slate-500">旧 cron 页迁移并统一到新的编辑器与运行列表。</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
              <button type="button" className="action-primary" onClick={onCreateNew}>新建 Job</button>
            </div>
          </div>
          <InfoPanel title="Worker 状态" items={[
            `enabled：${String(status?.enabled ?? false)}`,
            `running：${String(status?.running ?? false)}`,
            `workerPid：${String(status?.workerPid ?? "unknown")}`,
            loading ? "当前正在刷新 cron 信息" : "cron 信息已加载",
          ]}/>
          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          <div className="mt-4 space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className={clsx("rounded-2xl border p-4", selectedJobId === job.id ? "border-brand-300 bg-brand-50" : "border-slate-200")}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div role="button" tabIndex={0} onClick={() => onSelectJob(job)} onKeyDown={(event) => { if (event.key === "Enter") onSelectJob(job); }}>
                    <div className="text-sm font-semibold text-slate-950">{job.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{job.scheduleKind || "unknown"} · {job.cronExpr || job.scheduleAt || "未设置 schedule"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="action-secondary" onClick={() => onToggle(job.id, !job.enabled)}>{job.enabled ? "停用" : "启用"}</button>
                    <button type="button" className="action-secondary" onClick={() => onRun(job.id)}>立即运行</button>
                    <button type="button" className="action-secondary" onClick={() => onRemove(job.id)}>删除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <SectionHeader title="最近运行" description="最近执行结果和错误摘要。"/>
          <div className="space-y-3">
            {runs.map((run) => (
              <div key={run.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-950">{run.jobName || run.jobId || run.id}</span>
                  <StatusPill status={run.status || "unknown"} />
                </div>
                <div className="mt-2 text-xs text-slate-500">{formatTime(run.startedAt)} → {formatTime(run.finishedAt)}</div>
                {run.error ? <div className="mt-2 text-sm text-rose-600">{run.error}</div> : null}
              </div>
            ))}
            {!runs.length ? <EmptyState title="还没有运行记录" detail="运行任意 Job 后会出现在这里。" /> : null}
          </div>
        </div>
      </div>
      <div className="panel p-5">
        <SectionHeader title={editorMode === "create" ? "新建 Cron Job" : "编辑 Cron Job"} description="直接编辑 JSON 草稿，兼顾结构清晰和快速配置。"/>
        <textarea className="field min-h-[680px] font-mono text-xs" value={editorRaw} onChange={(event) => onEditorRawChange(event.target.value)} />
        <div className="mt-4 flex justify-end">
          <button type="button" className="action-primary" onClick={onSave}>保存草稿</button>
        </div>
      </div>
    </section>
  );
}

function AgentsTab(props: {
  agents: AgentsListResult | null;
  selectedAgentId: string;
  toolsCatalog: ToolsCatalogResult | null;
  loading: boolean;
  error: string;
  onSelectAgent: (agentId: string) => void;
  onReload: () => void;
}) {
  const { agents, selectedAgentId, toolsCatalog, loading, error, onSelectAgent, onReload } = props;
  const currentAgent = agents?.agents.find((agent) => agent.id === selectedAgentId) ?? null;
  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Agents 面板</h3>
            <p className="text-sm text-slate-500">旧 agents 页迁移并统一了卡片、状态和工具视图。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="space-y-3">
          {(agents?.agents ?? []).map((agent) => (
            <button key={agent.id} type="button" className={clsx("w-full rounded-2xl border p-4 text-left", selectedAgentId === agent.id ? "border-brand-300 bg-brand-50" : "border-slate-200")} onClick={() => onSelectAgent(agent.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{agent.id}</div>
                  <div className="text-xs text-slate-500">{agent.group || "未分组"} / {agent.type || "unknown"}</div>
                </div>
                <StatusPill status={String(agent.status || "unknown")} />
              </div>
            </button>
          ))}
          {!agents?.agents?.length && !loading ? <EmptyState title="当前没有 Agent 数据" detail="连接 Gateway 后刷新即可查看。"/> : null}
        </div>
      </div>
      <div className="grid gap-4">
        <JsonPanel title={`Agent 详情${currentAgent ? ` · ${currentAgent.id}` : ""}`} value={currentAgent} />
        <JsonPanel title="Tools Catalog" value={toolsCatalog} />
      </div>
    </section>
  );
}

function SkillsTab(props: {
  report: SkillStatusReport | null;
  loading: boolean;
  error: string;
  busyKey: string | null;
  edits: Record<string, string>;
  messages: Record<string, { kind: "success" | "error"; message: string }>;
  onEditChange: (key: string, value: string) => void;
  onReload: () => void;
  onToggle: (key: string, enabled: boolean) => void;
  onSaveKey: (key: string) => void;
  onInstall: (key: string) => void;
}) {
  const { report, loading, error, busyKey, edits, messages, onEditChange, onReload, onToggle, onSaveKey, onInstall } = props;
  const entries = [...(report?.skills ?? []), ...(report?.installed ?? []), ...(report?.available ?? [])].filter((entry, index, all) => all.findIndex((item) => item.skillKey === entry.skillKey) === index);
  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">技能管理</h3>
            <p className="text-sm text-slate-500">旧 skills 页迁移到新的管理表格，统一启停、安装和 API Key 编辑。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.skillKey} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{entry.name || entry.skillKey}</div>
                  <div className="mt-1 text-xs text-slate-500">{entry.description || entry.category || "暂无描述"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-secondary" disabled={busyKey === entry.skillKey} onClick={() => onToggle(entry.skillKey, !(entry.enabled ?? false))}>
                    {entry.enabled ? "停用" : "启用"}
                  </button>
                  <button type="button" className="action-secondary" disabled={busyKey === entry.skillKey} onClick={() => onInstall(entry.skillKey)}>
                    安装
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <input className="field" placeholder="输入 API Key" value={edits[entry.skillKey] ?? ""} onChange={(event) => onEditChange(entry.skillKey, event.target.value)} />
                <button type="button" className="action-primary" disabled={busyKey === entry.skillKey} onClick={() => onSaveKey(entry.skillKey)}>保存 Key</button>
              </div>
              {messages[entry.skillKey] ? (
                <div className={clsx("mt-3 rounded-xl px-3 py-2 text-sm", messages[entry.skillKey].kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                  {messages[entry.skillKey].message}
                </div>
              ) : null}
            </div>
          ))}
          {!entries.length && !loading ? <EmptyState title="当前没有技能数据" detail="连接 Gateway 并刷新后会显示技能清单。" /> : null}
        </div>
      </div>
    </section>
  );
}

function NodesTab(props: {
  devices: DevicePairingList | null;
  nodes: Array<Record<string, unknown>>;
  loading: boolean;
  error: string;
  onReload: () => void;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onRotate: (deviceId: string, role: string, scopes: string[]) => void;
  onRevoke: (deviceId: string, role: string) => void;
}) {
  const { devices, nodes, loading, error, onReload, onApprove, onReject, onRotate, onRevoke } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">设备配对与审批</h3>
            <p className="text-sm text-slate-500">旧 nodes / devices / approval 相关 UI 合并到一个治理面板。</p>
          </div>
          <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <SectionHeader title="待审批设备" description="请求批准、拒绝与角色绑定都在这里处理。"/>
        <div className="space-y-3">
          {(devices?.pending ?? []).map((device) => (
            <div key={device.requestId} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{device.displayName || device.deviceId}</div>
                  <div className="mt-1 text-xs text-slate-500">{device.role || device.roles?.join(", ") || "unknown role"} · {device.remoteIp || "unknown ip"}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="action-primary" onClick={() => onApprove(device.requestId)}>批准</button>
                  <button type="button" className="action-secondary" onClick={() => onReject(device.requestId)}>拒绝</button>
                </div>
              </div>
            </div>
          ))}
          {!devices?.pending?.length && !loading ? <EmptyState title="没有待审批设备" detail="新设备发起配对后会出现在这里。" /> : null}
        </div>
        <SectionHeader title="已配对设备" description="可轮换和吊销 token。"/>
        <div className="space-y-3">
          {(devices?.paired ?? []).map((device) => (
            <div key={device.deviceId} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{device.displayName || device.deviceId}</div>
                  <div className="mt-1 text-xs text-slate-500">{device.roles?.join(", ") || "无角色"} · {device.remoteIp || "unknown ip"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(device.tokens ?? []).map((token) => (
                    <div key={`${device.deviceId}-${token.role}`} className="flex gap-2">
                      <button type="button" className="action-secondary" onClick={() => onRotate(device.deviceId, token.role, token.scopes ?? [])}>轮换 {token.role}</button>
                      <button type="button" className="action-secondary" onClick={() => onRevoke(device.deviceId, token.role)}>吊销 {token.role}</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-5">
        <h3 className="text-lg font-semibold text-slate-950">Nodes 列表</h3>
        <p className="mt-1 text-sm text-slate-500">旧节点页迁移为更直接的运行状态列表。</p>
        <div className="mt-4 grid gap-3">
          {nodes.map((node, index) => (
            <div key={String(node.id ?? index)} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-950">{String(node.id ?? `node-${index}`)}</div>
                <StatusPill status={String(node.status ?? "unknown")} />
              </div>
              <div className="mt-2 text-xs text-slate-500">{safeStringify(node)}</div>
            </div>
          ))}
          {!nodes.length && !loading ? <EmptyState title="当前没有 nodes 数据" detail="连接 Gateway 后刷新即可查看。"/> : null}
        </div>
      </div>
    </section>
  );
}

function ConfigTab(props: {
  snapshot: ConfigSnapshot | null;
  schema: ConfigSchemaResponse | null;
  loading: boolean;
  error: string;
  raw: string;
  dirty: boolean;
  onRawChange: (value: string) => void;
  onReload: () => void;
  onSave: () => void;
  onApply: () => void;
  onRunUpdate: () => void;
}) {
  const { snapshot, schema, loading, error, raw, dirty, onRawChange, onReload, onSave, onApply, onRunUpdate } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">配置中心</h3>
            <p className="text-sm text-slate-500">旧 config 页迁移为统一编辑器，保留 raw 配置和 schema 视图。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
            <button type="button" className="action-secondary" onClick={onRunUpdate}>执行 update.run</button>
          </div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <SummaryStrip label="hash" value={snapshot?.hash || "unknown"} icon={<ScrollText className="h-4 w-4" />} />
          <SummaryStrip label="valid" value={String(snapshot?.valid ?? false)} icon={<ShieldCheck className="h-4 w-4" />} />
          <SummaryStrip label="dirty" value={String(dirty)} icon={<RefreshCw className="h-4 w-4" />} />
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <textarea className="field min-h-[620px] font-mono text-xs" value={raw} onChange={(event) => onRawChange(event.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="action-secondary" onClick={onSave}>保存</button>
          <button type="button" className="action-primary" onClick={onApply}>应用配置</button>
        </div>
      </div>
      <div className="grid gap-4">
        <JsonPanel title="Config Snapshot" value={snapshot} />
        <JsonPanel title="Config Schema" value={schema} />
      </div>
    </section>
  );
}

function ConfigSectionTab(props: {
  title: string;
  description: string;
  sectionKeys: string[];
  drafts: Record<string, string>;
  loading: boolean;
  error: string;
  onReload: () => void;
  onDraftChange: (key: string, value: string) => void;
  onSave: () => void;
  onApply: () => void;
}) {
  const { title, description, sectionKeys, drafts, loading, error, onReload, onDraftChange, onSave, onApply } = props;
  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="action-secondary" onClick={onReload}>刷新</button>
            <button type="button" className="action-primary" onClick={onApply}>{loading ? "应用中" : "应用分组配置"}</button>
          </div>
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {sectionKeys.map((key) => (
            <div key={key} className="rounded-2xl border border-slate-200 p-4">
              <SectionHeader title={key} description="JSON 分段编辑" />
              <textarea className="field min-h-[240px] font-mono text-xs" value={drafts[key] ?? "{}"} onChange={(event) => onDraftChange(key, event.target.value)} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className="action-secondary" onClick={onSave}>保存分组配置</button>
        </div>
      </div>
    </section>
  );
}

function DebugTab(props: {
  status: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  models: unknown[];
  heartbeat: Record<string, unknown> | null;
  loading: boolean;
  error: string;
  callMethod: string;
  callParams: string;
  callResult: string;
  onCallMethodChange: (value: string) => void;
  onCallParamsChange: (value: string) => void;
  onReload: () => void;
  onCall: () => void;
}) {
  const { status, health, models, heartbeat, loading, error, callMethod, callParams, callResult, onCallMethodChange, onCallParamsChange, onReload, onCall } = props;
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Debug 调用</h3>
              <p className="text-sm text-slate-500">迁移自旧 debug 页，保留任意 RPC 方法调用和结果查看。</p>
            </div>
            <button type="button" className="action-secondary" onClick={onReload}>刷新系统态</button>
          </div>
          {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          <Field label="Method">
            <input className="field" value={callMethod} onChange={(event) => onCallMethodChange(event.target.value)} />
          </Field>
          <Field label="Params">
            <textarea className="field min-h-[180px] font-mono text-xs" value={callParams} onChange={(event) => onCallParamsChange(event.target.value)} />
          </Field>
          <div className="mt-4 flex justify-end">
            <button type="button" className="action-primary" onClick={onCall}>执行调用</button>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-950">调用结果</div>
            <pre className="overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">{callResult || "还没有调用结果"}</pre>
          </div>
        </div>
      </div>
      <div className="grid gap-4">
        <JsonPanel title="Status" value={status} />
        <JsonPanel title="Health" value={health} />
        <JsonPanel title="Models" value={models} />
        <JsonPanel title="Last Heartbeat" value={heartbeat} />
        {loading ? <div className="text-sm text-slate-400">刷新中...</div> : null}
      </div>
    </section>
  );
}

function LogsTab(props: {
  entries: LogEntry[];
  file: string | null;
  truncated: boolean;
  loading: boolean;
  error: string;
  onReload: () => void;
  onMore: () => void;
}) {
  const { entries, file, truncated, loading, error, onReload, onMore } = props;
  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">日志中心</h3>
            <p className="text-sm text-slate-500">旧 logs 页迁移后统一成结构化日志列表，直接看 subsystem、level 和 message。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="action-secondary" onClick={onReload}>重新拉取</button>
            <button type="button" className="action-secondary" onClick={onMore}>加载更多</button>
          </div>
        </div>
        <div className="mb-4 text-xs text-slate-500">文件：{file || "unknown"} · truncated：{String(truncated)} · {loading ? "刷新中" : "已加载"}</div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={`${entry.time || "log"}-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>{entry.time || "no-time"}</span>
                <span>{entry.level || "info"}</span>
                <span>{entry.subsystem || "general"}</span>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.message}</div>
            </div>
          ))}
          {!entries.length && !loading ? <EmptyState title="当前没有日志" detail="连接 Gateway 后重新拉取即可查看。"/> : null}
        </div>
      </div>
    </section>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="panel p-5">
      <div className="mb-3 text-sm font-semibold text-slate-950">{title}</div>
      <pre className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
        {safeStringify(value ?? {})}
      </pre>
    </div>
  );
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: JSX.Element }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-brand-700">
        <div className="rounded-2xl bg-brand-50 p-2">{icon}</div>
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      </div>
      <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{title}</div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

function SummaryStrip({ label, value, icon }: { label: string; value: string; icon: JSX.Element }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</span>
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </div>
  );
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-950">{title}</div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {item}
          </div>
        ))}
        {!items.length ? <div className="text-sm text-slate-400">暂无记录</div> : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "blocked"
        ? "bg-amber-50 text-amber-700"
        : status === "failed"
          ? "bg-rose-50 text-rose-700"
          : status === "in_progress"
            ? "bg-brand-50 text-brand-700"
            : "bg-slate-100 text-slate-600";
  return <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{status}</span>;
}

function HealthPill({ status }: { status?: string | null }) {
  const className =
    status === "healthy"
      ? "bg-emerald-50 text-emerald-700"
      : status === "degraded"
        ? "bg-amber-50 text-amber-700"
        : status === "missing"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600";
  return <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{status || "unknown"}</span>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export default App;
