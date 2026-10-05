// Projection from the Live Atlas read model to the existing semantic-map
// maxGraph scene shape. World coordinates come from the selected topology only;
// observations and the camera change colour, motion and detail, never position.
import { currentRefs, summarizeScopes, TARGET_CLASSES } from './live-atlas.mjs';

// Same budget as packages/semantic-map/projection/projector.js.
export const MAX_SCENE_PRIMITIVES = 2048;
export const LOD_THRESHOLDS = Object.freeze({ middle: 2, near: 6 });

const CHIP = Object.freeze({ width: 46, height: 19 });
const LANE = Object.freeze({ width: 13, height: 8, gap: 2, slots: 3 });
const PAD = 2;
const GAP = 2;
// The whole world is packed for a typical landscape desktop viewport.
const WORLD_ASPECT = 1.7;
const BAND_GAP = 12;
const ACTOR = Object.freeze({ width: 46, height: 16, gap: 4 });
const TARGET = Object.freeze({ width: 70, height: 16, gap: 4 });

export const STATUS_PAINT = Object.freeze({
  blocked: Object.freeze({ fillColor: '#fde8ef', strokeColor: '#c2255c', strokeWidth: 2.6, dashed: false }),
  running: Object.freeze({ fillColor: '#e6f6ea', strokeColor: '#2b8a3e', strokeWidth: 1.8, dashed: false }),
  stopped: Object.freeze({ fillColor: '#fff3e0', strokeColor: '#d9480f', strokeWidth: 1.8, dashed: false }),
  residual: Object.freeze({ fillColor: '#f0ebfd', strokeColor: '#6741d9', strokeWidth: 1.6, dashed: false }),
  completed: Object.freeze({ fillColor: '#e7f1fb', strokeColor: '#1864ab', strokeWidth: 1.4, dashed: false }),
  created: Object.freeze({ fillColor: '#e3f6f8', strokeColor: '#0b7285', strokeWidth: 1.4, dashed: false }),
  idle: Object.freeze({ fillColor: '#ffffff', strokeColor: '#495057', strokeWidth: 1.2, dashed: false }),
  missing: Object.freeze({ fillColor: '#f8f9fa', strokeColor: '#868e96', strokeWidth: 1.4, dashed: true }),
  unknown: Object.freeze({ fillColor: '#f1f3f5', strokeColor: '#495057', strokeWidth: 1.4, dashed: true }),
});
const CLASS_PAINT = Object.freeze({
  purpose: '#e8590c', meta: '#ae3ec9', policy: '#1971c2', code: '#2f9e44',
});
const STATUS_GLYPH = Object.freeze({ completed: '✓', residual: '~', stopped: '■', created: '+' });

const sortIds = ids => [...ids].sort();

// Shelf-packs boxes in id order, choosing the column count whose content
// aspect is closest to `aspect`.
const pack = (boxes, aspect) => {
  if (boxes.length === 0) return { width: 0, height: 0, places: [] };
  let best = null;
  for (let columns = 1; columns <= boxes.length; columns += 1) {
    const places = [];
    let x = 0; let y = 0; let rowHeight = 0; let width = 0;
    boxes.forEach((box, index) => {
      if (index > 0 && index % columns === 0) { y += rowHeight + GAP; x = 0; rowHeight = 0; }
      places.push({ x, y });
      x += box.width + GAP;
      rowHeight = Math.max(rowHeight, box.height);
      width = Math.max(width, x - GAP);
    });
    const height = y + rowHeight;
    const score = Math.abs(Math.log((width / height) / aspect));
    if (!best || score < best.score) best = { score, width, height, places };
  }
  return best;
};

// A leaf is its chip above a row of lane slots; a parent puts its chip and
// lane slots in one header row above its packed children.
const LEAF = Object.freeze({ width: CHIP.width + 2 * PAD, height: CHIP.height + 1 + LANE.height + 2 * PAD });
const HEADER_WIDTH = CHIP.width + 2 + LANE.slots * (LANE.width + LANE.gap);

