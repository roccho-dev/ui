/* UI-only renderer: cached world surface + lightweight interaction overlay. */
var stage = document.getElementById("stage");
var ticksEl = document.getElementById("ticks");
var modeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-mode]"));
var worldSurface = document.createElement("canvas");
var worldCtx = worldSurface.getContext("2d", { alpha: true });
var viewMode = "purpose";
var tipPinned = false;
var inspectorKey = "";
var tickButtons = [];
var sceneCacheDirty = true;
var sceneDirty = true;
var overlayDirty = true;
var renderRaf = 0;
var pointerRaf = 0;
var latestPointer = null;
var lastHoverKey = "";
var lastArchiveBucket = null;
var cacheScale = 1.25;
var lastCanvasSize = { width: 0, height: 0 };
var renderStats = {
  frames: 0,
  sceneBuilds: 0,
  sceneBlits: 0,
  overlayFrames: 0,
  hoverChanges: 0,
  lastFrameMs: 0,
  maxFrameMs: 0,
  mode: viewMode,
};

function isMobileUI() {
  return window.matchMedia("(max-width:760px)").matches;
}

function archiveBucket() {
  return zoom >= 0.72 ? 1 : 0;
}

function objectKey(obj) {
  if (!obj) return "";
  if (obj.type === "responsibility") return "r:" + obj.node.id + ":" + obj.actor;
  return "n:" + obj.id;
}

function isMissing(id) {
  return !!missingMap[id];
}

function hexToRgb(h) {
  h = String(h || "#93a6c9").replace("#", "");
  if (h.length === 3) h = h.split("").map(function (x) { return x + x; }).join("");
  return {
    r: parseInt(h.slice(0, 2), 16) || 147,
    g: parseInt(h.slice(2, 4), 16) || 166,
    b: parseInt(h.slice(4, 6), 16) || 201,
  };
}

function nodeColor(n, alpha) {
  if (n.status === "archived") return "rgba(145,156,180," + alpha + ")";
  var rgb = hexToRgb(LAYER_COL[n.layer] || "#93a6c9");
  return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
}

function setCanvasSize(target, width, height) {
  var pw = Math.max(1, Math.round(width * dpr));
  var ph = Math.max(1, Math.round(height * dpr));
  if (target.width !== pw) target.width = pw;
  if (target.height !== ph) target.height = ph;
}

function invalidateScene(reason) {
  sceneCacheDirty = true;
  sceneDirty = true;
  overlayDirty = true;
  mapCache.key = "";
  scheduleRender(true, true);
}

function scheduleRender(scene, overlay) {
  if (scene) sceneDirty = true;
  if (overlay) overlayDirty = true;
  if (!renderRaf) renderRaf = requestAnimationFrame(renderFrame);
}

function renderFrame() {
  renderRaf = 0;
  if (!model) return;
  var started = performance.now();
  if (sceneCacheDirty) rebuildSceneCache();
  if (sceneDirty) {
    blitScene();
    sceneDirty = false;
    renderStats.sceneBlits++;
  }
  if (overlayDirty) {
    drawOverlay();
    overlayDirty = false;
    renderStats.overlayFrames++;
  }
  renderStats.frames++;
  renderStats.lastFrameMs = Math.round((performance.now() - started) * 100) / 100;
  renderStats.maxFrameMs = Math.max(renderStats.maxFrameMs, renderStats.lastFrameMs);
  var perf = document.getElementById("renderState");
  if (perf) perf.textContent = "cache " + renderStats.sceneBuilds + " · rAF";
}

function buildMap() {
  var nodes = activeNodes();
  var cell = isMobileUI() ? 12 : 10;
  var key = model.t + "|" + archiveBucket() + "|" + cell + "|" + nodes.map(function (n) {
    return n.id + ":" + n.status + ":" + Math.round(n.x) + ":" + Math.round(n.y);
  }).join(",");
  if (key === mapCache.key) return;

  var cols = Math.ceil(world.w / cell);
  var rows = Math.ceil(world.h / cell);
  var owners = new Int16Array(cols * rows);
  owners.fill(-1);
  var edgeLookup = Object.create(null);
  var edges = activeEdges();
  for (var ei = 0; ei < edges.length; ei++) {
    var ee = edges[ei];
    edgeLookup[ee.source + "|" + ee.target] = 1;
    edgeLookup[ee.target + "|" + ee.source] = 1;
  }

  for (var y = 0; y < rows; y++) {
    var wy = y * cell + cell / 2;
    for (var x = 0; x < cols; x++) {
      var wx = x * cell + cell / 2;
      if (wx < 22 || wy < 22 || wx > world.w - 20 || wy > world.h - 20) continue;
      var best = -1;
      var score = Infinity;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var rr = n.r * (n.status === "archived" ? 0.5 : 1);
        var dx = wx - n.x;
        var dy = wy - n.y;
        var boost = (n.id === model.currentPurpose ? 16 : 0) + (isMissing(n.id) ? 10 : 0);
        var candidate = Math.sqrt(dx * dx + dy * dy) - (rr + boost);
        if (candidate < score) {
          score = candidate;
          best = i;
        }
      }
      owners[y * cols + x] = best;
    }
  }
  mapCache = {
    key: key,
    nodes: nodes,
    owners: owners,
    cols: cols,
    rows: rows,
    cell: cell,
    edgeLookup: edgeLookup,
  };
}

