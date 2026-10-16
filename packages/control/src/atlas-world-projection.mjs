// Generic a2 world -> semantic scene projection.
// Owner contracts supply qualified entities/relations and explicit presentation areas;
// this file never derives business meaning from labels or position.

import { createGraphLayout } from '../../semantic-map/layout/graph.js';
import { DEFAULT_THEME } from '../../semantic-map/renderer-maxgraph/theme.js';
import { fitCamera } from '../../semantic-map/camera-fit.js';
import { LABEL_LINE_PX, linePx, wrapLabel } from './atlas-text.mjs';
import { ATLAS_COMPARISON_AXES, ATLAS_COMPARISON_GAPS, comparisonsForPair, containmentIndex, entityKey, indexWorldFrame, relationKey } from './atlas-world.mjs';
import { projectTimeline, timelinePosition } from './atlas-timeline.mjs';

const AREA_GAP = 40;
const AREA_TOP = 56;
const AREA_PAD = 22;
// Keep nested layout topology, but give the fixed-pixel node text enough width
// inside its own SVG clip at the representative fitted viewport.
const WORLD_WIDTH_SCALE = 1.5;
const MAX_ENTITIES_PER_AREA = 40;
const MAX_RELATION_GROUPS = 64;

const appearance = Object.freeze({
  now: Object.freeze({ fillColor: '#e6f6ea', strokeColor: '#2b8a3e', strokeWidth: 1.8, dashed: false }),
  recent: Object.freeze({ fillColor: '#fff3e0', strokeColor: '#d9480f', strokeWidth: 1.5, dashed: false }),
  unknown: Object.freeze({ fillColor: '#f1f3f5', strokeColor: '#495057', strokeWidth: 1.5, dashed: true }),
  none: Object.freeze({ fillColor: '#ffffff', strokeColor: '#868e96', strokeWidth: 1.2, dashed: false }),
});

const token = Object.freeze({ now: '▶', recent: '•', unknown: '?', none: '' });

// Supplied status flags, read as one display status. Checked in this order,
// so a conflict or an unassigned unit is never shown as a plain unmet one.
// Colors come from the renderer theme's palettes; the symbol always goes
// with the color, so no status is told by color alone.
const palette = (index, { dashed = false, strokeWidth = 1.6 } = {}) => Object.freeze({
  fillColor: DEFAULT_THEME.palettes[index][0], strokeColor: DEFAULT_THEME.palettes[index][1], strokeWidth, dashed,
});
export const ATLAS_STATUS = Object.freeze({
  conflict: Object.freeze({ symbol: '⚠', appearance: palette(4, { strokeWidth: 2.2 }),
    flags: Object.freeze(['scope_status=conflict', 'evaluation-disagreement', 'conflict', 'source=conflict', 'source=whole-purpose-conflict', 'purpose_standing=conflict']) }),
  unassigned: Object.freeze({ symbol: '∅', appearance: palette(1, { dashed: true }), flags: Object.freeze(['unassigned']) }),
  unknown: Object.freeze({ symbol: '?', appearance: palette(5, { dashed: true }),
    flags: Object.freeze(['scope_status=unknown', 'standing=unresolved', 'unknown', 'source=unknown', 'unexplained', 'purpose_standing=unknown']) }),
  unmet: Object.freeze({ symbol: '!', appearance: palette(3), flags: Object.freeze(['scope_status=unmet', 'purpose_standing=unmet']) }),
  satisfied: Object.freeze({ symbol: '✓', appearance: palette(2),
    flags: Object.freeze(['scope_status=declared_satisfied', 'standing=completed-history', 'purpose_standing=declared_satisfied']) }),
  history: Object.freeze({ symbol: '⟲', appearance: palette(5, { strokeWidth: 1.2 }), flags: Object.freeze(['history-preserved']) }),
});
const STATUS = ATLAS_STATUS;
const statusOf = flags => Object.keys(STATUS).find(status => STATUS[status].flags.some(flag => flags?.includes(flag))) ?? null;
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const sourceText = source => source ? source.sourceRef + (source.kind ? ' [' + source.kind + ']' : '') : 'source unknown';
const timeText = time => [
  'observed=' + (time?.observedAt ?? 'unknown'),
  'acquired=' + (time?.acquiredAt ?? 'unknown'),
  'effective=' + (time?.effectiveAt ?? 'unknown'),
].join(' · ');
const flagsText = flags => flags?.length ? flags.join(',') : 'none';
const contextText = context => Object.keys(context ?? {}).length ? Object.entries(context).map(([key, value]) => key + '=' + (typeof value === 'string' ? value : JSON.stringify(stable(value)))).join(' · ') : 'none';

const recordFor = (index, selected) => index.entityByKey.get(selected) ?? index.relationByKey.get(selected) ?? null;
const recordKind = (index, selected) => index.entityByKey.has(selected) ? 'entity' : index.relationByKey.has(selected) ? 'relation' : 'missing';

const changedFields = (current, other) => {
  if (!current || !other) return [];
  const fields = [...new Set([...Object.keys(current), ...Object.keys(other)])].sort();
  return fields.filter(field => !same(current[field], other[field]));
};

// Preserve every reference in a bounded set of simple supplied paths. A relation
// selection must traverse that exact relation first, never another Issue's edge.
const directionPaths = (frame, index, selected, targets) => {
  const relation = index.relationByKey.get(selected);
  const start = index.entityByKey.has(selected) ? selected : relation ? entityKey(relation.from) : null;
  const to = relation ? entityKey(relation.to) : null;
  const outgoing = new Map();
  for (const edge of frame.relations) {
    if (!edge.path) continue;
    const from = entityKey(edge.from), target = entityKey(edge.to);
    if (!index.entityByKey.has(from) || !index.entityByKey.has(target)) continue;
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(edge);
  }
  if (!start || !index.entityByKey.has(start) || (relation && (!relation.path || !index.entityByKey.has(to)))) {
    return Object.freeze({ routes: Object.freeze([]), limited: false,
      reason: relation && !relation.path ? 'selected relation path=false' : 'endpoint missing / unknown' });
  }
  const queue = [{ entities: relation ? [start, to] : [start], relations: relation ? [relation] : [] }];
  const routes = [];
  let examined = 0, truncated = false;
  while (queue.length && routes.length < 64 && examined < 4096) {
    const trail = queue.shift();
    examined += 1;
    const last = trail.entities.at(-1);
    if (targets.has(last)) {
      const flags = [...new Set(trail.relations.flatMap(edge => edge.flags))];
      routes.push(Object.freeze({ entities: Object.freeze(trail.entities),
        relations: Object.freeze(trail.relations.map(edge => relationKey(edge.ref))),
        status: flags.includes('proposal') ? 'PROPOSAL / not accepted' : flags.includes('unknown') ? 'UNKNOWN' : 'SUPPLIED path=true',
        flags: Object.freeze(flags) }));
      continue;
    }
    for (const edge of outgoing.get(last) ?? []) {
      const next = entityKey(edge.to);
      if (trail.entities.includes(next)) continue;
      if (queue.length + examined >= 4096) { truncated = true; continue; }
      queue.push({ entities: [...trail.entities, next], relations: [...trail.relations, edge] });
    }
  }
  return Object.freeze({ routes: Object.freeze(routes), limited: truncated || queue.length > 0,
    reason: routes.length ? null : 'no supplied path to a declared Purpose target' });
};

