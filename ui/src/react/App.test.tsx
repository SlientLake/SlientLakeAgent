import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

type TaskRecord = {
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
  status_history: Array<{ id: string; from_status?: string | null; to_status: string; by: string; at: string; note?: string }>;
  steps: Array<{ id: string; title: string; status: string; owner_agent: string; updated_at: string; note?: string }>;
  messages: Array<{ id: string; sender: string; content: string; ts: string; room_id?: string | null; type?: string }>;
  reports: Array<{ id: string; reporter: string; recipient: string; type: string; status: string; created_at: string; summary: string }>;
  is_overdue?: boolean;
};

const overviewPayload = {
  total: 2,
  online: 2,
  agents: [
    {
      id: "001",
      type: "independent",
      group: "product",
      children: ["002"],
      status: "online",
      current_task: "任务链治理",
      tasks_completed_today: 3,
      token_usage_today: 100,
    },
    {
      id: "002",
      type: "dependent",
      group: "design",
      children: [],
      status: "online",
      current_task: "MCP 设计台",
      tasks_completed_today: 2,
      token_usage_today: 50,
    },
  ],
};

const topologyPayload = {
  nodes: [
    { id: "001", type: "independent", group: "product", status: "online" },
    { id: "002", type: "dependent", group: "design", status: "online" },
  ],
  links: [
    { source: "002", target: "001", type: "reports_to" },
    { source: "001", target: "002", type: "collaborates" },
  ],
};

function createTask(title = "收口任务"): TaskRecord {
  return {
    task_id: "task-001",
    title,
    description: "任务链需要闭环。",
    status: "todo",
    priority: "medium",
    origin_agent: "001",
    owner_agent: "002",
    participants: ["001", "002"],
    created_at: "2026-04-20T10:00:00",
    updated_at: "2026-04-20T10:00:00",
    due_at: "2026-04-22T18:00",
    source_room_id: "room-product",
    blocked_reason: null,
    latest_activity_at: "2026-04-20T10:00:00",
    latest_activity_summary: "任务已创建",
    status_history: [{ id: "hist-1", from_status: null, to_status: "todo", by: "pm-console", at: "2026-04-20T10:00:00" }],
    steps: [{ id: "step-1", title: "任务创建", status: "todo", owner_agent: "002", updated_at: "2026-04-20T10:00:00" }],
    messages: [],
    reports: [],
    is_overdue: false,
  };
}

function createMcp() {
  return {
    name: "design-hub",
    description: "设计系统资源服务",
    category: "design",
    transport: "stdio",
    command: "/bin/echo",
    args: [],
    url: null,
    env: {},
    config: { health_path: "health" },
    enabled: true,
    auto_start: false,
    version: "1.2.0",
    owner: "design-team",
    docs_url: "https://example.com/design-hub",
    allowed_agents: ["001", "002"],
    allowed_groups: ["design"],
    enabled_agents: ["002"],
    enabled_groups: ["design"],
    tags: ["design", "assets"],
    dependency_names: ["asset-index"],
    health_status: "healthy",
    health_message: "探测成功",
    last_checked_at: "2026-04-20T10:00:00",
  };
}

describe("App", () => {
  let tasks: TaskRecord[];
  let servers: ReturnType<typeof createMcp>[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tasks = [createTask()];
    servers = [createMcp()];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/v1/dashboard/overview") {
        return jsonResponse(overviewPayload);
      }
      if (url === "/api/v1/dashboard/topology") {
        return jsonResponse(topologyPayload);
      }
      if (url === "/api/v1/dashboard/task-chains" && method === "GET") {
        return jsonResponse({ chains: tasks });
      }
      if (url === "/api/v1/dashboard/task-chains" && method === "POST") {
        const payload = JSON.parse(String(init?.body));
        const created = createTask(payload.title);
        created.task_id = "task-new";
        created.owner_agent = payload.owner_agent;
        tasks = [...tasks, created];
        return jsonResponse(created);
      }
      if (url === `/api/v1/dashboard/task-chains/${tasks[0].task_id}` && method === "PUT") {
        const payload = JSON.parse(String(init?.body));
        tasks[0] = {
          ...tasks[0],
          ...payload,
          updated_at: "2026-04-20T11:00:00",
          latest_activity_summary: payload.latest_activity_summary || tasks[0].latest_activity_summary,
        };
        return jsonResponse(tasks[0]);
      }
      if (url === `/api/v1/dashboard/task-chains/${tasks[0].task_id}/messages`) {
        const payload = JSON.parse(String(init?.body));
        tasks[0] = {
          ...tasks[0],
          messages: [
            ...tasks[0].messages,
            {
              id: "msg-1",
              sender: payload.sender,
              content: payload.content,
              ts: "2026-04-20T11:20:00",
              room_id: payload.room_id,
              type: "note",
            },
          ],
        };
        return jsonResponse(tasks[0]);
      }
      if (url === `/api/v1/dashboard/task-chains/${tasks[0].task_id}/reports`) {
        const payload = JSON.parse(String(init?.body));
        tasks[0] = {
          ...tasks[0],
          reports: [
            ...tasks[0].reports,
            {
              id: "rpt-1",
              reporter: payload.reporter,
              recipient: payload.recipient,
              type: "ad_hoc",
              status: "submitted",
              created_at: "2026-04-20T11:30:00",
              summary: payload.summary,
            },
          ],
        };
        return jsonResponse(tasks[0]);
      }
      if (url === "/api/v1/mcp/servers" && method === "GET") {
        return jsonResponse({ servers });
      }
      if (url === "/api/v1/mcp/servers" && method === "POST") {
        const payload = JSON.parse(String(init?.body));
        const created = {
          ...createMcp(),
          ...payload,
          args: [],
          env: {},
          config: payload.config ?? {},
          enabled_agents: [],
          enabled_groups: payload.allowed_groups ?? [],
          health_status: "healthy",
          health_message: "探测成功",
          last_checked_at: "2026-04-20T11:00:00",
        };
        servers = [...servers, created];
        return jsonResponse(created);
      }
      if (url === "/api/v1/mcp/servers/design-hub" && method === "GET") {
        return jsonResponse(servers[0]);
      }
      if (url === "/api/v1/mcp/servers/design-hub/toggle") {
        servers[0] = { ...servers[0], enabled: !servers[0].enabled };
        return jsonResponse(servers[0]);
      }
      if (url === "/api/v1/mcp/agents/001") {
        return jsonResponse({ servers: ["design-hub"] });
      }
      throw new Error(`Unhandled request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders overview metrics", async () => {
    render(<App />);

    expect(await screen.findByText("多 Agent 协作平台控制台")).toBeInTheDocument();
    expect(await screen.findByText("在线 Agent")).toBeInTheDocument();
    expect(await screen.findByText("2/2")).toBeInTheDocument();
  });

  it("creates a task and shows it in the task board", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "任务看板" }));
    const titleFields = await screen.findAllByLabelText("标题");
    fireEvent.change(titleFields[0], { target: { value: "新任务闭环" } });
    const createButtons = await screen.findAllByRole("button", { name: "创建任务" });
    fireEvent.click(createButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("新任务闭环")).toBeInTheDocument();
    });
  });

  it("shows MCP governance data and toggles a server", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "MCP 注册中心" }));
    expect((await screen.findAllByText("design-hub")).length).toBeGreaterThan(0);
    fireEvent.click((await screen.findAllByText("design-hub"))[0]);
    expect(await screen.findByText("状态：healthy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "已启用" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/mcp/servers/design-hub/toggle",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
