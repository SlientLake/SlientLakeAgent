/**
 * Register this openclaw gateway process with the SilentLake Python platform.
 *
 * Called on gateway startup. Posts a heartbeat to the platform so the topology
 * dashboard can show the agent as "online". Errors are silently ignored since
 * the platform may not be running.
 *
 * Usage (in gateway startup code):
 *   import { registerWithPlatform, startHeartbeat } from "../platform/register.js";
 *   await registerWithPlatform(agentId, port);
 *   const stopHeartbeat = startHeartbeat(agentId, port);  // call stopHeartbeat() on shutdown
 */

const DEFAULT_PLATFORM_URL = "http://localhost:18800";

export async function registerWithPlatform(
  agentId: string,
  port: number,
  platformUrl = DEFAULT_PLATFORM_URL,
): Promise<boolean> {
  try {
    const res = await fetch(`${platformUrl}/api/v1/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        port,
        status: "online",
        ts: Date.now(),
      }),
    });
    return res.ok;
  } catch {
    // Platform not running — ignore
    return false;
  }
}

/**
 * Start a periodic heartbeat to the platform (every 60 seconds).
 * Returns a stop function.
 */
export function startHeartbeat(
  agentId: string,
  port: number,
  platformUrl = DEFAULT_PLATFORM_URL,
  intervalMs = 60_000,
): () => void {
  // Send first heartbeat immediately
  void registerWithPlatform(agentId, port, platformUrl);

  const timer = setInterval(() => {
    void registerWithPlatform(agentId, port, platformUrl);
  }, intervalMs);

  return () => clearInterval(timer);
}