function cellAlpha(n) {
  var alpha = n.status === "archived" ? 0.035 : 0.082;
  if (viewMode === "responsibility") alpha *= 1.22;
  if (viewMode === "focus") alpha *= 0.72;
  if (n.id === model.currentPurpose) alpha = viewMode === "responsibility" ? 0.2 : 0.18;
  if (isMissing(n.id)) alpha = 0.16;
  return alpha;
}

function drawTerritories(target) {
  var nodes = mapCache.nodes;
  var owners = mapCache.owners;
  var cols = mapCache.cols;
  var rows = mapCache.rows;
  var cell = mapCache.cell;

  for (var y = 0; y < rows; y++) {
    var x = 0;
    while (x < cols) {
      var idx = owners[y * cols + x];
      if (idx < 0) { x++; continue; }
      var start = x;
      while (x + 1 < cols && owners[y * cols + x + 1] === idx) x++;
      var n = nodes[idx];
      target.fillStyle = nodeColor(n, cellAlpha(n));
      target.fillRect(start * cell, y * cell, (x - start + 1) * cell + 0.5, cell + 0.5);
      x++;
    }
  }

  var normal = new Path2D();
  var hot = new Path2D();
  for (var by = 0; by < rows; by++) {
    for (var bx = 0; bx < cols; bx++) {
      var a = owners[by * cols + bx];
      if (a < 0) continue;
      var right = bx + 1 < cols ? owners[by * cols + bx + 1] : -1;
      var down = by + 1 < rows ? owners[(by + 1) * cols + bx] : -1;
      if (right !== a) addBoundaryPath(normal, hot, (bx + 1) * cell, by * cell, (bx + 1) * cell, (by + 1) * cell, a, right, nodes);
      if (down !== a) addBoundaryPath(normal, hot, bx * cell, (by + 1) * cell, (bx + 1) * cell, (by + 1) * cell, a, down, nodes);
    }
  }
  target.lineWidth = 1;
  target.strokeStyle = "rgba(170,195,255,.065)";
  target.stroke(normal);
  target.strokeStyle = "rgba(220,235,255,.20)";
  target.stroke(hot);
}

function addBoundaryPath(normal, hot, x1, y1, x2, y2, a, b, nodes) {
  var path = normal;
  if (a >= 0 && b >= 0 && mapCache.edgeLookup[nodes[a].id + "|" + nodes[b].id]) path = hot;
  path.moveTo(x1, y1);
  path.lineTo(x2, y2);
}

function drawBaseEdges(target) {
  var edges = activeEdges();
  var alpha = viewMode === "purpose" ? 0.15 : viewMode === "responsibility" ? 0.085 : 0.05;
  target.save();
  target.lineCap = "round";
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (!SUPPORT_KINDS[e.kind]) continue;
    var a = model.nodes[e.source];
    var b = model.nodes[e.target];
    if (!a || !b) continue;
    target.beginPath();
    target.moveTo(a.x, a.y);
    target.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 24, b.x, b.y);
    target.lineWidth = viewMode === "purpose" ? 1.5 : 1.1;
    target.strokeStyle = "rgba(127,176,255," + alpha + ")";
    target.stroke();
  }
  target.restore();
}

function shouldDrawStaticRing(n) {
  if (n.id === model.currentPurpose || n.contract || isMissing(n.id)) return true;
  if (viewMode === "responsibility") return n.kind === "purpose" || n.kind === "milestone";
  return false;
}

function drawStaticRing(target, n) {
  var spec = ringSpec(n);
  if (!spec.segments.length) return;
  target.save();
  target.lineCap = "round";
  for (var i = 0; i < spec.segments.length; i++) {
    var segment = spec.segments[i];
    target.beginPath();
    target.arc(n.x, n.y, spec.r, segment.from, segment.to);
    target.lineWidth = viewMode === "responsibility" ? 7 : 5;
    target.strokeStyle = actorColor(segment.actor, viewMode === "responsibility" ? 0.88 : 0.7);
    target.stroke();
  }
  target.restore();
}

function drawStaticMarks(target) {
  var nodes = activeNodes();
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var current = n.id === model.currentPurpose;
    var missing = isMissing(n.id);
    var last = model.lastEvent && (model.lastEvent.node === n.id || model.lastEvent.id === n.id || model.lastEvent.terminal === n.id);
    var coreRadius = Math.max(4.5, n.r * (current ? 0.24 : missing ? 0.21 : n.status === "archived" ? 0.10 : 0.145));
    target.save();
    target.beginPath();
    target.arc(n.x, n.y, coreRadius, 0, Math.PI * 2);
    target.fillStyle = nodeColor(n, n.status === "archived" ? 0.5 : 0.92);
    if (current || last) {
      target.shadowColor = current ? "rgba(141,240,189,.75)" : "rgba(255,255,255,.65)";
      target.shadowBlur = 15;
    }
    target.fill();
    if (current || missing || last) {
      target.lineWidth = 2.5;
      target.strokeStyle = last ? "rgba(255,255,255,.82)" : current ? "rgba(141,240,189,.88)" : "rgba(255,209,102,.86)";
      target.stroke();
    }
    if (shouldDrawStaticRing(n)) drawStaticRing(target, n);
    if (n.lastActivity && model.t - n.lastActivity.t <= 2) drawActivityArc(target, n, n.lastActivity.role || actorOf(n), 0.9);
    target.restore();
  }
}

