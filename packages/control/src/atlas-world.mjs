// Generic bounded Atlas world input for the a2 presentation.
// This is a display/read-model seam, never a business authority or owner codec.

import { checkJournalDeltas, gapView, hasGapView, normalizeAdequacy, normalizeGap, normalizeHeld, normalizeJournal, normalizePhase, normalizePRecords, normalizeUpkeep } from './atlas-gap.mjs';

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

// Plans in force at a frame. Absent or null: no plan declared (UNKNOWN); []:
// declared, none in force. A plan is never a fact: nothing here feeds Gap,
// Current, coverage or status. `nodes`/`edges` null means the content is
// unknown, which is not the same as empty.
const textList = (value, at) => {
  check(Array.isArray(value), at + ' must be an array');
  return Object.freeze(value.map((item, index) => text(item, at + '[' + index + ']')));
};
const normalizePlanSource = (value, at) => {
  exactKeys(value, ['repo', 'commentId', 'updatedAt', 'sha256'], at);
  const id = value.commentId;
  check(id === null || id === undefined || (typeof id === 'string' && id.length > 0) || (Number.isSafeInteger(id) && id >= 0), at + '.commentId must be text, an integer or null');
  return Object.freeze({
    repo: text(value.repo, at + '.repo'),
    commentId: id ?? null,
    updatedAt: timeValue(value.updatedAt, at + '.updatedAt'),
    sha256: value.sha256 === null || value.sha256 === undefined ? null : text(value.sha256, at + '.sha256'),
  });
};
const normalizePlan = (value, at) => {
  exactKeys(value, ['ref', 'plan', 'version', 'label', 'serves', 'nodes', 'edges', 'unknown', 'source'], at);
  const nodes = value.nodes === null || value.nodes === undefined ? null : (check(Array.isArray(value.nodes), at + '.nodes must be an array or null'),
    Object.freeze(value.nodes.map((item, index) => {
      exactKeys(item, ['id', 'label'], at + '.nodes[' + index + ']');
      return Object.freeze({ id: text(item.id, at + '.nodes[' + index + '].id'), label: optionalText(item.label, at + '.nodes[' + index + '].label') });
    })));
  const edges = value.edges === null || value.edges === undefined ? null : (check(Array.isArray(value.edges), at + '.edges must be an array or null'),
    Object.freeze(value.edges.map((item, index) => {
      exactKeys(item, ['from', 'to', 'kind'], at + '.edges[' + index + ']');
      return Object.freeze({ from: text(item.from, at + '.edges[' + index + '].from'), to: text(item.to, at + '.edges[' + index + '].to'),
        kind: optionalText(item.kind, at + '.edges[' + index + '].kind') });
    })));
  return Object.freeze({
    ref: text(value.ref, at + '.ref'),
    plan: text(value.plan, at + '.plan'),
    version: integer(value.version, at + '.version'),
    label: text(value.label, at + '.label'),
    serves: textList(value.serves ?? [], at + '.serves'),
    nodes,
    edges,
    unknown: textList(value.unknown ?? [], at + '.unknown'),
    source: normalizePlanSource(value.source, at + '.source'),
  });
};
const normalizePlans = (value, at) => {
  if (value === null) return null;
  check(Array.isArray(value), at + ' must be an array or null');
  const plans = value.map((item, index) => normalizePlan(item, at + '[' + index + ']'));
  check(new Set(plans.map(item => item.plan)).size === plans.length, at + ': duplicate plan id');
  return Object.freeze(plans);
};

