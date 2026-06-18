import {html, css, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';
import {ACTOR_LAYER, LAYER_COLORS, SUPPORT_KINDS} from '../domain/atlas-engine.js';
import {AtlasCanvasApi} from '../a2ui/apis.js';

const GRID = 14;
const TAU = Math.PI * 2;

function hexToRgb(value) {
  const hex = String(value || '#93a6c9').replace('#', '');
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) || 147,
    g: Number.parseInt(hex.slice(2, 4), 16) || 166,
    b: Number.parseInt(hex.slice(4, 6), 16) || 201,
  };
}

function rgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function actorColor(actor, alpha = 1) {
  return rgba(LAYER_COLORS[ACTOR_LAYER[actor] || 'ceo'] || '#93a6c9', alpha);
}

function normAngle(value) {
  let angle = value;
  while (angle < -Math.PI) angle += TAU;
  while (angle > Math.PI) angle -= TAU;
  return angle;
}

function angleIn(angle, from, to) {
  const a = normAngle(angle);
  const start = normAngle(from);
  const end = normAngle(to);
  return start <= end ? a >= start && a <= end : a >= start || a <= end;
}

export class AtlasCanvasElement extends A2uiLitElement {
  static styles = css`
    :host { display: block; height: 100%; min-height: 0; }
    .stage { position: relative; height: 100%; min-height: 0; overflow: hidden; border-radius: 18px; border: 1px solid var(--atlas-border); background: #030712; box-shadow: var(--atlas-shadow); }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
    canvas.dragging { cursor: grabbing; }
    canvas:focus-visible { outline: 2px solid var(--atlas-info); outline-offset: -4px; }
    .hud { position: absolute; left: 12px; top: 12px; z-index: 2; display: flex; flex-wrap: wrap; gap: 7px; pointer-events: none; }
    .chip { border: 1px solid rgba(170,195,255,.14); background: rgba(5,10,20,.66); border-radius: 999px; padding: 7px 9px; backdrop-filter: blur(9px); color: #dbe7ff; font-size: 11px; font-weight: 820; box-shadow: 0 10px 28px rgba(0,0,0,.22); }
    .legend { position: absolute; right: 12px; top: 12px; z-index: 2; display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; max-width: 52%; pointer-events: none; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; border: 1px solid rgba(170,195,255,.12); background: rgba(5,10,20,.58); border-radius: 999px; padding: 5px 7px; color: var(--atlas-muted); font-size: 9px; font-weight: 800; backdrop-filter: blur(8px); }
    .legend i { width: 7px; height: 7px; border-radius: 50%; }
    .hint { position: absolute; left: 12px; bottom: 12px; z-index: 2; border: 1px solid rgba(170,195,255,.13); background: rgba(5,10,20,.62); border-radius: 12px; padding: 7px 9px; color: var(--atlas-muted); font-size: 10px; backdrop-filter: blur(8px); pointer-events: none; }
    .selection { position: absolute; right: 12px; bottom: 12px; z-index: 2; max-width: min(320px, 48%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid rgba(255,255,255,.14); background: rgba(5,10,20,.74); border-radius: 999px; padding: 7px 10px; color: #fff; font-size: 11px; font-weight: 850; pointer-events: none; backdrop-filter: blur(8px); }
    @media (max-width: 700px) { .legend { display: none; } .hint { display: none; } .hud { left: 8px; top: 8px; } .chip { padding: 6px 8px; } .selection { right: 8px; bottom: 8px; max-width: 70%; } }
  `;

  constructor() {
    super();
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.dragging = false;
    this.moved = false;
    this.pointerId = null;
    this.lastPoint = null;
    this.hover = null;
    this.mapCache = {key: ''};
    this.fitNonceSeen = null;
    this.resizeObserver = null;
    this.drawQueued = false;
  }

