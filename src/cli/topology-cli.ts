import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";

const DEFAULT_PLATFORM = "http://localhost:18800";

type TopoNode = { id: string; type?: string; status?: string; group?: string };
type TopoLink = { source: string; target: string; type?: string };
type TopoData = { nodes: TopoNode[]; links: TopoLink[] };

function toMermaid(data: TopoData): string {
  const lines: string[] = ["graph TD"];
  for (const node of data.nodes ?? []) {
    const label = node.type ? `${node.id}\\n[${node.type}]` : node.id;
    const shape = node.type === "independent" ? `([${label}])` : `[${label}]`;
    lines.push(`  ${node.id}${shape}`);
  }
  for (const link of data.links ?? []) {
    const arrow = link.type === "collaborates" ? "-.->" : "-->";
    lines.push(`  ${link.source} ${arrow} ${link.target}`);
  }
  return lines.join("\n");
}

function toTable(data: TopoData): string {
  const header = `${theme.heading("Agent Topology")}\n`;
  const nodeLines = (data.nodes ?? []).map((n) => {
    const statusColor =
      n.status === "online"
        ? theme.ok(n.status)
        : n.status === "busy"
          ? theme.warn(n.status)
          : theme.muted(n.status ?? "offline");
    return `  ${theme.bold(n.id.padEnd(20))} ${statusColor.padEnd(20)} ${theme.muted(n.type ?? "")}`;
  });
  return header + nodeLines.join("\n");
}

export function registerTopologyCli(program: Command) {
  program
    .command("topology")
    .description("Show org topology (Mermaid or table)")
    .option("--mermaid", "Output as Mermaid diagram", false)
    .option("--json", "Output as JSON", false)
    .option("--url <url>", "Platform URL", DEFAULT_PLATFORM)
    .action(async (opts: { mermaid: boolean; json: boolean; url: string }) => {
      try {
        const res = await fetch(`${opts.url}/api/v1/dashboard/topology`);
        if (!res.ok) throw new Error(`HTTP ${res.status} — 请确认 Python 平台已启动`);
        const data = (await res.json()) as TopoData;

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(data, null, 2));
        } else if (opts.mermaid) {
          defaultRuntime.log(toMermaid(data));
        } else {
          defaultRuntime.log(toTable(data));
          defaultRuntime.log(
            `\n${theme.muted(`共 ${data.nodes?.length ?? 0} 个 Agent，${data.links?.length ?? 0} 条关系`)}`,
          );
        }
      } catch (err) {
        defaultRuntime.error(`拓扑获取失败: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });
}