const frameText = frame => frame ? frame.id + ' · rev ' + frame.rev + ' · asOf ' + frame.asOf : 'UNKNOWN · no comparison frame';
const full = value => JSON.stringify(stable(value));

const worldComparisonLines = (input, before, after) => {
  const owners = comparisonsForPair(input, before, after);
  const lines = ['World Before: ' + frameText(before), 'World After: ' + frameText(after),
    'Owner comparison: ' + (owners.length ? owners.length + ' supplied receipt(s) for this exact pair' : 'NOT SUPPLIED for this pair'),
    'N=presence · M=meaning · R=reference · E=relation · S=evidence · T=time',
    'Business Gap / Frame delta / observation gap are separate owner claims.',
    'Work/Receipt completion does not establish Purpose achievement. UI authority=false.'];
  for (const owner of owners) {
    lines.push('Owner receipt: ' + owner.id + ' · ownerRef=' + owner.ownerRef,
      'Owner provenance: ' + full(owner.source) + ' · flags=' + flagsText(owner.flags),
      'Owner time: ' + timeText(owner.time));
    for (const [kind, keys, claims] of [['axis', ATLAS_COMPARISON_AXES, owner.axes], ['gap', ATLAS_COMPARISON_GAPS, owner.gaps]]) {
      for (const key of keys) {
        const claim = claims[key];
        lines.push('Owner ' + kind + ' ' + key + ': ' + (claim ? claim.status.toUpperCase() + ' · ' + claim.summary : 'NOT SUPPLIED / UNKNOWN'));
        if (claim) lines.push('Basis ' + key + ': ' + full(claim.basis), 'Refs ' + key + ': ' + full(claim.refs),
          'Reason ' + key + ': ' + (claim.reason ?? 'UNKNOWN'), 'Source ' + key + ': ' + full(claim.source),
          'Time ' + key + ': ' + timeText(claim.time), 'Flags ' + key + ': ' + flagsText(claim.flags));
      }
    }
  }
  if (!owners.length) {
    for (const key of ATLAS_COMPARISON_AXES) lines.push('Owner axis ' + key + ': NOT SUPPLIED / UNKNOWN');
    for (const key of ATLAS_COMPARISON_GAPS) lines.push('Owner gap ' + key + ': NOT SUPPLIED / UNKNOWN');
  }
  for (const item of input.comparisons ?? []) if (!owners.includes(item)) {
    lines.push('Other-pair receipt (not applied): ' + item.id + ' · Before=' + full(item.before) + ' · After=' + full(item.after));
  }
  lines.push('Factual world field delta: supplied records only; this is not owner M or Business Gap.');
  if (!before || !after) lines.push('Factual comparison UNKNOWN: both frames are required; reason/time UNKNOWN.');
  else {
    const records = frame => new Map([...frame.entities.map(item => [entityKey(item.ref), item]),
      ...frame.relations.map(item => [relationKey(item.ref), item])]);
    const left = records(before), right = records(after);
    let changes = 0;
    for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const a = left.get(key), b = right.get(key);
      const fields = changedFields(a, b);
      if (!a || !b || fields.length) {
        changes += 1;
        lines.push('Record delta ' + key + ': ' + (!a ? 'Before missing; reason/time UNKNOWN' : !b ? 'After missing; reason/time UNKNOWN' : 'fields=' + fields.join(', ')));
      }
    }
    lines.push('Factual records with supplied field/presence difference: ' + changes + '. Owner meaning remains separate.');
  }
  return Object.freeze(lines);
};

// SVG's plain-text renderer trims each line. Quoted JSON fragments keep line
// edges inside visible delimiters, and encode supplied newlines/tabs instead
// of sending them through that trimming path. The UI preserves interior spaces.
// Size the encoded label, not the original fragment; decoding never needs input
// metadata to restore a character. Unicode code points stay together.
const wrapLines = (lines, width) => {
  const capacity = Math.max(8, Math.floor(width / 18));
  return lines.flatMap((text, lineIndex) => {
    const parts = [];
    let encoded = '', length = 0, offset = 0, characters = 0;
    const emit = () => {
      parts.push(Object.freeze({ text: '"' + encoded + '"', lineIndex, offset }));
      offset += characters;
      encoded = ''; length = 0; characters = 0;
    };
    for (const character of text) {
      const literal = JSON.stringify(character).slice(1, -1)
        .replace(/[\u0085\u2028\u2029]/gu, value => '\\u' + value.charCodeAt(0).toString(16).padStart(4, '0'));
      const size = Array.from(literal).length;
      if (characters && length + size + 2 > capacity) emit();
      encoded += literal; length += size; characters += 1;
    }
    if (characters || parts.length === 0) emit();
    return parts;
  });
};

export const ATLAS_CHROMES = Object.freeze(['full', 'none']);
const TIMELINE_STRIP = 44;