function drawActivityArc(target, n, actor, alpha) {
  var rr = Math.max(22, n.r * 0.57);
  target.save();
  target.beginPath();
  target.arc(n.x, n.y, rr, -Math.PI * 0.18, Math.PI * 0.55);
  target.lineWidth = 3;
  target.strokeStyle = actorColor(actor, alpha == null ? 0.9 : alpha);
  target.setLineDash([5, 4]);
  target.stroke();
  target.restore();
}

function rebuildSceneCache() {
  buildMap();
  cacheScale = Math.min(2, Math.max(1.25, dpr));
  var width = Math.max(1, Math.round(world.w * cacheScale));
  var height = Math.max(1, Math.round(world.h * cacheScale));
  if (worldSurface.width !== width) worldSurface.width = width;
  if (worldSurface.height !== height) worldSurface.height = height;
  worldCtx.setTransform(1, 0, 0, 1, 0, 0);
  worldCtx.clearRect(0, 0, width, height);
  worldCtx.setTransform(cacheScale, 0, 0, cacheScale, 0, 0);
  drawTerritories(worldCtx);
  drawBaseEdges(worldCtx);
  drawStaticMarks(worldCtx);
  sceneCacheDirty = false;
  lastArchiveBucket = archiveBucket();
  renderStats.sceneBuilds++;
}

function blitScene() {
  var width = overlayCanvas.clientWidth;
  var height = overlayCanvas.clientHeight;
  sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
  sceneCtx.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height);
  sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sceneCtx.save();
  sceneCtx.translate(panX, panY);
  sceneCtx.scale(zoom, zoom);
  sceneCtx.globalAlpha = 1;
  sceneCtx.imageSmoothingEnabled = true;
  sceneCtx.drawImage(worldSurface, 0, 0, worldSurface.width, worldSurface.height, 0, 0, world.w, world.h);
  sceneCtx.restore();
  if (!width || !height) return;
}

function pathEdgesFrom(src, target) {
  var edges = activeEdges();
  var q = [src];
  var seen = Object.create(null);
  var previous = Object.create(null);
  seen[src] = 1;
  while (q.length) {
    var current = q.shift();
    if (current === target) break;
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if (edge.source !== current || !SUPPORT_KINDS[edge.kind] || seen[edge.target]) continue;
      seen[edge.target] = 1;
      previous[edge.target] = edge;
      q.push(edge.target);
    }
  }
  var result = Object.create(null);
  var cursor = target;
  if (!seen[target]) return result;
  while (cursor !== src && previous[cursor]) {
    var found = previous[cursor];
    result[found.id] = 1;
    cursor = found.source;
  }
  return result;
}

function focusEdgeSet() {
  var focus = selected || hover;
  var result = Object.create(null);
  var branch = focusBranch();
  if (branch) {
    for (var bid in branch.edges) result[bid] = 1;
    return result;
  }
  if (focus && focus.type !== "responsibility") {
    var path = pathEdgesFrom(focus.id, model.currentPurpose);
    for (var pid in path) result[pid] = 1;
    var edges = activeEdges();
    for (var i = 0; i < edges.length; i++) {
      if (edges[i].source === focus.id || edges[i].target === focus.id) result[edges[i].id] = 1;
    }
    return result;
  }
  if (currentGuard && currentGuard.missing && currentGuard.missing.length) {
    for (var mi = 0; mi < currentGuard.missing.length; mi++) {
      var missingPath = pathEdgesFrom(currentGuard.missing[mi], model.currentPurpose);
      for (var mid in missingPath) result[mid] = 1;
    }
  }
  return result;
}

function drawFocusEdges(target) {
  var selectedSet = focusEdgeSet();
  var actor = focusActor();
  var edges = activeEdges();
  target.save();
  target.lineCap = "round";
  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i];
    if (!selectedSet[edge.id]) continue;
    var a = model.nodes[edge.source];
    var b = model.nodes[edge.target];
    if (!a || !b) continue;
    target.beginPath();
    target.moveTo(a.x, a.y);
    target.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 24, b.x, b.y);
    target.lineWidth = 3.4 / Math.max(0.55, zoom);
    target.strokeStyle = actor ? actorColor(actor, 0.94) : "rgba(255,209,102,.86)";
    target.shadowColor = target.strokeStyle;
    target.shadowBlur = 8 / Math.max(0.6, zoom);
    target.stroke();
  }
  target.restore();
}

