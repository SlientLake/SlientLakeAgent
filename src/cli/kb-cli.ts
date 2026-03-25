import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";

const DEFAULT_PLATFORM = "http://localhost:18800";

type KnowledgeBase = {
  kb_id: string;
  name: string;
  kb_type?: string;
  description?: string;
  owner_agent_id?: string | null;
};

export function registerKbCli(program: Command) {
  const kb = program.command("kb").description("知识库管理（Knowledge Base）");

  kb.command("list")
    .description("列出所有知识库")
    .option("--json", "Output as JSON", false)
    .option("--url <url>", "Platform URL", DEFAULT_PLATFORM)
    .action(async (opts: { json: boolean; url: string }) => {
      try {
        const res = await fetch(`${opts.url}/api/v1/kb/list`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} — 请确认 Python 平台已启动`);
        }
        const data = (await res.json()) as { kbs: KnowledgeBase[] };
        const kbs = data.kbs ?? [];

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(kbs, null, 2));
          return;
        }
        if (kbs.length === 0) {
          defaultRuntime.log(theme.muted("暂无知识库"));
          return;
        }
        defaultRuntime.log(theme.heading("知识库列表\n"));
        for (const k of kbs) {
          defaultRuntime.log(
            `  ${theme.accent(k.kb_id.padEnd(24))} ${theme.muted(k.kb_type ?? "")} ${k.name}`,
          );
          if (k.description) {
            defaultRuntime.log(`    ${theme.muted(k.description)}`);
          }
        }
      } catch (err) {
        defaultRuntime.error(`知识库查询失败: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });

  kb.command("create <id>")
    .description("创建知识库")
    .option("--name <name>", "知识库名称")
    .option("--type <type>", "类型（shared/private/team）", "shared")
    .option("--desc <desc>", "描述")
    .option("--owner <agentId>", "Owner Agent ID")
    .option("--url <url>", "Platform URL", DEFAULT_PLATFORM)
    .action(
      async (
        id: string,
        opts: { name?: string; type: string; desc?: string; owner?: string; url: string },
      ) => {
        try {
          const res = await fetch(`${opts.url}/api/v1/kb/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              name: opts.name ?? id,
              type: opts.type,
              description: opts.desc ?? "",
              owner: opts.owner ?? null,
            }),
          });
          if (!res.ok) {
            const data = (await res.json()) as { error?: string };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          defaultRuntime.log(`${theme.success("✓")} 知识库 ${theme.accent(id)} 已创建`);
        } catch (err) {
          defaultRuntime.error(`创建失败: ${String(err)}`);
          defaultRuntime.exit(1);
        }
      },
    );

  kb.command("delete <id>")
    .description("删除知识库")
    .option("--url <url>", "Platform URL", DEFAULT_PLATFORM)
    .action(async (id: string, opts: { url: string }) => {
      try {
        const res = await fetch(`${opts.url}/api/v1/kb/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        defaultRuntime.log(`${theme.success("✓")} 知识库 ${theme.accent(id)} 已删除`);
      } catch (err) {
        defaultRuntime.error(`删除失败: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });
}