// Every layout keeps one timeline strip directly below the graph, whatever
// the chrome. `panel: false` is the chrome-free layout: no control row or
// detail panel is reserved, so the graph takes the rest of the viewport.
export const worldViewport = ({ width = 1500, height = 1000 } = {}, { panel: withPanel = true } = {}) => {
  const strip = top => Object.freeze({ x: 8, y: top, width: Math.max(1, width - 16), height: TIMELINE_STRIP - 8 });
  if (!withPanel) {
    return Object.freeze({ graph: Object.freeze({ x: 16, y: 16, width: Math.max(1, width - 32), height: Math.max(1, height - 32 - TIMELINE_STRIP) }),
      panel: null, timeline: strip(height - TIMELINE_STRIP) });
  }
  // Keep the representative nested Before world readable at 1200x900: the
  // graph keeps its size, and the strip takes its height from the detail
  // panel, which pages rather than shrinking node names to status glyphs.
  const panelHeight = Math.min(400, Math.max(280, Math.floor(height * 0.3)));
  return Object.freeze({ graph: Object.freeze({ x: 16, y: 52, width: Math.max(1, width - 32), height: Math.max(1, height - panelHeight - 68) }),
    panel: Object.freeze({ x: 8, y: height - panelHeight + TIMELINE_STRIP, width: Math.max(1, width - 16), height: panelHeight - 8 - TIMELINE_STRIP }),
    timeline: strip(height - panelHeight) });
};

const regionId = key => 'world:' + key;
const areaRegionId = id => 'area:' + encodeURIComponent(id);

const orderedKeys = (keys, entityByKey, rank = new Map()) => [...keys].sort((left, right) => {
  const a = entityByKey.get(left), b = entityByKey.get(right);
  return (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
    || (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right);
});

// The vertical order inside each area. It starts from the supplied `order`
// and then moves each entity toward the mean position of the entities it is
// related to in the other areas (a fixed number of barycenter sweeps over the
// visible supplied relations), which removes avoidable relation crossings.
// Only declared order and relations are read; ties keep the previous order,
// so the result is deterministic. Names and labels are never compared.
// An area with supplied containment keeps its supplied order: moving nested
// containers can hide relations behind them.
const BARYCENTER_SWEEPS = 4;
const areaRanks = (frame, areas, containment) => {
  const areaOf = new Map(frame.entities.map(entity => [entityKey(entity.ref), entity.area]));
  const nested = new Set([...containment.parentByChild.keys()].map(key => areaOf.get(key)));
  const movable = areas.filter(area => !nested.has(area.id));
  const lists = new Map(areas.map(area => [area.id, orderedKeys(frame.entities.filter(entity => entity.area === area.id)
    .map(entity => entityKey(entity.ref)), new Map(frame.entities.map(entity => [entityKey(entity.ref), entity])))]));
  const neighbors = new Map([...areaOf.keys()].map(key => [key, []]));
  for (const relation of frame.relations) {
    const from = entityKey(relation.from), to = entityKey(relation.to);
    if (!relation.visible || !areaOf.has(from) || !areaOf.has(to) || areaOf.get(from) === areaOf.get(to)) continue;
    neighbors.get(from).push(to);
    neighbors.get(to).push(from);
  }
  const position = new Map();
  const place = () => {
    for (const list of lists.values()) list.forEach((key, index) => position.set(key, list.length > 1 ? index / (list.length - 1) : 0.5));
  };
  place();
  for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep += 1) {
    for (const area of movable) {
      const list = lists.get(area.id);
      const barycenter = new Map(list.map(key => {
        const near = neighbors.get(key);
        return [key, near.length ? near.reduce((sum, other) => sum + position.get(other), 0) / near.length : position.get(key)];
      }));
      const previous = new Map(list.map((key, index) => [key, index]));
      list.sort((left, right) => barycenter.get(left) - barycenter.get(right) || previous.get(left) - previous.get(right));
      place();
    }
  }
  return new Map(movable.flatMap(area => lists.get(area.id).map((key, index) => [key, index])));
};

const markSubtreeOmitted = (key, childrenByParent, omitted) => {
  if (omitted.has(key)) return;
  omitted.add(key);
  for (const child of childrenByParent.get(key) ?? []) markSubtreeOmitted(child, childrenByParent, omitted);
};

const nestedAreaLayout = ({ area, rows, containment, rank, labelOf }) => {
  const entityByKey = new Map(rows.map(entity => [entityKey(entity.ref), entity]));
  const childrenByParent = new Map([...entityByKey.keys()].map(key => [key, []]));
  const roots = [];
  for (const key of entityByKey.keys()) {
    const parent = containment.parentByChild.get(key);
    if (parent && entityByKey.has(parent)) childrenByParent.get(parent).push(key);
    else roots.push(key);
  }
  // Contained entities keep their supplied order inside their container; the
  // relation ordering moves only the top-level entities of an area.
  for (const [parent, children] of childrenByParent) childrenByParent.set(parent, orderedKeys(children, entityByKey));

  const shown = [];
  const omitted = new Set();
  const visit = key => {
    const entity = entityByKey.get(key);
    if (!entity?.visible || shown.length >= MAX_ENTITIES_PER_AREA) {
      markSubtreeOmitted(key, childrenByParent, omitted);
      return;
    }
    shown.push(key);
    for (const child of childrenByParent.get(key) ?? []) visit(child);
  };
  for (const root of orderedKeys(roots, entityByKey, rank)) visit(root);

  const shownSet = new Set(shown);
  const rootId = 'atlas-area-root:' + area.id;
  const regions = new Map([[rootId, Object.freeze({
    id: rootId, parent: null, label: area.label, kind: 'node', order: 0,
  })]]);
  const children = new Map([[rootId, []]]);
  for (const key of shown) children.set(key, []);
  for (const key of shown) {
    const entity = entityByKey.get(key);
    const declaredParent = containment.parentByChild.get(key);
    const parent = declaredParent && shownSet.has(declaredParent) ? declaredParent : rootId;
    regions.set(key, Object.freeze({
      id: key,
      parent,
      label: labelOf(entity),
      kind: 'node',
      order: parent === rootId ? rank.get(key) ?? entity.order : entity.order,
    }));
    children.get(parent).push(key);
  }

  const layout = createGraphLayout({
    meta: Object.freeze({ root: rootId }),
    regions,
    children,
    relations: Object.freeze([]),
  });
  return Object.freeze({
    layout,
    rootId,
    entityByKey,
    childrenByParent,
    shown: Object.freeze(shown),
    shownSet,
    omitted: Object.freeze([...omitted].sort()),
  });
};

// Content-fitted layout for an area without containment. Node text is drawn
// at a fixed screen size, so each box is sized in screen pixels for the
// expected camera scale (`textScale`, world units per pixel inverted): wide
// enough for its longest line, tall enough for its lines, never wider than
// LABEL_MAX_PX — longer lines are broken into more lines instead
// (atlas-text.mjs).
const LABEL_PAD_X_PX = 16;
const LABEL_PAD_Y_PX = 9;
const AREA_HEADER_PX = 40;
const FLAT_GAP = 24;
export { wrapLabel };