function drawFocusMarks(target) {
  var focus = selected || hover;
  if (!focus) return;
  var node = focus.type === "responsibility" ? focus.node : focus;
  var branch = focusBranch();
  if (branch) {
    for (var id in branch.nodes) {
      var branchNode = model.nodes[id];
      if (!branchNode) continue;
      target.beginPath();
      target.arc(branchNode.x, branchNode.y, Math.max(9, branchNode.r * 0.22), 0, Math.PI * 2);
      target.lineWidth = 2 / Math.max(0.6, zoom);
      target.strokeStyle = actorColor(focus.actor, id === node.id ? 0.98 : 0.46);
      target.stroke();
    }
  }
  target.save();
  target.beginPath();
  target.arc(node.x, node.y, Math.max(18, node.r * 0.62), 0, Math.PI * 2);
  target.lineWidth = 3 / Math.max(0.6, zoom);
  target.strokeStyle = focus.type === "responsibility" ? actorColor(focus.actor, 1) : "rgba(255,255,255,.9)";
  target.shadowColor = target.strokeStyle;
  target.shadowBlur = 18 / Math.max(0.6, zoom);
  target.stroke();
  if (focus.type === "responsibility") {
    var spec = ringSpec(node);
    for (var si = 0; si < spec.segments.length; si++) {
      var segment = spec.segments[si];
      if (segment.actor !== focus.actor) continue;
      target.beginPath();
      target.arc(node.x, node.y, spec.r, segment.from, segment.to);
      target.lineWidth = 11 / Math.max(0.6, zoom);
      target.lineCap = "round";
      target.strokeStyle = actorColor(focus.actor, 1);
      target.stroke();
    }
  }
  target.restore();
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function nodeLabelPriority(n, focus, branch) {
  var score = n.r;
  if (n.id === model.currentPurpose) score += 2000;
  if (isMissing(n.id)) score += 1700;
  if (focus && focus.id === n.id) score += 1600;
  if (branch && branch.nodes[n.id]) score += 1400;
  if (n.contract) score += 900;
  if (n.kind === "purpose" || n.kind === "milestone") score += 720;
  if (n.lastActivity && model.t - n.lastActivity.t <= 1) score += 650;
  if (n.status === "archived") score -= 160;
  return score;
}

function drawLabels(target) {
  var nodes = activeNodes();
  var focus = focusNode();
  var branch = focusBranch();
  var mobile = isMobileUI();
  var budget = mobile ? 14 : 30;
  budget += Math.max(0, Math.round((zoom - 0.85) * (mobile ? 8 : 18)));
  if (viewMode === "responsibility") budget += mobile ? 2 : 8;
  if (viewMode === "focus" && focus) budget += mobile ? 4 : 12;
  budget = Math.min(nodes.length, Math.max(8, budget));

  var candidates = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var p = worldToScreen(n.x, n.y);
    if (p.x < -120 || p.y < -100 || p.x > overlayCanvas.clientWidth + 120 || p.y > overlayCanvas.clientHeight + 100) continue;
    if (viewMode === "focus" && focus && n.id !== model.currentPurpose && n.id !== focus.id && !(branch && branch.nodes[n.id])) continue;
    var priority = nodeLabelPriority(n, focus, branch);
    if (viewMode === "purpose" && priority < 600 && zoom < 1.04) continue;
    candidates.push({ node: n, point: p, priority: priority });
  }
  candidates.sort(function (a, b) { return b.priority - a.priority || a.node.id.localeCompare(b.node.id); });

  var occupied = [];
  var drawn = 0;
  target.save();
  target.textAlign = "center";
  target.textBaseline = "middle";
  for (var ci = 0; ci < candidates.length && drawn < budget; ci++) {
    var item = candidates[ci];
    var node = item.node;
    var point = item.point;
    var size = Math.max(10, Math.min(21, 10 + node.r * 0.12 * zoom + (node.id === model.currentPurpose ? 3 : 0)));
    var label = node.label;
    if (label.length > 16 && !(focus && focus.id === node.id) && zoom < 1.15) label = label.slice(0, 15) + "…";
    target.font = "850 " + size + "px system-ui,-apple-system,sans-serif";
    var width = target.measureText(label).width + 10;
    var box = { x: point.x - width / 2, y: point.y - size * 0.72, w: width, h: size * 1.45 };
    var collides = false;
    for (var oi = 0; oi < occupied.length; oi++) {
      if (rectsOverlap(box, occupied[oi])) { collides = true; break; }
    }
    var essential = item.priority >= 1400;
    if (collides && !essential) continue;
    occupied.push(box);
    target.lineWidth = mobile ? 4.5 : 4;
    target.strokeStyle = "rgba(2,5,12,.88)";
    target.fillStyle = node.status === "archived" ? "rgba(203,214,232,.62)" : node.id === model.currentPurpose ? "#baffd7" : isMissing(node.id) ? "#ffe39c" : "#eef5ff";
    target.strokeText(label, point.x, point.y);
    target.fillText(label, point.x, point.y);
    if (node.id === model.currentPurpose) drawBadge(target, point.x, point.y - size - 18, currentGuard && currentGuard.status === "ok" ? "一致" : "ズレ", currentGuard && currentGuard.status === "ok" ? "ok" : "warn");
    else if (isMissing(node.id)) drawBadge(target, point.x, point.y + size + 15, "missing", "warn");
    else if (node.status === "archived" && zoom > 0.9) drawBadge(target, point.x, point.y + size + 15, "archive", "info");
    if (focus && focus.id === node.id) drawBadge(target, point.x, point.y - size - 34, actorOf(node), "actor", actorColor(actorOf(node), 1));
    drawn++;
  }
  target.restore();
}

