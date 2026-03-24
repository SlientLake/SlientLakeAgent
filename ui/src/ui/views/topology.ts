import { LitElement, html, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";

type NodeStatus = "online" | "busy" | "offline";

type TopologyNode = {
  id: string;
  type?: string;
  status?: NodeStatus;
  group?: string;
  // Force simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};

type TopologyLink = {
  source: string;
  target: string;
  type?: "reports_to" | "collaborates" | string;
  // Resolved after layout
  sx?: number;
  sy?: number;
  tx?: number;
  ty?: number;
};

type TopologyData = {
  nodes: Array<{ id: string; type?: string; status?: string; group?: string }>;
  links: Array<{ source: string; target: string; type?: string }>;
};

const PLATFORM_BASE = "http://localhost:18800";

const STATUS_COLOR: Record<string, string> = {
  online: "#10B981",
  busy: "#F59E0B",
  offline: "#9CA3AF",
};

const NODE_RADIUS = 24;
const TICK_STEPS = 150; // run simulation for N ticks before rendering

// Minimal force simulation
function runSimulation(nodes: TopologyNode[], links: TopologyLink[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (let tick = 0; tick < TICK_STEPS; tick++) {
    const alpha = 1 - tick / TICK_STEPS;

    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (400 / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Spring attraction along links
    for (const link of links) {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const restLength = 130;
      const stretch = (dist - restLength) / dist;
      const force = stretch * 0.3 * alpha;
      source.vx += dx * force;
      source.vy += dy * force;
      target.vx -= dx * force;
      target.vy -= dy * force;
    }

    // Centering force
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.02 * alpha;
      n.vy += (cy - n.y) * 0.02 * alpha;
    }

    // Apply velocity with damping
    for (const n of nodes) {
      if (n.fx !== null) {
        n.x = n.fx;
        n.vx = 0;
      } else {
        n.vx *= 0.7;
        n.x += n.vx;
      }
      if (n.fy !== null) {
        n.y = n.fy;
        n.vy = 0;
      } else {
        n.vy *= 0.7;
        n.y += n.vy;
      }
      // Clamp to bounds
      const r = NODE_RADIUS + 4;
      n.x = Math.max(r, Math.min(width - r, n.x));
      n.y = Math.max(r, Math.min(height - r, n.y));
    }
  }
}

@customElement("topology-view")
export class TopologyView extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private nodes: TopologyNode[] = [];
  @state() private links: TopologyLink[] = [];
  @state() private error: string | null = null;
  @state() private loading = false;
  @state() private selectedNode: TopologyNode | null = null;
  @state() private svgWidth = 800;
  @state() private svgHeight = 500;

  private refreshTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private containerRef: Element | null = null;
  // Drag state
  private dragging: TopologyNode | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  connectedCallback() {
    super.connectedCallback();
    void this.load();
    this.refreshTimer = window.setInterval(() => void this.load(), 10_000);
  }

  disconnectedCallback() {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  protected firstUpdated() {
    const container = this.querySelector(".topology-svg-container");
    if (container) {
      this.containerRef = container;
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          this.svgWidth = entry.contentRect.width || 800;
          this.svgHeight = Math.max(entry.contentRect.height, 400);
          // Re-run layout on resize
          if (this.nodes.length > 0) this.layout();
        }
      });
      this.resizeObserver.observe(container);
      this.svgWidth = (container as HTMLElement).clientWidth || 800;
      this.svgHeight = Math.max((container as HTMLElement).clientHeight, 400);
      if (this.nodes.length > 0) this.layout();
    }
  }

  private async load() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${PLATFORM_BASE}/api/v1/dashboard/topology`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TopologyData;
      this.initFromData(data);
    } catch (err) {
      this.error = `加载拓扑失败: ${String(err)}`;
    } finally {
      this.loading = false;
    }
  }

  private initFromData(data: TopologyData) {
    const cx = this.svgWidth / 2;
    const cy = this.svgHeight / 2;
    const count = data.nodes?.length ?? 0;

    // Keep existing positions for nodes that already exist
    const existingById = new Map(this.nodes.map((n) => [n.id, n]));

    this.nodes = (data.nodes ?? []).map((n, i) => {
      const existing = existingById.get(n.id);
      if (existing) {
        return { ...existing, status: (n.status as NodeStatus) ?? "offline", type: n.type, group: n.group };
      }
      // Arrange in a circle initially
      const angle = (i / count) * 2 * Math.PI;
      const r = Math.min(cx, cy) * 0.6;
      return {
        id: n.id,
        type: n.type,
        status: (n.status as NodeStatus) ?? "offline",
        group: n.group,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
      };
    });

    this.links = (data.links ?? []).map((l) => ({ ...l }));
    this.layout();
  }

  private layout() {
    if (this.nodes.length === 0) return;
    runSimulation(this.nodes, this.links, this.svgWidth, this.svgHeight);
    // Resolve link coordinates for rendering
    const nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    for (const link of this.links) {
      const s = nodeById.get(link.source);
      const t = nodeById.get(link.target);
      if (s && t) {
        link.sx = s.x;
        link.sy = s.y;
        link.tx = t.x;
        link.ty = t.y;
      }
    }
    this.requestUpdate();
  }

  // Drag handlers
  private onNodeMouseDown(e: MouseEvent, node: TopologyNode) {
    e.preventDefault();
    e.stopPropagation();
    this.dragging = node;
    const svgEl = this.querySelector(".topology-svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
    this.dragOffsetX = node.x - svgP.x;
    this.dragOffsetY = node.y - svgP.y;
    // Pin the node
    node.fx = node.x;
    node.fy = node.y;

    const onMove = (ev: MouseEvent) => {
      if (!this.dragging) return;
      const pt2 = svgEl.createSVGPoint();
      pt2.x = ev.clientX;
      pt2.y = ev.clientY;
      const p = pt2.matrixTransform(svgEl.getScreenCTM()!.inverse());
      this.dragging.fx = p.x + this.dragOffsetX;
      this.dragging.fy = p.y + this.dragOffsetY;
      this.dragging.x = this.dragging.fx;
      this.dragging.y = this.dragging.fy;
      this.updateLinkCoords();
      this.requestUpdate();
    };

    const onUp = () => {
      if (this.dragging) {
        this.dragging.fx = null;
        this.dragging.fy = null;
        this.dragging = null;
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  private updateLinkCoords() {
    const nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    for (const link of this.links) {
      const s = nodeById.get(link.source);
      const t = nodeById.get(link.target);
      if (s && t) {
        link.sx = s.x;
        link.sy = s.y;
        link.tx = t.x;
        link.ty = t.y;
      }
    }
  }

  private onNodeClick(e: MouseEvent, node: TopologyNode) {
    e.stopPropagation();
    this.selectedNode = this.selectedNode?.id === node.id ? null : node;
  }

  private renderLinks() {
    return this.links.map((link) => {
      if (link.sx == null || link.sy == null || link.tx == null || link.ty == null) return nothing;
      const isReport = link.type === "reports_to";
      const isCollab = link.type === "collaborates";
      // Shorten line to node radius
      const dx = link.tx - link.sx;
      const dy = link.ty - link.sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const r = NODE_RADIUS + 2;
      const x1 = link.sx + (dx / dist) * r;
      const y1 = link.sy + (dy / dist) * r;
      const x2 = link.tx - (dx / dist) * (r + (isReport ? 8 : 0));
      const y2 = link.ty - (dy / dist) * (r + (isReport ? 8 : 0));

      return svg`
        <line
          x1=${x1} y1=${y1} x2=${x2} y2=${y2}
          stroke=${isReport ? "#6B7280" : "#D1D5DB"}
          stroke-width=${isReport ? 2 : 1.5}
          stroke-dasharray=${isCollab ? "6,4" : "none"}
          marker-end=${isReport ? "url(#arrow)" : "none"}
          opacity="0.8"
        />
      `;
    });
  }

  private renderNodes() {
    return this.nodes.map((node) => {
      const color = STATUS_COLOR[node.status ?? "offline"] ?? STATUS_COLOR.offline;
      const isSelected = this.selectedNode?.id === node.id;
      const label = node.id.length > 12 ? node.id.slice(0, 12) + "…" : node.id;
      const isIndependent = node.type === "independent";
      const r = isIndependent ? NODE_RADIUS + 4 : NODE_RADIUS;

      return svg`
        <g
          transform=${`translate(${node.x},${node.y})`}
          style="cursor: grab"
          @mousedown=${(e: MouseEvent) => this.onNodeMouseDown(e, node)}
          @click=${(e: MouseEvent) => this.onNodeClick(e, node)}
        >
          <circle
            r=${r}
            fill="var(--card, #1e293b)"
            stroke=${isSelected ? "var(--accent, #6366f1)" : color}
            stroke-width=${isSelected ? 3.5 : 2.5}
          />
          <circle cx="0" cy=${-r + 2} r="5" fill=${color} />
          <text
            text-anchor="middle"
            dy="4"
            font-size="10"
            font-weight="600"
            fill="var(--fg, #f1f5f9)"
          >${label}</text>
        </g>
      `;
    });
  }

  private renderDetailPanel() {
    const node = this.selectedNode;
    if (!node) return nothing;
    return html`
      <div class="topology-detail">
        <div class="topology-detail__header">
          <span class="topology-detail__id">${node.id}</span>
          <button
            class="topology-detail__close"
            type="button"
            @click=${() => (this.selectedNode = null)}
          >
            ✕
          </button>
        </div>
        <div class="topology-detail__row">
          <span class="topology-detail__label">状态</span>
          <span
            class="topology-detail__value"
            style="color: ${STATUS_COLOR[node.status ?? "offline"]}"
          >
            ● ${node.status ?? "offline"}
          </span>
        </div>
        ${node.type
          ? html`<div class="topology-detail__row">
              <span class="topology-detail__label">类型</span>
              <span class="topology-detail__value">${node.type}</span>
            </div>`
          : nothing}
        ${node.group
          ? html`<div class="topology-detail__row">
              <span class="topology-detail__label">分组</span>
              <span class="topology-detail__value">${node.group}</span>
            </div>`
          : nothing}
        <div class="topology-detail__row">
          <span class="topology-detail__label">汇报给</span>
          <span class="topology-detail__value">
            ${this.links
              .filter((l) => l.source === node.id && l.type === "reports_to")
              .map((l) => l.target)
              .join(", ") || "—"}
          </span>
        </div>
        <div class="topology-detail__row">
          <span class="topology-detail__label">下属</span>
          <span class="topology-detail__value">
            ${this.links
              .filter((l) => l.target === node.id && l.type === "reports_to")
              .map((l) => l.source)
              .join(", ") || "—"}
          </span>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="topology-layout">
        <div class="topology-toolbar">
          <span class="topology-toolbar__title">组织拓扑</span>
          <div class="topology-legend">
            <span class="topology-legend__item">
              <span class="topology-legend__dot" style="background:#10B981"></span>在线
            </span>
            <span class="topology-legend__item">
              <span class="topology-legend__dot" style="background:#F59E0B"></span>忙碌
            </span>
            <span class="topology-legend__item">
              <span class="topology-legend__dot" style="background:#9CA3AF"></span>离线
            </span>
            <span class="topology-legend__item topology-legend__item--line">
              <span class="topology-legend__line topology-legend__line--solid"></span>汇报关系
            </span>
            <span class="topology-legend__item topology-legend__item--line">
              <span class="topology-legend__line topology-legend__line--dashed"></span>协作
            </span>
          </div>
          <button
            class="btn btn--sm"
            type="button"
            ?disabled=${this.loading}
            @click=${() => void this.load()}
          >
            ${this.loading ? "加载中…" : "刷新"}
          </button>
        </div>

        ${this.error
          ? html`<div class="callout danger topology-error">
              ${this.error}
              <button class="btn btn--sm" type="button" @click=${() => void this.load()}>
                重试
              </button>
            </div>`
          : nothing}

        <div class="topology-content" @click=${() => (this.selectedNode = null)}>
          <div class="topology-svg-container">
            <svg
              class="topology-svg"
              width=${this.svgWidth}
              height=${this.svgHeight}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 -5 10 10"
                  refX="8"
                  refY="0"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,-5L10,0L0,5" fill="#6B7280" />
                </marker>
              </defs>
              <g class="topology-links">${this.renderLinks()}</g>
              <g class="topology-nodes">${this.renderNodes()}</g>
              ${this.nodes.length === 0 && !this.loading
                ? svg`
                    <text
                      x=${this.svgWidth / 2}
                      y=${this.svgHeight / 2}
                      text-anchor="middle"
                      font-size="14"
                      fill="#9CA3AF"
                    >
                      暂无 Agent 数据，请确认 Python 平台已启动（oc-platform platform start）
                    </text>
                  `
                : nothing}
            </svg>
          </div>
          ${this.renderDetailPanel()}
        </div>
      </div>
    `;
  }
}