  createController() { return new A2uiController(this, AtlasCanvasApi); }

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector('canvas');
    this.ctx = this.canvas?.getContext('2d', {alpha: false});
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this);
    this.resizeCanvas();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  updated() {
    this.ensureViewport();
    this.queueDraw();
  }

  get props() { return this.controller?.props || {}; }
  get snapshot() { return this.props.snapshot || null; }
  get viewMode() { return this.props.viewMode || 'all'; }
  get viewport() {
    const current = this.props.viewport || {};
    return {
      zoom: Number(current.zoom) || 1,
      panX: Number(current.panX) || 0,
      panY: Number(current.panY) || 0,
      fitNonce: Number(current.fitNonce) || 0,
      initialized: Boolean(current.initialized),
    };
  }

  resizeCanvas() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height || this.dpr !== dpr) {
      this.dpr = dpr;
      this.canvas.width = width;
      this.canvas.height = height;
      this.mapCache.key = '';
    }
    this.ensureViewport(true);
    this.queueDraw();
  }

  ensureViewport(resized = false) {
    if (!this.canvas || !this.snapshot?.world) return;
    const viewport = this.viewport;
    if (!viewport.initialized || viewport.fitNonce !== this.fitNonceSeen || (resized && this.fitNonceSeen == null)) {
      this.fitNonceSeen = viewport.fitNonce;
      this.commitViewport(this.computeFit(viewport.fitNonce));
    }
  }

  computeFit(fitNonce = 0) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.snapshot?.world || {w: 1180, h: 1020};
    const mobile = rect.width < 700;
    const zoom = Math.max(mobile ? 0.36 : 0.42, Math.min(rect.width / world.w, rect.height / world.h) * (mobile ? 0.94 : 0.91));
    return {
      initialized: true,
      zoom,
      panX: mobile ? 12 : (rect.width - world.w * zoom) / 2,
      panY: mobile ? 28 : (rect.height - world.h * zoom) / 2,
      fitNonce,
    };
  }

  commitViewport(value) {
    this.props.setViewport?.({...value});
  }

  queueDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  worldToScreen(x, y) {
    const viewport = this.viewport;
    return {x: viewport.panX + x * viewport.zoom, y: viewport.panY + y * viewport.zoom};
  }

  screenToWorld(x, y) {
    const viewport = this.viewport;
    return {x: (x - viewport.panX) / viewport.zoom, y: (y - viewport.panY) / viewport.zoom};
  }

  visibleNodes() {
    const zoom = this.viewport.zoom;
    return (this.snapshot?.nodes || []).filter((node) => !(node.status === 'archived' && zoom < .72 && !node.current));
  }

  nodeMap() { return new Map(this.visibleNodes().map((node) => [node.id, node])); }

  ringVisible(node) {
    const composition = this.snapshot?.responsibility?.[node.id]?.composition || [];
    if (!composition.length) return false;
    const selectedId = this.props.selection?.nodeId;
    if (this.viewMode === 'responsibility') return true;
    if (this.viewMode === 'purpose') return node.current || node.contract || node.kind === 'purpose' || node.kind === 'milestone';
    if (this.viewMode === 'risk') return node.current || node.missing || selectedId === node.id;
    return node.current || node.contract || node.kind === 'purpose' || node.kind === 'milestone' || selectedId === node.id || this.viewport.zoom > 1.25;
  }

  ringSpec(node) {
    const entries = this.snapshot?.responsibility?.[node.id]?.composition || [];
    const radius = Math.max(18, Number(node.r || 30) * .55);
    const line = Math.max(4, 6 / Math.max(.7, this.viewport.zoom));
    const gap = .045;
    const total = entries.length ? TAU - gap * entries.length : 0;
    let start = -Math.PI / 2;
    const segments = entries.map((entry) => {
      const span = total * Number(entry.ratio || 0);
      const segment = {actor: entry.actor, from: start, to: start + span, ratio: entry.ratio, value: entry.value};
      start += span + gap;
      return segment;
    });
    return {r: radius, line, segments};
  }

  focusObject() { return this.props.selection || this.hover; }

  focusBranch() {
    const focus = this.focusObject();
    if (!focus?.nodeId || focus.type !== 'responsibility' || !focus.actor) return null;
    return this.snapshot?.responsibility?.[focus.nodeId]?.branches?.[focus.actor] || null;
  }

  isFocusedNode(id) {
    const focus = this.focusObject();
    if (!focus?.nodeId) return true;
    const branch = this.focusBranch();
    if (branch) return id === focus.nodeId || branch.nodeIds?.includes(id);
    return id === focus.nodeId;
  }

  mapKey(nodes) {
    return [this.snapshot?.t, this.viewport.zoom < .72 ? 'compact' : 'full', nodes.map((node) => `${node.id}:${node.status}:${Math.round(node.x)}:${Math.round(node.y)}`).join(',')].join('|');
  }

  buildMap() {
    const nodes = this.visibleNodes();
    const key = this.mapKey(nodes);
    if (key === this.mapCache.key) return this.mapCache;
    const world = this.snapshot?.world || {w: 1180, h: 1020};
    const cols = Math.ceil(world.w / GRID);
    const rows = Math.ceil(world.h / GRID);
    const owners = [];
    for (let y = 0; y < rows; y += 1) {
      const row = [];
      for (let x = 0; x < cols; x += 1) {
        const wx = x * GRID + GRID / 2;
        const wy = y * GRID + GRID / 2;
        if (wx < 24 || wy < 24 || wx > world.w - 20 || wy > world.h - 20) { row.push(-1); continue; }
        let best = -1;
        let score = Number.POSITIVE_INFINITY;
        nodes.forEach((node, index) => {
          const dx = wx - node.x;
          const dy = wy - node.y;
          const radius = Number(node.r || 30) * (node.status === 'archived' ? .5 : 1);
          const boost = (node.current ? 16 : 0) + (node.missing ? 10 : 0);
          const candidate = Math.hypot(dx, dy) - radius - boost;
          if (candidate < score) { score = candidate; best = index; }
        });
        row.push(best);
      }
      owners.push(row);
    }
    this.mapCache = {key, nodes, owners, cols, rows};
    return this.mapCache;
  }

  nodeColor(node, alpha) {
    if (node.status === 'archived') return `rgba(145,156,180,${alpha})`;
    return rgba(LAYER_COLORS[node.layer] || '#93a6c9', alpha);
  }

  edgeBetween(firstId, secondId) {
    return (this.snapshot?.edges || []).some((edge) => (edge.source === firstId && edge.target === secondId) || (edge.source === secondId && edge.target === firstId));
  }

  pathEdgesFrom(source, target) {
    if (!source || !target) return new Set();
    const queue = [source];
    const seen = new Set(queue);
    const previous = new Map();
    const edges = this.snapshot?.edges || [];
    while (queue.length) {
      const current = queue.shift();
      if (current === target) break;
      for (const edge of edges) {
        if (edge.source !== current || !SUPPORT_KINDS.has(edge.kind) || seen.has(edge.target)) continue;
        seen.add(edge.target);
        previous.set(edge.target, edge);
        queue.push(edge.target);
      }
    }
    const output = new Set();
    if (!seen.has(target)) return output;
    let current = target;
    while (current !== source && previous.has(current)) {
      const edge = previous.get(current);
      output.add(edge.id);
      current = edge.source;
    }
    return output;
  }

  relevantEdge(edge) {
    const focus = this.focusObject();
    const branch = this.focusBranch();
    if (branch) return branch.edgeIds?.includes(edge.id);
    if (this.viewMode === 'risk') return Boolean(this.snapshot?.guard?.missing?.includes(edge.source) || this.snapshot?.guard?.missing?.includes(edge.target) || edge.target === this.snapshot?.currentPurposeId);
    if (this.viewMode === 'responsibility') return edge.support;
    if (focus?.nodeId) {
      const path = this.pathEdgesFrom(focus.nodeId, this.snapshot?.currentPurposeId);
      return edge.source === focus.nodeId || edge.target === focus.nodeId || path.has(edge.id);
    }
    if (edge.target === this.snapshot?.currentPurposeId || edge.source === this.snapshot?.currentPurposeId) return true;
    const last = this.snapshot?.lastEvent;
    if (last && last.source === edge.source && last.target === edge.target) return true;
    return this.viewMode === 'purpose' ? edge.support : this.viewport.zoom > 1.05 && edge.support;
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const background = ctx.createRadialGradient(rect.width * .2, 0, 10, rect.width * .55, rect.height * .55, Math.max(rect.width, rect.height));
    background.addColorStop(0, '#152f5a');
    background.addColorStop(.5, '#07101f');
    background.addColorStop(1, '#030611');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (!this.snapshot) return;
    const viewport = this.viewport;
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    this.drawCells(ctx);
    this.drawEdges(ctx);
    this.drawMarks(ctx);
    ctx.restore();
    this.drawLabels(ctx);
  }

  drawCells(ctx) {
    const map = this.buildMap();
    const hasFocus = Boolean(this.focusObject()?.nodeId);
    for (let y = 0; y < map.rows; y += 1) {
      for (let x = 0; x < map.cols; x += 1) {
        const index = map.owners[y][x];
        if (index < 0) continue;
        const node = map.nodes[index];
        let alpha = node.status === 'archived' ? .045 : .095;
        if (node.current) alpha = .22;
        if (node.missing) alpha = .18;
        if (this.viewMode === 'responsibility') alpha *= .8;
        if (this.viewMode === 'risk' && !node.current && !node.missing) alpha *= .28;
        if (hasFocus && !this.isFocusedNode(node.id)) alpha *= .4;
        if (hasFocus && this.isFocusedNode(node.id)) alpha *= 1.34;
        ctx.fillStyle = this.nodeColor(node, alpha);
        ctx.fillRect(x * GRID, y * GRID, GRID + 1, GRID + 1);
      }
    }
    ctx.lineWidth = 1.05 / this.viewport.zoom;
    for (let y = 0; y < map.rows; y += 1) {
      for (let x = 0; x < map.cols; x += 1) {
        const index = map.owners[y][x];
        if (index < 0) continue;
        const right = x + 1 < map.cols ? map.owners[y][x + 1] : -1;
        const down = y + 1 < map.rows ? map.owners[y + 1][x] : -1;
        if (right !== index) this.drawBoundary(ctx, (x + 1) * GRID, y * GRID, (x + 1) * GRID, (y + 1) * GRID, index, right, map.nodes);
        if (down !== index) this.drawBoundary(ctx, x * GRID, (y + 1) * GRID, (x + 1) * GRID, (y + 1) * GRID, index, down, map.nodes);
      }
    }
  }

  drawBoundary(ctx, x1, y1, x2, y2, first, second, nodes) {
    const hot = first >= 0 && second >= 0 && this.edgeBetween(nodes[first].id, nodes[second].id);
    ctx.beginPath();
    ctx.strokeStyle = hot ? 'rgba(220,235,255,.26)' : 'rgba(170,195,255,.075)';
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  drawEdges(ctx) {
    const nodes = this.nodeMap();
    for (const edge of this.snapshot?.edges || []) {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) continue;
      const relevant = this.relevantEdge(edge);
      if (!relevant && this.viewport.zoom < 1.15) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2 - 26;
      ctx.quadraticCurveTo(mx, my, target.x, target.y);
      ctx.lineWidth = (relevant ? 3.4 : 1.5) / this.viewport.zoom;
      const focus = this.focusObject();
      const responsibilityFocus = focus?.type === 'responsibility';
      ctx.strokeStyle = relevant ? (responsibilityFocus ? actorColor(focus.actor, .78) : 'rgba(255,209,102,.70)') : 'rgba(127,176,255,.20)';
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMarks(ctx) {
    const focus = this.focusObject();
    for (const node of this.visibleNodes()) {
      const hot = focus?.nodeId === node.id;
      const last = [this.snapshot?.lastEvent?.node, this.snapshot?.lastEvent?.id, this.snapshot?.lastEvent?.terminal].includes(node.id);
      const dim = focus?.nodeId && !this.isFocusedNode(node.id);
      ctx.save();
      ctx.globalAlpha = dim ? .46 : 1;
      ctx.beginPath();
      const scale = hot ? .3 : node.current ? .25 : node.missing ? .22 : node.status === 'archived' ? .11 : .15;
      ctx.arc(node.x, node.y, Math.max(5, Number(node.r || 30) * scale), 0, TAU);
      ctx.fillStyle = hot ? 'rgba(255,255,255,.95)' : this.nodeColor(node, node.status === 'archived' ? .5 : .92);
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = (hot || node.current || last ? 24 : 9) / this.viewport.zoom;
      ctx.fill();
      if (node.current || node.missing || last) {
        ctx.lineWidth = 3 / this.viewport.zoom;
        ctx.strokeStyle = last ? 'rgba(255,255,255,.86)' : node.current ? 'rgba(141,240,189,.86)' : 'rgba(255,209,102,.86)';
        ctx.stroke();
      }
      if (this.ringVisible(node)) this.drawRing(ctx, node, hot && focus?.type === 'responsibility' ? focus.actor : null);
      if (node.lastActivity && Number(this.snapshot.t) - Number(node.lastActivity.t) <= 2) this.drawActivityPulse(ctx, node, node.lastActivity);
      ctx.restore();
    }
  }

  drawRing(ctx, node, focusedActor) {
    const spec = this.ringSpec(node);
    ctx.save();
    ctx.lineCap = 'round';
    for (const segment of spec.segments) {
      const active = focusedActor === segment.actor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, spec.r, segment.from, segment.to);
      ctx.lineWidth = (active ? 10 : 6) / this.viewport.zoom;
      ctx.strokeStyle = actorColor(segment.actor, active ? 1 : .78);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = (active ? 18 : 5) / this.viewport.zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawActivityPulse(ctx, node, activity) {
    const actor = activity.role || node.actor;
    const radius = Math.max(21, Number(node.r || 30) * .54);
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, -Math.PI * .18, Math.PI * .55);
    ctx.lineWidth = 4 / this.viewport.zoom;
    ctx.strokeStyle = actorColor(actor, .95);
    ctx.setLineDash([5 / this.viewport.zoom, 4 / this.viewport.zoom]);
    ctx.stroke();
    ctx.restore();
  }

  drawLabels(ctx) {
    const focusId = this.focusObject()?.nodeId;
    const rect = this.canvas.getBoundingClientRect();
    for (const node of this.visibleNodes()) {
      const point = this.worldToScreen(node.x, node.y);
      if (point.x < -140 || point.y < -140 || point.x > rect.width + 140 || point.y > rect.height + 140) continue;
      const important = node.current || node.missing || Number(node.r) > 40 || this.viewport.zoom > 1.05 || focusId === node.id || this.viewMode === 'responsibility';
      if (!important) continue;
      const size = Math.max(10, Math.min(24, Number(node.r || 30) * .17 * this.viewport.zoom + 7 + (node.current ? 3 : 0)));
      let label = node.label || node.id;
      if (label.length > 18 && focusId !== node.id && this.viewport.zoom < 1.15) label = `${label.slice(0, 17)}…`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${size}px system-ui,-apple-system,sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(2,5,12,.82)';
      ctx.fillStyle = node.status === 'archived' ? 'rgba(200,210,230,.64)' : node.current ? '#baffd7' : node.missing ? '#ffe29b' : '#edf5ff';
      ctx.strokeText(label, point.x, point.y);
      ctx.fillText(label, point.x, point.y);
      if (node.current) this.drawBadge(ctx, point.x, point.y - size - 20, this.snapshot?.guard?.status === 'ok' ? '一致' : 'ズレ', this.snapshot?.guard?.status === 'ok' ? 'ok' : 'warn');
      if (node.missing) this.drawBadge(ctx, point.x, point.y + size + 18, 'missing', 'warn');
    }
  }

  drawBadge(ctx, x, y, text, tone) {
    ctx.save();
    ctx.font = '850 9px system-ui,-apple-system,sans-serif';
    const width = ctx.measureText(text).width + 14;
    ctx.fillStyle = tone === 'ok' ? 'rgba(22,75,52,.92)' : 'rgba(88,65,16,.94)';
    ctx.strokeStyle = tone === 'ok' ? 'rgba(136,240,189,.72)' : 'rgba(255,209,102,.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 9, width, 18, 9);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = tone === 'ok' ? '#baffd8' : '#ffe7a0';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
    ctx.restore();
  }

  hitObject(wx, wy) {
    let best = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const node of this.visibleNodes()) {
      const dx = wx - node.x;
      const dy = wy - node.y;
      const distance = Math.hypot(dx, dy);
      if (this.ringVisible(node)) {
        const spec = this.ringSpec(node);
        if (Math.abs(distance - spec.r) < Math.max(10, spec.line * 1.8)) {
          const angle = Math.atan2(dy, dx);
          const segment = spec.segments.find((item) => angleIn(angle, item.from, item.to));
          if (segment) return {type: 'responsibility', actor: segment.actor, nodeId: node.id};
        }
      }
      if (distance < nearest) { nearest = distance; best = node; }
    }
    return best && nearest < Math.max(36, Number(best.r || 30) * .95) ? {type: 'node', nodeId: best.id} : null;
  }

  localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  onPointerDown(event) {
    this.dragging = true;
    this.moved = false;
    this.pointerId = event.pointerId;
    this.lastPoint = {x: event.clientX, y: event.clientY};
    this.canvas?.setPointerCapture?.(event.pointerId);
    this.requestUpdate();
  }

  onPointerMove(event) {
    if (this.dragging) {
      const dx = event.clientX - this.lastPoint.x;
      const dy = event.clientY - this.lastPoint.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      const viewport = this.viewport;
      this.commitViewport({...viewport, initialized: true, panX: viewport.panX + dx, panY: viewport.panY + dy});
      this.lastPoint = {x: event.clientX, y: event.clientY};
      this.queueDraw();
      return;
    }
    if ((event.pointerType || 'mouse') === 'mouse') {
      const point = this.localPoint(event);
      const world = this.screenToWorld(point.x, point.y);
      this.hover = this.hitObject(world.x, world.y);
      this.queueDraw();
      this.requestUpdate();
    }
  }

  onPointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    this.canvas?.releasePointerCapture?.(event.pointerId);
    if (!this.moved) {
      const point = this.localPoint(event);
      const world = this.screenToWorld(point.x, point.y);
      const selection = this.hitObject(world.x, world.y);
      this.props.setSelection?.(selection);
      queueMicrotask(() => this.props.onSelect?.());
    }
    this.requestUpdate();
    this.queueDraw();
  }

  onPointerLeave() {
    if (!this.dragging) {
      this.hover = null;
      this.requestUpdate();
      this.queueDraw();
    }
  }

  zoomAt(factor, x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = x ?? rect.width / 2;
    const cy = y ?? rect.height / 2;
    const before = this.screenToWorld(cx, cy);
    const viewport = this.viewport;
    const zoom = Math.max(.32, Math.min(2.5, viewport.zoom * factor));
    this.mapCache.key = '';
    this.commitViewport({...viewport, initialized: true, zoom, panX: cx - before.x * zoom, panY: cy - before.y * zoom});
  }

  onWheel(event) {
    event.preventDefault();
    const point = this.localPoint(event);
    this.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, point.x, point.y);
  }

  onKeyDown(event) {
    const viewport = this.viewport;
    const amount = event.shiftKey ? 80 : 32;
    const changes = {ArrowLeft: [amount, 0], ArrowRight: [-amount, 0], ArrowUp: [0, amount], ArrowDown: [0, -amount]};
    if (changes[event.key]) {
      event.preventDefault();
      const [dx, dy] = changes[event.key];
      this.commitViewport({...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy, initialized: true});
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault(); this.zoomAt(1.15);
    } else if (event.key === '-') {
      event.preventDefault(); this.zoomAt(1 / 1.15);
    } else if (event.key === 'Escape') {
      this.props.setSelection?.(null); queueMicrotask(() => this.props.onSelect?.());
    }
  }

  getRingTestPoints() {
    const output = [];
    for (const node of this.visibleNodes()) {
      if (!this.ringVisible(node)) continue;
      const spec = this.ringSpec(node);
      for (const segment of spec.segments) {
        const angle = (segment.from + segment.to) / 2;
        const point = this.worldToScreen(node.x + Math.cos(angle) * spec.r, node.y + Math.sin(angle) * spec.r);
        output.push({nodeId: node.id, actor: segment.actor, x: point.x, y: point.y});
      }
    }
    return output;
  }

  selectionLabel() {
    const focus = this.hover || this.props.selection;
    if (!focus?.nodeId) return '';
    const node = this.snapshot?.nodes?.find((item) => item.id === focus.nodeId);
    return focus.type === 'responsibility' ? `${focus.actor}責務 · ${node?.label || focus.nodeId}` : (node?.label || focus.nodeId);
  }

  render() {
    const p = this.controller?.props;
    if (!p) return nothing;
    const snapshot = p.snapshot || {};
    const selectionLabel = this.selectionLabel();
    const legend = (snapshot.currentComposition || []).slice(0, 7);
    return html`
      <section class="stage" aria-label="Purpose and responsibility terrain">
        <canvas class=${this.dragging ? 'dragging' : ''} tabindex="0" role="application" aria-label="目的と責務の地形。ドラッグで移動、ホイールでズーム、クリックで選択。" @pointerdown=${this.onPointerDown} @pointermove=${this.onPointerMove} @pointerup=${this.onPointerUp} @pointercancel=${this.onPointerUp} @pointerleave=${this.onPointerLeave} @wheel=${this.onWheel} @keydown=${this.onKeyDown}></canvas>
        <div class="hud"><span class="chip">${this.viewMode}</span><span class="chip">${Math.round(this.viewport.zoom * 100)}%</span><span class="chip">責務 ${snapshot.counts?.responsibilityActors || 0}</span></div>
        <div class="legend">${legend.map((entry) => html`<span><i style=${`background:${actorColor(entry.actor)}`}></i>${entry.actor} ${Math.round((entry.ratio || 0) * 100)}%</span>`)}</div>
        <div class="hint">drag / wheel / click ring</div>
        ${selectionLabel ? html`<div class="selection">${selectionLabel}</div>` : nothing}
      </section>
    `;
  }
}

if (!customElements.get('purpose-atlas-canvas')) customElements.define('purpose-atlas-canvas', AtlasCanvasElement);
export const AtlasCanvas = {...AtlasCanvasApi, tagName: 'purpose-atlas-canvas'};