const normalizeFrame = (value, at, areaIds) => {
  exactKeys(value, ['id', 'rev', 'asOf', 'sourceState', 'coverage', 'entities', 'relations', 'plans', 'gap', 'phase', 'journal', 'matched_until',
    'adequacy', 'held', 'upkeep', 'p_records'], at);
  check(Array.isArray(value.entities) && value.entities.length > 0, at + '.entities must be non-empty');
  check(Array.isArray(value.relations), at + '.relations must be an array');
  const entities = value.entities.map((item, index) => normalizeEntity(item, at + '.entities[' + index + ']', areaIds));
  const relations = value.relations.map((item, index) => normalizeRelation(item, at + '.relations[' + index + ']'));
  const entityIds = entities.map(item => entityKey(item.ref));
  const relationIds = relations.map(item => relationKey(item.ref));
  check(new Set(entityIds).size === entityIds.length, at + ': duplicate qualified entity ref');
  check(new Set(relationIds).size === relationIds.length, at + ': duplicate qualified relation ref');
  deriveContainmentIndex(entities, relations, at);
  const gap = value.gap === undefined ? undefined : normalizeGap(value.gap, at + '.gap');
  return Object.freeze({
    id: text(value.id, at + '.id'),
    rev: integer(value.rev, at + '.rev'),
    asOf: text(value.asOf, at + '.asOf'),
    sourceState: text(value.sourceState, at + '.sourceState'),
    coverage: normalizeCoverage(value.coverage, at + '.coverage'),
    entities: Object.freeze(entities),
    relations: Object.freeze(relations),
    // Kept only when supplied, so a frame without plans normalizes as before.
    ...(value.plans === undefined ? {} : { plans: normalizePlans(value.plans, at + '.plans') }),
    ...(gap === undefined ? {} : { gap }),
    ...(value.phase === undefined ? {} : { phase: normalizePhase(value.phase, at + '.phase') }),
    ...(value.journal === undefined ? {} : { journal: normalizeJournal(value.journal, at + '.journal') }),
    ...(value.matched_until === undefined ? {} : { matched_until: value.matched_until === null ? null : timeValue(value.matched_until, at + '.matched_until') }),
    // Contract v12, kept only when supplied: a World without them draws as before.
    ...(value.adequacy === undefined ? {} : { adequacy: normalizeAdequacy(value.adequacy, at + '.adequacy', gap ?? null) }),
    ...(value.held === undefined ? {} : { held: normalizeHeld(value.held, at + '.held') }),
    ...(value.upkeep === undefined ? {} : { upkeep: normalizeUpkeep(value.upkeep, at + '.upkeep') }),
    // P's records that entered at the frame (adrs#647 c6346827237), kept only when supplied.
    ...(value.p_records === undefined ? {} : { p_records: normalizePRecords(value.p_records, at + '.p_records') }),
  });
};

// A frame that carries a gap is drawn from it (atlas-gap.mjs); its other
// areas keep their supplied entities. Deriving again from a derived frame
// gives the same frame.
const withGapView = (frame, earlier, presentation, all) => {
  if (!hasGapView(frame)) return frame;
  // `all`: every frame, so a P record replaced later is not drawn with its text here (adrs#647 R c6349841686).
  const view = gapView({ frame, earlier, presentation, key: entityKey, all });
  const entityIds = view.entities.map(item => entityKey(item.ref));
  check(new Set(entityIds).size === entityIds.length, frame.id + ': gap view entity collides with a supplied entity');
  deriveContainmentIndex(view.entities, view.relations, frame.id);
  return Object.freeze({ ...frame, entities: view.entities, relations: view.relations });
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

export const ATLAS_COMPARISON_AXES = Object.freeze(['N', 'M', 'R', 'E', 'S', 'T']);
export const ATLAS_COMPARISON_GAPS = Object.freeze(['business', 'frame', 'observation']);

// Display receipts supplied with the prepared input. Status, meaning and basis
// belong to ownerRef; neither record fields nor layout populate these receipts.
const normalizeComparisonEndpoint = (value, at) => {
  if (value === null) return null;
  exactKeys(value, ['frameId', 'rev', 'asOf'], at);
  return Object.freeze({ frameId: text(value.frameId, at + '.frameId'),
    rev: integer(value.rev, at + '.rev'), asOf: text(value.asOf, at + '.asOf') });
};

const normalizeComparisonClaim = (value, at) => {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['status', 'summary', 'basis', 'refs', 'reason', 'source', 'time', 'flags'], at);
  check(['changed', 'unchanged', 'unknown'].includes(value.status), at + '.status must be changed|unchanged|unknown');
  check(value.refs === undefined || Array.isArray(value.refs), at + '.refs must be an array');
  const refs = (value.refs ?? []).map((item, index) => {
    const refAt = at + '.refs[' + index + ']';
    exactKeys(item, ['type', 'ref'], refAt);
    check(['entity', 'relation'].includes(item.type), refAt + '.type must be entity|relation');
    return Object.freeze({ type: item.type, ref: normalizeWorldRef(item.ref, refAt + '.ref') });
  });
  return Object.freeze({ status: value.status, summary: optionalText(value.summary, at + '.summary'),
    basis: jsonValue(value.basis ?? null, at + '.basis'), refs: Object.freeze(refs),
    reason: timeValue(value.reason, at + '.reason'), source: normalizeSource(value.source, at + '.source'),
    time: normalizeTime(value.time, at + '.time'), flags: normalizeFlags(value.flags, at + '.flags') });
};