const packScopes = (topology, innerAspect) => {
  const boxes = new Map();
  const measure = id => {
    const children = topology.children.get(id);
    if (children.length === 0) {
      const box = { width: LEAF.width, height: LEAF.height, content: null };
      boxes.set(id, box);
      return box;
    }
    const content = pack(children.map(measure), innerAspect);
    const box = {
      width: Math.max(HEADER_WIDTH, content.width) + 2 * PAD,
      height: PAD + CHIP.height + GAP + content.height + PAD,
      content,
    };
    boxes.set(id, box);
    return box;
  };
  const top = pack(topology.roots.map(measure), WORLD_ASPECT);
  return { boxes, top };
};

export const layoutTopology = topology => {
  // The inner aspect is searched deterministically so that the packed world
  // best fills a WORLD_ASPECT screen; it depends on the topology alone.
  let chosen = null;
  for (let step = 3; step <= 40; step += 1) {
    const candidate = packScopes(topology, step / 10);
    const fill = Math.min(WORLD_ASPECT / candidate.top.width, 1 / (candidate.top.height + 4 * (ACTOR.height + BAND_GAP)));
    if (!chosen || fill > chosen.fill) chosen = { ...candidate, fill };
  }
  const { boxes, top } = chosen;
  const scopes = new Map();
  const place = (id, x, y, depth) => {
    const box = boxes.get(id);
    const area = { x, y, width: box.width, height: box.height };
    const leaf = box.content === null;
    // A parent's chip takes its header row up to the lane slots, so subtree
    // totals stay readable.
    const laneBlock = LANE.slots * (LANE.width + LANE.gap) - LANE.gap;
    const chipWidth = leaf ? CHIP.width : box.width - 2 * PAD - 2 - laneBlock;
    const chip = { x: x + PAD, y: y + PAD, width: chipWidth, height: CHIP.height };
    const laneX = leaf ? x + PAD : x + PAD + chipWidth + 2;
    const laneY = leaf ? y + PAD + CHIP.height + 1 : y + PAD + (CHIP.height - LANE.height) / 2;
    const lanes = Array.from({ length: LANE.slots }, (_, index) => ({
      x: laneX + index * (LANE.width + LANE.gap), y: laneY, width: LANE.width, height: LANE.height,
    }));
    scopes.set(id, { area, chip, lanes, depth });
    topology.children.get(id).forEach((child, index) => {
      const offset = box.content.places[index];
      place(child, x + PAD + offset.x, y + PAD + CHIP.height + GAP + offset.y, depth + 1);
    });
  };
  topology.roots.forEach((id, index) => place(id, top.places[index].x, top.places[index].y, 0));

  const width = Math.max(top.width, 4 * (TARGET.width + TARGET.gap));
  const actors = new Map();
  let y = top.height + BAND_GAP;
  const byDepth = new Map();
  for (const id of topology.actors.keys()) {
    const depth = topology.orgDepth.get(id);
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push(id);
  }
  const perRow = Math.max(1, Math.floor((width + ACTOR.gap) / (ACTOR.width + ACTOR.gap)));
  const orgRows = [];
  for (const depth of sortIds(byDepth.keys()).map(Number).sort((a, b) => a - b)) {
    const ids = sortIds(byDepth.get(depth));
    const rowStart = y;
    ids.forEach((id, index) => {
      if (index > 0 && index % perRow === 0) y += ACTOR.height + ACTOR.gap;
      actors.set(id, { x: (index % perRow) * (ACTOR.width + ACTOR.gap), y, width: ACTOR.width, height: ACTOR.height, depth });
    });
    orgRows.push({ depth, y: rowStart, ids });
    y += ACTOR.height + ACTOR.gap * 3;
  }
  const targets = new Map();
  y += BAND_GAP - ACTOR.gap * 3;
  let x = 0;
  for (const id of [...topology.targets.keys()].sort((a, b) => (
    TARGET_CLASSES.indexOf(topology.targets.get(a).class) - TARGET_CLASSES.indexOf(topology.targets.get(b).class) || (a < b ? -1 : 1)))) {
    if (x + TARGET.width > width) { x = 0; y += TARGET.height + TARGET.gap; }
    targets.set(id, { x, y, width: TARGET.width, height: TARGET.height });
    x += TARGET.width + TARGET.gap;
  }
  const height = topology.targets.size ? y + TARGET.height : y;
  return Object.freeze({ scopes, actors, targets, orgRows, world: Object.freeze({ x: -PAD, y: -PAD, width: width + 2 * PAD, height: height + 2 * PAD }) });
};

