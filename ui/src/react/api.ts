import type {
  AgentsListResult,
  ChannelsStatusSnapshot,
  ConfigSchemaResponse,
  ConfigSnapshot,
  CostUsageSummary,
  CronJobsListResult,
  CronRunsResult,
  CronStatus,
  DashboardOverview,
  DevicePairingList,
  GatewayEventPayload,
  HealthSnapshot,
  LogEntry,
  MCPServer,
  SessionsListResult,
  SessionsUsageResult,
  SkillStatusReport,
  StatusSummary,
  TaskChain,
  ToolsCatalogResult,
  TopologyResponse,
} from "./types";

type GatewayRpcClient = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw new Error("后端 API 未联通，当前拿到的是 HTML 页面而不是 JSON。");
  }
  return JSON.parse(text) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await parseJsonResponse<Record<string, unknown>>(response);
  if (!response.ok) {
    throw new Error(
      String(payload.error ?? payload.message ?? `${response.status} ${response.statusText}`),
    );
  }
  return payload as T;
}

export async function fetchOverview(): Promise<DashboardOverview> {
  return request<DashboardOverview>("/api/v1/dashboard/overview");
}

export async function fetchTopology(): Promise<TopologyResponse> {
  return request<TopologyResponse>("/api/v1/dashboard/topology");
}

export async function fetchTaskChains(): Promise<TaskChain[]> {
  const payload = await request<{ chains: TaskChain[] }>("/api/v1/dashboard/task-chains");
  return payload.chains;
}