const normalizeComparisons = value => {
  if (value === undefined) return Object.freeze([]);
  check(Array.isArray(value), 'comparisons must be an array');
  const comparisons = value.map((item, index) => {
    const at = 'comparisons[' + index + ']';
    exactKeys(item, ['id', 'ownerRef', 'before', 'after', 'axes', 'gaps', 'source', 'time', 'flags'], at);
    exactKeys(item.axes ?? {}, ATLAS_COMPARISON_AXES, at + '.axes');
    exactKeys(item.gaps ?? {}, ATLAS_COMPARISON_GAPS, at + '.gaps');
    return Object.freeze({ id: text(item.id, at + '.id'), ownerRef: text(item.ownerRef, at + '.ownerRef'),
      before: normalizeComparisonEndpoint(item.before, at + '.before'),
      after: normalizeComparisonEndpoint(item.after, at + '.after'),
      axes: Object.freeze(Object.fromEntries(ATLAS_COMPARISON_AXES.map(key => [key,
        normalizeComparisonClaim(item.axes?.[key], at + '.axes.' + key)]))),
      gaps: Object.freeze(Object.fromEntries(ATLAS_COMPARISON_GAPS.map(key => [key,
        normalizeComparisonClaim(item.gaps?.[key], at + '.gaps.' + key)]))),
      source: normalizeSource(item.source, at + '.source'), time: normalizeTime(item.time, at + '.time'),
      flags: normalizeFlags(item.flags, at + '.flags') });
  });
  check(new Set(comparisons.map(item => item.id)).size === comparisons.length, 'comparison ids must be unique');
  return Object.freeze(comparisons);
};

export const worldPair = (input, afterIndex = input.frames.length - 1) => Object.freeze({
  // Retain the immutable input too: presentation and owner receipts are evidence
  // for these exact contents, even if a later payload reuses both frame IDs.
  input, before: afterIndex > 0 ? frameAt(input, 0) : null, after: frameAt(input, afterIndex),
});

export const comparisonsForPair = (input, before, after) => {
  const matches = (endpoint, frame) => endpoint === null ? !frame : Boolean(frame
    && endpoint.frameId === frame.id && endpoint.rev === frame.rev && endpoint.asOf === frame.asOf);
  return Object.freeze((input.comparisons ?? []).filter(item => matches(item.before, before) && matches(item.after, after)));
};

export const parseAtlasWorldInput = input => {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  exactKeys(value, ['kind', 'authority', 'presentation', 'frames', 'comparisons', 'note'], 'input');
  check(value.kind === ATLAS_WORLD_KIND, 'input.kind must be ' + ATLAS_WORLD_KIND);
  check(value.authority === false, 'input.authority must be false');
  const presentation = normalizePresentation(value.presentation);
  const areaIds = new Set(presentation.areas.map(area => area.id));
  check(Array.isArray(value.frames) && value.frames.length > 0, 'input.frames must be non-empty');
  const supplied = value.frames.map((frame, index) => normalizeFrame(frame, 'frames[' + index + ']', areaIds));
  checkJournalDeltas(supplied);
  const frames = supplied.map((frame, index) => withGapView(frame, supplied.slice(0, index), presentation, supplied));
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
    comparisons: normalizeComparisons(value.comparisons),
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
