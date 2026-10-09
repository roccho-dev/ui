// Generic a2 world -> semantic scene projection.
// Owner contracts supply qualified entities/relations and explicit presentation areas;
// this file never derives business meaning from labels or position.

import { createGraphLayout } from '../../semantic-map/layout/graph.js';
import { containmentIndex, entityKey, indexWorldFrame, relationKey } from './atlas-world.mjs';

const AREA_GAP = 40;
const AREA_TOP = 56;
const AREA_PAD = 22;
const DETAIL_GAP = 34;
const DETAIL_LINE_HEIGHT = 44;
const DETAIL_LINE_GAP = 6;
const DETAIL_PANEL_PAD = 14;
const CONTROL_HEIGHT = 32;
const CONTROL_GAP = 10;
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
const short = (value, limit = 86) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
};
const sourceText = source => source ? source.sourceRef + (source.kind ? ' [' + source.kind + ']' : '') : 'source unknown';
const timeText = time => [
  'observed=' + (time?.observedAt ?? 'unknown'),
  'acquired=' + (time?.acquiredAt ?? 'unknown'),
  'effective=' + (time?.effectiveAt ?? 'unknown'),
].join(' · ');
const flagsText = flags => flags?.length ? flags.join(',') : 'none';
const contextText = context => Object.keys(context ?? {}).length ? Object.entries(context).map(([key, value]) => key + '=' + short(value, 32)).join(' · ') : 'none';

const recordFor = (index, selected) => index.entityByKey.get(selected) ?? index.relationByKey.get(selected) ?? null;
const recordKind = (index, selected) => index.entityByKey.has(selected) ? 'entity' : index.relationByKey.has(selected) ? 'relation' : 'missing';

const changedFields = (current, other) => {
  if (!current || !other) return [];
  const fields = [...new Set([...Object.keys(current), ...Object.keys(other)])].sort();
  return fields.filter(field => !same(current[field], other[field]));
};

