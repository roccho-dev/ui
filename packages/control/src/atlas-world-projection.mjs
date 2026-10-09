// Generic a2 world -> semantic scene projection.
// Owner contracts supply qualified entities/relations and explicit presentation areas;
// this file never derives business meaning from labels or position.

import { createGraphLayout } from '../../semantic-map/layout/graph.js';
import { ATLAS_COMPARISON_AXES, ATLAS_COMPARISON_GAPS, comparisonsForPair, containmentIndex, entityKey, indexWorldFrame, relationKey } from './atlas-world.mjs';

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

export const worldViewport = ({ width = 1500, height = 1000 } = {}) => {
  // Keep the representative nested Before world readable at 1200x900. The
  // detail panel uses paging rather than shrinking node names to status glyphs.
  const panelHeight = Math.min(400, Math.max(280, Math.floor(height * 0.3)));
  return Object.freeze({ graph: Object.freeze({ x: 16, y: 52, width: Math.max(1, width - 32), height: Math.max(1, height - panelHeight - 68) }),
    panel: Object.freeze({ x: 8, y: height - panelHeight, width: Math.max(1, width - 16), height: panelHeight - 8 }) });
};

const regionId = key => 'world:' + key;
const areaRegionId = id => 'area:' + encodeURIComponent(id);

const orderedKeys = (keys, entityByKey) => [...keys].sort((left, right) => {
  const a = entityByKey.get(left), b = entityByKey.get(right);
  return (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right);
});

const markSubtreeOmitted = (key, childrenByParent, omitted) => {
  if (omitted.has(key)) return;
  omitted.add(key);
  for (const child of childrenByParent.get(key) ?? []) markSubtreeOmitted(child, childrenByParent, omitted);
};

const nestedAreaLayout = ({ area, rows, containment }) => {
  const entityByKey = new Map(rows.map(entity => [entityKey(entity.ref), entity]));
  const childrenByParent = new Map([...entityByKey.keys()].map(key => [key, []]));
  const roots = [];
  for (const key of entityByKey.keys()) {
    const parent = containment.parentByChild.get(key);
    if (parent && entityByKey.has(parent)) childrenByParent.get(parent).push(key);
    else roots.push(key);
  }
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
  for (const root of orderedKeys(roots, entityByKey)) visit(root);

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
      label: entity.label,
      kind: 'node',
      order: entity.order,
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
} = {}) => {
  const index = indexWorldFrame(frame);
  const counterpartIndex = counterpart ? indexWorldFrame(counterpart) : null;
  const liveLatest = mode === 'live' && latest;
  const currentUnavailable = !connected || admission?.status === 'rejected';
  const displayedActivity = declared => (
    liveLatest && currentUnavailable && declared !== 'none' ? 'unknown' : declared
  );
  const containment = containmentIndex(frame);
  const counterpartContainment = counterpart ? containmentIndex(counterpart) : null;
  const areas = input.presentation.areas;
  const areaEntities = new Map(areas.map(area => [area.id, []]));
  for (const entity of frame.entities) areaEntities.get(entity.area)?.push(entity);

  const representations = [];
  const visibleEntityKeys = new Set();
  const omittedEntityIds = [];
  const areaBounds = new Map();
  let worldHeight = 0;
  let contentRight = AREA_PAD;

  for (const area of areas) {
    const rows = areaEntities.get(area.id) ?? [];
    const nested = nestedAreaLayout({ area, rows, containment });
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
      const activity = displayedActivity(entity.activity);
      const glyph = token[activity];
      visibleEntityKeys.add(key);
      representations.push(Object.freeze({
        regionId: regionId(key),
        sourceRegionId: regionId(key),
        label: (glyph ? glyph + ' · ' : '') + entity.label,
        bounds: entityBounds,
        kind: entity.ref.kind,
        depth: containmentDepth(key, containment.parentByChild),
        zIndex: containmentDepth(key, containment.parentByChild) * 10,
        shape: hasChildren ? 'boundary' : 'graph-node',
        readOnly: true,
        geometryEditable: false,
        labelEditable: false,
        activation: Object.freeze({ type: 'atlas.world.select', id: key }),
        visual: Object.freeze({ appearance: appearance[activity] }),
        atlas: Object.freeze({
          kind: 'entity',
          ref: entity.ref,
          area: entity.area,
          activity,
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
  const omittedIds = Object.freeze([...new Set(grouped.omitted)].sort());
  const omittedEntities = Object.freeze([...new Set(omittedEntityIds)].sort());
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
  const layout = worldViewport(viewport);
  const panel = layout.panel;
  const physical = wrapLines(tabs[tab], panel.width - 32);
  const pageSize = Math.max(1, Math.floor((panel.height - 114) / 24));
  const pageCount = Math.max(1, Math.ceil(physical.length / pageSize));
  const pageIndex = Math.max(0, Math.min(pageCount - 1, detailPage));
  const pageRows = physical.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
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
    activation: { type: 'atlas.world.noop' }, atlas: { selected, lines: detailLines } });
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
    ['omitted-entity-cycle', 'Omitted entities ' + omittedEntities.length + ' · next', 'next-omitted-entity'],
    ['omitted-cycle', 'Omitted relations ' + omittedIds.length + ' · next', 'next-omitted'],
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
  const totalWidth = Math.max(640, contentRight - AREA_GAP + AREA_PAD);
  const world = Object.freeze({ x: 0, y: 44, width: totalWidth, height: worldHeight - 44 + AREA_PAD });
  let selectedRegionId = null;
  if (index.entityByKey.has(selected) && visibleEntityKeys.has(selected)) selectedRegionId = regionId(selected);
  else if (index.entityByKey.has(selected) && omittedEntities.includes(selected)) selectedRegionId = 'world:omitted-entity-cycle';
  else if (!currentRecord) selectedRegionId = 'world:judgement-line:1';
  else if (index.relationByKey.has(selected) && grouped.omitted.includes(selected)) selectedRegionId = 'world:omitted-cycle';
  else if (index.relationByKey.has(selected)) selectedRegionId = 'world:judgement-line:1';

  return Object.freeze({
    scene: Object.freeze({
      pattern: 'graph/1',
      scale,
      resourceComposition: null,
      representations: Object.freeze(representations),
      relations: Object.freeze(relations),
      selectionProxies: Object.freeze({}),
    }),
    world,
    selected: Object.freeze({ key: selected, record: currentRecord ?? null, counterpart: counterpartRecord ?? null, comparison }),
    selectedRegionId,
    aggregateRelationIds: aggregateIds,
    omittedRelationIds: omittedIds,
    omittedEntityIds: omittedEntities,
    areaBounds,
    direction,
    detail: Object.freeze({ tab, page: pageIndex, pageCount, pageSize, logicalLines: Object.freeze(tabs[tab]), physicalLines: Object.freeze(physical), rows: Object.freeze(pageRows) }),
    viewport: layout,
    worldComparison: Object.freeze({ before: beforeFrame, after: afterFrame, owners, lines: worldLines }),
    coverage: Object.freeze({
      omittedRelations: omittedIds.length,
      omittedEntities: omittedEntities.length,
      totalRelations: frame.relations.length,
      totalEntities: frame.entities.length,
    }),
  });
};