function drawBadge(target, x, y, text, kind, custom) {
  target.save();
  target.font = "800 10px system-ui";
  target.textAlign = "center";
  target.textBaseline = "middle";
  var width = target.measureText(text).width + 16;
  var fill = kind === "ok" ? "rgba(141,240,189,.16)" : kind === "warn" ? "rgba(255,209,102,.16)" : kind === "actor" ? String(custom).replace(",1)", ",.16)") : "rgba(127,176,255,.12)";
  var stroke = kind === "ok" ? "rgba(141,240,189,.42)" : kind === "warn" ? "rgba(255,209,102,.42)" : kind === "actor" ? custom : "rgba(127,176,255,.36)";
  roundedRect(target, x - width / 2, y - 10, width, 20, 10);
  target.fillStyle = fill;
  target.fill();
  target.strokeStyle = stroke;
  target.stroke();
  target.fillStyle = kind === "ok" ? "#baffd7" : kind === "warn" ? "#ffe39c" : "#edf5ff";
  target.fillText(text, x, y + 0.5);
  target.restore();
}

function roundedRect(target, x, y, w, h, r) {
  target.beginPath();
  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.quadraticCurveTo(x + w, y, x + w, y + r);
  target.lineTo(x + w, y + h - r);
  target.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  target.lineTo(x + r, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
  target.closePath();
}

function drawOverlay() {
  overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  overlayCtx.save();
  overlayCtx.translate(panX, panY);
  overlayCtx.scale(zoom, zoom);
  drawFocusEdges(overlayCtx);
  drawFocusMarks(overlayCtx);
  overlayCtx.restore();
  drawLabels(overlayCtx);
  updateZoomUI();
}

function worldToScreen(x, y) {
  return { x: x * zoom + panX, y: y * zoom + panY };
}

function screenToWorld(x, y) {
  return { x: (x - panX) / zoom, y: (y - panY) / zoom };
}

function normAngle(a) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}

function angleIn(a, from, to) {
  a = normAngle(a);
  from = normAngle(from);
  to = normAngle(to);
  return from <= to ? a >= from && a <= to : a >= from || a <= to;
}

function hitObject(wx, wy) {
  var nodes = activeNodes();
  var best = null;
  var distance = Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var dx = wx - n.x;
    var dy = wy - n.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (shouldDrawStaticRing(n) || n.id === model.currentPurpose || viewMode === "responsibility") {
      var spec = ringSpec(n);
      if (Math.abs(d - spec.r) < Math.max(10, 9 / Math.max(0.7, zoom))) {
        var angle = Math.atan2(dy, dx);
        for (var si = 0; si < spec.segments.length; si++) {
          if (angleIn(angle, spec.segments[si].from, spec.segments[si].to)) {
            return { type: "responsibility", actor: spec.segments[si].actor, node: n, segment: spec.segments[si] };
          }
        }
      }
    }
    if (d < distance) {
      distance = d;
      best = n;
    }
  }
  return best && distance < Math.max(34, best.r * 0.92) ? best : null;
}

function renderCompositionRows(comp) {
  if (!comp.length) return '<p class="inspector-copy">責務構成はまだ計算できません。</p>';
  return '<div class="comp-list">' + comp.map(function (entry) {
    var percent = Math.round(entry.ratio * 100);
    return '<div class="comp-row"><span>' + esc(entry.actor) + '</span><span class="comp-track"><i class="comp-fill" style="width:' + Math.max(4, percent) + '%;background:' + actorColor(entry.actor, .92) + '"></i></span><b>' + percent + '%</b></div>';
  }).join("") + '</div>';
}

function inspectorChrome(kicker, title, body, closable) {
  return '<div class="inspector-head"><div><small>' + esc(kicker) + '</small><h2>' + esc(title) + '</h2></div>' + (closable ? '<button class="close-inspector" id="closeTip" aria-label="閉じる">×</button>' : '') + '</div><div class="inspector-body">' + body + '</div>';
}

function renderInspectorOverview() {
  if (!model) return;
  inspectorKey = "overview:" + model.t + ":" + viewMode + ":" + Object.keys(ops).length;
  var g = currentGuard || guard();
  var comp = model.currentPurpose ? compositionEntries(model.currentPurpose) : [];
  var body = '<p class="inspector-copy">目的の支援経路と、同じnode群から再帰集約した責務を並列に確認します。</p>' +
    '<div class="section"><h3 class="section-title">Current state</h3><div class="metric-grid">' +
    '<div class="metric-card"><small>guard</small><b>' + esc(g.status === "ok" ? "一致" : "ズレ") + '</b></div>' +
    '<div class="metric-card"><small>next owner</small><b>' + esc(g.owner) + '</b></div>' +
    '<div class="metric-card"><small>nodes</small><b>' + activeNodes().length + '</b></div>' +
    '<div class="metric-card"><small>edges</small><b>' + activeEdges().length + '</b></div></div></div>' +
    '<div class="section"><h3 class="section-title">Responsibility composition</h3>' + renderCompositionRows(comp) + '</div>' +
    '<div class="section"><h3 class="section-title">Recent projection</h3><div class="eventbox">' + esc(model.eventLog.slice(0, 6).join("\n") || "t0 initial projection") + '</div></div>';
  tip.innerHTML = inspectorChrome("Inspector", model.currentPurpose ? labelFromId(model.currentPurpose) : "目的未設定", body, false);
  if (isMobileUI()) tip.classList.remove("show");
}