const directionPath = (frame, index, selected, directionTargets) => {
  let start = index.entityByKey.has(selected) ? selected : null;
  const selectedRelation = index.relationByKey.get(selected);
  if (!start && selectedRelation) start = entityKey(selectedRelation.from);
  if (!start || !index.entityByKey.has(start)) return [];
  if (directionTargets.has(start)) return [start];
  const outgoing = new Map();
  for (const relation of frame.relations) {
    if (!relation.path) continue;
    const from = entityKey(relation.from), to = entityKey(relation.to);
    if (!index.entityByKey.has(from) || !index.entityByKey.has(to)) continue;
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
  }
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const trail = queue.shift();
    const last = trail.at(-1);
    for (const next of outgoing.get(last) ?? []) {
      if (visited.has(next)) continue;
      const candidate = [...trail, next];
      if (directionTargets.has(next)) return candidate;
      visited.add(next);
      queue.push(candidate);
    }
  }
  return [];
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
  x: bounds.x + dx,
  y: bounds.y + dy,
  width: bounds.width,
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
  frame,
  counterpart = null,
  selected,
  mode = 'sample',
  connected = false,
  latest = true,
  scale = 1,
} = {}) => {
  const index = indexWorldFrame(frame);
  const counterpartIndex = counterpart ? indexWorldFrame(counterpart) : null;
  const liveLatest = mode === 'live' && latest;
  const displayedActivity = declared => (
    liveLatest && !connected && declared !== 'none' ? 'unknown' : declared
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
    const dx = contentRight - rootBounds.x;
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
  const recordFrame = currentRecord ? frame : counterpart;
  const directionTargets = new Set(input.presentation.directionTargets.map(entityKey));
  const pathKeys = currentRecord ? directionPath(frame, index, selected, directionTargets)
    : counterpartRecord && counterpart ? directionPath(counterpart, counterpartIndex, selected, directionTargets) : [];
  const pathLabels = pathKeys.map(key => (currentRecord ? index : counterpartIndex).entityByKey.get(key)?.label ?? key);
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
  const activityClaim = liveLatest && !connected && declaredActivity !== 'none'
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
  const context = currentRecord?.context ? contextText(currentRecord.context) : 'none';
  const comparison = selectedDiff({
    frame, counterpart, index, counterpartIndex, containment, counterpartContainment, selected,
  });
  const detailLines = Object.freeze([
    'Frame ' + frame.id + ' · rev ' + frame.rev + ' · asOf ' + frame.asOf,
    'Selected ' + currentKind + ' · ' + selectedIdentity,
    'Record: ' + recordLabel,
    'Context: ' + context,
    ...directionLines,
    activityClaim,
    'Source state: ' + frame.sourceState,
    'Source: ' + sourceText(record?.source),
    'Time: ' + timeText(record?.time),
    'Coverage: ' + frame.coverage.state + ' · ' + frame.coverage.label,
    'Coverage counts: ' + computedCoverage,
    'Flags: ' + flagsText(record?.flags),
    'Before: ' + comparisonSideText(comparison.before),
    'After: ' + comparisonSideText(comparison.after),
    'Diff: ' + comparison.summary,
    'Diff basis: supplied record fields / explicit containment · owner comparison NOT SUPPLIED',
    ...comparison.changes.map(change => 'Field ' + change.field + ' [' + change.basis + ']: Before='
      + JSON.stringify(stable(change.before)) + ' → After=' + JSON.stringify(stable(change.after))),
  ]);

  const detailY = worldHeight + DETAIL_GAP;
  const totalWidth = Math.max(640, contentRight - AREA_GAP + AREA_PAD);
  const controlSpecs = Object.freeze([
    Object.freeze({ id: 'before', label: '◀ Before · [', type: 'atlas.world.frame-before' }),
    Object.freeze({ id: 'after', label: 'After · ] ▶', type: 'atlas.world.frame-after' }),
    Object.freeze({ id: 'fit', label: 'Fit · 0', type: 'atlas.world.fit' }),
    Object.freeze({ id: 'focus', label: 'Focus · F', type: 'atlas.world.focus' }),
    Object.freeze({ id: 'select', label: 'Select · S', type: 'atlas.world.tool-select' }),
    Object.freeze({ id: 'hand', label: 'Hand · H', type: 'atlas.world.tool-hand' }),
  ]);
  const controlWidth = (totalWidth - AREA_PAD * 2 - CONTROL_GAP * (controlSpecs.length - 1)) / controlSpecs.length;
  controlSpecs.forEach((control, index) => {
    representations.push(Object.freeze({
      regionId: 'world:control:' + control.id,
      label: control.label,
      bounds: { x: AREA_PAD + index * (controlWidth + CONTROL_GAP), y: 10, width: controlWidth, height: CONTROL_HEIGHT },
      kind: 'control',
      depth: 5,
      shape: 'graph-node',
      isGuide: true,
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      activation: Object.freeze({ type: control.type }),
      visual: Object.freeze({ appearance: Object.freeze({ fillColor: '#f8f9fa', strokeColor: '#495057', strokeWidth: 1.2, dashed: false }) }),
      atlas: Object.freeze({ kind: 'control', control: control.id }),
    }));
  });

  const detailHeight = DETAIL_PANEL_PAD * 2 + 28 + detailLines.length * (DETAIL_LINE_HEIGHT + DETAIL_LINE_GAP);
  representations.push(Object.freeze({
    regionId: 'world:judgement',
    label: 'Judgement',
    bounds: { x: AREA_PAD, y: detailY, width: totalWidth - AREA_PAD * 2, height: detailHeight },
    kind: 'judgement-panel',
    depth: 2,
    shape: 'boundary',
    mode: 'boundary',
    readOnly: true,
    geometryEditable: false,
    labelEditable: false,
    atlas: Object.freeze({ kind: 'judgement', selected, lines: detailLines }),
  }));
  detailLines.forEach((line, lineIndex) => {
    representations.push(Object.freeze({
      regionId: 'world:judgement-line:' + lineIndex,
      label: line,
      bounds: {
        x: AREA_PAD + DETAIL_PANEL_PAD,
        y: detailY + DETAIL_PANEL_PAD + 26 + lineIndex * (DETAIL_LINE_HEIGHT + DETAIL_LINE_GAP),
        width: totalWidth - AREA_PAD * 2 - DETAIL_PANEL_PAD * 2,
        height: DETAIL_LINE_HEIGHT,
      },
      kind: 'judgement-line',
      depth: 3,
      shape: 'graph-node',
      isGuide: true,
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      visual: Object.freeze({ appearance: Object.freeze({ fillColor: '#ffffff', strokeColor: '#adb5bd', strokeWidth: 1, dashed: false }) }),
      atlas: Object.freeze({ kind: 'judgement-line', lineIndex, text: line, selected }),
    }));
  });

  const controlY = detailY + detailHeight + 12;
  let leftControlRows = 0;
  if (aggregateIds.length > 1) {
    representations.push(Object.freeze({
      regionId: 'world:aggregate-cycle',
      label: 'Aggregate members ' + aggregateIds.length + ' · click to inspect next\n' + aggregateIds.map(id => short(id, 52)).join('\n'),
      bounds: { x: AREA_PAD + 18, y: controlY + leftControlRows++ * 96, width: Math.min(500, totalWidth / 2 - 30), height: 84 },
      kind: 'aggregate-members',
      depth: 3,
      shape: 'graph-node',
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      activation: Object.freeze({ type: 'atlas.world.next-aggregate' }),
      atlas: Object.freeze({ kind: 'aggregate-members', relationIds: aggregateIds }),
    }));
  }

  if (omittedEntities.length > 0) {
    representations.push(Object.freeze({
      regionId: 'world:omitted-entity-cycle',
      label: 'Omitted entities ' + omittedEntities.length + ' · click to inspect next\n' + omittedEntities.slice(0, 3).map(id => short(id, 52)).join('\n'),
      bounds: { x: AREA_PAD + 18, y: controlY + leftControlRows++ * 96, width: Math.min(500, totalWidth / 2 - 30), height: 84 },
      kind: 'omitted-entities',
      depth: 3,
      shape: 'graph-node',
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      activation: Object.freeze({ type: 'atlas.world.next-omitted-entity' }),
      atlas: Object.freeze({ kind: 'omitted-entities', entityIds: omittedEntities }),
    }));
  }

  if (omittedIds.length > 0) {
    representations.push(Object.freeze({
      regionId: 'world:omitted-cycle',
      label: 'Omitted relations ' + omittedIds.length + ' · click to inspect next\n' + omittedIds.slice(0, 3).map(id => short(id, 52)).join('\n'),
      bounds: { x: AREA_PAD + totalWidth / 2, y: controlY, width: Math.min(500, totalWidth / 2 - 40), height: 84 },
      kind: 'omitted-relations',
      depth: 3,
      shape: 'graph-node',
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      activation: Object.freeze({ type: 'atlas.world.next-omitted' }),
      atlas: Object.freeze({ kind: 'omitted-relations', relationIds: omittedIds }),
    }));
  }

  const controlRows = Math.max(leftControlRows, omittedIds.length > 0 ? 1 : 0);
  const bottom = detailY + detailHeight + (controlRows > 0 ? controlRows * 96 + 16 : 16);
  const world = Object.freeze({ x: 0, y: 0, width: totalWidth, height: bottom });
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
    coverage: Object.freeze({
      omittedRelations: omittedIds.length,
      omittedEntities: omittedEntities.length,
      totalRelations: frame.relations.length,
      totalEntities: frame.entities.length,
    }),
  });
};
