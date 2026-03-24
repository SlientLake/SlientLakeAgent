import type { Command } from "commander";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { formatSkillInfo, formatSkillsCheck, formatSkillsList } from "./skills-cli.format.js";

export type {
  SkillInfoOptions,
  SkillsCheckOptions,
  SkillsListOptions,
} from "./skills-cli.format.js";
export { formatSkillInfo, formatSkillsCheck, formatSkillsList } from "./skills-cli.format.js";

type SkillStatusReport = Awaited<
  ReturnType<(typeof import("../agents/skills-status.js"))["buildWorkspaceSkillStatus"]>
>;

async function loadSkillsStatusReport(): Promise<SkillStatusReport> {
  const config = loadConfig();
  const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
  const { buildWorkspaceSkillStatus } = await import("../agents/skills-status.js");
  return buildWorkspaceSkillStatus(workspaceDir, { config });
}

async function runSkillsAction(render: (report: SkillStatusReport) => string): Promise<void> {
  try {
    const report = await loadSkillsStatusReport();
    defaultRuntime.log(render(report));
  } catch (err) {
    defaultRuntime.error(String(err));
    defaultRuntime.exit(1);
  }
}

/**
 * Register the skills CLI commands
 */
export function registerSkillsCli(program: Command) {
  const skills = program
    .command("skills")
    .description("List and inspect available skills")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/skills", "docs.openclaw.ai/cli/skills")}\n`,
    );

  skills
    .command("list")
    .description("List all available skills")
    .option("--json", "Output as JSON", false)
    .option("--eligible", "Show only eligible (ready to use) skills", false)
    .option("-v, --verbose", "Show more details including missing requirements", false)
    .action(async (opts) => {
      await runSkillsAction((report) => formatSkillsList(report, opts));
    });

  skills
    .command("info")
    .description("Show detailed information about a skill")
    .argument("<name>", "Skill name")
    .option("--json", "Output as JSON", false)
    .action(async (name, opts) => {
      await runSkillsAction((report) => formatSkillInfo(report, name, opts));
    });

  skills
    .command("check")
    .description("Check which skills are ready vs missing requirements")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runSkillsAction((report) => formatSkillsCheck(report, opts));
    });

  // Default action (no subcommand) - show list
  skills.action(async () => {
    await runSkillsAction((report) => formatSkillsList(report, {}));
  });

  // coding subcommand — manage Coding CLI skills config
  const coding = skills
    .command("coding")
    .description("管理 Coding CLI Skills（claude / gemini / codex / opencode）");

  coding
    .command("list")
    .description("列出各 Agent 的 Coding CLI Skills 配置")
    .action(async () => {
      const { resolveDefaultAgentId } = await import("../agents/agent-scope.js");
      const { loadConfig } = await import("../config/config.js");
      const { theme } = await import("../terminal/theme.js");
      const config = loadConfig();
      const defaultId = resolveDefaultAgentId(config);
      const skillsPath = `${process.env.HOME ?? "~"}/.openclaw/agents/${defaultId}/.openclaw/skills.json`;
      try {
        const { readFileSync } = await import("node:fs");
        const raw = readFileSync(skillsPath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, { model?: string; preferredCli?: string }>;
        defaultRuntime.log(theme.heading("Coding Skills 配置\n"));
        for (const [name, cfg] of Object.entries(parsed)) {
          defaultRuntime.log(`  ${theme.bold(name)}`);
          if (cfg.model) defaultRuntime.log(`    model:        ${cfg.model}`);
          if (cfg.preferredCli) defaultRuntime.log(`    preferredCli: ${cfg.preferredCli}`);
        }
        if (Object.keys(parsed).length === 0) {
          defaultRuntime.log(theme.muted("  （使用默认配置）"));
        }
      } catch {
        defaultRuntime.log(theme.muted("暂无 skills.json，使用默认配置"));
      }
    });

  coding
    .command("set <skill>")
    .description("设置 skill 配置（如 coding-agent 或 gemini）")
    .option("--model <model>", "模型 ID")
    .option("--cli <cli>", "Preferred CLI（claude/codex/opencode/pi）")
    .option("--agent <agentId>", "目标 Agent ID（默认使用默认 Agent）")
    .action(async (skill: string, opts: { model?: string; cli?: string; agent?: string }) => {
      const { resolveDefaultAgentId } = await import("../agents/agent-scope.js");
      const { loadConfig } = await import("../config/config.js");
      const { theme } = await import("../terminal/theme.js");
      const { readFileSync, writeFileSync } = await import("node:fs");
      const config = loadConfig();
      const agentId = opts.agent ?? resolveDefaultAgentId(config);
      const skillsPath = `${process.env.HOME ?? "~"}/.openclaw/agents/${agentId}/.openclaw/skills.json`;
      let current: Record<string, { model?: string; preferredCli?: string }> = {};
      try {
        current = JSON.parse(readFileSync(skillsPath, "utf8"));
      } catch {
        // start fresh
      }
      const entry = { ...(current[skill] ?? {}) };
      if (opts.model) entry.model = opts.model;
      if (opts.cli) entry.preferredCli = opts.cli;
      current[skill] = entry;
      writeFileSync(skillsPath, JSON.stringify(current, null, 2));
      defaultRuntime.log(`${theme.ok("✓")} ${theme.bold(agentId)} / ${skill} 已更新`);
    });
}
