// Generic bounded Atlas world input for the a2 presentation.
// This is a display/read-model seam, never a business authority or owner codec.

export const ATLAS_WORLD_KIND = 'ui.atlasWorldInput.v1';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error('atlas-world: ' + message); };
const text = (value, at) => { check(typeof value === 'string' && value.length > 0, at + ' must be non-empty text'); return value; };
const optionalText = (value, at) => {
  check(value === undefined || value === null || typeof value === 'string', at + ' must be text');
  return value ?? '';
};
const integer = (value, at) => { check(Number.isSafeInteger(value) && value >= 0, at + ' must be a non-negative integer'); return value; };
const exactKeys = (value, allowed, at) => {
  check(plain(value), at + ' must be an object');
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) check(allow.has(key), at + ': unknown field ' + key);
};

const jsonValue = (value, at) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    check(Number.isFinite(value), at + ' number must be finite');
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((item, index) => jsonValue(item, at + '[' + index + ']')));
  check(plain(value), at + ' must be JSON');
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item, at + '.' + key)])));
};

export const normalizeWorldRef = (value, at = 'ref') => {
  exactKeys(value, ['space', 'kind', 'id'], at);
  return Object.freeze({
    space: text(value.space, at + '.space'),
    kind: text(value.kind, at + '.kind'),
    id: text(value.id, at + '.id'),
  });
};

const part = value => encodeURIComponent(value);
const qualifiedKey = (prefix, ref) => prefix + ':' + part(ref.space) + ':' + part(ref.kind) + ':' + part(ref.id);
export const entityKey = ref => qualifiedKey('entity', ref);
export const relationKey = ref => qualifiedKey('relation', ref);

const normalizeSource = (value, at) => {
  if (value === null || value === undefined) return null;
  exactKeys(value, ['sourceRef', 'sourceDigest', 'kind'], at);
  return Object.freeze({
    sourceRef: text(value.sourceRef, at + '.sourceRef'),
    sourceDigest: value.sourceDigest === null || value.sourceDigest === undefined ? null : text(value.sourceDigest, at + '.sourceDigest'),
    kind: value.kind === null || value.kind === undefined ? null : text(value.kind, at + '.kind'),
  });
};

const timeValue = (value, at) => {
  if (value === null || value === undefined) return null;
  return text(value, at);
};

const normalizeTime = (value, at) => {
  if (value === null || value === undefined) return Object.freeze({ acquiredAt: null, observedAt: null, effectiveAt: null });
  exactKeys(value, ['acquiredAt', 'observedAt', 'effectiveAt'], at);
  return Object.freeze({
    acquiredAt: timeValue(value.acquiredAt, at + '.acquiredAt'),
    observedAt: timeValue(value.observedAt, at + '.observedAt'),
    effectiveAt: timeValue(value.effectiveAt, at + '.effectiveAt'),
  });
};

const normalizeFlags = (value, at) => {
  if (value === undefined) return Object.freeze([]);
  check(Array.isArray(value), at + ' must be an array');
  const result = value.map((item, index) => text(item, at + '[' + index + ']'));
  check(new Set(result).size === result.length, at + ' must not contain duplicates');
  return Object.freeze(result);
};

const ACTIVITIES = new Set(['now', 'recent', 'unknown', 'none']);
const CONTAINMENTS = new Set(['from-contains-to', 'to-contains-from']);
const normalizeActivity = (value, at) => {
  const activity = value ?? 'none';
  check(ACTIVITIES.has(activity), at + ' must be now|recent|unknown|none');
  return activity;
};

const normalizeContainment = (value, at) => {
  if (value === undefined || value === null) return null;
  check(CONTAINMENTS.has(value), at + ' must be from-contains-to|to-contains-from|null');
  return value;
};

const normalizeEntity = (value, at, areaIds) => {
  exactKeys(value, ['ref', 'label', 'area', 'order', 'visible', 'activity', 'summary', 'source', 'time', 'flags'], at);
  const area = text(value.area, at + '.area');
  check(areaIds.has(area), at + '.area references unknown presentation area ' + area);
  return Object.freeze({
    ref: normalizeWorldRef(value.ref, at + '.ref'),
    label: text(value.label, at + '.label'),
    area,
    order: integer(value.order ?? 0, at + '.order'),
    visible: value.visible !== false,
    activity: normalizeActivity(value.activity, at + '.activity'),
    summary: optionalText(value.summary, at + '.summary'),
    source: normalizeSource(value.source, at + '.source'),
    time: normalizeTime(value.time, at + '.time'),
    flags: normalizeFlags(value.flags, at + '.flags'),
  });
};

