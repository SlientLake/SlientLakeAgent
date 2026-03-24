/**
 * SilentLake Python platform launcher.
 *
 * Called on gateway startup. Checks if the Python platform (oc-platform) is
 * already running at http://localhost:18800. If not, attempts to spawn it as a
 * child process from the `platform/` directory alongside this package.
 *
 * The spawned process is detached and its stdio is piped to the gateway log.
 * Errors are silently ignored — the platform is optional.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM_URL = "http://localhost:18800";
const HEALTH_TIMEOUT_MS = 3_000;

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

/** Check if the Python platform is already responding. */
async function isPlatformRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${PLATFORM_URL}/api/v1/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve the `platform/` directory relative to this package root. */
function resolvePlatformDir(): string | null {
  try {
    // Walk up from src/platform/ → src/ → package root → platform/
    const thisFile = fileURLToPath(import.meta.url);
    const pkgRoot = path.resolve(path.dirname(thisFile), "../../");
    const candidate = path.join(pkgRoot, "platform");
    if (existsSync(path.join(candidate, "main.py"))) {
      return candidate;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Ensure the Python platform is running.
 * If already running, does nothing. Otherwise spawns `python main.py`
 * in the platform/ directory as a detached background process.
 */
export async function ensurePlatformRunning(log?: Logger): Promise<void> {
  try {
    if (await isPlatformRunning()) {
      log?.info("[SilentLake] Python platform already running at http://localhost:18800");
      return;
    }

    const platformDir = resolvePlatformDir();
    if (!platformDir) {
      log?.warn("[SilentLake] platform/ directory not found — skipping auto-start");
      return;
    }

    log?.info("[SilentLake] Starting Python platform...");

    const child = spawn("python", ["main.py"], {
      cwd: platformDir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (data: Buffer) => {
      log?.info(`[platform] ${data.toString().trim()}`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      log?.warn(`[platform] ${data.toString().trim()}`);
    });

    child.on("error", (err) => {
      log?.warn(`[SilentLake] Failed to start Python platform: ${err.message}`);
    });

    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        log?.warn(`[SilentLake] Python platform exited with code ${code}`);
      }
    });

    // Unref so the gateway process can exit independently of the platform
    child.unref();

    log?.info(`[SilentLake] Python platform spawned (pid ${child.pid ?? "unknown"})`);
  } catch {
    // Never crash the gateway due to platform launch failure
  }
}