const flatAreaLayout = ({ area, rows, rank, labelOf, textScale }) => {
  const entityByKey = new Map(rows.map(entity => [entityKey(entity.ref), entity]));
  const ordered = orderedKeys([...entityByKey.keys()], entityByKey, rank);
  const shown = [], omitted = [];
  for (const key of ordered) (entityByKey.get(key).visible && shown.length < MAX_ENTITIES_PER_AREA ? shown : omitted).push(key);
  const labels = new Map(shown.map(key => [key, wrapLabel(labelOf(entityByKey.get(key)))]));
  const size = label => {
    const lines = label.split('\n');
    return { width: (Math.max(...lines.map(linePx)) + 2 * LABEL_PAD_X_PX) / textScale,
      height: (lines.length * LABEL_LINE_PX + 2 * LABEL_PAD_Y_PX) / textScale };
  };
  const sizes = new Map(shown.map(key => [key, size(labels.get(key))]));
  const header = (AREA_HEADER_PX) / textScale;
  const pad = LABEL_PAD_X_PX / textScale;
  const inner = Math.max(linePx(area.label) / textScale, ...[...sizes.values()].map(item => item.width), 120);
  const bounds = new Map();
  let y = header;
  for (const key of shown) {
    const { width, height } = sizes.get(key);
    // translateBounds widens x and width by WORLD_WIDTH_SCALE; undo it here.
    bounds.set(key, Object.freeze({ x: (pad + (inner - width) / 2) / WORLD_WIDTH_SCALE, y, width: width / WORLD_WIDTH_SCALE, height }));
    y += height + FLAT_GAP;
  }
  const rootBounds = Object.freeze({ x: 0, y: 0, width: (inner + 2 * pad) / WORLD_WIDTH_SCALE, height: Math.max(y - FLAT_GAP + pad, header + pad) });
  return Object.freeze({
    layout: Object.freeze({ rootBounds, bounds }),
    labels,
    entityByKey,
    childrenByParent: new Map(),
    shown: Object.freeze(shown),
    shownSet: new Set(shown),
    omitted: Object.freeze([...omitted].sort()),
  });
};

const containmentDepth = (key, parentByChild) => {
  let depth = 1, current = key;
  while (parentByChild.has(current)) {
    depth += 1;
    current = parentByChild.get(current);
  }
  return depth;
};

const translateBounds = (bounds, dx, dy) => Object.freeze({
  x: bounds.x * WORLD_WIDTH_SCALE + dx,
  y: bounds.y + dy,
  width: bounds.width * WORLD_WIDTH_SCALE,
  height: bounds.height,
});

