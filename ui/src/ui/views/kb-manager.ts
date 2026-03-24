import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

type KnowledgeBase = {
  kb_id: string;
  name: string;
  kb_type?: string;
  description?: string;
  owner_agent_id?: string | null;
};

const PLATFORM_BASE = "http://localhost:18800";

@customElement("kb-manager-view")
export class KbManagerView extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private kbs: KnowledgeBase[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private creating = false;
  @state() private deleting = new Set<string>();
  // Create form
  @state() private formOpen = false;
  @state() private formId = "";
  @state() private formName = "";
  @state() private formType = "shared";
  @state() private formDesc = "";
  @state() private formOwner = "";
  @state() private formError: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/kb/list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { kbs: KnowledgeBase[]; error?: string };
      if (data.error) throw new Error(data.error);
      this.kbs = data.kbs ?? [];
    } catch (err) {
      this.error = `加载知识库失败: ${String(err)}`;
    } finally {
      this.loading = false;
    }
  }

  private async create() {
    if (!this.formId.trim()) {
      this.formError = "ID 不能为空";
      return;
    }
    this.creating = true;
    this.formError = null;
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/kb/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: this.formId.trim(),
          name: this.formName.trim() || this.formId.trim(),
          type: this.formType,
          description: this.formDesc.trim(),
          owner: this.formOwner.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      this.formOpen = false;
      this.formId = "";
      this.formName = "";
      this.formDesc = "";
      this.formOwner = "";
      await this.load();
    } catch (err) {
      this.formError = `创建失败: ${String(err)}`;
    } finally {
      this.creating = false;
    }
  }

  private async deleteKb(kbId: string) {
    if (!confirm(`确定删除知识库 "${kbId}"？此操作不可撤销。`)) return;
    this.deleting = new Set([...this.deleting, kbId]);
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/kb/${encodeURIComponent(kbId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.kbs = this.kbs.filter((kb) => kb.kb_id !== kbId);
    } catch (err) {
      this.error = `删除失败: ${String(err)}`;
    } finally {
      const next = new Set(this.deleting);
      next.delete(kbId);
      this.deleting = next;
    }
  }

  private renderCreateForm() {
    return html`
      <div class="kb-create-form card">
        <div class="card-title">新建知识库</div>
        ${this.formError
          ? html`<div class="callout danger" style="margin-bottom:10px">${this.formError}</div>`
          : nothing}
        <div class="kb-form-grid">
          <label class="field">
            <span>ID <span class="required">*</span></span>
            <input
              type="text"
              placeholder="my-kb"
              .value=${this.formId}
              @input=${(e: Event) => (this.formId = (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>名称</span>
            <input
              type="text"
              placeholder="我的知识库"
              .value=${this.formName}
              @input=${(e: Event) => (this.formName = (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>类型</span>
            <select
              .value=${this.formType}
              @change=${(e: Event) => (this.formType = (e.target as HTMLSelectElement).value)}
            >
              <option value="shared">shared（共享）</option>
              <option value="private">private（私有）</option>
              <option value="team">team（团队）</option>
            </select>
          </label>
          <label class="field">
            <span>Owner Agent ID（可选）</span>
            <input
              type="text"
              placeholder="agent-001"
              .value=${this.formOwner}
              @input=${(e: Event) => (this.formOwner = (e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field kb-form-full">
            <span>描述</span>
            <input
              type="text"
              placeholder="用途描述"
              .value=${this.formDesc}
              @input=${(e: Event) => (this.formDesc = (e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div class="kb-form-actions">
          <button
            class="btn btn--sm"
            type="button"
            @click=${() => {
              this.formOpen = false;
              this.formError = null;
            }}
          >
            取消
          </button>
          <button
            class="btn btn--sm btn--primary"
            type="button"
            ?disabled=${this.creating}
            @click=${() => void this.create()}
          >
            ${this.creating ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="kb-layout">
        <div class="kb-toolbar">
          <span class="kb-toolbar__title">知识库管理</span>
          <div class="kb-toolbar__actions">
            <button
              class="btn btn--sm btn--primary"
              type="button"
              @click=${() => {
                this.formOpen = !this.formOpen;
                this.formError = null;
              }}
            >
              ${this.formOpen ? "取消" : "+ 新建"}
            </button>
            <button
              class="btn btn--sm"
              type="button"
              ?disabled=${this.loading}
              @click=${() => void this.load()}
            >
              ${this.loading ? "加载中…" : "刷新"}
            </button>
          </div>
        </div>

        ${this.error
          ? html`<div class="callout danger kb-error">
              ${this.error}
              <button class="btn btn--sm" type="button" @click=${() => void this.load()}>
                重试
              </button>
            </div>`
          : nothing}

        ${this.formOpen ? this.renderCreateForm() : nothing}

        ${this.kbs.length === 0 && !this.loading && !this.formOpen
          ? html`
              <div class="card kb-empty">
                <div class="card-title">暂无知识库</div>
                <div class="card-sub">
                  点击「新建」创建第一个知识库，或确认 Python 平台已启动。
                </div>
              </div>
            `
          : nothing}

        <div class="kb-list">
          ${this.kbs.map(
            (kb) => html`
              <div class="kb-card card">
                <div class="kb-card__main">
                  <div class="kb-card__id mono">${kb.kb_id}</div>
                  <div class="kb-card__name">${kb.name}</div>
                  ${kb.description
                    ? html`<div class="kb-card__desc">${kb.description}</div>`
                    : nothing}
                  <div class="kb-card__meta">
                    ${kb.kb_type
                      ? html`<span class="pill">${kb.kb_type}</span>`
                      : nothing}
                    ${kb.owner_agent_id
                      ? html`<span class="kb-card__owner">owner: ${kb.owner_agent_id}</span>`
                      : nothing}
                  </div>
                </div>
                <div class="kb-card__actions">
                  <button
                    class="btn btn--sm danger"
                    type="button"
                    ?disabled=${this.deleting.has(kb.kb_id)}
                    @click=${() => void this.deleteKb(kb.kb_id)}
                  >
                    ${this.deleting.has(kb.kb_id) ? "删除中…" : "删除"}
                  </button>
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }
}