export const lodFor = zoom => (zoom >= LOD_THRESHOLDS.near ? 'near' : zoom >= LOD_THRESHOLDS.middle ? 'middle' : 'far');

// Chip status: dominant tone plus compact tokens. Tokens precede ' · ' so the
// renderer's compact label keeps them when the scope name does not fit.
export const scopeStatus = (summary, current) => {
  if (!current.current) return { tone: 'unknown', token: '?' };
  if (!summary.reported) return { tone: 'missing', token: '—' };
  const tokens = [];
  if (summary.lanes > 0) tokens.push(`▶${summary.lanes}`);
  if (summary.blocked > 0) tokens.push(`!${summary.blocked}`);
  const status = summary.status?.status;
  if (tokens.length === 0 && STATUS_GLYPH[status]) tokens.push(STATUS_GLYPH[status]);
  if (tokens.length === 0 && summary.stopped > 0) tokens.push(`■${summary.stopped}`);
  const tone = summary.blocked > 0 ? 'blocked' : summary.lanes > 0 ? 'running' : summary.stopped > 0 ? 'stopped' : status && STATUS_PAINT[status] ? status : 'idle';
  return { tone, token: tokens.join('') || '·' };
};

const rect = bounds => Object.freeze({ ...bounds });

const region = (id, bounds, extra) => Object.freeze({
  regionId: id, label: '', bounds: rect(bounds), kind: 'node', depth: 3, readOnly: true,
  geometryEditable: false, labelEditable: false, ...extra,
});