const groupRelations = (frame, index, visibleEntityKeys) => {
  const groups = new Map();
  const omitted = [];
  for (const relation of frame.relations) {
    const id = relationKey(relation.ref);
    const from = entityKey(relation.from), to = entityKey(relation.to);
    const resolved = index.entityByKey.has(from) && index.entityByKey.has(to);
    const drawable = relation.visible && resolved && visibleEntityKeys.has(from) && visibleEntityKeys.has(to);
    if (!drawable) { omitted.push(id); continue; }
    const key = JSON.stringify([from, to, relation.kind]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(relation);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const drawn = ordered.slice(0, MAX_RELATION_GROUPS);
  for (const [, relations] of ordered.slice(MAX_RELATION_GROUPS)) {
    for (const relation of relations) omitted.push(relationKey(relation.ref));
  }
  return { drawn, omitted };
};

const selectedDiff = ({
  frame, counterpart, index, counterpartIndex, containment, counterpartContainment, selected,
}) => {
  const current = recordFor(index, selected);
  const other = counterpartIndex ? recordFor(counterpartIndex, selected) : null;
  const side = (sourceFrame, record) => sourceFrame ? Object.freeze({
    frameId: sourceFrame.id, rev: sourceFrame.rev, asOf: sourceFrame.asOf, record,
  }) : null;
  // Frame rev orders supplied snapshots, not the time or reason of a business change.
  const currentIsBefore = counterpart && frame.rev < counterpart.rev;
  const before = currentIsBefore ? side(frame, current) : side(counterpart, other);
  const after = currentIsBefore ? side(counterpart, other) : side(frame, current);
  const changes = changedFields(before?.record, after?.record).map(field => Object.freeze({
    field, before: before.record[field], after: after.record[field], basis: 'supplied record field',
  }));
  if (index.entityByKey.has(selected) && counterpartIndex?.entityByKey.has(selected)) {
    const currentParent = containment.parentByChild.get(selected) ?? null;
    const otherParent = counterpartContainment?.parentByChild.get(selected) ?? null;
    if (currentParent !== otherParent) changes.push(Object.freeze({
      field: 'containment',
      before: currentIsBefore ? currentParent : otherParent,
      after: currentIsBefore ? otherParent : currentParent,
      basis: 'supplied containment endpoints',
    }));
  }
  const summary = !counterpart ? 'no comparison frame'
    : !current && !other ? 'not present in either compared frame'
      : !current ? 'missing in ' + frame.id + ' · counterpart exists in ' + counterpart.id
        : !other ? 'present in ' + frame.id + ' · counterpart missing in ' + counterpart.id
          : changes.length ? 'changed ' + changes.map(change => change.field).join(', ')
            : 'no supplied selected-record field change';
  return Object.freeze({ before, after, changes: Object.freeze(changes), summary });
};

const comparisonSideText = side => side
  ? side.frameId + ' · rev ' + side.rev + ' · asOf ' + side.asOf
    + (side.record ? ' · record present' : ' · record missing · reason/time UNKNOWN')
  : 'UNKNOWN · no comparison frame';

const activityDisplay = ({ mode, connected, latest, admission }) => {
  const liveLatest = mode === 'live' && latest;
  const currentUnavailable = !connected || admission?.status === 'rejected';
  return Object.freeze({
    liveLatest,
    currentUnavailable,
    displayed: declared => (liveLatest && currentUnavailable && declared !== 'none' ? 'unknown' : declared),
  });
};

// The three-area World alone: areas, nested entities and drawn relation groups
// in world coordinates. It knows nothing of the camera, panel or controls.
export const projectWorldScene = ({
  input,
  frame,
  mode = 'sample',
  connected = false,
  latest = true,
  admission = null,
  ordering = 'relations',
  textScale = 1,
} = {}) => {
  if (!['relations', 'supplied'].includes(ordering)) throw new Error('atlas-world: unsupported ordering ' + ordering);
  if (!(textScale > 0)) throw new Error('atlas-world: textScale must be positive');
  const index = indexWorldFrame(frame);
  const displayedActivity = activityDisplay({ mode, connected, latest, admission }).displayed;
  const containment = containmentIndex(frame);
  const areas = input.presentation.areas;
  const areaEntities = new Map(areas.map(area => [area.id, []]));
  for (const entity of frame.entities) areaEntities.get(entity.area)?.push(entity);

  const representations = [];
  const visibleEntityKeys = new Set();
  const omittedEntityIds = [];
  const areaBounds = new Map();
  let worldHeight = 0;
  let contentRight = AREA_PAD;
  // `ordering: 'supplied'` keeps the supplied order alone; it exists so the
  // crossings removed by the relation ordering can be measured against it.
  const rank = ordering === 'supplied' ? new Map() : areaRanks(frame, areas, containment);
  // Live activity keeps its own glyph and color; otherwise the supplied status
  // flags choose them. Either way a symbol precedes the label.
  const look = entity => {
    const activity = displayedActivity(entity.activity);
    const status = activity === 'none' ? statusOf(entity.flags) : null;
    const symbol = status ? STATUS[status].symbol : token[activity];
    return { activity, status, label: (symbol ? symbol + ' · ' : '') + entity.label,
      appearance: status ? STATUS[status].appearance : appearance[activity] };
  };

  const nestedAreas = new Set([...containment.parentByChild.keys()].map(key => index.entityByKey.get(key)?.area));
  for (const area of areas) {
    const rows = areaEntities.get(area.id) ?? [];
    const nested = nestedAreas.has(area.id)
      ? nestedAreaLayout({ area, rows, containment, rank, labelOf: entity => look(entity).label })
      : flatAreaLayout({ area, rows, rank, labelOf: entity => look(entity).label, textScale });
    const rootBounds = nested.layout.rootBounds;
    const dx = contentRight - rootBounds.x * WORLD_WIDTH_SCALE;
    const dy = AREA_TOP - rootBounds.y;
    const bounds = translateBounds(rootBounds, dx, dy);
    areaBounds.set(area.id, bounds);
    worldHeight = Math.max(worldHeight, bounds.y + bounds.height);
    contentRight = bounds.x + bounds.width + AREA_GAP;
    omittedEntityIds.push(...nested.omitted);

    representations.push(Object.freeze({
      regionId: areaRegionId(area.id),
      label: area.label + (nested.omitted.length ? ' · +' + nested.omitted.length + ' omitted' : ''),
      bounds,
      kind: 'area',
      depth: 0,
      shape: 'boundary',
      mode: 'boundary',
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      atlas: Object.freeze({ kind: 'area', areaId: area.id, count: rows.length, omitted: nested.omitted.length }),
    }));

    for (const key of nested.shown) {
      const entity = nested.entityByKey.get(key);
      const localBounds = nested.layout.bounds.get(key);
      const entityBounds = translateBounds(localBounds, dx, dy);
      const shownChildren = (nested.childrenByParent.get(key) ?? []).filter(child => nested.shownSet.has(child));
      const hasChildren = shownChildren.length > 0;
      const { activity, status, label: lookLabel, appearance: entityAppearance } = look(entity);
      const label = nested.labels?.get(key) ?? lookLabel;
      visibleEntityKeys.add(key);
      representations.push(Object.freeze({
        regionId: regionId(key),
        sourceRegionId: regionId(key),
        label,
        bounds: entityBounds,
        kind: entity.ref.kind,
        depth: containmentDepth(key, containment.parentByChild),
        zIndex: containmentDepth(key, containment.parentByChild) * 10,
        shape: hasChildren ? 'boundary' : 'graph-node',
        readOnly: true,
        geometryEditable: false,
        labelEditable: false,
        activation: Object.freeze({ type: 'atlas.world.select', id: key }),
        visual: Object.freeze({ appearance: entityAppearance }),
        atlas: Object.freeze({
          kind: 'entity',
          ref: entity.ref,
          area: entity.area,
          activity,
          status,
          declaredActivity: entity.activity,
          parent: containment.parentByChild.get(key) ?? null,
          containmentEvidence: Object.freeze([...(containment.evidenceByChild.get(key) ?? [])]),
          hasChildren,
        }),
      }));
    }
  }

  const grouped = groupRelations(frame, index, visibleEntityKeys);
  const relations = [];
  const groupByRelationId = new Map();
  for (const [, members] of grouped.drawn) {
    const ids = members.map(member => relationKey(member.ref)).sort();
    const labels = [...new Set(members.map(member => member.label || member.kind).filter(Boolean))];
    const first = members[0];
    const sceneRelation = Object.freeze({
      relationIds: Object.freeze(ids),
      from: regionId(entityKey(first.from)),
      to: regionId(entityKey(first.to)),
      kind: first.kind,
      label: labels.length === 1 ? labels[0] : labels.join(' / '),
      directed: true,
      readOnly: true,
      foreground: true,
      atlas: Object.freeze({ kind: 'relation-group', relationRefs: Object.freeze(members.map(member => member.ref)) }),
    });
    relations.push(sceneRelation);
    for (const id of ids) groupByRelationId.set(id, sceneRelation);
  }

  const totalWidth = Math.max(640, contentRight - AREA_GAP + AREA_PAD);
  return Object.freeze({
    representations: Object.freeze(representations),
    relations: Object.freeze(relations),
    world: Object.freeze({ x: 0, y: 44, width: totalWidth, height: worldHeight - 44 + AREA_PAD }),
    areaBounds,
    index,
    containment,
    visibleEntityKeys,
    groupByRelationId,
    omittedRelationIds: Object.freeze([...new Set(grouped.omitted)].sort()),
    omittedEntityIds: Object.freeze([...new Set(omittedEntityIds)].sort()),
  });
};

// The judgement panel's text: every tab's logical lines for the selected
// record, wrapped to the panel width and paged. Pure text; no regions.
export const projectDetail = ({
  input,
  receivedInput = input,
  frame,
  counterpart = null,
  selected,
  mode = 'sample',
  connected = false,
  latest = true,
  admission = null,
  scene = projectWorldScene({ input, frame, mode, connected, latest, admission }),
  panel = worldViewport().panel,
  detailTab = 'record',
  detailPage = 0,
} = {}) => {
  const { index, containment, groupByRelationId } = scene;
  const counterpartIndex = counterpart ? indexWorldFrame(counterpart) : null;
  const counterpartContainment = counterpart ? containmentIndex(counterpart) : null;
  const { liveLatest, currentUnavailable, displayed: displayedActivity } = activityDisplay({ mode, connected, latest, admission });
  const currentRecord = recordFor(index, selected);
  const counterpartRecord = counterpartIndex ? recordFor(counterpartIndex, selected) : null;
  const currentKind = recordKind(index, selected);
  const record = currentRecord ?? counterpartRecord;
  const recordFrame = currentRecord ? frame : counterpartRecord ? counterpart : null;
  const directionTargets = new Set(input.presentation.directionTargets.map(entityKey));
  const evidenceIndex = currentRecord ? index : counterpartIndex;
  const direction = recordFrame && evidenceIndex ? directionPaths(recordFrame, evidenceIndex, selected, directionTargets)
    : { routes: [], limited: false, reason: 'selected record missing in both frames' };
  const pathLabels = (direction.routes[0]?.entities ?? []).map(key => evidenceIndex.entityByKey.get(key)?.label ?? key);
  const aggregateIds = groupByRelationId.get(selected)?.relationIds ?? Object.freeze([]);
  const omittedIds = scene.omittedRelationIds;
  const omittedEntities = scene.omittedEntityIds;
  const computedCoverage = 'entities ' + frame.entities.length
    + ' · omitted entities ' + omittedEntities.length
    + ' · relations ' + frame.relations.length
    + ' · omitted relations ' + omittedIds.length;
  const transport = mode === 'live'
    ? (latest ? (connected ? 'SSE connected' : 'SSE disconnected') : 'HISTORY snapshot')
    : 'SAMPLE';
  const selectedIdentity = record ? (record.ref.space + '/' + record.ref.kind + '/' + record.ref.id) : selected || 'none';
  const declaredActivity = record?.activity ?? 'unknown';
  const activity = displayedActivity(declaredActivity);
  const activityClaim = liveLatest && currentUnavailable && declaredActivity !== 'none'
    ? 'Activity: UNKNOWN · lastDeclared=' + String(declaredActivity).toUpperCase() + ' · transport=' + transport
    : 'Activity: ' + String(activity).toUpperCase() + ' · declared=' + String(declaredActivity).toUpperCase() + ' · transport=' + transport;
  const directionLines = pathLabels.length === 0
    ? Object.freeze(['Direction: UNCONNECTED / UNKNOWN'])
    : Object.freeze([
      'Direction: ' + pathLabels.slice(0, 4).join(' → '),
      ...(pathLabels.length > 4 ? ['Direction cont.: ' + pathLabels.slice(4).join(' → ')] : []),
    ]);
  const recordLabel = currentRecord
    ? (currentRecord.label || currentRecord.kind || currentRecord.ref.id)
    : 'Selected record missing in this frame' + (recordFrame ? ' · evidence from counterpart ' + recordFrame.id : '');
  const context = record?.context ? contextText(record.context) : 'none';
  const evidenceSide = recordFrame ? (recordFrame === (frame.rev < (counterpart?.rev ?? -1) ? frame : counterpart) ? 'Before' : 'After') : 'UNKNOWN';
  const comparison = selectedDiff({
    frame, counterpart, index, counterpartIndex, containment, counterpartContainment, selected,
  });
  const beforeFrame = comparison.before ? (frame.rev < counterpart?.rev ? frame : counterpart) : null;
  const afterFrame = frame.rev < counterpart?.rev ? counterpart : frame;
  const owners = comparisonsForPair(input, beforeFrame, afterFrame);
  const detailLines = Object.freeze([
    'Frame ' + frame.id + ' · rev ' + frame.rev + ' · asOf ' + frame.asOf,
    'Selected ' + currentKind + ' · ' + selectedIdentity,
    'Record: ' + recordLabel,
    'Context: ' + context,
    'Evidence side: ' + evidenceSide + ' · ' + frameText(recordFrame) + (currentRecord ? ' · current record' : ' · counterpart only; current record missing'),
    ...(record?.from ? ['Endpoints: from=' + entityKey(record.from) + ' · to=' + entityKey(record.to)] : []),
    ...directionLines,
    'Direction basis: ' + (record?.from ? 'selected RelationRef must be the first edge' : 'selected EntityRef') + ' · ' + evidenceSide,
    'Direction status: ' + (direction.routes[0]?.status ?? 'UNCONNECTED / UNKNOWN · ' + direction.reason) + ' · alternatives=' + direction.routes.length + (direction.limited ? ' · LIMIT; additional supplied relations remain in member/omitted recovery' : ''),
    activityClaim,
    'Source state: ' + frame.sourceState,
    'Source: ' + sourceText(record?.source),
    'Source digest: ' + (record?.source?.sourceDigest ?? 'UNKNOWN'),
    'Time: ' + timeText(record?.time),
    'Coverage: ' + frame.coverage.state + ' · ' + frame.coverage.label,
    'Coverage counts: ' + computedCoverage,
    'Flags: ' + flagsText(record?.flags),
    'Before: ' + comparisonSideText(comparison.before),
    'After: ' + comparisonSideText(comparison.after),
    'Diff: ' + comparison.summary,
    'Diff basis: supplied record fields / explicit containment · owner comparison ' + (owners.length ? 'SUPPLIED separately in World comparison' : 'NOT SUPPLIED'),
    ...comparison.changes.map(change => 'Field ' + change.field + ' [' + change.basis + ']: Before='
      + JSON.stringify(stable(change.before)) + ' → After=' + JSON.stringify(stable(change.after))),
    'Full record: ' + full(record ?? null),
  ]);

  const worldLines = worldComparisonLines(input, beforeFrame, afterFrame);
  const routeLines = ['Direction selected: ' + selected + ' · evidence ' + evidenceSide + ' · ' + frameText(recordFrame),
    'Selected context: ' + context, 'Basis: only supplied path=true edges; proposal remains PROPOSAL / not accepted.',
    'Route alternatives: ' + direction.routes.length + (direction.limited ? ' · LIMIT 64 paths / 4096 traversals; all input relations remain inspectable' : ' · complete within supplied acyclic trails'),
    ...(direction.reason ? ['Direction: UNCONNECTED / UNKNOWN · ' + direction.reason] : [])];
  if (record?.from) for (const [side, ref] of [['from', record.from], ['to', record.to]]) {
    routeLines.push('Endpoint ' + side + ': ' + entityKey(ref) + ' · ' + (evidenceIndex?.entityByKey.get(entityKey(ref))?.label ?? 'MISSING / UNKNOWN'));
  }
  for (const [number, route] of direction.routes.entries()) {
    routeLines.push('Route ' + (number + 1) + ': ' + route.status + ' · ' + route.entities.map(key => evidenceIndex.entityByKey.get(key)?.label ?? key).join(' → '),
      'EntityRefs ' + (number + 1) + ': ' + route.entities.join(' → '), 'RelationRefs ' + (number + 1) + ': ' + route.relations.join(' → '));
  }
  for (const key of new Set(direction.routes.flatMap(route => route.relations))) {
    routeLines.push('Route evidence ' + key + ': ' + full(evidenceIndex.relationByKey.get(key)));
  }
  const acceptanceLines = [
    'Text: JSON string fragments; outer quotes and escapes are display notation.',
    'View: Focus / All records recover shortened overview labels.',
    'Comparison: ' + (latest ? 'LATEST FOLLOW' : 'HELD pair; both contents retained') + ' · incoming frames=' + receivedInput.frames.length,
    'Admission: ' + (admission?.status === 'rejected' ? 'REJECTED · last accepted input retained · ' + admission.reason : 'accepted prepared input'),
    'Transport: ' + transport + (mode === 'live' && !connected ? ' · UNKNOWN; no fresh observation' : '')];
  const catalog = [...frame.entities.map(item => ({ key: entityKey(item.ref), label: item.label })),
    ...frame.relations.map(item => ({ key: relationKey(item.ref), label: item.label || item.kind }))];
  const tabs = { record: [...acceptanceLines, ...detailLines], world: [...acceptanceLines, 'Latest received: ' + frameText(receivedInput.frames.at(-1)), ...worldLines], direction: [...acceptanceLines, ...routeLines],
    records: catalog.map(item => item.key + ' · ' + item.label) };
  const tab = Object.hasOwn(tabs, detailTab) ? detailTab : 'record';
  const physical = wrapLines(tabs[tab], panel.width - 32);
  const pageSize = Math.max(1, Math.floor((panel.height - 114) / 24));
  const pageCount = Math.max(1, Math.ceil(physical.length / pageSize));
  const pageIndex = Math.max(0, Math.min(pageCount - 1, detailPage));
  const pageRows = physical.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  return Object.freeze({
    view: Object.freeze({ tab, page: pageIndex, pageCount, pageSize, logicalLines: Object.freeze(tabs[tab]), physicalLines: Object.freeze(physical), rows: Object.freeze(pageRows) }),
    lines: detailLines,
    catalog: Object.freeze(catalog),
    record,
    currentRecord,
    counterpartRecord,
    comparison,
    direction,
    evidenceSide,
    beforeFrame,
    afterFrame,
    owners,
    worldLines,
    aggregateRelationIds: aggregateIds,
  });
};

// The operating HUD: frame/tool controls, the judgement panel and its rows,
// placed in screen space through the camera. It owns no World meaning.
export const projectChrome = ({
  frame,
  selected,
  latest = true,
  scene,
  detail,
  camera = { scale: 1, translateX: 0, translateY: 0 },
  viewport = { width: 1500, height: 1000 },
  panel = worldViewport(viewport).panel,
} = {}) => {
  const representations = [];
  const { tab, page: pageIndex, pageCount, rows: pageRows } = detail.view;
  const { record, catalog, evidenceSide, beforeFrame, aggregateRelationIds: aggregateIds } = detail;
  const screenBounds = ({ x, y, width, height }) => ({
    x: x / camera.scale - camera.translateX, y: y / camera.scale - camera.translateY,
    width: width / camera.scale, height: height / camera.scale,
  });
  const hud = ({ id, label, bounds, activation = null, kind = 'control', atlas = {}, zIndex = 10002 }) => {
    representations.push(Object.freeze({ regionId: id, label, bounds: screenBounds(bounds), kind, depth: 2,
      shape: 'graph-node', isGuide: true, readOnly: true, geometryEditable: false, labelEditable: false,
      zIndex, ...(activation ? { activation: Object.freeze(activation) } : {}),
      visual: Object.freeze({ appearance: Object.freeze({ fillColor: '#ffffff', strokeColor: '#adb5bd', strokeWidth: 1, dashed: false }) }),
      atlas: Object.freeze({ kind, ...atlas }) }));
  };
  const controls = [
    ['before', '◀ Before · [', 'frame-before'], ['after', 'After · ] ▶', 'frame-after'],
    ['latest', 'Latest · L', 'latest'], ['fit', 'Fit · 0', 'fit'], ['focus', 'Focus · F', 'focus'],
    ['select', 'Select · S', 'tool-select'], ['hand', 'Hand · H', 'tool-hand'],
  ];
  const controlWidth = (viewport.width - 16) / controls.length;
  controls.forEach(([id, label, action], position) => hud({ id: 'world:control:' + id, label,
    bounds: { x: 8 + position * controlWidth, y: 8, width: controlWidth - 6, height: 32 },
    activation: { type: 'atlas.world.' + action }, atlas: { control: id } }));
  hud({ id: 'world:judgement', label: '', bounds: panel, kind: 'judgement', zIndex: 10000,
    activation: { type: 'atlas.world.noop' }, atlas: { selected, lines: detail.lines } });
  hud({ id: 'world:judgement-title', label: 'Judgement · ' + tab + ' · ' + (latest ? 'LATEST' : 'HELD') + ' · viewing ' + (frame === beforeFrame ? 'Before' : 'After') + (tab === 'record' ? ' · evidence ' + evidenceSide : '') + ' · page ' + (pageIndex + 1) + '/' + pageCount + ' · JSON strings',
    bounds: { x: panel.x + 8, y: panel.y + 6, width: panel.width - 16, height: 26 }, kind: 'judgement-title' });
  const detailControls = [
    ['record', 'Record', 'tab', 'record'], ['world', 'World comparison', 'tab', 'world'], ['direction', 'Direction', 'tab', 'direction'],
    ['records', 'All records', 'tab', 'records'],
    ['previous', 'Previous page · PgUp', 'detail-previous'], ['next', 'Next page · PgDn', 'detail-next'],
  ];
  detailControls.forEach(([id, label, action, value], position) => hud({ id: 'world:detail:' + id, label,
    bounds: { x: panel.x + 8 + position * (panel.width - 16) / detailControls.length, y: panel.y + 36, width: (panel.width - 16) / detailControls.length - 6, height: 28 },
    activation: { type: 'atlas.world.' + action, value }, kind: 'detail-control' }));
  const memberControls = [
    ['aggregate-cycle', 'Members ' + aggregateIds.length + ' · next', 'next-aggregate'],
    ['omitted-entity-cycle', 'Omitted entities ' + scene.omittedEntityIds.length + ' · next', 'next-omitted-entity'],
    ['omitted-cycle', 'Omitted relations ' + scene.omittedRelationIds.length + ' · next', 'next-omitted'],
    ['endpoint-from', 'Inspect from endpoint', 'endpoint', record?.from ? entityKey(record.from) : null],
    ['endpoint-to', 'Inspect to endpoint', 'endpoint', record?.to ? entityKey(record.to) : null],
  ];
  memberControls.forEach(([id, label, action, value], position) => hud({ id: 'world:' + id, label,
    bounds: { x: panel.x + 8 + position * (panel.width - 16) / 5, y: panel.y + 70, width: (panel.width - 16) / 5 - 6, height: 28 },
    activation: { type: 'atlas.world.' + action, value }, kind: 'member-control' }));
  pageRows.forEach((row, position) => hud({ id: 'world:judgement-line:' + position, label: row.text,
    bounds: { x: panel.x + 16, y: panel.y + 108 + position * 24, width: panel.width - 32, height: 22 },
    kind: 'judgement-line', atlas: { ...row, selected },
    activation: tab === 'records' ? { type: 'atlas.world.select', id: catalog[row.lineIndex].key } : null }));
  return Object.freeze(representations);
};

// Where the focus marker goes. With the HUD, records that are not drawn point
// at the HUD control or judgement line that recovers them. Without it, only
// drawn regions qualify: an omitted entity marks its nearest drawn container
// (else its area); a relation or a record missing from this frame marks none.
const focusRegion = ({ chrome, scene, detail, selected }) => {
  const { index, visibleEntityKeys, containment } = scene;
  if (index.entityByKey.has(selected) && visibleEntityKeys.has(selected)) return regionId(selected);
  if (chrome === 'full') {
    if (index.entityByKey.has(selected) && scene.omittedEntityIds.includes(selected)) return 'world:omitted-entity-cycle';
    if (!detail.currentRecord) return 'world:judgement-line:1';
    if (index.relationByKey.has(selected) && scene.omittedRelationIds.includes(selected)) return 'world:omitted-cycle';
    if (index.relationByKey.has(selected)) return 'world:judgement-line:1';
    return null;
  }
  const entity = index.entityByKey.get(selected);
  if (!entity) return null;
  for (let parent = containment.parentByChild.get(selected); parent; parent = containment.parentByChild.get(parent)) {
    if (visibleEntityKeys.has(parent)) return regionId(parent);
  }
  return scene.areaBounds.has(entity.area) ? areaRegionId(entity.area) : null;
};

// One World projection composed from separate layers: the scene, the chrome
// (`'full'` is the established HUD screen; `'none'` draws no HUD) and the
// timeline strip, which every chrome keeps.
export const projectAtlasWorld = ({
  input,
  receivedInput = input,
  frame,
  counterpart = null,
  selected,
  mode = 'sample',
  connected = false,
  latest = true,
  scale = 1,
  camera = { scale, translateX: 0, translateY: 0 },
  viewport = { width: 1500, height: 1000 },
  detailTab = 'record',
  detailPage = 0,
  admission = null,
  chrome = 'full',
  planOpen = false,
} = {}) => {
  if (!ATLAS_CHROMES.includes(chrome)) throw new Error('atlas-world: unsupported chrome ' + chrome);
  const fullLayout = worldViewport(viewport);
  const layout = chrome === 'full' ? fullLayout : worldViewport(viewport, { panel: false });
  // Size content-fitted boxes for the scale Fit will choose: start at 1 and,
  // while Fit would be smaller, size for slightly less than that scale.
  let textScale = 1;
  let scene = projectWorldScene({ input, frame, mode, connected, latest, admission, textScale });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const fitted = fitCamera(scene.world, layout.graph, 0.94).scale;
    if (fitted >= textScale) break;
    textScale = fitted * 0.97;
    scene = projectWorldScene({ input, frame, mode, connected, latest, admission, textScale });
  }
  // The detail is paged against the full layout's panel in both chromes, so the
  // selected record's text and pages do not depend on what is drawn.
  const detail = projectDetail({ input, receivedInput, frame, counterpart, selected, mode, connected, latest, admission,
    scene, panel: fullLayout.panel, detailTab, detailPage });
  const hud = chrome === 'full'
    ? projectChrome({ frame, selected, latest, scene, detail, camera, viewport, panel: fullLayout.panel })
    : Object.freeze([]);
  // The timeline is its own layer: present in every chrome. Its planned part
  // reads the displayed frame's supplied plans and nothing else.
  const timeline = projectTimeline({ frames: receivedInput.frames, frame, latest, planOpen, strip: layout.timeline, camera });

  return Object.freeze({
    scene: Object.freeze({
      pattern: 'graph/1',
      scale,
      resourceComposition: null,
      representations: Object.freeze([...scene.representations, ...hud, ...timeline]),
      relations: scene.relations,
      selectionProxies: Object.freeze({}),
    }),
    world: scene.world,
    selected: Object.freeze({ key: selected, record: detail.currentRecord ?? null, counterpart: detail.counterpartRecord ?? null, comparison: detail.comparison }),
    selectedRegionId: focusRegion({ chrome, scene, detail, selected }),
    aggregateRelationIds: detail.aggregateRelationIds,
    omittedRelationIds: scene.omittedRelationIds,
    omittedEntityIds: scene.omittedEntityIds,
    areaBounds: scene.areaBounds,
    direction: detail.direction,
    detail: detail.view,
    viewport: layout,
    timeline: timelinePosition(receivedInput.frames, frame.id),
    worldComparison: Object.freeze({ before: detail.beforeFrame, after: detail.afterFrame, owners: detail.owners, lines: detail.worldLines }),
    coverage: Object.freeze({
      omittedRelations: scene.omittedRelationIds.length,
      omittedEntities: scene.omittedEntityIds.length,
      totalRelations: frame.relations.length,
      totalEntities: frame.entities.length,
    }),
  });
};
