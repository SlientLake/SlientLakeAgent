import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

type McpServer = {
  name: string;
  description?: string;
  category?: string;
  transport?: string;
  enabled: boolean;
  auto_start?: boolean;
  command?: string | null;
  url?: string | null;
};

const PLATFORM_BASE = "http://localhost:18800";

@customElement("mcp-manager-view")
export class McpManagerView extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private servers: McpServer[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private toggling = new Set<string>();

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/mcp/servers`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { servers: McpServer[]; error?: string };
      if (data.error) {
        throw new Error(data.error);
      }
      this.servers = data.servers ?? [];
    } catch (err) {
      this.error = `加载 MCP Server 失败: ${String(err)}`;
    } finally {
      this.loading = false;
    }
  }

  private async toggle(name: string, enabled: boolean) {
    this.toggling = new Set([...this.toggling, name]);
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/mcp/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      // Optimistic update
      this.servers = this.servers.map((s) => (s.name === name ? { ...s, enabled } : s));
    } catch (err) {
      this.error = `切换失败: ${String(err)}`;
    } finally {
      const next = new Set(this.toggling);
      next.delete(name);
      this.toggling = next;
    }
  }

  render() {
    const byCategory = new Map<string, McpServer[]>();
    for (const s of this.servers) {
      const cat = s.category ?? "其他";
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(s);
    }

    return html`
      <div class="mcp-layout">
        <div class="mcp-toolbar">
          <span class="mcp-toolbar__title">MCP Server 管理</span>
          <button
            class="btn btn--sm"
            type="button"
            ?disabled=${this.loading}
            @click=${() => void this.load()}
          >
            ${this.loading ? "加载中…" : "刷新"}
          </button>
        </div>

        ${
          this.error
            ? html`<div class="callout danger mcp-error">
              ${this.error}
              <button class="btn btn--sm" type="button" @click=${() => void this.load()}>
                重试
              </button>
            </div>`
            : nothing
        }

        ${
          this.servers.length === 0 && !this.loading
            ? html`
                <div class="card mcp-empty">
                  <div class="card-title">暂无 MCP Server</div>
                  <div class="card-sub">
                    请确认 Python 平台已启动（<code>oc-platform platform start</code>）<br />
                    并在 <code>~/.openclaw/mcp/registry.yaml</code> 中注册 MCP Server。
                  </div>
                </div>
              `
            : nothing
        }

        ${[...byCategory.entries()].map(
          ([category, servers]) => html`
            <div class="mcp-category">
              <div class="mcp-category__label">${category}</div>
              <div class="mcp-server-list">
                ${servers.map(
                  (server) => html`
                    <div class="mcp-server-card ${server.enabled ? "enabled" : "disabled"}">
                      <div class="mcp-server-card__main">
                        <div class="mcp-server-card__name">${server.name}</div>
                        ${
                          server.description
                            ? html`<div class="mcp-server-card__desc">${server.description}</div>`
                            : nothing
                        }
                        <div class="mcp-server-card__meta">
                          ${
                            server.transport
                              ? html`<span class="pill">${server.transport}</span>`
                              : nothing
                          }
                          ${
                            server.command
                              ? html`<span class="mcp-server-card__cmd mono">${server.command}</span>`
                              : nothing
                          }
                          ${
                            server.url
                              ? html`<span class="mcp-server-card__cmd mono">${server.url}</span>`
                              : nothing
                          }
                        </div>
                      </div>
                      <div class="mcp-server-card__actions">
                        <label class="mcp-toggle" title="${server.enabled ? "禁用" : "启用"}">
                          <input
                            type="checkbox"
                            .checked=${server.enabled}
                            ?disabled=${this.toggling.has(server.name)}
                            @change=${(e: Event) =>
                              void this.toggle(server.name, (e.target as HTMLInputElement).checked)}
                          />
                          <span class="mcp-toggle__track"></span>
                        </label>
                        <span class="mcp-server-card__status ${server.enabled ? "on" : "off"}">
                          ${server.enabled ? "已启用" : "已禁用"}
                        </span>
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }
}
