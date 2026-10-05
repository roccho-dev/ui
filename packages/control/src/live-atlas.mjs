// Live Agent Organization Atlas read model (ui#320).
//
// Input is one full envelope per revision. The topology channel is mandatory
// and fails closed; Control, claims and observations are optional channels that
// are accepted, absent or rejected as a whole. Observations are producer
// statements, never business authority, and nothing here is persisted.
import { splitDataPinJSONL } from '../../data-pin/contract.mjs';
import { connectControl, parseClaims, parseControl } from './control-graph.mjs';

export const INPUT_KIND = 'ui.liveAtlasInput.v1';
export const HISTORY_KIND = 'ui.liveAtlasHistory.v1';
export const STATUSES = Object.freeze(['created', 'running', 'blocked', 'stopped', 'completed', 'residual']);
export const TARGET_CLASSES = Object.freeze(['purpose', 'meta', 'policy', 'code']);
export const EVIDENCE_KINDS = Object.freeze(['issue', 'pr', 'worktree', 'log', 'receipt', 'other']);
export const HISTORY_LIMIT = 64;
export const CHANNELS = Object.freeze(['topology', 'control', 'claims', 'observations']);

const STATUS_SET = new Set(STATUSES);
const CLASS_SET = new Set(TARGET_CLASSES);
const EVIDENCE_SET = new Set(EVIDENCE_KINDS);
const TOPOLOGY_KINDS = new Set(['scope', 'actor', 'target', 'org', 'member']);
const OBSERVATION_KINDS = new Set(['work', 'ref', 'status']);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const SAFE_HREF = /^https?:\/\/[^\s<>"']+$/u;

const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, name) => check(typeof value === 'string' && value.length > 0 && value.length <= 512, `${name} must be a non-empty string`);

export const parseInstant = (value, name) => {
  check(typeof value === 'string' && INSTANT.test(value), `${name} must be an ISO UTC instant`);
  const ms = Date.parse(value);
  check(Number.isFinite(ms), `${name} is not a valid instant`);
  return ms;
};

// Every non-empty source line, with its 1-based line number and exact text.
export const sourceLines = source => String(source).split(/\r?\n/u)
  .map((raw, index) => ({ line: index + 1, raw }))
  .filter(item => item.raw.trim());

const jsonRows = (source, channel) => sourceLines(source).map(({ line, raw }) => {
  let value;
  try { value = JSON.parse(raw); } catch (error) { fail(`${channel} L${line}: ${error.message}`); }
  check(plain(value), `${channel} L${line}: object required`);
  return Object.freeze({ ...value, line });
});