export async function createTaskChain(payload: Partial<TaskChain> & { title: string }): Promise<TaskChain> {
  return request<TaskChain>("/api/v1/dashboard/task-chains", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTaskChain(
  taskId: string,
  payload: Partial<TaskChain> & Record<string, unknown>,
): Promise<TaskChain> {
  return request<TaskChain>(`/api/v1/dashboard/task-chains/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function appendTaskMessage(
  taskId: string,
  payload: {
    sender: string;
    content: string;
    room_id?: string;
    create_step?: boolean;
    step_title?: string;
  },
): Promise<TaskChain> {
  return request<TaskChain>(`/api/v1/dashboard/task-chains/${taskId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function appendTaskReport(
  taskId: string,
  payload: {
    reporter: string;
    recipient: string;
    summary: string;
    background?: string;
    approach?: string;
    expected_outcome?: string;
  },
): Promise<TaskChain> {
  return request<TaskChain>(`/api/v1/dashboard/task-chains/${taskId}/reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchMcpServers(): Promise<MCPServer[]> {
  const payload = await request<{ servers: MCPServer[] }>("/api/v1/mcp/servers");
  return payload.servers;
}

export async function fetchMcpServer(name: string): Promise<MCPServer> {
  return request<MCPServer>(`/api/v1/mcp/servers/${encodeURIComponent(name)}`);
}

export async function saveMcpServer(payload: Partial<MCPServer> & { name: string }): Promise<MCPServer> {
  return request<MCPServer>("/api/v1/mcp/servers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMcpServer(name: string, payload: Partial<MCPServer>): Promise<MCPServer> {
  return request<MCPServer>(`/api/v1/mcp/servers/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function toggleMcpServer(name: string, enabled: boolean): Promise<MCPServer> {
  return request<MCPServer>(`/api/v1/mcp/servers/${encodeURIComponent(name)}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteMcpServer(name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/v1/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function fetchAgentMcp(agentId: string): Promise<string[]> {
  const payload = await request<{ servers: string[] }>(
    `/api/v1/mcp/agents/${encodeURIComponent(agentId)}`,
  );
  return payload.servers;
}

export async function rpcAgentsList(client: GatewayRpcClient): Promise<AgentsListResult> {
  return client.request<AgentsListResult>("agents.list", {});
}

export async function rpcToolsCatalog(
  client: GatewayRpcClient,
  agentId: string,
): Promise<ToolsCatalogResult> {
  return client.request<ToolsCatalogResult>("tools.catalog", {
    agentId,
    includePlugins: true,
  });
}

export async function rpcSessionsList(
  client: GatewayRpcClient,
  params: Record<string, unknown>,
): Promise<SessionsListResult> {
  return client.request<SessionsListResult>("sessions.list", params);
}

export async function rpcPatchSession(
  client: GatewayRpcClient,
  key: string,
  patch: Record<string, unknown>,
): Promise<unknown> {
  return client.request("sessions.patch", { key, ...patch });
}

export async function rpcDeleteSession(client: GatewayRpcClient, key: string): Promise<unknown> {
  return client.request("sessions.delete", { key, deleteTranscript: true });
}

export async function rpcChannelsStatus(
  client: GatewayRpcClient,
  probe: boolean,
): Promise<ChannelsStatusSnapshot | null> {
  return client.request<ChannelsStatusSnapshot | null>("channels.status", {
    probe,
    timeoutMs: 8000,
  });
}

export async function rpcStartWhatsAppLogin(
  client: GatewayRpcClient,
  force: boolean,
): Promise<{ message?: string; qrDataUrl?: string }> {
  return client.request("web.login.start", { force, timeoutMs: 30000 });
}

export async function rpcWaitWhatsAppLogin(
  client: GatewayRpcClient,
): Promise<{ message?: string; connected?: boolean }> {
  return client.request("web.login.wait", { timeoutMs: 120000 });
}

export async function rpcLogoutWhatsApp(client: GatewayRpcClient): Promise<unknown> {
  return client.request("channels.logout", { channel: "whatsapp" });
}

export async function rpcLogsTail(
  client: GatewayRpcClient,
  params: Record<string, unknown>,
): Promise<{
  file?: string;
  cursor?: number;
  lines?: string[];
  truncated?: boolean;
  reset?: boolean;
}> {
  return client.request("logs.tail", params);
}

export async function rpcLoadDevices(client: GatewayRpcClient): Promise<DevicePairingList> {
  const payload = await client.request<{ pending?: unknown[]; paired?: unknown[] }>(
    "device.pair.list",
    {},
  );
  return {
    pending: Array.isArray(payload.pending) ? (payload.pending as DevicePairingList["pending"]) : [],
    paired: Array.isArray(payload.paired) ? (payload.paired as DevicePairingList["paired"]) : [],
  };
}

export async function rpcApproveDevice(client: GatewayRpcClient, requestId: string) {
  return client.request("device.pair.approve", { requestId });
}

export async function rpcRejectDevice(client: GatewayRpcClient, requestId: string) {
  return client.request("device.pair.reject", { requestId });
}

export async function rpcRotateDeviceToken(
  client: GatewayRpcClient,
  params: { deviceId: string; role: string; scopes?: string[] },
) {
  return client.request("device.token.rotate", params);
}

export async function rpcRevokeDeviceToken(
  client: GatewayRpcClient,
  params: { deviceId: string; role: string },
) {
  return client.request("device.token.revoke", params);
}

export async function rpcNodesList(client: GatewayRpcClient): Promise<Array<Record<string, unknown>>> {
  const payload = await client.request<{ nodes?: Record<string, unknown>[] }>("node.list", {});
  return Array.isArray(payload.nodes) ? payload.nodes : [];
}

export async function rpcSkillsStatus(client: GatewayRpcClient): Promise<SkillStatusReport> {
  return client.request<SkillStatusReport>("skills.status", {});
}

export async function rpcSkillsUpdate(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
) {
  return client.request("skills.update", payload);
}

export async function rpcSkillsInstall(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
) {
  return client.request("skills.install", payload);
}

export async function rpcUsageSessions(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
): Promise<SessionsUsageResult> {
  return client.request<SessionsUsageResult>("sessions.usage", payload);
}

export async function rpcUsageCost(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
): Promise<CostUsageSummary> {
  return client.request<CostUsageSummary>("usage.cost", payload);
}

export async function rpcCronStatus(client: GatewayRpcClient): Promise<CronStatus> {
  return client.request<CronStatus>("cron.status", {});
}

export async function rpcCronJobs(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
): Promise<CronJobsListResult> {
  return client.request<CronJobsListResult>("cron.list", payload);
}

export async function rpcCronRuns(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
): Promise<CronRunsResult> {
  return client.request<CronRunsResult>("cron.runs", payload);
}

export async function rpcCronAdd(client: GatewayRpcClient, payload: Record<string, unknown>) {
  return client.request("cron.add", payload);
}

export async function rpcCronUpdate(
  client: GatewayRpcClient,
  id: string,
  patch: Record<string, unknown>,
) {
  return client.request("cron.update", { id, patch });
}

export async function rpcCronRun(client: GatewayRpcClient, id: string, mode = "foreground") {
  return client.request("cron.run", { id, mode });
}

export async function rpcCronRemove(client: GatewayRpcClient, id: string) {
  return client.request("cron.remove", { id });
}

export async function rpcConfigGet(client: GatewayRpcClient): Promise<ConfigSnapshot> {
  return client.request<ConfigSnapshot>("config.get", {});
}

export async function rpcConfigSchema(client: GatewayRpcClient): Promise<ConfigSchemaResponse> {
  return client.request<ConfigSchemaResponse>("config.schema", {});
}

export async function rpcConfigSet(
  client: GatewayRpcClient,
  raw: string,
  baseHash?: string | null,
) {
  return client.request("config.set", { raw, baseHash });
}

export async function rpcConfigApply(
  client: GatewayRpcClient,
  raw: string,
  baseHash?: string | null,
  sessionKey?: string,
) {
  return client.request("config.apply", { raw, baseHash, sessionKey });
}

export async function rpcRunUpdate(client: GatewayRpcClient, sessionKey?: string) {
  return client.request("update.run", { sessionKey });
}

export async function rpcStatus(client: GatewayRpcClient): Promise<StatusSummary> {
  return client.request<StatusSummary>("status", {});
}

export async function rpcHealth(client: GatewayRpcClient): Promise<HealthSnapshot> {
  return client.request<HealthSnapshot>("health", {});
}

export async function rpcModelsList(client: GatewayRpcClient): Promise<{ models?: unknown[] }> {
  return client.request<{ models?: unknown[] }>("models.list", {});
}

export async function rpcLastHeartbeat(client: GatewayRpcClient): Promise<Record<string, unknown>> {
  return client.request("last-heartbeat", {});
}

export async function rpcCallMethod(
  client: GatewayRpcClient,
  method: string,
  params: unknown,
): Promise<unknown> {
  return client.request(method, params);
}

export async function rpcChatHistory(
  client: GatewayRpcClient,
  sessionKey: string,
): Promise<{ messages?: unknown[]; thinkingLevel?: string }> {
  return client.request("chat.history", { sessionKey, limit: 200 });
}

export async function rpcChatSend(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return client.request("chat.send", payload);
}

export async function rpcChatAbort(
  client: GatewayRpcClient,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return client.request("chat.abort", payload);
}

export function extractGatewayChatEvent(frame: {
  event?: string;
  payload?: unknown;
}): GatewayEventPayload | null {
  const event = frame.event?.toLowerCase() ?? "";
  if (!event.includes("chat")) {
    return null;
  }
  const payload = frame.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.sessionKey !== "string" || typeof record.state !== "string") {
    return null;
  }
  return {
    runId: typeof record.runId === "string" ? record.runId : "",
    sessionKey: record.sessionKey,
    state: record.state as GatewayEventPayload["state"],
    message: record.message,
    errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
  };
}

export function parseLogLine(line: string): LogEntry {
  if (!line.trim()) {
    return { raw: line, message: line };
  }
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const meta =
      obj && typeof obj._meta === "object" && obj._meta !== null
        ? (obj._meta as Record<string, unknown>)
        : null;
    const time =
      typeof obj.time === "string" ? obj.time : typeof meta?.date === "string" ? meta.date : null;
    const level = typeof meta?.logLevelName === "string" ? meta.logLevelName.toLowerCase() : null;
    const subsystem =
      typeof obj["0"] === "string"
        ? obj["0"]
        : typeof meta?.name === "string"
          ? meta.name
          : null;
    const message =
      typeof obj["1"] === "string"
        ? obj["1"]
        : typeof obj.message === "string"
          ? obj.message
          : line;
    return {
      raw: line,
      time,
      level,
      subsystem,
      message,
      meta: meta ?? undefined,
    };
  } catch {
    return { raw: line, message: line };
  }
}
