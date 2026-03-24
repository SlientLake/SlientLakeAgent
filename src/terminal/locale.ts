/**
 * Terminal locale detection and translation helper.
 *
 * Priority: OPENCLAW_LANG > LANG env > system default (en)
 * Set OPENCLAW_LANG=zh-CN to enable Chinese terminal output.
 */

type SupportedLocale = "zh-CN" | "en";

export function getTerminalLocale(): SupportedLocale {
  const explicit = process.env["OPENCLAW_LANG"] ?? "";
  if (explicit) {
    return explicit.startsWith("zh") ? "zh-CN" : "en";
  }
  const lang = process.env["LANG"] ?? process.env["LANGUAGE"] ?? "";
  if (lang.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

const ZH_CN: Record<string, string> = {
  // Common actions
  Connect: "连接",
  Refresh: "刷新",
  Loading: "加载中",
  Saving: "保存中",
  Save: "保存",
  Cancel: "取消",
  Delete: "删除",
  Create: "创建",
  Error: "错误",
  Done: "完成",

  // Status
  Online: "在线",
  Offline: "离线",
  Busy: "忙碌",
  Connected: "已连接",
  Disconnected: "未连接",

  // Channel status
  "Channel health and recent sessions": "频道健康状态与最近会话",
  "No agents found": "未找到 Agent",
  "No sessions found": "未找到会话",

  // Skills
  "Skills and API keys": "技能与 API 密钥",
  "List all available skills": "列出所有可用技能",
  "Show detailed information about a skill": "显示技能详情",

  // Config
  "Edit openclaw.json": "编辑 openclaw.json",

  // Cron
  "Wakeups and recurring runs": "唤醒与定时任务",

  // Platform
  "Platform not running": "平台未运行（请执行 oc-platform platform start）",

  // CLI success/error patterns
  "Created successfully": "创建成功",
  "Deleted successfully": "删除成功",
  "Updated successfully": "更新成功",
  "Operation failed": "操作失败",
};

/**
 * Terminal translate — returns zh-CN string if locale is zh-CN and key exists,
 * otherwise returns the key unchanged (acts as a passthrough for English).
 */
export function tt(key: string): string {
  if (getTerminalLocale() === "zh-CN") {
    return ZH_CN[key] ?? key;
  }
  return key;
}
