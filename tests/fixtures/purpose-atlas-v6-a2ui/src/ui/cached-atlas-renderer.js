import {ACTOR_LAYER, LAYER_COLORS, ROLES, SUPPORT_KINDS} from '../domain/atlas-engine.js';

const TAU = Math.PI * 2;

function hexToRgb(value) {
  let hex = String(value || '#93a6c9').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((part) => part + part).join('');
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

function nodeColor(node, alpha) {
  if (node.status === 'archived') return `rgba(145,156,180,${alpha})`;
  return rgba(LAYER_COLORS[node.layer] || '#93a6c9', alpha);
}

function selectionKey(selection) {
  if (!selection?.nodeId) return '';
  return selection.type === 'responsibility'
    ? `r:${selection.nodeId}:${selection.actor || ''}`
    : `n:${selection.nodeId}`;
}

function sameViewport(first, second) {
  return Boolean(first && second)
    && Boolean(first.initialized) === Boolean(second.initialized)
    && Number(first.zoom || 0) === Number(second.zoom || 0)
    && Number(first.panX || 0) === Number(second.panX || 0)
    && Number(first.panY || 0) === Number(second.panY || 0)
    && Number(first.fitNonce || 0) === Number(second.fitNonce || 0);
}

function normalizeViewport(value = {}) {
  return {
    initialized: Boolean(value.initialized),
    zoom: Number(value.zoom) || 1,
    panX: Number(value.panX) || 0,
    panY: Number(value.panY) || 0,
    fitNonce: Number(value.fitNonce) || 0,
  };
}

function rectsOverlap(first, second) {
  return first.x < second.x + second.w
    && first.x + first.w > second.x
    && first.y < second.y + second.h
    && first.y + first.h > second.y;
}

function normAngle(angle) {
  let value = angle;
  while (value < 0) value += TAU;
  while (value >= TAU) value -= TAU;
  return value;
}

function angleIn(angle, from, to) {
  const value = normAngle(angle);
  const start = normAngle(from);
  const end = normAngle(to);
  return start <= end ? value >= start && value <= end : value >= start || value <= end;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

export class CachedAtlasRenderer {
  constructor({
    stage,
    sceneCanvas,
    overlayCanvas,
    onViewport,
    onSelection,
    onHover,
    onStats,
  }) {
    this.stage = stage;
    this.sceneCanvas = sceneCanvas;
    this.overlayCanvas = overlayCanvas;
    this.sceneContext = sceneCanvas.getContext('2d', {alpha: true, desynchronized: true});
    this.overlayContext = overlayCanvas.getContext('2d', {alpha: true, desynchronized: true});
    this.worldSurface = document.createElement('canvas');
    this.worldContext = this.worldSurface.getContext('2d', {alpha: true});
    this.onViewport = onViewport;
    this.onSelection = onSelection;
    this.onHover = onHover;
    this.onStats = onStats;

    this.snapshot = null;
    this.nodeById = new Map();
    this.viewMode = 'responsibility';
    this.viewport = normalizeViewport();
    this.selection = null;
    this.hover = null;
    this.missing = new Set();
    this.dpr = 1;
    this.cacheScale = 1.25;
    this.lastCanvasSize = {width: 0, height: 0};
    this.lastArchiveBucket = null;
    this.fitNonceSeen = null;
    this.mapCache = {key: ''};

    this.sceneCacheDirty = true;
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.renderRaf = 0;
    this.pointerRaf = 0;
    this.latestPointer = null;
    this.lastHoverKey = '';
    this.dragging = false;
    this.moved = false;
    this.lastPoint = null;
    this.pointerId = null;

    this.renderStats = {
      frames: 0,
      sceneBuilds: 0,
      sceneBlits: 0,
      overlayFrames: 0,
      hoverChanges: 0,
      lastFrameMs: 0,
      maxFrameMs: 0,
      mode: this.viewMode,
      dpr: this.dpr,
    };

    this.boundPointerDown = (event) => this.handlePointerDown(event);
    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);
    this.boundPointerCancel = (event) => this.handlePointerCancel(event);
    this.boundPointerLeave = () => this.handlePointerLeave();
    this.boundWheel = (event) => this.handleWheel(event);
    this.boundKeyDown = (event) => this.handleKeyDown(event);

    overlayCanvas.addEventListener('pointerdown', this.boundPointerDown);
    overlayCanvas.addEventListener('pointermove', this.boundPointerMove);
    overlayCanvas.addEventListener('pointerup', this.boundPointerUp);
    overlayCanvas.addEventListener('pointercancel', this.boundPointerCancel);
    overlayCanvas.addEventListener('pointerleave', this.boundPointerLeave);
    overlayCanvas.addEventListener('wheel', this.boundWheel, {passive: false});
    overlayCanvas.addEventListener('keydown', this.boundKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.resize(false));
    this.resizeObserver.observe(stage);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.overlayCanvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.overlayCanvas.removeEventListener('pointermove', this.boundPointerMove);
    this.overlayCanvas.removeEventListener('pointerup', this.boundPointerUp);
    this.overlayCanvas.removeEventListener('pointercancel', this.boundPointerCancel);
    this.overlayCanvas.removeEventListener('pointerleave', this.boundPointerLeave);
    this.overlayCanvas.removeEventListener('wheel', this.boundWheel);
    this.overlayCanvas.removeEventListener('keydown', this.boundKeyDown);
    if (this.renderRaf) cancelAnimationFrame(this.renderRaf);
    if (this.pointerRaf) cancelAnimationFrame(this.pointerRaf);
  }

  isMobile() {
    return this.stage.getBoundingClientRect().width <= 760 || window.matchMedia('(max-width:760px)').matches;
  }

  world() {
    return this.snapshot?.world || {w: 1180, h: 1020};
  }

  archiveBucket() {
    return this.viewport.zoom >= 0.72 ? 1 : 0;
  }

  update({snapshot, viewMode, viewport, selection}) {
    const previousSnapshot = this.snapshot;
    const previousMode = this.viewMode;
    const previousViewport = this.viewport;
    const previousSelectionKey = selectionKey(this.selection);

    this.snapshot = snapshot || null;
    this.nodeById = new Map((this.snapshot?.nodes || []).map((node) => [node.id, node]));
    this.viewMode = ['purpose', 'responsibility', 'focus'].includes(viewMode) ? viewMode : 'responsibility';
    this.viewport = normalizeViewport(viewport);
    this.selection = selection?.nodeId ? {...selection} : null;
    this.missing = new Set(this.snapshot?.guard?.missing || []);
    this.renderStats.mode = this.viewMode;

    const snapshotChanged = previousSnapshot?.t !== this.snapshot?.t
      || previousSnapshot?.nodes !== this.snapshot?.nodes
      || previousSnapshot?.edges !== this.snapshot?.edges;
    const modeChanged = previousMode !== this.viewMode;
    const viewportChanged = !sameViewport(previousViewport, this.viewport);
    const selectionChanged = previousSelectionKey !== selectionKey(this.selection);

    if (snapshotChanged || modeChanged) this.invalidateScene(snapshotChanged ? 'snapshot' : 'mode');
    else {
      if (viewportChanged) {
        if (this.archiveBucket() !== this.lastArchiveBucket) this.invalidateScene('archive-visibility');
        else this.scheduleRender(true, true);
      }
      if (selectionChanged) this.scheduleRender(false, true);
    }

    this.ensureViewport();
  }

  ensureViewport() {
    if (!this.snapshot || !this.overlayCanvas) return;
    const viewport = this.viewport;
    if (!viewport.initialized || viewport.fitNonce !== this.fitNonceSeen) {
      this.fitNonceSeen = viewport.fitNonce;
      this.commitViewport(this.computeFit(viewport.fitNonce));
    }
  }

  computeFit(fitNonce = 0) {
    const rect = this.overlayCanvas.getBoundingClientRect();
    const world = this.world();
    const mobile = this.isMobile();
    let zoom = Math.min(rect.width / world.w, rect.height / world.h) * (mobile ? 0.94 : 0.92);
    if (mobile) zoom = Math.max(0.38, zoom);
    return {
      initialized: true,
      zoom,
      panX: mobile ? 8 : (rect.width - world.w * zoom) / 2,
      panY: mobile ? Math.max(8, (rect.height - world.h * zoom) / 2) : (rect.height - world.h * zoom) / 2,
      fitNonce,
    };
  }

  fit() {
    const next = this.computeFit(this.viewport.fitNonce);
    this.fitNonceSeen = next.fitNonce;
    this.commitViewport(next);
  }

  commitViewport(value) {
    const next = normalizeViewport(value);
    this.viewport = next;
    this.onViewport?.(next);
    if (this.archiveBucket() !== this.lastArchiveBucket) this.invalidateScene('archive-visibility');
    else this.scheduleRender(true, true);
  }

  setCanvasSize(canvas, width, height) {
    const pixelWidth = Math.max(1, Math.round(width * this.dpr));
    const pixelHeight = Math.max(1, Math.round(height * this.dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  }

  resize(resetCamera = false) {
    const rect = this.overlayCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const mobile = this.isMobile();
    this.dpr = Math.max(1, Math.min(mobile ? 1.5 : 2, window.devicePixelRatio || 1));
    this.renderStats.dpr = this.dpr;
    this.setCanvasSize(this.sceneCanvas, rect.width, rect.height);
    this.setCanvasSize(this.overlayCanvas, rect.width, rect.height);
    const changed = Math.abs(this.lastCanvasSize.width - rect.width) > 1
      || Math.abs(this.lastCanvasSize.height - rect.height) > 1;
    this.lastCanvasSize = {width: rect.width, height: rect.height};
    if (resetCamera || changed || !this.viewport.initialized) this.fit();
    this.invalidateScene('resize');
  }

  invalidateScene() {
    this.sceneCacheDirty = true;
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.mapCache.key = '';
    this.scheduleRender(true, true);
  }

  scheduleRender(scene = false, overlay = false) {
    if (scene) this.sceneDirty = true;
    if (overlay) this.overlayDirty = true;
    if (this.renderRaf) return;
    this.renderRaf = requestAnimationFrame(() => this.renderFrame());
  }

  renderFrame() {
    this.renderRaf = 0;
    if (!this.snapshot) return;
    const started = performance.now();
    if (this.sceneCacheDirty) this.rebuildSceneCache();
    if (this.sceneDirty) {
      this.blitScene();
      this.sceneDirty = false;
      this.renderStats.sceneBlits += 1;
    }
    if (this.overlayDirty) {
      this.drawOverlay();
      this.overlayDirty = false;
      this.renderStats.overlayFrames += 1;
    }
    this.renderStats.frames += 1;
    this.renderStats.lastFrameMs = Math.round((performance.now() - started) * 100) / 100;
    this.renderStats.maxFrameMs = Math.max(this.renderStats.maxFrameMs, this.renderStats.lastFrameMs);
    this.onStats?.({...this.renderStats});
  }

  activeNodes() {
    const zoom = this.viewport.zoom;
    return (this.snapshot?.nodes || []).filter((node) => !(
      node.status === 'archived'
      && zoom < 0.72
      && node.id !== this.snapshot?.currentPurposeId
    ));
  }

  activeEdges() {
    return (this.snapshot?.edges || []).filter((edge) => this.nodeById.has(edge.source) && this.nodeById.has(edge.target));
  }

  isMissing(id) {
    return this.missing.has(id);
  }

  actorOf(node) {
    return node?.actor || 'CEO';
  }

  responsibility(nodeId) {
    return this.snapshot?.responsibility?.[nodeId] || {composition: [], branches: {}};
  }

  compositionEntries(nodeId) {
    return this.responsibility(nodeId).composition || [];
  }

  ringSpec(node) {
    const entries = this.compositionEntries(node.id);
    const radius = Math.max(18, Number(node.r || 30) * 0.55);
    const line = Math.max(4, 6 / Math.max(0.7, this.viewport.zoom));
    const gap = 0.045;
    const total = entries.length ? TAU - gap * entries.length : 0;
    let start = -Math.PI / 2;
    const segments = entries.map((entry) => {
      const span = total * Number(entry.ratio || 0);
      const segment = {
        actor: entry.actor,
        from: start,
        to: start + span,
        ratio: entry.ratio,
        value: entry.value,
      };
      start += span + gap;
      return segment;
    });
    return {r: radius, line, segments};
  }

  focusSelection() {
    return this.selection || this.hover;
  }

  focusNode() {
    const focus = this.focusSelection();
    return focus?.nodeId ? this.nodeById.get(focus.nodeId) || null : null;
  }

  focusActor() {
    const focus = this.focusSelection();
    return focus?.type === 'responsibility' ? focus.actor : null;
  }

  focusBranch() {
    const focus = this.focusSelection();
    if (!focus?.nodeId || focus.type !== 'responsibility' || !focus.actor) return null;
    return this.responsibility(focus.nodeId).branches?.[focus.actor] || null;
  }

  shouldDrawStaticRing(node) {
    if (node.id === this.snapshot?.currentPurposeId || node.contract || this.isMissing(node.id)) return true;
    if (this.viewMode === 'responsibility') return node.kind === 'purpose' || node.kind === 'milestone';
    return false;
  }

  buildMap() {
    const nodes = this.activeNodes();
    const cell = this.isMobile() ? 12 : 10;
    const key = [
      this.snapshot?.t,
      this.archiveBucket(),
      cell,
      nodes.map((node) => `${node.id}:${node.status}:${Math.round(node.x)}:${Math.round(node.y)}`).join(','),
    ].join('|');
    if (key === this.mapCache.key) return;

    const world = this.world();
    const cols = Math.ceil(world.w / cell);
    const rows = Math.ceil(world.h / cell);
    const owners = new Int16Array(cols * rows);
    owners.fill(-1);
    const edgeLookup = Object.create(null);
    for (const edge of this.activeEdges()) {
      edgeLookup[`${edge.source}|${edge.target}`] = 1;
      edgeLookup[`${edge.target}|${edge.source}`] = 1;
    }

    for (let y = 0; y < rows; y += 1) {
      const worldY = y * cell + cell / 2;
      for (let x = 0; x < cols; x += 1) {
        const worldX = x * cell + cell / 2;
        if (worldX < 22 || worldY < 22 || worldX > world.w - 20 || worldY > world.h - 20) continue;
        let best = -1;
        let score = Number.POSITIVE_INFINITY;
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index];
          const radius = Number(node.r || 30) * (node.status === 'archived' ? 0.5 : 1);
          const dx = worldX - node.x;
          const dy = worldY - node.y;
          const boost = (node.id === this.snapshot?.currentPurposeId ? 16 : 0) + (this.isMissing(node.id) ? 10 : 0);
          const candidate = Math.hypot(dx, dy) - (radius + boost);
          if (candidate < score) {
            score = candidate;
            best = index;
          }
        }
        owners[y * cols + x] = best;
      }
    }

    this.mapCache = {key, nodes, owners, cols, rows, cell, edgeLookup};
  }

  cellAlpha(node) {
    let alpha = node.status === 'archived' ? 0.035 : 0.082;
    if (this.viewMode === 'responsibility') alpha *= 1.22;
    if (this.viewMode === 'focus') alpha *= 0.72;
    if (node.id === this.snapshot?.currentPurposeId) alpha = this.viewMode === 'responsibility' ? 0.2 : 0.18;
    if (this.isMissing(node.id)) alpha = 0.16;
    return alpha;
  }

  drawTerritories(context) {
    const {nodes, owners, cols, rows, cell} = this.mapCache;
    for (let y = 0; y < rows; y += 1) {
      let x = 0;
      while (x < cols) {
        const index = owners[y * cols + x];
        if (index < 0) { x += 1; continue; }
        const start = x;
        while (x + 1 < cols && owners[y * cols + x + 1] === index) x += 1;
        const node = nodes[index];
        context.fillStyle = nodeColor(node, this.cellAlpha(node));
        context.fillRect(start * cell, y * cell, (x - start + 1) * cell + 0.5, cell + 0.5);
        x += 1;
      }
    }

    const normal = new Path2D();
    const hot = new Path2D();
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const first = owners[y * cols + x];
        if (first < 0) continue;
        const right = x + 1 < cols ? owners[y * cols + x + 1] : -1;
        const down = y + 1 < rows ? owners[(y + 1) * cols + x] : -1;
        if (right !== first) this.addBoundaryPath(normal, hot, (x + 1) * cell, y * cell, (x + 1) * cell, (y + 1) * cell, first, right, nodes);
        if (down !== first) this.addBoundaryPath(normal, hot, x * cell, (y + 1) * cell, (x + 1) * cell, (y + 1) * cell, first, down, nodes);
      }
    }
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(170,195,255,.065)';
    context.stroke(normal);
    context.strokeStyle = 'rgba(220,235,255,.20)';
    context.stroke(hot);
  }

  addBoundaryPath(normal, hot, x1, y1, x2, y2, first, second, nodes) {
    const path = first >= 0
      && second >= 0
      && this.mapCache.edgeLookup[`${nodes[first].id}|${nodes[second].id}`]
      ? hot
      : normal;
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
  }

  drawBaseEdges(context) {
    const alpha = this.viewMode === 'purpose' ? 0.15 : this.viewMode === 'responsibility' ? 0.085 : 0.05;
    context.save();
    context.lineCap = 'round';
    for (const edge of this.activeEdges()) {
      if (!SUPPORT_KINDS.has(edge.kind)) continue;
      const source = this.nodeById.get(edge.source);
      const target = this.nodeById.get(edge.target);
      if (!source || !target) continue;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.quadraticCurveTo((source.x + target.x) / 2, (source.y + target.y) / 2 - 24, target.x, target.y);
      context.lineWidth = this.viewMode === 'purpose' ? 1.5 : 1.1;
      context.strokeStyle = `rgba(127,176,255,${alpha})`;
      context.stroke();
    }
    context.restore();
  }

  drawStaticRing(context, node) {
    const spec = this.ringSpec(node);
    if (!spec.segments.length) return;
    context.save();
    context.lineCap = 'round';
    for (const segment of spec.segments) {
      context.beginPath();
      context.arc(node.x, node.y, spec.r, segment.from, segment.to);
      context.lineWidth = this.viewMode === 'responsibility' ? 7 : 5;
      context.strokeStyle = actorColor(segment.actor, this.viewMode === 'responsibility' ? 0.88 : 0.7);
      context.stroke();
    }
    context.restore();
  }

  drawActivityArc(context, node, actor, alpha = 0.9) {
    const radius = Math.max(22, Number(node.r || 30) * 0.57);
    context.save();
    context.beginPath();
    context.arc(node.x, node.y, radius, -Math.PI * 0.18, Math.PI * 0.55);
    context.lineWidth = 3;
    context.strokeStyle = actorColor(actor, alpha);
    context.setLineDash([5, 4]);
    context.stroke();
    context.restore();
  }

  drawStaticMarks(context) {
    for (const node of this.activeNodes()) {
      const current = node.id === this.snapshot?.currentPurposeId;
      const missing = this.isMissing(node.id);
      const event = this.snapshot?.lastEvent;
      const last = event && (event.node === node.id || event.id === node.id || event.terminal === node.id);
      const coreRadius = Math.max(4.5, Number(node.r || 30) * (
        current ? 0.24 : missing ? 0.21 : node.status === 'archived' ? 0.1 : 0.145
      ));
      context.save();
      context.beginPath();
      context.arc(node.x, node.y, coreRadius, 0, TAU);
      context.fillStyle = nodeColor(node, node.status === 'archived' ? 0.5 : 0.92);
      if (current || last) {
        context.shadowColor = current ? 'rgba(141,240,189,.75)' : 'rgba(255,255,255,.65)';
        context.shadowBlur = 15;
      }
      context.fill();
      if (current || missing || last) {
        context.lineWidth = 2.5;
        context.strokeStyle = last
          ? 'rgba(255,255,255,.82)'
          : current
            ? 'rgba(141,240,189,.88)'
            : 'rgba(255,209,102,.86)';
        context.stroke();
      }
      if (this.shouldDrawStaticRing(node)) this.drawStaticRing(context, node);
      if (node.lastActivity && Number(this.snapshot?.t) - Number(node.lastActivity.t) <= 2) {
        this.drawActivityArc(context, node, node.lastActivity.role || this.actorOf(node), 0.9);
      }
      context.restore();
    }
  }

  rebuildSceneCache() {
    this.buildMap();
    const world = this.world();
    this.cacheScale = Math.min(2, Math.max(1.25, this.dpr));
    const width = Math.max(1, Math.round(world.w * this.cacheScale));
    const height = Math.max(1, Math.round(world.h * this.cacheScale));
    if (this.worldSurface.width !== width) this.worldSurface.width = width;
    if (this.worldSurface.height !== height) this.worldSurface.height = height;
    this.worldContext.setTransform(1, 0, 0, 1, 0, 0);
    this.worldContext.clearRect(0, 0, width, height);
    this.worldContext.setTransform(this.cacheScale, 0, 0, this.cacheScale, 0, 0);
    this.drawTerritories(this.worldContext);
    this.drawBaseEdges(this.worldContext);
    this.drawStaticMarks(this.worldContext);
    this.sceneCacheDirty = false;
    this.lastArchiveBucket = this.archiveBucket();
    this.renderStats.sceneBuilds += 1;
  }

  blitScene() {
    const world = this.world();
    this.sceneContext.setTransform(1, 0, 0, 1, 0, 0);
    this.sceneContext.clearRect(0, 0, this.sceneCanvas.width, this.sceneCanvas.height);
    this.sceneContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sceneContext.save();
    this.sceneContext.translate(this.viewport.panX, this.viewport.panY);
    this.sceneContext.scale(this.viewport.zoom, this.viewport.zoom);
    this.sceneContext.globalAlpha = 1;
    this.sceneContext.imageSmoothingEnabled = true;
    this.sceneContext.drawImage(
      this.worldSurface,
      0,
      0,
      this.worldSurface.width,
      this.worldSurface.height,
      0,
      0,
      world.w,
      world.h,
    );
    this.sceneContext.restore();
  }

  pathEdgesFrom(source, target) {
    const edges = this.activeEdges();
    const queue = [source];
    const seen = new Set([source]);
    const previous = new Map();
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
    const result = new Set();
    let cursor = target;
    if (!seen.has(target)) return result;
    while (cursor !== source && previous.has(cursor)) {
      const edge = previous.get(cursor);
      result.add(edge.id);
      cursor = edge.source;
    }
    return result;
  }

  focusEdgeSet() {
    const focus = this.focusSelection();
    const branch = this.focusBranch();
    const result = new Set();
    if (branch) {
      for (const edgeId of branch.edgeIds || []) result.add(edgeId);
      return result;
    }
    if (focus?.nodeId && focus.type !== 'responsibility') {
      for (const edgeId of this.pathEdgesFrom(focus.nodeId, this.snapshot?.currentPurposeId)) result.add(edgeId);
      for (const edge of this.activeEdges()) {
        if (edge.source === focus.nodeId || edge.target === focus.nodeId) result.add(edge.id);
      }
      return result;
    }
    for (const missingId of this.snapshot?.guard?.missing || []) {
      for (const edgeId of this.pathEdgesFrom(missingId, this.snapshot?.currentPurposeId)) result.add(edgeId);
    }
    return result;
  }

  drawFocusEdges(context) {
    const selectedEdges = this.focusEdgeSet();
    const actor = this.focusActor();
    context.save();
    context.lineCap = 'round';
    for (const edge of this.activeEdges()) {
      if (!selectedEdges.has(edge.id)) continue;
      const source = this.nodeById.get(edge.source);
      const target = this.nodeById.get(edge.target);
      if (!source || !target) continue;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.quadraticCurveTo((source.x + target.x) / 2, (source.y + target.y) / 2 - 24, target.x, target.y);
      context.lineWidth = 3.4 / Math.max(0.55, this.viewport.zoom);
      context.strokeStyle = actor ? actorColor(actor, 0.94) : 'rgba(255,209,102,.86)';
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = 8 / Math.max(0.6, this.viewport.zoom);
      context.stroke();
    }
    context.restore();
  }

  drawFocusMarks(context) {
    const focus = this.focusSelection();
    const node = this.focusNode();
    if (!focus || !node) return;
    const branch = this.focusBranch();
    if (branch) {
      for (const id of branch.nodeIds || []) {
        const branchNode = this.nodeById.get(id);
        if (!branchNode) continue;
        context.beginPath();
        context.arc(branchNode.x, branchNode.y, Math.max(9, Number(branchNode.r || 30) * 0.22), 0, TAU);
        context.lineWidth = 2 / Math.max(0.6, this.viewport.zoom);
        context.strokeStyle = actorColor(focus.actor, id === node.id ? 0.98 : 0.46);
        context.stroke();
      }
    }
    context.save();
    context.beginPath();
    context.arc(node.x, node.y, Math.max(18, Number(node.r || 30) * 0.62), 0, TAU);
    context.lineWidth = 3 / Math.max(0.6, this.viewport.zoom);
    context.strokeStyle = focus.type === 'responsibility' ? actorColor(focus.actor, 1) : 'rgba(255,255,255,.9)';
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = 18 / Math.max(0.6, this.viewport.zoom);
    context.stroke();
    if (focus.type === 'responsibility') {
      for (const segment of this.ringSpec(node).segments) {
        if (segment.actor !== focus.actor) continue;
        context.beginPath();
        context.arc(node.x, node.y, this.ringSpec(node).r, segment.from, segment.to);
        context.lineWidth = 11 / Math.max(0.6, this.viewport.zoom);
        context.lineCap = 'round';
        context.strokeStyle = actorColor(focus.actor, 1);
        context.stroke();
      }
    }
    context.restore();
  }

  nodeLabelPriority(node, focus, branchNodeIds) {
    let score = Number(node.r || 30);
    if (node.id === this.snapshot?.currentPurposeId) score += 2000;
    if (this.isMissing(node.id)) score += 1700;
    if (focus?.id === node.id) score += 1600;
    if (branchNodeIds?.has(node.id)) score += 1400;
    if (node.contract) score += 900;
    if (node.kind === 'purpose' || node.kind === 'milestone') score += 720;
    if (node.lastActivity && Number(this.snapshot?.t) - Number(node.lastActivity.t) <= 1) score += 650;
    if (node.status === 'archived') score -= 160;
    return score;
  }

  drawLabels(context) {
    const nodes = this.activeNodes();
    const focus = this.focusNode();
    const branch = this.focusBranch();
    const branchNodeIds = branch ? new Set(branch.nodeIds || []) : null;
    const mobile = this.isMobile();
    let budget = mobile ? 14 : 30;
    budget += Math.max(0, Math.round((this.viewport.zoom - 0.85) * (mobile ? 8 : 18)));
    if (this.viewMode === 'responsibility') budget += mobile ? 2 : 8;
    if (this.viewMode === 'focus' && focus) budget += mobile ? 4 : 12;
    budget = Math.min(nodes.length, Math.max(8, budget));

    const candidates = [];
    for (const node of nodes) {
      const point = this.worldToScreen(node.x, node.y);
      if (
        point.x < -120
        || point.y < -100
        || point.x > this.overlayCanvas.clientWidth + 120
        || point.y > this.overlayCanvas.clientHeight + 100
      ) continue;
      if (
        this.viewMode === 'focus'
        && focus
        && node.id !== this.snapshot?.currentPurposeId
        && node.id !== focus.id
        && !branchNodeIds?.has(node.id)
      ) continue;
      const priority = this.nodeLabelPriority(node, focus, branchNodeIds);
      if (this.viewMode === 'purpose' && priority < 600 && this.viewport.zoom < 1.04) continue;
      candidates.push({node, point, priority});
    }
    candidates.sort((first, second) => second.priority - first.priority || first.node.id.localeCompare(second.node.id));

    const occupied = [];
    let drawn = 0;
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const item of candidates) {
      if (drawn >= budget) break;
      const {node, point} = item;
      const size = Math.max(10, Math.min(21, 10 + Number(node.r || 30) * 0.12 * this.viewport.zoom + (node.id === this.snapshot?.currentPurposeId ? 3 : 0)));
      let label = node.label;
      if (label.length > 16 && focus?.id !== node.id && this.viewport.zoom < 1.15) label = `${label.slice(0, 15)}…`;
      context.font = `850 ${size}px system-ui,-apple-system,sans-serif`;
      const width = context.measureText(label).width + 10;
      const box = {x: point.x - width / 2, y: point.y - size * 0.72, w: width, h: size * 1.45};
      const collides = occupied.some((other) => rectsOverlap(box, other));
      const essential = item.priority >= 1400;
      if (collides && !essential) continue;
      occupied.push(box);
      context.lineWidth = mobile ? 4.5 : 4;
      context.strokeStyle = 'rgba(2,5,12,.88)';
      context.fillStyle = node.status === 'archived'
        ? 'rgba(203,214,232,.62)'
        : node.id === this.snapshot?.currentPurposeId
          ? '#baffd7'
          : this.isMissing(node.id)
            ? '#ffe39c'
            : '#eef5ff';
      context.strokeText(label, point.x, point.y);
      context.fillText(label, point.x, point.y);
      if (node.id === this.snapshot?.currentPurposeId) {
        this.drawBadge(context, point.x, point.y - size - 18, this.snapshot?.guard?.status === 'ok' ? '一致' : 'ズレ', this.snapshot?.guard?.status === 'ok' ? 'ok' : 'warn');
      } else if (this.isMissing(node.id)) {
        this.drawBadge(context, point.x, point.y + size + 15, 'missing', 'warn');
      } else if (node.status === 'archived' && this.viewport.zoom > 0.9) {
        this.drawBadge(context, point.x, point.y + size + 15, 'archive', 'info');
      }
      if (focus?.id === node.id) this.drawBadge(context, point.x, point.y - size - 34, this.actorOf(node), 'actor', actorColor(this.actorOf(node), 1));
      drawn += 1;
    }
    context.restore();
  }

  drawBadge(context, x, y, text, kind, custom) {
    context.save();
    context.font = '800 10px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = context.measureText(text).width + 16;
    const fill = kind === 'ok'
      ? 'rgba(141,240,189,.16)'
      : kind === 'warn'
        ? 'rgba(255,209,102,.16)'
        : kind === 'actor'
          ? String(custom).replace(',1)', ',.16)')
          : 'rgba(127,176,255,.12)';
    const stroke = kind === 'ok'
      ? 'rgba(141,240,189,.42)'
      : kind === 'warn'
        ? 'rgba(255,209,102,.42)'
        : kind === 'actor'
          ? custom
          : 'rgba(127,176,255,.36)';
    roundedRect(context, x - width / 2, y - 10, width, 20, 10);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.stroke();
    context.fillStyle = kind === 'ok' ? '#baffd7' : kind === 'warn' ? '#ffe39c' : '#edf5ff';
    context.fillText(text, x, y + 0.5);
    context.restore();
  }

  drawOverlay() {
    this.overlayContext.setTransform(1, 0, 0, 1, 0, 0);
    this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.overlayContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.overlayContext.save();
    this.overlayContext.translate(this.viewport.panX, this.viewport.panY);
    this.overlayContext.scale(this.viewport.zoom, this.viewport.zoom);
    this.drawFocusEdges(this.overlayContext);
    this.drawFocusMarks(this.overlayContext);
    this.overlayContext.restore();
    this.drawLabels(this.overlayContext);
  }

  worldToScreen(x, y) {
    return {
      x: x * this.viewport.zoom + this.viewport.panX,
      y: y * this.viewport.zoom + this.viewport.panY,
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.viewport.panX) / this.viewport.zoom,
      y: (y - this.viewport.panY) / this.viewport.zoom,
    };
  }

  hitObject(worldX, worldY) {
    let best = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const node of this.activeNodes()) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const nodeDistance = Math.hypot(dx, dy);
      if (this.shouldDrawStaticRing(node) || node.id === this.snapshot?.currentPurposeId || this.viewMode === 'responsibility') {
        const spec = this.ringSpec(node);
        if (Math.abs(nodeDistance - spec.r) < Math.max(10, 9 / Math.max(0.7, this.viewport.zoom))) {
          const angle = Math.atan2(dy, dx);
          const segment = spec.segments.find((candidate) => angleIn(angle, candidate.from, candidate.to));
          if (segment) return {type: 'responsibility', actor: segment.actor, nodeId: node.id};
        }
      }
      if (nodeDistance < distance) {
        distance = nodeDistance;
        best = node;
      }
    }
    return best && distance < Math.max(34, Number(best.r || 30) * 0.92)
      ? {type: 'node', nodeId: best.id}
      : null;
  }

  pointerPosition(event) {
    const rect = this.overlayCanvas.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  processHover() {
    this.pointerRaf = 0;
    if (!this.latestPointer || this.dragging || this.isMobile()) return;
    const point = this.pointerPosition(this.latestPointer);
    const worldPoint = this.screenToWorld(point.x, point.y);
    const selection = this.hitObject(worldPoint.x, worldPoint.y);
    const key = selectionKey(selection);
    if (key === this.lastHoverKey) return;
    this.lastHoverKey = key;
    this.renderStats.hoverChanges += 1;
    this.hover = selection;
    this.onHover?.(selection);
    this.scheduleRender(false, true);
  }

  queueHover(event) {
    this.latestPointer = event;
    if (!this.pointerRaf) this.pointerRaf = requestAnimationFrame(() => this.processHover());
  }

  handlePointerDown(event) {
    this.dragging = true;
    this.moved = false;
    this.pointerId = event.pointerId;
    this.lastPoint = {x: event.clientX, y: event.clientY};
    this.overlayCanvas.classList.add('dragging');
    try { this.overlayCanvas.setPointerCapture(event.pointerId); } catch { /* no-op */ }
  }

  handlePointerMove(event) {
    if (this.dragging) {
      const dx = event.clientX - this.lastPoint.x;
      const dy = event.clientY - this.lastPoint.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      this.lastPoint = {x: event.clientX, y: event.clientY};
      this.commitViewport({
        ...this.viewport,
        initialized: true,
        panX: this.viewport.panX + dx,
        panY: this.viewport.panY + dy,
      });
      return;
    }
    if ((event.pointerType || 'mouse') === 'mouse') this.queueHover(event);
  }

  handlePointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    this.overlayCanvas.classList.remove('dragging');
    try { this.overlayCanvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    if (!this.moved) {
      const point = this.pointerPosition(event);
      const worldPoint = this.screenToWorld(point.x, point.y);
      const selection = this.hitObject(worldPoint.x, worldPoint.y);
      this.hover = null;
      this.lastHoverKey = '';
      this.onHover?.(null);
      this.onSelection?.(selection);
    }
  }

  handlePointerCancel(event) {
    this.dragging = false;
    this.overlayCanvas.classList.remove('dragging');
    try { this.overlayCanvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  }

  handlePointerLeave() {
    if (this.dragging || this.selection) return;
    this.hover = null;
    this.lastHoverKey = '';
    this.onHover?.(null);
    this.scheduleRender(false, true);
  }

  zoomAt(factor, x, y) {
    const rect = this.overlayCanvas.getBoundingClientRect();
    const centerX = x ?? rect.width / 2;
    const centerY = y ?? rect.height / 2;
    const before = this.screenToWorld(centerX, centerY);
    const zoom = Math.max(0.3, Math.min(2.5, this.viewport.zoom * factor));
    this.commitViewport({
      ...this.viewport,
      initialized: true,
      zoom,
      panX: centerX - before.x * zoom,
      panY: centerY - before.y * zoom,
    });
  }

  handleWheel(event) {
    event.preventDefault();
    const point = this.pointerPosition(event);
    this.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, point.x, point.y);
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onSelection?.(null);
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoomAt(1.18);
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      this.zoomAt(1 / 1.18);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      this.fit();
      return;
    }
    const amount = event.shiftKey ? 80 : 32;
    const movement = {
      ArrowLeft: [amount, 0],
      ArrowRight: [-amount, 0],
      ArrowUp: [0, amount],
      ArrowDown: [0, -amount],
    }[event.key];
    if (movement) {
      event.preventDefault();
      this.commitViewport({
        ...this.viewport,
        initialized: true,
        panX: this.viewport.panX + movement[0],
        panY: this.viewport.panY + movement[1],
      });
    }
  }

  getRingTestPoints() {
    const output = [];
    const rect = this.overlayCanvas.getBoundingClientRect();
    for (const node of this.activeNodes()) {
      if (!this.shouldDrawStaticRing(node) && this.viewMode !== 'responsibility') continue;
      const spec = this.ringSpec(node);
      if (!spec.segments.length) continue;
      const segment = spec.segments[0];
      const angle = (segment.from + segment.to) / 2;
      const point = this.worldToScreen(node.x + Math.cos(angle) * spec.r, node.y + Math.sin(angle) * spec.r);
      output.push({
        id: node.id,
        actor: segment.actor,
        x: Math.round(rect.left + point.x),
        y: Math.round(rect.top + point.y),
        localX: Math.round(point.x),
        localY: Math.round(point.y),
      });
    }
    return output;
  }

  debugState() {
    return {
      render: {...this.renderStats},
      zoom: this.viewport.zoom,
      viewport: {panX: this.viewport.panX, panY: this.viewport.panY},
      viewMode: this.viewMode,
      focusType: this.selection?.type || null,
      responsibilityTestPoints: this.getRingTestPoints(),
      activeNodes: this.activeNodes().length,
      activeEdges: this.activeEdges().length,
      actorOrder: ROLES,
    };
  }
}

export {actorColor};