function renderInspectorObject(obj, pinned) {
  var key = objectKey(obj) + ":" + model.t + ":" + (pinned ? "pin" : "hover");
  if (key === inspectorKey) return;
  inspectorKey = key;
  var title;
  var copy;
  var chips = "";
  var comp = [];
  if (obj.type === "responsibility") {
    var data = responsibilityData(obj.node.id);
    var branch = data.branches[obj.actor] || { nodes: {} };
    var ids = Object.keys(branch.nodes);
    title = obj.actor + "責務 · " + obj.node.label;
    copy = "この目的を支えるsubgraphから再帰集約された責務です。目的配置は変えず、外周と支援経路だけを強調しています。";
    chips = '<span class="pill info">coverage ' + ids.length + ' nodes</span>' + ids.slice(0, 5).map(function (id) {
      return '<span class="pill">' + esc(model.nodes[id] ? model.nodes[id].label : id) + '</span>';
    }).join("");
    comp = [{ actor: obj.actor, ratio: 1 }];
  } else {
    title = obj.label;
    copy = (obj.labelText || obj.purposeLabel || obj.kind || "") + (obj.status === "archived" ? "。archiveとして残っています。" : "");
    chips = '<span class="pill info">' + esc(actorOf(obj)) + '責務</span><span class="pill info">' + esc(obj.kind || "node") + '</span><span class="pill info">meta ' + esc(obj.metaRank) + '</span>';
    comp = compositionEntries(obj.id);
  }
  var actions = pinned ? '<div class="actions"><button class="warn" id="logMismatch">ズレとして記録</button><button class="primary" id="askOwner">担当へ検査依頼</button><button id="stepInTip">Step JSONL</button><button id="holdCEO">CEO判断待ち</button></div>' : '<p class="inspector-copy section">クリックすると固定し、判断アクションを表示します。</p>';
  var body = '<p class="inspector-copy">' + esc(copy) + '</p><div class="row">' + chips + '</div>' +
    '<div class="section"><h3 class="section-title">Responsibility</h3>' + renderCompositionRows(comp) + '</div>' +
    actions + '<div class="eventbox">' + esc(model.eventLog.slice(0, 5).join("\n")) + '</div>';
  tip.innerHTML = inspectorChrome(obj.type === "responsibility" ? "Responsibility projection" : "Node inspector", title, body, pinned);
  if (pinned || !isMobileUI()) tip.classList.add("show");
  if (pinned) bindTip();
}

function showTip(obj, pin) {
  if (!obj) return;
  if (pin) {
    selected = obj;
    hover = null;
    tipPinned = true;
  } else {
    if (selected) return;
    hover = obj;
  }
  renderInspectorObject(pin ? selected : obj, !!pin);
  scheduleRender(false, true);
}

function closeTip() {
  selected = null;
  hover = null;
  tipPinned = false;
  lastHoverKey = "";
  tip.classList.remove("show");
  renderInspectorOverview();
  scheduleRender(false, true);
}

function bindTip() {
  var g = currentGuard || guard();
  function record(kind) {
    var key = kind + ":" + model.t + ":" + g.owner + ":" + g.text;
    if (ops[key]) {
      toast("記録済み。同じ内容は再記録しません");
      return;
    }
    var labels = { mismatch: "ズレとして記録", request: g.owner + "へ検査依頼", hold: "CEO判断待ち" };
    ops[key] = {
      kind: kind,
      t: model.t,
      owner: g.owner,
      target: g.missing && g.missing[0] ? labelFromId(g.missing[0]) : "—",
      label: labels[kind] || kind,
    };
    sessionQueue.unshift(ops[key]);
    if (sessionQueue.length > 8) sessionQueue.pop();
    document.getElementById("opsState").textContent = Object.keys(ops).length;
    updateOpsDisplay();
    toast("記録: " + labels[kind]);
  }
  var close = document.getElementById("closeTip");
  if (close) close.onclick = function (event) { event.stopPropagation(); closeTip(); };
  var mismatch = document.getElementById("logMismatch");
  if (mismatch) mismatch.onclick = function (event) { event.stopPropagation(); record("mismatch"); };
  var ask = document.getElementById("askOwner");
  if (ask) ask.onclick = function (event) { event.stopPropagation(); record("request"); };
  var hold = document.getElementById("holdCEO");
  if (hold) hold.onclick = function (event) { event.stopPropagation(); record("hold"); };
  var stepButton = document.getElementById("stepInTip");
  if (stepButton) stepButton.onclick = function (event) { event.stopPropagation(); step(1); };
}

function updateOpsDisplay() {
  var queue = document.getElementById("opsQueue");
  if (!queue) return;
  if (!sessionQueue.length) {
    queue.innerHTML = "";
    return;
  }
  queue.innerHTML = sessionQueue.slice(0, 2).map(function (item) {
    var icon = { mismatch: "⚠", request: "👤", hold: "⏸" }[item.kind] || "•";
    return '<div class="opsline"><b>' + icon + ' ' + esc(item.label) + '</b><br><small>t' + item.t + ' · ' + esc(item.owner) + ' → ' + esc(item.target) + '</small></div>';
  }).join("");
}

function toast(message) {
  var element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { element.classList.remove("show"); }, 1450);
}

