import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { AgentsListResult } from "../types.ts";

type ChatMsg = {
  type: "normal" | "system" | "task" | "report";
  content: string;
  timestamp: string;
  room_id?: string;
  sender_id?: string;
  sender_name?: string;
};

type Room = {
  id: string;
  name: string;
  description?: string;
};

const PLATFORM_BASE = "http://localhost:18800";
const WS_BASE = "ws://localhost:18800";

@customElement("chatroom-view")
export class ChatroomView extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property({ attribute: false }) agentsList: AgentsListResult | null = null;

  @state() private rooms: Room[] = [];
  @state() private activeRoomId: string | null = null;
  @state() private messages: ChatMsg[] = [];
  @state() private draft = "";
  @state() private wsConnected = false;
  @state() private loadError: string | null = null;
  @state() private mentionOpen = false;
  @state() private mentionQuery = "";
  @state() private mentionIndex = 0;

  private ws: WebSocket | null = null;
  private mentionStart = -1;

  connectedCallback() {
    super.connectedCallback();
    void this.loadRooms();
  }

  disconnectedCallback() {
    this.ws?.close();
    this.ws = null;
    super.disconnectedCallback();
  }

  private get agentNames(): string[] {
    return (this.agentsList?.agents ?? []).map((a) => a.name ?? a.id);
  }

  private async loadRooms() {
    this.loadError = null;
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/rooms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rooms: Room[] };
      this.rooms = data.rooms ?? [];
      if (this.rooms.length > 0 && !this.activeRoomId) {
        await this.selectRoom(this.rooms[0].id);
      }
    } catch (err) {
      this.loadError = `加载聊天室失败: ${String(err)}`;
    }
  }

  private async selectRoom(roomId: string) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.activeRoomId = roomId;
    this.messages = [];
    this.wsConnected = false;
    this.loadError = null;

    // Load message history
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/rooms/${roomId}/messages?limit=50`);
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMsg[] };
        this.messages = data.messages ?? [];
      }
    } catch {
      // Ignore history load failures; WebSocket will bring new messages
    }

    this.connectWs(roomId);
    this.scrollToBottom();
  }

  private connectWs(roomId: string) {
    const ws = new WebSocket(`${WS_BASE}/ws/chat/${roomId}`);
    this.ws = ws;

    ws.onopen = () => {
      this.wsConnected = true;
    };

    ws.onclose = () => {
      this.wsConnected = false;
      if (this.ws === ws) {
        this.ws = null;
      }
    };

    ws.onerror = () => {
      this.loadError = "WebSocket 连接失败，请确认 Python 平台已启动（oc-platform platform start）";
      this.wsConnected = false;
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ChatMsg;
        // Skip duplicate welcome messages that overlap with loaded history
        if (
          msg.type === "system" &&
          this.messages.some((m) => m.timestamp === msg.timestamp && m.content === msg.content)
        ) {
          return;
        }
        this.messages = [...this.messages, msg];
        this.scrollToBottom();
      } catch {
        // Ignore malformed messages
      }
    };
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.querySelector(".chatroom-messages");
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  private sendMessage() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.draft.trim()) return;
    this.ws.send(
      JSON.stringify({
        type: "normal",
        content: this.draft.trim(),
        room_id: this.activeRoomId,
      }),
    );
    this.draft = "";
    this.mentionOpen = false;
  }

  private handleInput(e: Event) {
    const ta = e.target as HTMLTextAreaElement;
    this.draft = ta.value;

    const val = ta.value;
    const pos = ta.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx >= 0) {
      const query = before.slice(atIdx + 1);
      if (!query.includes(" ")) {
        this.mentionOpen = true;
        this.mentionQuery = query;
        this.mentionStart = atIdx;
        this.mentionIndex = 0;
        return;
      }
    }
    this.mentionOpen = false;
  }

  private handleKeyDown(e: KeyboardEvent) {
    const filtered = this.filteredAgents();
    if (this.mentionOpen && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.mentionIndex = (this.mentionIndex + 1) % filtered.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.mentionIndex = (this.mentionIndex - 1 + filtered.length) % filtered.length;
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.insertMention(filtered[this.mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        this.mentionOpen = false;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private filteredAgents(): string[] {
    const names = this.agentNames;
    if (!this.mentionQuery) return names;
    return names.filter((n) => n.toLowerCase().includes(this.mentionQuery.toLowerCase()));
  }

  private insertMention(name: string) {
    if (!name) return;
    const ta = this.querySelector(".chatroom-input") as HTMLTextAreaElement | null;
    if (!ta) return;
    const before = this.draft.slice(0, this.mentionStart);
    const after = this.draft.slice(ta.selectionStart ?? this.draft.length);
    this.draft = `${before}@${name} ${after}`;
    this.mentionOpen = false;
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + name.length + 2;
      ta.setSelectionRange(pos, pos);
    });
  }

  private msgTypeBadge(type: string) {
    switch (type) {
      case "task":
        return "任务委托";
      case "report":
        return "汇报通知";
      default:
        return null;
    }
  }

  private renderContent(content: string) {
    // Highlight @mentions
    const parts = content.split(/(@\S+)/g);
    return parts.map((part) =>
      part.startsWith("@")
        ? html`<span class="chatroom-mention">${part}</span>`
        : html`${part}`,
    );
  }

  render() {
    const activeRoom = this.rooms.find((r) => r.id === this.activeRoomId) ?? null;
    const filtered = this.mentionOpen ? this.filteredAgents() : [];

    return html`
      <div class="chatroom-layout">
        <!-- Left sidebar: room list -->
        <aside class="chatroom-sidebar">
          <div class="chatroom-sidebar__title">聊天室</div>
          ${this.rooms.map(
            (room) => html`
              <button
                class="chatroom-room-item ${room.id === this.activeRoomId ? "active" : ""}"
                type="button"
                @click=${() => void this.selectRoom(room.id)}
              >
                <span class="chatroom-room-item__icon">#</span>
                <span class="chatroom-room-item__name">${room.name}</span>
              </button>
            `,
          )}
          ${this.rooms.length === 0 && !this.loadError
            ? html`<div class="chatroom-sidebar__empty">暂无聊天室</div>`
            : nothing}
          <button
            class="chatroom-sidebar__reload btn btn--sm"
            type="button"
            @click=${() => void this.loadRooms()}
          >
            刷新
          </button>
        </aside>

        <!-- Main area -->
        <main class="chatroom-main">
          ${this.loadError
            ? html`
                <div class="callout danger chatroom-error">
                  ${this.loadError}
                  <button
                    class="btn btn--sm"
                    type="button"
                    @click=${() => void this.loadRooms()}
                  >
                    重试
                  </button>
                </div>
              `
            : nothing}

          <!-- Header -->
          <div class="chatroom-header">
            <span class="chatroom-header__name">${activeRoom?.name ?? "请选择聊天室"}</span>
            ${activeRoom?.description
              ? html`<span class="chatroom-header__desc">${activeRoom.description}</span>`
              : nothing}
            <span class="chatroom-header__status ${this.wsConnected ? "online" : "offline"}">
              ${this.wsConnected ? "● 已连接" : "○ 未连接"}
            </span>
          </div>

          <!-- Messages -->
          <div class="chatroom-messages">
            ${this.messages.map((msg) => {
              if (msg.type === "system") {
                return html`
                  <div class="chatroom-msg chatroom-msg--system">
                    <span class="chatroom-msg__system-text">${msg.content}</span>
                  </div>
                `;
              }
              const badge = this.msgTypeBadge(msg.type);
              const initials = (msg.sender_name ?? msg.sender_id ?? "?")[0].toUpperCase();
              return html`
                <div class="chatroom-msg chatroom-msg--${msg.type}">
                  <div class="chatroom-msg__avatar">${initials}</div>
                  <div class="chatroom-msg__body">
                    <div class="chatroom-msg__meta">
                      <span class="chatroom-msg__sender"
                        >${msg.sender_name ?? msg.sender_id ?? "Unknown"}</span
                      >
                      ${badge
                        ? html`<span class="chatroom-msg__badge chatroom-msg__badge--${msg.type}"
                            >${badge}</span
                          >`
                        : nothing}
                      <span class="chatroom-msg__time"
                        >${new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}</span
                      >
                    </div>
                    <div class="chatroom-msg__content">${this.renderContent(msg.content)}</div>
                  </div>
                </div>
              `;
            })}
            ${this.messages.length === 0 && !this.loadError && this.activeRoomId
              ? html`<div class="chatroom-messages__empty">暂无消息，发送第一条消息吧</div>`
              : nothing}
            ${!this.activeRoomId && !this.loadError
              ? html`<div class="chatroom-messages__empty">请从左侧选择聊天室</div>`
              : nothing}
          </div>

          <!-- Input area -->
          <div class="chatroom-input-area">
            ${this.mentionOpen && filtered.length > 0
              ? html`
                  <div class="chatroom-mention-dropdown">
                    ${filtered.map(
                      (name, idx) => html`
                        <button
                          class="chatroom-mention-item ${idx === this.mentionIndex ? "active" : ""}"
                          type="button"
                          @mousedown=${(e: Event) => {
                            e.preventDefault();
                            this.insertMention(name);
                          }}
                        >
                          @${name}
                        </button>
                      `,
                    )}
                  </div>
                `
              : nothing}
            <div class="chatroom-input-row">
              <textarea
                class="chatroom-input"
                placeholder=${this.wsConnected
                  ? "输入消息… Enter 发送，Shift+Enter 换行，@ 提及 Agent"
                  : "未连接到聊天室（确认 Python 平台已启动）"}
                .value=${this.draft}
                ?disabled=${!this.wsConnected}
                rows="3"
                @input=${this.handleInput.bind(this)}
                @keydown=${this.handleKeyDown.bind(this)}
              ></textarea>
              <button
                class="btn btn--primary chatroom-send-btn"
                type="button"
                ?disabled=${!this.wsConnected || !this.draft.trim()}
                @click=${this.sendMessage.bind(this)}
              >
                发送
              </button>
            </div>
          </div>
        </main>
      </div>
    `;
  }
}
