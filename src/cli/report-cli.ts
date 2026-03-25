import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";

const DEFAULT_PLATFORM = "http://localhost:18800";

type Report = {
  id?: string;
  agent_id?: string;
  title?: string;
  created_at?: string;
  summary?: string;
};

function formatReport(r: Report): string {
  const lines = [
    theme.accent(r.title ?? r.id ?? "—"),
    `  ${theme.muted("Agent:")} ${r.agent_id ?? "—"}`,
    `  ${theme.muted("时间:")} ${r.created_at ?? "—"}`,
  ];
  if (r.summary) {
    lines.push(`  ${theme.muted("摘要:")} ${r.summary}`);
  }
  return lines.join("\n");
}

export function registerReportCli(program: Command) {
  const report = program.command("report").description("查看和管理 Agent 汇报记录");

  report
    .command("list [agent]")
    .description("列出汇报记录（可按 Agent 过滤）")
    .option("--json", "Output as JSON", false)
    .option("--limit <n>", "最多显示条数", "20")
    .option("--url <url>", "Platform URL", DEFAULT_PLATFORM)
    .action(
      async (agent: string | undefined, opts: { json: boolean; limit: string; url: string }) => {
        try {
          const qs = new URLSearchParams({ limit: opts.limit });
          if (agent) {
            qs.set("agent_id", agent);
          }
          const res = await fetch(`${opts.url}/api/v1/reports?${qs}`);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} — 请确认 Python 平台已启动`);
          }
          const data = (await res.json()) as { reports: Report[] };
          const reports = data.reports ?? [];

          if (opts.json) {
            defaultRuntime.log(JSON.stringify(reports, null, 2));
            return;
          }

          if (reports.length === 0) {
            defaultRuntime.log(theme.muted("暂无汇报记录"));
            return;
          }
          defaultRuntime.log(
            `${theme.heading("汇报记录")}${agent ? ` — ${theme.accent(agent)}` : ""}\n`,
          );
          for (const r of reports) {
            defaultRuntime.log(formatReport(r));
            defaultRuntime.log("");
          }
        } catch (err) {
          defaultRuntime.error(`汇报查询失败: ${String(err)}`);
          defaultRuntime.exit(1);
        }
      },
    );
}