export const parseTopology = source => {
  const rows = jsonRows(source, 'topology');
  const byId = new Map();
  for (const row of rows) {
    const at = `topology L${row.line}`;
    check(TOPOLOGY_KINDS.has(row.t), `${at}: unknown t ${JSON.stringify(row.t)}`);
    text(row.id, `${at} id`);
    check(!byId.has(row.id), `${at}: duplicate id ${row.id}`);
    byId.set(row.id, row);
    if (row.t === 'scope') {
      text(row.label, `${at} label`);
      check(row.parent === null || typeof row.parent === 'string', `${at}: parent must be null or a scope id`);
    }
    if (row.t === 'actor') text(row.label, `${at} label`);
    if (row.t === 'scope' || row.t === 'actor') check(row.controlId === undefined || typeof row.controlId === 'string', `${at}: controlId must be a string`);
    if (row.t === 'target') {
      text(row.label, `${at} label`);
      check(CLASS_SET.has(row.class), `${at}: class must be ${TARGET_CLASSES.join('|')}`);
    }
    if (row.t === 'org') { text(row.from, `${at} from`); text(row.to, `${at} to`); }
    if (row.t === 'member') { text(row.actor, `${at} actor`); text(row.scope, `${at} scope`); }
  }
  const of = kind => rows.filter(row => row.t === kind).sort((a, b) => (a.id < b.id ? -1 : 1));
  const scopes = new Map(of('scope').map(row => [row.id, row]));
  const actors = new Map(of('actor').map(row => [row.id, row]));
  const targets = new Map(of('target').map(row => [row.id, row]));
  check(scopes.size > 0, 'topology: at least one scope is required');
  const kindOf = (id, kind, at) => check(byId.get(id)?.t === kind, `${at}: ${id} is not a ${kind}`);

  const children = new Map([...scopes.keys()].map(id => [id, []]));
  const roots = [];
  for (const scope of scopes.values()) {
    if (scope.parent === null) roots.push(scope.id);
    else {
      kindOf(scope.parent, 'scope', `topology L${scope.line}`);
      check(scope.parent !== scope.id, `topology L${scope.line}: scope cannot parent itself`);
      children.get(scope.parent).push(scope.id);
    }
  }
  const depth = new Map();
  const visit = (id, level, path) => {
    check(!path.has(id), `topology: scope cycle at ${id}`);
    depth.set(id, level);
    path.add(id);
    for (const child of children.get(id)) visit(child, level + 1, path);
    path.delete(id);
  };
  roots.forEach(id => visit(id, 0, new Set()));
  check(depth.size === scopes.size, 'topology: scope cycle detached from every root');

  const orgs = of('org');
  const reports = new Map([...actors.keys()].map(id => [id, []]));
  const orgPairs = new Set();
  for (const org of orgs) {
    const at = `topology L${org.line}`;
    kindOf(org.from, 'actor', at);
    kindOf(org.to, 'actor', at);
    check(org.from !== org.to, `${at}: org edge cannot be a self edge`);
    check(!orgPairs.has(`${org.from}>${org.to}`), `${at}: duplicate org edge`);
    orgPairs.add(`${org.from}>${org.to}`);
    reports.get(org.from).push(org.to);
  }
  const orgDepth = new Map();
  const state = new Map();
  const depthOf = id => {
    if (state.get(id) === 'done') return orgDepth.get(id);
    check(state.get(id) !== 'visiting', `topology: org cycle at ${id}`);
    state.set(id, 'visiting');
    let value = 0;
    for (const org of orgs) if (org.to === id) value = Math.max(value, depthOf(org.from) + 1);
    state.set(id, 'done');
    orgDepth.set(id, value);
    return value;
  };
  [...actors.keys()].forEach(depthOf);

  const members = of('member');
  const memberPairs = new Set();
  for (const member of members) {
    const at = `topology L${member.line}`;
    kindOf(member.actor, 'actor', at);
    kindOf(member.scope, 'scope', at);
    check(!memberPairs.has(`${member.actor}@${member.scope}`), `${at}: duplicate membership`);
    memberPairs.add(`${member.actor}@${member.scope}`);
  }
  for (const list of children.values()) list.sort();
  roots.sort();
  return Object.freeze({ rows, byId, scopes, actors, targets, orgs, members, children, roots, depth, orgDepth });
};

const parseEvidence = (value, at) => {
  if (value === undefined) return [];
  check(Array.isArray(value) && value.length <= 32, `${at}: evidence must be an array`);
  return value.map((item, index) => {
    check(plain(item), `${at}: evidence[${index}] must be an object`);
    check(EVIDENCE_SET.has(item.kind), `${at}: evidence[${index}].kind must be ${EVIDENCE_KINDS.join('|')}`);
    text(item.ref, `${at} evidence[${index}].ref`);
    check(item.href === undefined || (typeof item.href === 'string' && SAFE_HREF.test(item.href)), `${at}: evidence[${index}].href must be an http(s) URL`);
    return item;
  });
};