const normalizeRelation = (value, at) => {
  exactKeys(value, ['ref', 'from', 'to', 'kind', 'label', 'context', 'source', 'time', 'flags', 'path', 'visible', 'activity', 'containment'], at);
  return Object.freeze({
    ref: normalizeWorldRef(value.ref, at + '.ref'),
    from: normalizeWorldRef(value.from, at + '.from'),
    to: normalizeWorldRef(value.to, at + '.to'),
    kind: text(value.kind, at + '.kind'),
    label: optionalText(value.label, at + '.label'),
    context: value.context === undefined ? Object.freeze({}) : jsonValue(value.context, at + '.context'),
    source: normalizeSource(value.source, at + '.source'),
    time: normalizeTime(value.time, at + '.time'),
    flags: normalizeFlags(value.flags, at + '.flags'),
    path: value.path === true,
    visible: value.visible !== false,
    activity: normalizeActivity(value.activity, at + '.activity'),
    containment: normalizeContainment(value.containment, at + '.containment'),
  });
};

export const containmentEndpoints = relation => {
  if (!relation?.containment) return null;
  return relation.containment === 'from-contains-to'
    ? Object.freeze({ parent: relation.from, child: relation.to })
    : Object.freeze({ parent: relation.to, child: relation.from });
};

const deriveContainmentIndex = (entities, relations, at = 'frame') => {
  const entityByKey = new Map(entities.map(entity => [entityKey(entity.ref), entity]));
  const parentByChild = new Map();
  const evidenceByChild = new Map();
  const childrenByParent = new Map([...entityByKey.keys()].map(key => [key, []]));

  for (const relation of relations) {
    const endpoints = containmentEndpoints(relation);
    if (!endpoints) continue;
    const parent = entityKey(endpoints.parent);
    const child = entityKey(endpoints.child);
    check(entityByKey.has(parent), at + ': containment parent missing ' + parent);
    check(entityByKey.has(child), at + ': containment child missing ' + child);
    check(parent !== child, at + ': containment cannot self-parent ' + child);
    check(entityByKey.get(parent).area === entityByKey.get(child).area,
      at + ': containment must remain inside one presentation area');

    const previous = parentByChild.get(child);
    check(previous === undefined || previous === parent,
      at + ': distinct multi-parent containment unsupported for ' + child);
    parentByChild.set(child, parent);
    if (!evidenceByChild.has(child)) evidenceByChild.set(child, []);
    evidenceByChild.get(child).push(relationKey(relation.ref));
  }

  for (const child of parentByChild.keys()) {
    const seen = new Set();
    let current = child;
    while (parentByChild.has(current)) {
      check(!seen.has(current), at + ': containment cycle at ' + current);
      seen.add(current);
      current = parentByChild.get(current);
    }
  }

  for (const [child, parent] of parentByChild) childrenByParent.get(parent).push(child);
  return Object.freeze({ entityByKey, parentByChild, evidenceByChild, childrenByParent });
};

export const containmentIndex = frame => deriveContainmentIndex(frame.entities, frame.relations, 'frame');

const normalizeCoverage = (value, at) => {
  if (value === undefined || value === null) return Object.freeze({ state: 'unknown', label: 'coverage unknown', observed: 0, unsupported: 0, unknown: 0 });
  exactKeys(value, ['state', 'label', 'observed', 'unsupported', 'unknown'], at);
  check(['complete', 'partial', 'unknown'].includes(value.state), at + '.state must be complete|partial|unknown');
  return Object.freeze({
    state: value.state,
    label: text(value.label, at + '.label'),
    observed: integer(value.observed ?? 0, at + '.observed'),
    unsupported: integer(value.unsupported ?? 0, at + '.unsupported'),
    unknown: integer(value.unknown ?? 0, at + '.unknown'),
  });
};

const normalizeFrame = (value, at, areaIds) => {
  exactKeys(value, ['id', 'rev', 'asOf', 'sourceState', 'coverage', 'entities', 'relations'], at);
  check(Array.isArray(value.entities) && value.entities.length > 0, at + '.entities must be non-empty');
  check(Array.isArray(value.relations), at + '.relations must be an array');
  const entities = value.entities.map((item, index) => normalizeEntity(item, at + '.entities[' + index + ']', areaIds));
  const relations = value.relations.map((item, index) => normalizeRelation(item, at + '.relations[' + index + ']'));
  const entityIds = entities.map(item => entityKey(item.ref));
  const relationIds = relations.map(item => relationKey(item.ref));
  check(new Set(entityIds).size === entityIds.length, at + ': duplicate qualified entity ref');
  check(new Set(relationIds).size === relationIds.length, at + ': duplicate qualified relation ref');
  deriveContainmentIndex(entities, relations, at);
  return Object.freeze({
    id: text(value.id, at + '.id'),
    rev: integer(value.rev, at + '.rev'),
    asOf: text(value.asOf, at + '.asOf'),
    sourceState: text(value.sourceState, at + '.sourceState'),
    coverage: normalizeCoverage(value.coverage, at + '.coverage'),
    entities: Object.freeze(entities),
    relations: Object.freeze(relations),
  });
};

