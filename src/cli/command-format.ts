import { replaceCliName, resolveCliName } from "./cli-name.js";
import { normalizeProfileName } from "./profile-utils.js";

const PROFILE_FLAG_RE = /(?:^|\s)--profile(?:\s|=|$)/;
const DEV_FLAG_RE = /(?:^|\s)--dev(?:\s|$)/;

function buildCliPrefixRe(cliName: string): RegExp {
  const escaped = cliName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Keep legacy alias `openclaw` so env-profile injection works during migration.
  return new RegExp(
    `^(?:pnpm|npm|bunx|npx)\\s+(?:${escaped}|openclaw)\\b|^(?:${escaped}|openclaw)\\b`,
  );
}

export function formatCliCommand(
  command: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const cliName = resolveCliName();
  const cliPrefixRe = buildCliPrefixRe(cliName);
  const normalizedCommand = replaceCliName(command, cliName);
  const profile = normalizeProfileName(env.OPENCLAW_PROFILE);
  if (!profile) {
    return normalizedCommand;
  }
  if (!cliPrefixRe.test(normalizedCommand)) {
    return normalizedCommand;
  }
  if (PROFILE_FLAG_RE.test(normalizedCommand) || DEV_FLAG_RE.test(normalizedCommand)) {
    return normalizedCommand;
  }
  return normalizedCommand.replace(cliPrefixRe, (match) => `${match} --profile ${profile}`);
}