export const parseObservations = (source, topology, asOfMs) => {
  const rows = jsonRows(source, 'observations');
  const ids = new Set();
  const subjects = new Set();
  for (const row of rows) {
    const at = `observations L${row.line}`;
    check(OBSERVATION_KINDS.has(row.t), `${at}: unknown t ${JSON.stringify(row.t)}`);
    text(row.id, `${at} id`);
    check(!ids.has(row.id) && !topology.byId.has(row.id), `${at}: duplicate id ${row.id}`);
    ids.add(row.id);
    const observed = parseInstant(row.observedAt, `${at} observedAt`);
    check(observed <= asOfMs, `${at}: observedAt is after the envelope asOf`);
    if (row.createdAt !== undefined) check(parseInstant(row.createdAt, `${at} createdAt`) <= observed, `${at}: createdAt is after observedAt`);
    if (row.t !== 'ref') check(STATUS_SET.has(row.status), `${at}: status must be ${STATUSES.join('|')}`);
    if (row.t !== 'ref') parseEvidence(row.evidence, at);
    if (row.t === 'work') {
      check(topology.scopes.has(row.scope), `${at}: unknown scope ${row.scope}`);
      check(Array.isArray(row.actors) && row.actors.every(id => topology.actors.has(id)), `${at}: actors must be known actor ids`);
      check(new Set(row.actors).size === row.actors.length, `${at}: duplicate actor`);
    }
    if (row.t === 'ref') {
      check(topology.actors.has(row.actor), `${at}: unknown actor ${row.actor}`);
      check(topology.targets.has(row.target), `${at}: unknown target ${row.target}`);
    }
  }
  const refIds = new Set(rows.filter(row => row.t === 'ref').map(row => row.id));
  for (const row of rows.filter(item => item.t === 'status')) {
    const at = `observations L${row.line}`;
    const subject = topology.byId.get(row.subject);
    check((subject && subject.t !== 'target') || refIds.has(row.subject), `${at}: subject must be a scope, actor, org, member or ref id`);
    check(!subjects.has(row.subject), `${at}: more than one status for ${row.subject}`);
    subjects.add(row.subject);
  }
  const of = kind => rows.filter(row => row.t === kind).sort((a, b) => (a.id < b.id ? -1 : 1));
  return Object.freeze({ work: of('work'), refs: of('ref'), statuses: of('status') });
};

const parseControlChannel = source => {
  const split = splitDataPinJSONL(source);
  const records = parseControl(split.dataText);
  connectControl(records);
  return { records, pins: split.dataPinRecords };
};

const channelText = (channels, name) => {
  if (!Object.hasOwn(channels, name)) return null;
  const channel = channels[name];
  check(plain(channel) && Object.keys(channel).length === 1 && typeof channel.text === 'string', `channels.${name} must be {text}`);
  return channel.text;
};

const optional = (sourceText, parse) => {
  if (sourceText === null) return { state: 'absent' };
  try { return { state: 'accepted', ...parse(sourceText) }; } catch (error) { return { state: 'rejected', diagnostic: error.message }; }
};

// Validates one envelope. `ok: false` means the publication is rejected; raw
// text and diagnostics are kept either way for the audit.
export const evaluateEnvelope = (input, { now }) => {
  let value = input;
  const rawInput = typeof input === 'string' ? input : JSON.stringify(input);
  const raw = {};
  try {
    if (typeof input === 'string') {
      try { value = JSON.parse(input); } catch (error) { fail(`envelope: ${error.message}`); }
    }
    check(plain(value), 'envelope must be an object');
    for (const name of CHANNELS) {
      if (plain(value.channels) && plain(value.channels[name]) && typeof value.channels[name].text === 'string') raw[name] = value.channels[name].text;
    }
    check(value.kind === INPUT_KIND, `envelope.kind must be ${INPUT_KIND}`);
    for (const key of Object.keys(value)) check(['kind', 'rev', 'asOf', 'maxAgeMs', 'channels'].includes(key), `envelope.${key} is not allowed`);
    check(Number.isSafeInteger(value.rev) && value.rev >= 0, 'envelope.rev must be a non-negative safe integer');
    const asOfMs = parseInstant(value.asOf, 'envelope.asOf');
    check(typeof value.maxAgeMs === 'number' && Number.isFinite(value.maxAgeMs) && value.maxAgeMs > 0, 'envelope.maxAgeMs must be a positive finite number');
    check(plain(value.channels), 'envelope.channels must be an object');
    for (const key of Object.keys(value.channels)) check(CHANNELS.includes(key), `channels.${key} is not allowed`);
    const topologyText = channelText(value.channels, 'topology');
    check(topologyText !== null, 'channels.topology is required');
    const texts = Object.fromEntries(CHANNELS.slice(1).map(name => [name, channelText(value.channels, name)]));
    let topology;
    try { topology = parseTopology(topologyText); } catch (error) { fail(`topology rejected: ${error.message}`); }

    const control = optional(texts.control, parseControlChannel);
    const controlIds = control.state === 'accepted' ? new Set(control.records.map(record => record.id)) : null;
    const joins = [];
    for (const row of topology.rows) {
      if (row.controlId === undefined) continue;
      if (controlIds) check(controlIds.has(row.controlId), `topology L${row.line}: controlId ${row.controlId} is not in the accepted Control`);
      joins.push({ id: row.id, controlId: row.controlId, resolved: Boolean(controlIds) });
    }
    let claims;
    if (texts.claims === null) claims = { state: 'absent' };
    else if (control.state !== 'accepted') claims = { state: 'rejected', diagnostic: `claims need an accepted Control (Control is ${control.state})` };
    else claims = optional(texts.claims, sourceText => ({ records: parseClaims(splitDataPinJSONL(sourceText).dataText, control.records) }));
    let observations;
    if (texts.observations === null) observations = { state: 'absent' };
    else if (asOfMs > now) observations = { state: 'rejected', diagnostic: 'envelope asOf is in the future; current activity is untrusted' };
    else observations = optional(texts.observations, sourceText => parseObservations(sourceText, topology, asOfMs));

    return Object.freeze({
      ok: true, rev: value.rev, asOf: value.asOf, asOfMs, maxAgeMs: value.maxAgeMs, rawInput, raw,
      topology, joins, channels: Object.freeze({ control, claims, observations }),
    });
  } catch (error) {
    return Object.freeze({ ok: false, rev: Number.isSafeInteger(value?.rev) ? value.rev : null, rawInput, raw, diagnostic: error.message });
  }
};