const normalizePresentation = value => {
  exactKeys(value, ['areas', 'purposeAreaId', 'directionTargets', 'defaultSelection'], 'presentation');
  check(Array.isArray(value.areas) && value.areas.length > 0, 'presentation.areas must be non-empty');
  const areas = value.areas.map((area, index) => {
    exactKeys(area, ['id', 'label', 'order'], 'presentation.areas[' + index + ']');
    return Object.freeze({
      id: text(area.id, 'presentation.areas[' + index + '].id'),
      label: text(area.label, 'presentation.areas[' + index + '].label'),
      order: integer(area.order, 'presentation.areas[' + index + '].order'),
    });
  });
  check(new Set(areas.map(area => area.id)).size === areas.length, 'presentation area ids must be unique');
  check(new Set(areas.map(area => area.order)).size === areas.length, 'presentation area order must be unique');
  const areaIds = new Set(areas.map(area => area.id));
  const purposeAreaId = text(value.purposeAreaId, 'presentation.purposeAreaId');
  check(areaIds.has(purposeAreaId), 'presentation.purposeAreaId must reference an area');
  check(Array.isArray(value.directionTargets) && value.directionTargets.length > 0, 'presentation.directionTargets must be non-empty');
  const directionTargets = value.directionTargets.map((item, index) => normalizeWorldRef(item, 'presentation.directionTargets[' + index + ']'));
  check(new Set(directionTargets.map(entityKey)).size === directionTargets.length, 'presentation.directionTargets must be unique');
  return Object.freeze({
    areas: Object.freeze(areas.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))),
    purposeAreaId,
    directionTargets: Object.freeze(directionTargets),
    defaultSelection: normalizeWorldRef(value.defaultSelection, 'presentation.defaultSelection'),
  });
};

export const parseAtlasWorldInput = input => {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  exactKeys(value, ['kind', 'authority', 'presentation', 'frames', 'note'], 'input');
  check(value.kind === ATLAS_WORLD_KIND, 'input.kind must be ' + ATLAS_WORLD_KIND);
  check(value.authority === false, 'input.authority must be false');
  const presentation = normalizePresentation(value.presentation);
  const areaIds = new Set(presentation.areas.map(area => area.id));
  check(Array.isArray(value.frames) && value.frames.length > 0, 'input.frames must be non-empty');
  const frames = value.frames.map((frame, index) => normalizeFrame(frame, 'frames[' + index + ']', areaIds));
  check(new Set(frames.map(frame => frame.id)).size === frames.length, 'frame ids must be unique');
  check(new Set(frames.map(frame => frame.rev)).size === frames.length, 'frame rev values must be unique');
  let previousAsOf = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const asOf = Date.parse(frame.asOf);
    check(Number.isFinite(asOf), 'frames[' + index + '].asOf must be a parseable instant');
    if (index > 0) {
      check(frame.rev > frames[index - 1].rev, 'frames[] rev must be strictly increasing');
      check(asOf >= previousAsOf, 'frames[] asOf must be non-decreasing');
    }
    previousAsOf = asOf;
  }
  const defaultKey = entityKey(presentation.defaultSelection);
  check(frames.some(frame => frame.entities.some(entity => entityKey(entity.ref) === defaultKey)), 'defaultSelection must exist in at least one frame');
  for (const target of presentation.directionTargets) {
    const key = entityKey(target);
    check(frames.some(frame => frame.entities.some(entity => entityKey(entity.ref) === key)), 'directionTarget must exist in at least one frame: ' + key);
  }
  return Object.freeze({
    kind: ATLAS_WORLD_KIND,
    authority: false,
    presentation,
    frames: Object.freeze(frames),
    note: optionalText(value.note, 'input.note'),
  });
};

export const indexWorldFrame = frame => Object.freeze({
  entityByKey: new Map(frame.entities.map(entity => [entityKey(entity.ref), entity])),
  relationByKey: new Map(frame.relations.map(relation => [relationKey(relation.ref), relation])),
});

export const frameAt = (input, index) => {
  check(Number.isSafeInteger(index) && index >= 0 && index < input.frames.length, 'frame index out of range');
  return input.frames[index];
};
