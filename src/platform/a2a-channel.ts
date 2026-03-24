/**
 * A2A (Agent-to-Agent) persistent message channel.
 *
 * Wraps the Python platform's A2A router API to provide a typed interface
 * for inter-agent communication. The Python platform persists messages at
 * ~/.openclaw/a2a/chatrooms/ and exposes them via WebSocket + REST.
 *
 * Usage:
 *   const ch = new A2AChannel("agent-001", "http://localhost:18800");
 *   await ch.send("agent-002", "请处理这个任务", "task");
 *   const msgs = await ch.receive(20);
 */

export type A2AMessageType = "normal" | "task" | "report" | "system";

export type A2AMessage = {
  id?: string;
  room_id?: string;
  sender_id?: string;
  sender_name?: string;
  recipient_id?: string;
  type: A2AMessageType;
  content: string;
  timestamp: string;
};

export type A2ARoom = {
  id: string;
  name: string;
  description?: string;
};

export class A2AChannel {
  constructor(
    private readonly fromAgentId: string,
    private readonly platformUrl = "http://localhost:18800",
  ) {}

  /**
   * Send a message to another agent via the platform's A2A router.
   * Falls back to the chatroom broadcast if no dedicated direct-message endpoint exists.
   */
  async send(
    toAgentId: string,
    content: string,
    type: A2AMessageType = "normal",
    roomId?: string,
  ): Promise<boolean> {
    // Default to recipient's personal inbox room so receive() can find it
    const room = roomId ?? `direct_${toAgentId}`;
    try {
      const payload: Record<string, string> = {
        type,
        content,
        room_id: room,
        sender_id: this.fromAgentId,
        recipient_id: toAgentId,
      };
      // Use REST endpoint if available; fall back gracefully
      const res = await fetch(`${this.platformUrl}/api/v1/a2a/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Receive recent messages addressed to this agent.
   * Reads from the agent's personal inbox room: direct_{agentId}
   */
  async receive(limit = 20): Promise<A2AMessage[]> {
    try {
      const inboxRoom = `direct_${this.fromAgentId}`;
      const res = await fetch(
        `${this.platformUrl}/api/v1/rooms/${encodeURIComponent(inboxRoom)}/messages?limit=${limit}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { messages?: A2AMessage[] };
      return data.messages ?? [];
    } catch {
      return [];
    }
  }

  /**
   * List available chatrooms.
   */
  async listRooms(): Promise<A2ARoom[]> {
    try {
      const res = await fetch(`${this.platformUrl}/api/v1/rooms`);
      if (!res.ok) return [];
      const data = (await res.json()) as { rooms?: A2ARoom[] };
      return data.rooms ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Subscribe to real-time messages via WebSocket.
   * Returns a cleanup function to close the connection.
   */
  subscribe(
    roomId: string,
    onMessage: (msg: A2AMessage) => void,
    onError?: (err: Event) => void,
  ): () => void {
    const wsUrl = this.platformUrl.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/ws/chat/${roomId}`);

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as A2AMessage;
        onMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    if (onError) {
      ws.onerror = onError;
    }

    return () => ws.close();
  }
}