export const createAtlasState = () => Object.freeze({
  held: null, attempt: null, history: Object.freeze([]), complete: true, gaps: Object.freeze([]),
});

// Applies one envelope to the transient session state. Rejection never moves
// the held revision; stale or repeated revisions change nothing but `attempt`.
export const applyEnvelope = (state, input, { now, limit = HISTORY_LIMIT }) => {
  const evaluated = evaluateEnvelope(input, { now });
  if (!evaluated.ok) return Object.freeze({ ...state, attempt: Object.freeze({ outcome: 'rejected', evaluated }) });
  if (state.held && evaluated.rev <= state.held.rev) {
    const same = state.history.find(item => item.rev === evaluated.rev);
    const outcome = same && same.rawInput !== evaluated.rawInput ? 'conflict' : same ? 'duplicate' : 'stale';
    return Object.freeze({ ...state, attempt: Object.freeze({ outcome, evaluated }) });
  }
  const gaps = state.held && evaluated.rev > state.held.rev + 1
    ? Object.freeze([...state.gaps, Object.freeze({ fromRev: state.held.rev, toRev: evaluated.rev })])
    : state.gaps;
  let history = [...state.history, evaluated];
  let complete = state.complete && gaps === state.gaps;
  if (history.length > limit) {
    history = history.slice(history.length - limit);
    complete = false;
  }
  return Object.freeze({
    held: evaluated, attempt: Object.freeze({ outcome: 'accepted', evaluated }),
    history: Object.freeze(history), complete, gaps,
  });
};

export const loadHistory = (value, { limit = HISTORY_LIMIT } = {}) => {
  check(plain(value) && value.kind === HISTORY_KIND, `history.kind must be ${HISTORY_KIND}`);
  check(typeof value.complete === 'boolean', 'history.complete must be boolean');
  check(Array.isArray(value.snapshots) && value.snapshots.length > 0, 'history.snapshots must be a non-empty array');
  let state = createAtlasState();
  const rejected = [];
  for (const snapshot of value.snapshots) {
    // A recorded snapshot is judged as of its own asOf.
    const asOfMs = Date.parse(snapshot?.asOf);
    state = applyEnvelope(state, snapshot, { now: Number.isFinite(asOfMs) ? asOfMs : 0, limit });
    if (state.attempt.outcome !== 'accepted') rejected.push(state.attempt);
  }
  return Object.freeze({ ...state, complete: state.complete && value.complete && rejected.length === 0, rejected: Object.freeze(rejected) });
};