function ensureTicks() {
  if (tickButtons.length) return;
  var keys = { 2: 1, 7: 1, 20: 1, 39: 1 };
  var fragment = document.createDocumentFragment();
  for (var i = 1; i <= EVENTS.length; i++) {
    var button = document.createElement("button");
    button.className = "tick" + (keys[i] ? " key" : "");
    button.type = "button";
    button.dataset.t = String(i);
    button.title = "t" + i + " " + (EVENTS[i - 1].label || EVENTS[i - 1].type);
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", function () { setT(Number(this.dataset.t)); });
    fragment.appendChild(button);
    tickButtons.push(button);
  }
  ticksEl.appendChild(fragment);
}

function drawTicks() {
  ensureTicks();
  for (var i = 0; i < tickButtons.length; i++) {
    var t = i + 1;
    tickButtons[i].classList.toggle("done", t <= model.t);
    tickButtons[i].classList.toggle("now", t === model.t);
    tickButtons[i].setAttribute("aria-current", t === model.t ? "step" : "false");
  }
  if (isMobileUI() && model.t > 0 && tickButtons[model.t - 1]) {
    tickButtons[model.t - 1].scrollIntoView({ block: "nearest", inline: "center" });
  }
}

function updateZoomUI() {
  var label = document.getElementById("zoomLabel");
  if (label) label.textContent = Math.round(zoom * 100) + "%";
}

function resize(resetCamera) {
  var rect = overlayCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  var mobile = isMobileUI();
  dpr = Math.max(1, Math.min(mobile ? 1.5 : 2, window.devicePixelRatio || 1));
  setCanvasSize(sceneCanvas, rect.width, rect.height);
  setCanvasSize(overlayCanvas, rect.width, rect.height);
  var changed = Math.abs(lastCanvasSize.width - rect.width) > 1 || Math.abs(lastCanvasSize.height - rect.height) > 1;
  lastCanvasSize = { width: rect.width, height: rect.height };
  if (resetCamera !== false || changed) fitView();
  invalidateScene("resize");
}

function fitView() {
  var rect = overlayCanvas.getBoundingClientRect();
  zoom = Math.min(rect.width / world.w, rect.height / world.h) * (isMobileUI() ? 0.94 : 0.92);
  if (isMobileUI()) zoom = Math.max(0.38, zoom);
  panX = isMobileUI() ? 8 : (rect.width - world.w * zoom) / 2;
  panY = (rect.height - world.h * zoom) / 2;
  if (isMobileUI()) panY = Math.max(8, panY);
  lastArchiveBucket = archiveBucket();
  updateZoomUI();
}

function zoomAt(factor, cx, cy) {
  var rect = overlayCanvas.getBoundingClientRect();
  cx = cx == null ? rect.width / 2 : cx;
  cy = cy == null ? rect.height / 2 : cy;
  var before = screenToWorld(cx, cy);
  var oldBucket = archiveBucket();
  zoom = Math.max(0.3, Math.min(2.5, zoom * factor));
  panX = cx - before.x * zoom;
  panY = cy - before.y * zoom;
  if (archiveBucket() !== oldBucket) invalidateScene("archive-visibility");
  else scheduleRender(true, true);
}

