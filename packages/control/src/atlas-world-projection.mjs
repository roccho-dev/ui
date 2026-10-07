// Generic a2 world -> semantic scene projection.
// Owner contracts supply qualified entities/relations and explicit presentation areas;
// this file never derives business meaning from labels or position.

import { entityKey, indexWorldFrame, relationKey } from './atlas-world.mjs';

const AREA_WIDTH = 320;
const AREA_GAP = 40;
const AREA_TOP = 56;
const AREA_PAD = 22;
const ENTITY_WIDTH = 276;
const ENTITY_HEIGHT = 52;
const ENTITY_GAP = 12;
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
  const fields = ['label', 'activity', 'summary', 'kind', 'from', 'to', 'context', 'source', 'time', 'flags'];
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

const selectedDiff = ({ frame, counterpart, index, counterpartIndex, selected }) => {
  const current = recordFor(index, selected);
  const other = counterpartIndex ? recordFor(counterpartIndex, selected) : null;
  if (!current && !other) return 'not present in either compared frame';
  if (!current && other) return 'missing in ' + frame.id + ' · counterpart exists in ' + counterpart.id;
  if (current && !other) return counterpart ? 'present in ' + frame.id + ' · counterpart missing in ' + counterpart.id : 'no comparison frame';
  const changed = changedFields(current, other);
  return changed.length ? 'changed ' + changed.join(', ') : 'no selected meaning change';
};

export const projectAtlasWorld = ({
  input,
  frame,
  counterpart = null,
  selected,
  mode = 'sample',
  connected = false,
  scale = 1,
} = {}) => {
  const index = indexWorldFrame(frame);
  const counterpartIndex = counterpart ? indexWorldFrame(counterpart) : null;
  const areas = input.presentation.areas;
  const areaEntities = new Map(areas.map(area => [area.id, []]));
  for (const entity of frame.entities) areaEntities.get(entity.area)?.push(entity);
  for (const rows of areaEntities.values()) rows.sort((a, b) => a.order - b.order || entityKey(a.ref).localeCompare(entityKey(b.ref)));

  const representations = [];
  const visibleEntityKeys = new Set();
  const omittedEntityIds = [];
  const areaBounds = new Map();
  let worldHeight = 0;
  areas.forEach((area, areaIndex) => {
    const rows = areaEntities.get(area.id) ?? [];
    const eligible = rows.filter(entity => entity.visible);
    const shown = eligible.slice(0, MAX_ENTITIES_PER_AREA);
    for (const entity of rows.filter(item => !item.visible)) omittedEntityIds.push(entityKey(entity.ref));
    for (const entity of eligible.slice(MAX_ENTITIES_PER_AREA)) omittedEntityIds.push(entityKey(entity.ref));
    const height = AREA_PAD * 2 + 34 + shown.length * (ENTITY_HEIGHT + ENTITY_GAP);
    const x = AREA_PAD + areaIndex * (AREA_WIDTH + AREA_GAP);
    const bounds = { x, y: AREA_TOP, width: AREA_WIDTH, height: Math.max(160, height) };
    areaBounds.set(area.id, bounds);
    worldHeight = Math.max(worldHeight, bounds.y + bounds.height);
    representations.push(Object.freeze({
      regionId: areaRegionId(area.id),
      label: area.label + (rows.length > shown.length ? ' · +' + (rows.length - shown.length) + ' omitted' : ''),
      bounds,
      kind: 'area',
      depth: 0,
      shape: 'boundary',
      mode: 'boundary',
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      atlas: Object.freeze({ kind: 'area', areaId: area.id, count: rows.length, omitted: rows.length - shown.length }),
    }));
    shown.forEach((entity, indexInArea) => {
      const key = entityKey(entity.ref);
      visibleEntityKeys.add(key);
      const glyph = token[entity.activity];
      representations.push(Object.freeze({
        regionId: regionId(key),
        sourceRegionId: regionId(key),
        label: (glyph ? glyph + ' · ' : '') + entity.label,
        bounds: {
          x: x + AREA_PAD,
          y: AREA_TOP + 42 + AREA_PAD + indexInArea * (ENTITY_HEIGHT + ENTITY_GAP),
          width: ENTITY_WIDTH,
          height: ENTITY_HEIGHT,
        },
        kind: entity.ref.kind,
        depth: 1,
        shape: 'graph-node',
        readOnly: true,
        geometryEditable: false,
        labelEditable: false,
        activation: Object.freeze({ type: 'atlas.world.select', id: key }),
        visual: Object.freeze({ appearance: appearance[entity.activity] }),
        atlas: Object.freeze({ kind: 'entity', ref: entity.ref, area: entity.area, activity: entity.activity }),
      }));
    });
  });

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
  const transport = mode === 'live' ? (connected ? 'SSE connected' : 'SSE disconnected') : 'SAMPLE';
  const selectedIdentity = record ? (record.ref.space + '/' + record.ref.kind + '/' + record.ref.id) : selected || 'none';
  const activity = record?.activity ?? 'unknown';
  const detailLines = Object.freeze([
    'Frame ' + frame.id + ' · rev ' + frame.rev + ' · asOf ' + frame.asOf,
    'Selected ' + currentKind + ' · ' + selectedIdentity,
    currentRecord ? ((currentRecord.label || currentRecord.kind || currentRecord.ref.id) + (currentRecord.context ? ' · context ' + contextText(currentRecord.context) : '')) : 'Selected record missing in this frame',
    'Direction: ' + (pathLabels.length ? pathLabels.join(' → ') : 'UNCONNECTED / UNKNOWN'),
    'Activity: ' + String(activity).toUpperCase() + ' · transport=' + transport + ' · sourceState=' + frame.sourceState,
    'Source: ' + sourceText(record?.source),
    'Time: ' + timeText(record?.time),
    'Coverage: ' + frame.coverage.state + ' · ' + frame.coverage.label + ' · ' + computedCoverage,
    'Flags: ' + flagsText(record?.flags),
    'Diff: ' + selectedDiff({ frame, counterpart, index, counterpartIndex, selected }),
  ]);

  const detailY = worldHeight + DETAIL_GAP;
  const totalWidth = AREA_PAD * 2 + areas.length * AREA_WIDTH + Math.max(0, areas.length - 1) * AREA_GAP;
  const controlSpecs = Object.freeze([
    Object.freeze({ id: 'before', label: '◀ Before', type: 'atlas.world.frame-before' }),
    Object.freeze({ id: 'after', label: 'After ▶', type: 'atlas.world.frame-after' }),
    Object.freeze({ id: 'fit', label: 'Fit', type: 'atlas.world.fit' }),
    Object.freeze({ id: 'focus', label: 'Focus selected', type: 'atlas.world.focus' }),
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
    selected: Object.freeze({ key: selected, record: currentRecord ?? null, counterpart: counterpartRecord ?? null }),
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