// Currentness of one accepted snapshot. Sample and history playback judge the
// snapshot at its own asOf and are labelled as such; live needs a connected,
// fresh, accepted observation channel and no newer rejected or conflicting
// update (the held revision is then known not to be the producer's latest).
export const currentness = (snapshot, { mode, now, connected, attempt = null }) => {
  if (!snapshot) return Object.freeze({ current: false, now, reason: 'no accepted snapshot' });
  const observations = snapshot.channels.observations;
  if (observations.state !== 'accepted') return Object.freeze({ current: false, now, reason: `observations ${observations.state}` });
  if (mode !== 'live') return Object.freeze({ current: true, now: snapshot.asOfMs, reason: `${mode} as of ${snapshot.asOf}` });
  if (!connected) return Object.freeze({ current: false, now, reason: 'producer disconnected' });
  if (attempt && (attempt.outcome === 'rejected' || attempt.outcome === 'conflict')) {
    return Object.freeze({ current: false, now, reason: `latest update ${attempt.outcome}` });
  }
  const age = now - snapshot.asOfMs;
  if (age < 0) return Object.freeze({ current: false, now, reason: 'snapshot asOf is in the future' });
  if (age > snapshot.maxAgeMs) return Object.freeze({ current: false, now, reason: 'snapshot is older than maxAgeMs' });
  return Object.freeze({ current: true, now, reason: 'live' });
};

export const fresh = (row, snapshot, now) => {
  const age = now - Date.parse(row.observedAt);
  return age >= 0 && age <= snapshot.maxAgeMs;
};

export const descendants = (topology, id) => {
  const result = [id];
  for (let index = 0; index < result.length; index += 1) result.push(...topology.children.get(result[index]));
  return result;
};

// Per-scope activity. Counts are distinct work ids, never deliveries. When
// activity is not current every count is null (unknown), not zero.
export const summarizeScopes = (snapshot, current) => {
  const { topology } = snapshot;
  const summary = new Map();
  const observations = snapshot.channels.observations;
  const statusBySubject = current.current ? new Map(observations.statuses.map(row => [row.subject, row])) : new Map();
  const workByScope = new Map();
  if (current.current) {
    for (const work of observations.work) {
      if (!fresh(work, snapshot, current.now)) continue;
      if (!workByScope.has(work.scope)) workByScope.set(work.scope, []);
      workByScope.get(work.scope).push(work);
    }
  }
  for (const id of topology.scopes.keys()) {
    if (!current.current) {
      summary.set(id, Object.freeze({ known: false, lanes: null, blocked: null, stopped: null, reported: null, status: null, works: [] }));
      continue;
    }
    const all = descendants(topology, id).flatMap(scope => workByScope.get(scope) ?? []);
    const own = workByScope.get(id) ?? [];
    const status = statusBySubject.get(id);
    const statusFresh = status && fresh(status, snapshot, current.now) ? status : null;
    const count = value => new Set(all.filter(work => work.status === value).map(work => work.id)).size;
    summary.set(id, Object.freeze({
      known: true,
      lanes: count('running'),
      blocked: count('blocked') + (statusFresh?.status === 'blocked' ? 1 : 0),
      stopped: count('stopped'),
      reported: all.length > 0 || Boolean(statusFresh),
      status: statusFresh,
      works: own,
    }));
  }
  return summary;
};

export const currentRefs = (snapshot, current) => (current.current
  ? snapshot.channels.observations.refs.filter(ref => fresh(ref, snapshot, current.now))
  : []);

const observedChannel = snapshot => (snapshot?.channels.observations.state === 'accepted' ? snapshot.channels.observations : null);