// Builds the scene for one view. Every scope is individually present at every
// LOD (area + chip); actors, work, references and edges are budgeted, and
// whatever is not drawn is counted in coverage and stays reachable in HTML.
export const projectAtlas = (snapshot, current, view) => {
  const { topology } = snapshot;
  const layout = view.layout ?? layoutTopology(topology);
  const lod = lodFor(view.zoom);
  const summaries = summarizeScopes(snapshot, current);
  const refs = currentRefs(snapshot, current);
  const scopeCount = topology.scopes.size;
  const fixed = 2 * scopeCount + topology.targets.size;
  if (fixed > MAX_SCENE_PRIMITIVES) {
    return Object.freeze({ supported: false, diagnostic: `${scopeCount} scopes and ${topology.targets.size} targets need ${fixed} primitives; the scene budget is ${MAX_SCENE_PRIMITIVES}`, layout, lod });
  }
  let budget = MAX_SCENE_PRIMITIVES - fixed;
  const representations = [];
  const relations = [];
  const selectionProxies = {};
  const status = new Map();
  const motion = on => (current.current && on ? 'pulse' : 'none');

  for (const [id, scope] of layout.scopes) {
    const summary = summaries.get(id);
    const state = scopeStatus(summary, current);
    status.set(id, state);
    const row = topology.scopes.get(id);
    representations.push(region(`area:${id}`, scope.area, {
      shape: 'boundary', mode: 'boundary', zIndex: scope.depth * 2,
      visual: { appearance: { strokeColor: '#adb5bd', strokeWidth: 1, dashed: false } },
    }));
    representations.push(region(id, scope.chip, {
      shape: 'graph-node', label: `${state.token} · ${row.label}`, zIndex: scope.depth * 2 + 1,
      activation: { type: 'select', id },
      visual: { appearance: STATUS_PAINT[state.tone], motion: motion(state.tone === 'running') },
      atlas: { kind: 'scope', tone: state.tone, token: state.token },
    }));
    selectionProxies[`area:${id}`] = id;
  }

  // Actors: one individual glyph each when the budget allows, otherwise one
  // aggregate glyph per org depth that covers its members exactly once.
  const actorIds = [...layout.actors.keys()];
  // Half of the remaining budget stays for work glyphs and edges.
  const individualActors = actorIds.length <= budget / 2;
  const visibleActor = new Map();
  const aggregates = [];
  if (individualActors) {
    for (const id of actorIds) {
      const bounds = layout.actors.get(id);
      representations.push(region(id, bounds, {
        shape: 'graph-node', label: topology.actors.get(id).label, zIndex: 10_000,
        activation: { type: 'select', id },
        visual: { appearance: { fillColor: '#ffffff', strokeColor: '#343a40', strokeWidth: 1.2, dashed: false } },
        atlas: { kind: 'actor' },
      }));
      visibleActor.set(id, id);
    }
    budget -= actorIds.length;
  } else {
    for (const row of layout.orgRows) {
      const glyph = `actors:depth:${row.depth}`;
      const first = layout.actors.get(row.ids[0]);
      const selected = row.ids.filter(id => id === view.selected);
      const covered = row.ids.filter(id => id !== view.selected);
      representations.push(region(glyph, { x: 0, y: first.y, width: ACTOR.width * 2, height: ACTOR.height }, {
        shape: 'graph-node', label: `${covered.length} actors · org depth ${row.depth}`, zIndex: 10_000,
        activation: { type: 'select', id: glyph },
        visual: { appearance: { fillColor: '#f1f3f5', strokeColor: '#343a40', strokeWidth: 1.2, dashed: true } },
        atlas: { kind: 'aggregate', covers: covered },
      }));
      aggregates.push({ id: glyph, covers: covered });
      for (const id of covered) visibleActor.set(id, glyph);
      for (const id of selected) {
        representations.push(region(id, layout.actors.get(id), {
          shape: 'graph-node', label: topology.actors.get(id).label, zIndex: 10_001,
          activation: { type: 'select', id },
          visual: { appearance: { fillColor: '#ffffff', strokeColor: '#343a40', strokeWidth: 1.2, dashed: false } },
          atlas: { kind: 'actor' },
        }));
        visibleActor.set(id, id);
      }
      budget -= 1 + selected.length;
    }
  }

  for (const [id, bounds] of layout.targets) {
    const target = topology.targets.get(id);
    representations.push(region(id, bounds, {
      shape: 'graph-node', label: `${target.class} · ${target.label}`, zIndex: 10_000,
      activation: { type: 'select', id },
      visual: { appearance: { fillColor: '#ffffff', strokeColor: CLASS_PAINT[target.class], strokeWidth: 1.6, dashed: false } },
      atlas: { kind: 'target', class: target.class },
    }));
  }

  // Work glyphs sit in their scope's fixed lane slots. Far shows them only
  // when every work fits; middle and near show them within the budget.
  const works = current.current
    ? snapshot.channels.observations.work.filter(work => Date.parse(work.observedAt) <= current.now)
    : [];
  const coverage = { works: { total: works.length, shown: 0 }, refs: { total: 0, shown: 0 }, org: { total: topology.orgs.length, shown: 0 }, members: { total: topology.members.length, shown: 0 } };
  const workSlots = new Map();
  for (const work of works) {
    if (!workSlots.has(work.scope)) workSlots.set(work.scope, []);
    workSlots.get(work.scope).push(work);
  }
  const showWork = lod !== 'far' || works.length <= budget / 4;
  if (showWork) {
    for (const scopeId of sortIds(workSlots.keys())) {
      const list = workSlots.get(scopeId).sort((a, b) => (a.id < b.id ? -1 : 1));
      const slots = layout.scopes.get(scopeId).lanes;
      const shown = list.filter(work => work.id === view.selected).concat(list.filter(work => work.id !== view.selected)).slice(0, slots.length);
      shown.forEach((work, index) => {
        if (budget <= 0) return;
        const evidence = (work.evidence ?? []).map(item => item.ref).join(' ');
        representations.push(region(work.id, slots[index], {
          shape: 'graph-node', label: lod === 'near' ? `${work.id} · ${evidence}` : '', zIndex: 20_000,
          activation: { type: 'select', id: work.id },
          visual: { appearance: STATUS_PAINT[work.status], motion: motion(work.status === 'running') },
          atlas: { kind: 'work', status: work.status },
        }));
        coverage.works.shown += 1;
        budget -= 1;
      });
    }
  }

  const visible = new Set(representations.map(item => item.regionId));
  const edge = (id, from, to, appearance, { directed = true, moving = false } = {}) => {
    if (budget <= 0 || !visible.has(from) || !visible.has(to) || from === to) return false;
    relations.push(Object.freeze({
      relationIds: [id], from, to, kind: 'relation', directed, readOnly: true, label: '',
      visual: { appearance, motion: moving ? 'flow' : 'none' },
    }));
    budget -= 1;
    return true;
  };
  const orgSeen = new Set();
  for (const org of topology.orgs) {
    const from = visibleActor.get(org.from);
    const to = visibleActor.get(org.to);
    const key = `${from}>${to}`;
    if (from === to || orgSeen.has(key)) continue;
    orgSeen.add(key);
    if (edge(`org:${key}`, from, to, { strokeColor: '#343a40', strokeWidth: 1.4, dashed: false })) coverage.org.shown += 1;
  }
  const refPairs = new Map();
  for (const ref of refs) {
    const key = `${visibleActor.get(ref.actor)}>${ref.target}`;
    if (!refPairs.has(key)) refPairs.set(key, { from: visibleActor.get(ref.actor), to: ref.target, ids: [] });
    refPairs.get(key).ids.push(ref.id);
  }
  coverage.refs.total = refs.length;
  for (const [key, pair] of [...refPairs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const target = topology.targets.get(pair.to);
    if (edge(`ref:${key}`, pair.from, pair.to, { strokeColor: CLASS_PAINT[target.class], strokeWidth: 1.6, dashed: true }, { moving: current.current })) {
      coverage.refs.shown += pair.ids.length;
    }
  }
  if (lod !== 'far') {
    const focus = view.selected;
    for (const member of topology.members) {
      if (member.actor !== focus && member.scope !== focus) continue;
      if (edge(`member:${member.id}`, visibleActor.get(member.actor), member.scope, { strokeColor: '#868e96', strokeWidth: 1, dashed: false }, { directed: false })) coverage.members.shown += 1;
    }
    if (lod === 'near') {
      for (const work of works) {
        if (!visible.has(work.id)) continue;
        for (const actor of work.actors) edge(`work:${work.id}:${actor}`, visibleActor.get(actor), work.id, { strokeColor: '#adb5bd', strokeWidth: 1, dashed: false });
      }
    }
  }

  const primitives = representations.length + relations.length;
  if (primitives > MAX_SCENE_PRIMITIVES) throw new Error(`live-atlas: projection exceeded the scene budget (${primitives})`);
  return Object.freeze({
    supported: true, lod, layout, status, aggregates, coverage, primitives,
    scene: Object.freeze({
      pattern: 'graph/1', scale: view.scale, resourceComposition: null,
      representations: Object.freeze(representations), relations: Object.freeze(relations),
      selectionProxies: Object.freeze(selectionProxies),
    }),
  });
};

export const fitCamera = (world, viewport, margin = 0.98) => {
  const scale = Math.min(viewport.width / world.width, viewport.height / world.height) * margin;
  return Object.freeze({
    scale,
    translateX: (viewport.width / scale - world.width) / 2 - world.x,
    translateY: (viewport.height / scale - world.height) / 2 - world.y,
  });
};