function pointerPosition(event) {
  var rect = overlayCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function processHover() {
  pointerRaf = 0;
  if (!latestPointer || dragging || isMobileUI()) return;
  var p = pointerPosition(latestPointer);
  var worldPoint = screenToWorld(p.x, p.y);
  var object = hitObject(worldPoint.x, worldPoint.y);
  var key = objectKey(object);
  if (key === lastHoverKey) return;
  lastHoverKey = key;
  renderStats.hoverChanges++;
  hover = object;
  if (object) showTip(object, false);
  else if (!selected) {
    renderInspectorOverview();
    scheduleRender(false, true);
  }
}

function queueHover(event) {
  latestPointer = event;
  if (!pointerRaf) pointerRaf = requestAnimationFrame(processHover);
}

overlayCanvas.addEventListener("pointerdown", function (event) {
  dragging = true;
  moved = false;
  lastPt = { x: event.clientX, y: event.clientY };
  overlayCanvas.classList.add("dragging");
  try { overlayCanvas.setPointerCapture(event.pointerId); } catch (error) {}
});

overlayCanvas.addEventListener("pointermove", function (event) {
  if (dragging) {
    var dx = event.clientX - lastPt.x;
    var dy = event.clientY - lastPt.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    panX += dx;
    panY += dy;
    lastPt = { x: event.clientX, y: event.clientY };
    scheduleRender(true, true);
    return;
  }
  if ((event.pointerType || "mouse") === "mouse") queueHover(event);
});

overlayCanvas.addEventListener("pointerup", function (event) {
  dragging = false;
  overlayCanvas.classList.remove("dragging");
  try { overlayCanvas.releasePointerCapture(event.pointerId); } catch (error) {}
  if (!moved) {
    var p = pointerPosition(event);
    var worldPoint = screenToWorld(p.x, p.y);
    var object = hitObject(worldPoint.x, worldPoint.y);
    if (object) showTip(object, true);
    else closeTip();
  }
});

overlayCanvas.addEventListener("pointercancel", function () {
  dragging = false;
  overlayCanvas.classList.remove("dragging");
});

overlayCanvas.addEventListener("pointerleave", function () {
  if (dragging || selected) return;
  hover = null;
  lastHoverKey = "";
  renderInspectorOverview();
  scheduleRender(false, true);
});

overlayCanvas.addEventListener("wheel", function (event) {
  event.preventDefault();
  var rect = overlayCanvas.getBoundingClientRect();
  zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

function setMode(mode) {
  if (!mode || mode === viewMode) return;
  viewMode = mode;
  renderStats.mode = mode;
  for (var i = 0; i < modeButtons.length; i++) {
    var active = modeButtons[i].dataset.mode === mode;
    modeButtons[i].classList.toggle("active", active);
    modeButtons[i].setAttribute("aria-selected", active ? "true" : "false");
  }
  var copy = document.getElementById("modeCopy");
  if (copy) copy.textContent = mode === "purpose" ? "目的距離" : mode === "responsibility" ? "責務構成" : "選択経路";
  renderInspectorOverview();
  invalidateScene("mode");
}

for (var mbi = 0; mbi < modeButtons.length; mbi++) {
  modeButtons[mbi].addEventListener("click", function () { setMode(this.dataset.mode); });
}

document.getElementById("zoomIn").onclick = function () { zoomAt(1.18); };
document.getElementById("zoomOut").onclick = function () { zoomAt(1 / 1.18); };
document.getElementById("fitBtn").onclick = function () { fitView(); scheduleRender(true, true); };
document.getElementById("stepBtn").onclick = function () { step(1); };
document.getElementById("prevBtn").onclick = function () { step(-1); };
document.getElementById("resetBtn").onclick = function () { setT(0); toast("reset"); };
document.getElementById("playBtn").onclick = play;

window.addEventListener("keydown", function (event) {
  if (event.target && /button|input|select|textarea/i.test(event.target.tagName)) return;
  if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  else if (event.key === " ") { event.preventDefault(); play(); }
  else if (event.key === "Escape") closeTip();
  else if (event.key === "0") { fitView(); scheduleRender(true, true); }
  else if (event.key === "+" || event.key === "=") zoomAt(1.18);
  else if (event.key === "-") zoomAt(1 / 1.18);
});

function ringTestPoints() {
  var out = [];
  var nodes = activeNodes();
  var rect = overlayCanvas.getBoundingClientRect();
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!shouldDrawStaticRing(n) && viewMode !== "responsibility") continue;
    var spec = ringSpec(n);
    if (!spec.segments.length) continue;
    var segment = spec.segments[0];
    var angle = (segment.from + segment.to) / 2;
    var point = worldToScreen(n.x + Math.cos(angle) * spec.r, n.y + Math.sin(angle) * spec.r);
    out.push({
      id: n.id,
      actor: segment.actor,
      x: Math.round(rect.left + point.x),
      y: Math.round(rect.top + point.y),
      localX: Math.round(point.x),
      localY: Math.round(point.y),
    });
  }
  return out;
}

window.__uxState = function () {
  var g = currentGuard || guard();
  var comp = model.currentPurpose ? compositionEntries(model.currentPurpose) : [];
  return {
    version: "v6-ui-refactor",
    t: model.t,
    currentPurpose: model.currentPurpose ? labelFromId(model.currentPurpose) : null,
    guard: g.status,
    guardText: g.text,
    nextOwner: g.owner,
    visibleNodes: activeNodes().length,
    visibleEdges: activeEdges().length,
    roleNodeCount: activeNodes().filter(function (n) { return n.kind === "role"; }).length,
    responsibilityTestPoints: ringTestPoints(),
    responsibilityComposition: comp.map(function (x) { return { actor: x.actor, ratio: Math.round(x.ratio * 1000) / 1000 }; }),
    totalOpsRecorded: Object.keys(ops).length,
    zoom: zoom,
    viewport: { panX: panX, panY: panY },
    tipVisible: tip.classList.contains("show") || (!isMobileUI() && !!tip.innerHTML),
    focusType: selected ? selected.type || "node" : null,
    lastEvent: model.lastEvent ? model.lastEvent.type : null,
    viewMode: viewMode,
    render: {
      frames: renderStats.frames,
      sceneBuilds: renderStats.sceneBuilds,
      sceneBlits: renderStats.sceneBlits,
      overlayFrames: renderStats.overlayFrames,
      hoverChanges: renderStats.hoverChanges,
      lastFrameMs: renderStats.lastFrameMs,
      maxFrameMs: renderStats.maxFrameMs,
      dpr: dpr,
    },
    metaOrder: activeNodes().filter(function (n) {
      return n.kind === "purpose" || n.contract || n.id === model.currentPurpose;
    }).map(function (n) {
      return { id: n.id, label: n.label, rank: n.metaRank, x: Math.round(n.x), y: Math.round(n.y), actor: actorOf(n), status: n.status };
    }).sort(function (a, b) { return a.rank - b.rank || a.x - b.x; }),
  };
};

function boot() {
  ensureTicks();
  var params = new URLSearchParams(window.location.search);
  var initialT = params.has("t") ? Number(params.get("t")) : 7;
  var initialMode = params.get("mode") || "responsibility";
  setT(Number.isFinite(initialT) ? initialT : 7);
  resize(true);
  setMode(["purpose", "responsibility", "focus"].indexOf(initialMode) >= 0 ? initialMode : "responsibility");
  toast("UIをキャッシュ描画で起動しました");
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(function () { resize(false); });
    observer.observe(stage);
  } else {
    window.addEventListener("resize", function () { resize(false); });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