// Changes of the same stable ids between accepted snapshots. Topology compares
// `prev` with `next`; observations compare the last snapshot whose observations
// were accepted (`observedPrev`) with `next`, flagging any span in between whose
// observations were not accepted. Times are the interval (from.asOf, next.asOf]
// unless the producer gave createdAt.
export const diffSnapshots = (prev, next, observedPrev = observedChannel(prev) ? prev : null) => {
  const changes = [];
  const strip = row => { const { line, ...rest } = row; return JSON.stringify(rest); };
  const pushFrom = (from, extra) => change => changes.push(Object.freeze({
    ...change, fromRev: from.rev, toRev: next.rev, interval: Object.freeze([from.asOf, next.asOf]), gap: next.rev > from.rev + 1, ...extra,
  }));
  const push = pushFrom(prev, {});
  for (const row of next.topology.rows) {
    const old = prev.topology.byId.get(row.id);
    if (!old) push({ id: row.id, entity: row.t, kind: 'topology', change: 'added' });
    else if (strip(old) !== strip(row)) push({ id: row.id, entity: row.t, kind: 'topology', change: 'changed', from: old, to: row });
  }
  for (const row of prev.topology.rows) if (!next.topology.byId.has(row.id)) push({ id: row.id, entity: row.t, kind: 'topology', change: 'removed' });
  const after = observedChannel(next);
  if (!after || observedPrev !== prev) {
    push({ id: null, entity: 'observations', kind: 'unknown', change: `observations ${observedChannel(prev) ? 'accepted' : prev.channels.observations.state} -> ${after ? 'accepted' : next.channels.observations.state}` });
  }
  if (!after || !observedPrev) return changes;
  const before = observedChannel(observedPrev);
  const observe = pushFrom(observedPrev, { observationGap: observedPrev !== prev });
  const createdIn = row => row.createdAt !== undefined && Date.parse(row.createdAt) > observedPrev.asOfMs && Date.parse(row.createdAt) <= next.asOfMs;
  const lifecycle = (key, entity, oldList, newList) => {
    const oldBy = new Map(oldList.map(row => [row[key], row]));
    const newBy = new Map(newList.map(row => [row[key], row]));
    for (const [id, row] of newBy) {
      const old = oldBy.get(id);
      if (!old) {
        const explicit = createdIn(row) || row.status === 'created';
        observe({ id, entity, kind: explicit ? 'created' : 'appeared', status: row.status, at: createdIn(row) ? row.createdAt : null, evidence: row.evidence ?? [] });
      } else if (old.status !== row.status) {
        observe({ id, entity, kind: row.status === 'running' ? 'activity' : 'status', from: old.status, to: row.status, evidence: row.evidence ?? [] });
      }
    }
    for (const id of oldBy.keys()) if (!newBy.has(id)) observe({ id, entity, kind: 'notReported', from: oldBy.get(id).status });
  };
  lifecycle('id', 'work', before.work, after.work);
  lifecycle('subject', 'status', before.statuses, after.statuses);
  const oldRefs = new Map(before.refs.map(row => [row.id, row]));
  const newRefs = new Map(after.refs.map(row => [row.id, row]));
  for (const [id, row] of newRefs) {
    const old = oldRefs.get(id);
    if (!old) observe({ id, entity: 'ref', kind: 'appeared', to: row.target, actor: row.actor });
    else if (old.target !== row.target || old.actor !== row.actor) observe({ id, entity: 'ref', kind: 'retarget', from: old.target, to: row.target, actor: row.actor });
  }
  for (const [id, row] of oldRefs) if (!newRefs.has(id)) observe({ id, entity: 'ref', kind: 'notReported', from: row.target, actor: row.actor });
  return changes;
};

export const historyChanges = history => {
  const changes = [];
  let observed = observedChannel(history[0]) ? history[0] : null;
  for (let index = 1; index < history.length; index += 1) {
    changes.push(...diffSnapshots(history[index - 1], history[index], observed));
    if (observedChannel(history[index])) observed = history[index];
  }
  return changes;
};

// Changes that concern one id: the entity itself, status rows about it, its
// references, and work in a scope or by an actor in any held revision.
export const timelineFor = (history, id) => {
  const works = new Map();
  for (const snapshot of history) for (const row of observedChannel(snapshot)?.work ?? []) works.set(row.id, [...(works.get(row.id) ?? []), row]);
  return historyChanges(history).filter(change => {
    if (change.id === id || change.actor === id) return true;
    return (works.get(change.id) ?? []).some(work => work.scope === id || work.actors.includes(id));
  });
};

// Subscribes to full-envelope `snapshot` events from an external producer.
// The UI never produces state; it only consumes the stream.
export const connectLiveAtlas = ({ url, EventSourceImpl = globalThis.EventSource, onSnapshot, onConnection }) => {
  check(typeof EventSourceImpl === 'function', 'EventSource is unavailable');
  const source = new EventSourceImpl(url);
  source.addEventListener('open', () => onConnection(true));
  source.addEventListener('error', () => onConnection(false));
  source.addEventListener('snapshot', event => onSnapshot(event.data));
  return Object.freeze({ close() { source.close(); onConnection(false); } });
};
