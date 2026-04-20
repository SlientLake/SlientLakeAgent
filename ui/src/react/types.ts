export type DashboardOverview = {
  agents: Array<{
    id: string;
    type: string;
    group?: string | null;
    parent?: string | null;
    children: string[];
    status: string;
    last_heartbeat?: string | null;
    current_task?: string | null;
    token_usage_today?: number;
    tasks_completed_today?: number;
  }>;
  total: number;
  online: number;
};

export type TopologyResponse = {
  nodes: Array<{
    id: string;
    type: string;
    group?: string | null;
    status: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    type: string;
  }>;
};

export type TaskHistoryItem = {
  id: string;
  from_status?: string | null;
  to_status: string;
  by: string;
  at: string;
  note?: string;
};

export type TaskStep = {
  id: string;
  title: string;
  status: string;
  owner_agent?: string;
  updated_at: string;
  note?: string;
};

export type TaskMessage = {
  id: string;
  sender: string;
  content: string;
  ts: string;
  room_id?: string | null;
  type?: string;
};

export type TaskReport = {
  id: string;
  reporter: string;
  recipient: string;
  type: string;
  status: string;
  created_at: string;
  summary: string;
  background?: string;
  approach?: string;
  expected_outcome?: string;
};

export type TaskChain = {
  task_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  origin_agent: string;
  owner_agent: string;
  participants: string[];
  created_at: string;
  updated_at: string;
  due_at?: string | null;
  source_room_id?: string | null;
  blocked_reason?: string | null;
  latest_activity_at: string;
  latest_activity_summary: string;
  status_history: TaskHistoryItem[];
  steps: TaskStep[];
  messages: TaskMessage[];
  reports: TaskReport[];
  is_overdue?: boolean;
};

export type MCPServer = {
  name: string;
  description: string;
  category: string;
  transport: string;
  command?: string | null;
  args: string[];
  url?: string | null;
  env: Record<string, string>;
  config: Record<string, unknown>;
  enabled: boolean;
  auto_start: boolean;
  version?: string | null;
  owner?: string | null;
  docs_url?: string | null;
  allowed_agents: string[];
  allowed_groups: string[];
  enabled_agents: string[];
  enabled_groups: string[];
  tags: string[];
  dependency_names: string[];
  health_status?: string | null;
  health_message?: string | null;
  last_checked_at?: string | null;
};

export type GenericAgent = {
  id: string;
  type?: string;
  label?: string | null;
  model?: string | null;
  cwd?: string | null;
  status?: string | null;
  roles?: string[];
  group?: string | null;
  parent?: string | null;
  [key: string]: unknown;
};

export type AgentsListResult = {
  defaultId?: string | null;
  agents: GenericAgent[];
};

export type ToolsCatalogResult = {
  profiles?: Array<Record<string, unknown>>;
  entries?: Array<Record<string, unknown>>;
  groups?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type SessionRow = {
  key: string;
  label?: string | null;
  agentId?: string | null;
  model?: string | null;
  updatedAt?: string | null;
  lastActivityAt?: string | null;
  fastMode?: boolean | null;
  thinkingLevel?: string | null;
  usage?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type SessionsListResult = {
  defaults?: {
    defaultAgentId?: string | null;
    mainKey?: string | null;
    mainSessionKey?: string | null;
    scope?: string | null;
  } | null;
  rows?: SessionRow[];
  totals?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ConfigSnapshot = {
  hash?: string | null;
  raw?: string;
  config?: Record<string, unknown>;
  valid?: boolean | null;
  issues?: unknown[];
};

export type ConfigSchemaResponse = {
  version?: string | null;
  schema?: unknown;
  uiHints?: Record<string, unknown>;
};

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  audience?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  [key: string]: unknown;
};

export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type LogEntry = {
  raw: string;
  time?: string | null;
  level?: string | null;
  subsystem?: string | null;
  message: string;
  meta?: Record<string, unknown>;
};

export type DeviceTokenSummary = {
  role: string;
  scopes?: string[];
  createdAtMs?: number;
  rotatedAtMs?: number;
  revokedAtMs?: number;
  lastUsedAtMs?: number;
};

export type PendingDevice = {
  requestId: string;
  deviceId: string;
  displayName?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  isRepair?: boolean;
  ts?: number;
};

export type PairedDevice = {
  deviceId: string;
  displayName?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  tokens?: DeviceTokenSummary[];
  createdAtMs?: number;
  approvedAtMs?: number;
};

export type DevicePairingList = {
  pending: PendingDevice[];
  paired: PairedDevice[];
};

export type SkillEntry = {
  skillKey: string;
  name?: string | null;
  enabled?: boolean | null;
  apiKeyConfigured?: boolean | null;
  description?: string | null;
  installId?: string | null;
  category?: string | null;
  [key: string]: unknown;
};

export type SkillStatusReport = {
  skills?: SkillEntry[];
  installed?: SkillEntry[];
  available?: SkillEntry[];
  [key: string]: unknown;
};

export type UsageSession = {
  key?: string;
  sessionKey?: string;
  model?: string | null;
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  [key: string]: unknown;
};

export type SessionsUsageResult = {
  sessions?: UsageSession[];
  totals?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CostUsageSummary = {
  totalUsd?: number | null;
  byModel?: Array<Record<string, unknown>>;
  byProvider?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type CronJob = {
  id: string;
  name: string;
  enabled?: boolean;
  scheduleKind?: string;
  cronExpr?: string | null;
  scheduleAt?: string | null;
  everyAmount?: number | null;
  payloadText?: string | null;
  sessionTarget?: string | null;
  updatedAt?: string | null;
  lastRunStatus?: string | null;
  [key: string]: unknown;
};

export type CronRunLogEntry = {
  id: string;
  jobId?: string | null;
  jobName?: string | null;
  status?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  deliveryStatus?: string | null;
  error?: string | null;
  [key: string]: unknown;
};

export type CronStatus = {
  enabled?: boolean;
  running?: boolean;
  workerPid?: number | null;
  [key: string]: unknown;
};

export type CronJobsListResult = {
  jobs?: CronJob[];
  total?: number;
  limit?: number;
  offset?: number;
  nextOffset?: number | null;
  hasMore?: boolean;
};

export type CronRunsResult = {
  runs?: CronRunLogEntry[];
  total?: number;
  limit?: number;
  offset?: number;
  nextOffset?: number | null;
  hasMore?: boolean;
};

export type HealthSnapshot = Record<string, unknown>;

export type StatusSummary = Record<string, unknown>;

export type ChatMessage = {
  role?: string;
  text?: string;
  timestamp?: number | string;
  content?: Array<{ type: string; text?: string; source?: unknown }>;
  [key: string]: unknown;
};

export type GatewayEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};
