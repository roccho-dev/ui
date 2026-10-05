// Node checks for the Live Agent Organization Atlas (ui#320): input contract,
// atomic revisions, currentness, history changes, layout/projection
// invariants, renderer primitives, single-file packing and a real WHATWG
// EventSource against the finite fixture producer. Runs without Git or network
// and writes only to a fresh temporary directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  applyEnvelope, createAtlasState, currentness, evaluateEnvelope, historyChanges, loadHistory,
  parseTopology, summarizeScopes, timelineFor, HISTORY_LIMIT,
} from '../packages/control/src/live-atlas.mjs';
import { fitCamera, layoutTopology, lodFor, MAX_SCENE_PRIMITIVES, projectAtlas } from '../packages/control/src/live-atlas-projection.mjs';
import { MAX_SCENE_PRIMITIVES as PROJECTOR_BUDGET } from '../packages/semantic-map/projection/projector.js';
import { displayedRegionLabel } from '../packages/semantic-map/renderer-maxgraph/labels.js';
import { edgeStyle, vertexStyle } from '../packages/semantic-map/renderer-maxgraph/styles.js';
import { DEFAULT_THEME, paletteFor } from '../packages/semantic-map/renderer-maxgraph/theme.js';
import { ATLAS_MODULE_ROOTS, buildLiveAtlas, resolveHistory } from '../scripts/build-live-atlas.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'live-atlas', 'history.json');
const history = await resolveHistory(fixturePath);
const jsonl = rows => `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
const lines = text => text.split(/\r?\n/u).filter(line => line.trim()).length;
const T0 = Date.parse('2026-10-06T00:10:00Z');

const envelope = ({ rev = 1, asOf = '2026-10-06T00:10:00Z', maxAgeMs = 600000, topology, ...channels }) => ({
  kind: 'ui.liveAtlasInput.v1', rev, asOf, maxAgeMs,
  channels: { topology: { text: typeof topology === 'string' ? topology : jsonl(topology) },
    ...Object.fromEntries(Object.entries(channels).map(([key, value]) => [key, { text: typeof value === 'string' ? value : jsonl(value) }])) },
});
const scopes = [
  { t: 'scope', id: 'root', label: 'Root', parent: null },
  { t: 'scope', id: 'a', label: 'A', parent: 'root' },
  { t: 'scope', id: 'b', label: 'B', parent: 'root' },
  { t: 'actor', id: 'x', label: 'X' },
  { t: 'actor', id: 'y', label: 'Y' },
  { t: 'target', id: 'p', label: 'P', class: 'policy' },
  { t: 'org', id: 'o', from: 'x', to: 'y' },
  { t: 'member', id: 'm1', actor: 'y', scope: 'a' },
  { t: 'member', id: 'm2', actor: 'y', scope: 'b' },
];
const work = (id, scope, status, observedAt = '2026-10-06T00:09:00Z', extra = {}) => ({ t: 'work', id, scope, actors: ['y'], status, observedAt, ...extra });

// --- mandatory topology fails closed; raw is kept ---
const rejectsTopology = (rows, pattern) => {
  const result = evaluateEnvelope(envelope({ topology: rows }), { now: T0 });
  assert.equal(result.ok, false, `expected rejection: ${pattern}`);
  assert.match(result.diagnostic, pattern);
  assert.ok(result.raw.topology.length > 0);
};
rejectsTopology([...scopes, { t: 'scope', id: 'a', label: 'dup', parent: null }], /duplicate id a/u);
rejectsTopology([...scopes, { t: 'scope', id: 'c', label: 'C', parent: 'missing' }], /missing is not a scope/u);
rejectsTopology([{ t: 'scope', id: 'r', label: 'R', parent: null }, { t: 'scope', id: 'c1', label: 'C', parent: 'c2' }, { t: 'scope', id: 'c2', label: 'C', parent: 'c1' }], /cycle/u);
rejectsTopology([...scopes, { t: 'org', id: 'o2', from: 'y', to: 'x' }], /org cycle/u);
rejectsTopology([...scopes, { t: 'member', id: 'm3', actor: 'a', scope: 'b' }], /a is not a actor/u);
rejectsTopology([...scopes, { t: 'team', id: 'q' }], /unknown t/u);
rejectsTopology([...scopes, { t: 'target', id: 'q', label: 'Q', class: 'roadmap' }], /class must be/u);
rejectsTopology(`${jsonl(scopes)}{not json}\n`, /topology L10/u);
assert.equal(evaluateEnvelope('{', { now: T0 }).ok, false);
assert.match(evaluateEnvelope({ ...envelope({ topology: scopes }), extra: 1 }, { now: T0 }).diagnostic, /envelope.extra/u);
assert.match(evaluateEnvelope({ ...envelope({ topology: scopes }), rev: -1 }, { now: T0 }).diagnostic, /rev/u);
assert.match(evaluateEnvelope({ ...envelope({ topology: scopes }), asOf: '2026-10-06 00:10' }, { now: T0 }).diagnostic, /ISO UTC/u);

// --- topology is not inferred from Control: explicit controlId only ---
const control = fs.readFileSync(path.join(repoRoot, 'examples', 'control', 'control.jsonl'), 'utf8');
const claims = fs.readFileSync(path.join(repoRoot, 'examples', 'control', 'claims.jsonl'), 'utf8');
const joined = scopes.map(row => (row.id === 'a' ? { ...row, controlId: 'ui' } : row));
let result = evaluateEnvelope(envelope({ topology: joined, control, claims }), { now: T0 });
assert.equal(result.ok, true);
assert.deepEqual(result.joins, [{ id: 'a', controlId: 'ui', resolved: true }]);
assert.equal(result.channels.control.records.length, lines(control));
assert.equal(result.channels.claims.state, 'accepted');
assert.equal(result.topology.scopes.size, 3, 'Control rows do not become scopes');
assert.equal(evaluateEnvelope(envelope({ topology: joined }), { now: T0 }).joins[0].resolved, false);
result = evaluateEnvelope(envelope({ topology: scopes.map(row => (row.id === 'a' ? { ...row, controlId: 'nope' } : row)), control }), { now: T0 });
assert.match(result.diagnostic, /controlId nope is not in the accepted Control/u);
result = evaluateEnvelope(envelope({ topology: joined, control: '{"id":"/root"}\n', claims }), { now: T0 });
assert.equal(result.ok, true);
assert.equal(result.channels.control.state, 'rejected');
assert.match(result.channels.claims.diagnostic, /accepted Control/u);
assert.equal(result.joins[0].resolved, false, 'unknown Control never fabricates a join');

// --- optional observations: whole channel accepted or rejected ---
const obs = [work('w1', 'a', 'running'), work('w2', 'a', 'running'), work('w3', 'a', 'running'), work('w4', 'b', 'blocked'),
  { t: 'ref', id: 'r1', actor: 'x', target: 'p', observedAt: '2026-10-06T00:09:00Z' }];
result = evaluateEnvelope(envelope({ topology: scopes, observations: [...obs, work('w5', 'missing', 'running')] }), { now: T0 });
assert.equal(result.ok, true, 'topology still publishes');
assert.equal(result.channels.observations.state, 'rejected', 'one bad row rejects the whole channel');
assert.match(evaluateEnvelope(envelope({ topology: scopes, observations: [work('w1', 'a', 'done')] }), { now: T0 }).channels.observations.diagnostic, /status must be/u);
assert.match(evaluateEnvelope(envelope({ topology: scopes, observations: [work('w1', 'a', 'running', '2026-10-06T00:11:00Z')] }), { now: T0 }).channels.observations.diagnostic, /after the envelope asOf/u);
assert.match(evaluateEnvelope(envelope({ topology: scopes, observations: [{ t: 'status', id: 's', subject: 'p', status: 'running', observedAt: '2026-10-06T00:09:00Z' }] }), { now: T0 }).channels.observations.diagnostic, /subject/u);
assert.match(evaluateEnvelope(envelope({ topology: scopes, observations: [work('w1', 'a', 'running', undefined, { evidence: [{ kind: 'pr', ref: 'x', href: 'javascript:alert(1)' }] })] }), { now: T0 }).channels.observations.diagnostic, /href/u);
const future = evaluateEnvelope(envelope({ topology: scopes, observations: obs, asOf: '2026-10-06T00:20:00Z' }), { now: T0 });
assert.equal(future.ok, true, 'a future asOf rejects observations only');
assert.equal(future.channels.observations.state, 'rejected');

// --- atomic revisions: rejection never advances, stale ignored, retry allowed ---
let state = createAtlasState();
state = applyEnvelope(state, envelope({ rev: 1, topology: scopes, observations: obs }), { now: T0 });
assert.equal(state.held.rev, 1);
state = applyEnvelope(state, envelope({ rev: 2, topology: [...scopes, { t: 'scope', id: 'z', label: 'Z', parent: 'gone' }] }), { now: T0 });
assert.equal(state.attempt.outcome, 'rejected');
assert.equal(state.held.rev, 1);
state = applyEnvelope(state, envelope({ rev: 2, topology: scopes, observations: obs }), { now: T0 });
assert.equal(state.held.rev, 2, 'the corrected same revision is accepted');
const rev2 = envelope({ rev: 2, topology: scopes, observations: obs });
state = applyEnvelope(state, rev2, { now: T0 });
assert.equal(state.attempt.outcome, 'duplicate');
state = applyEnvelope(state, envelope({ rev: 2, topology: scopes }), { now: T0 });
assert.equal(state.attempt.outcome, 'conflict');
state = applyEnvelope(state, envelope({ rev: 0, topology: scopes }), { now: T0 });
assert.equal(state.attempt.outcome, 'stale');
assert.equal(state.held.rev, 2);
state = applyEnvelope(state, envelope({ rev: 7, topology: scopes, observations: obs }), { now: T0 });
assert.deepEqual(state.gaps, [{ fromRev: 2, toRev: 7 }]);
assert.equal(state.complete, false, 'a revision gap makes history incomplete');
assert.equal(state.history.length, 3);
let windowed = createAtlasState();
for (let rev = 1; rev <= HISTORY_LIMIT + 2; rev += 1) windowed = applyEnvelope(windowed, envelope({ rev, topology: scopes }), { now: T0 });
assert.equal(windowed.history.length, HISTORY_LIMIT);
assert.equal(windowed.complete, false, 'eviction makes history incomplete');

// --- currentness and distinct running work ---
const held = applyEnvelope(createAtlasState(), envelope({ topology: scopes, observations: [...obs, work('w-old', 'a', 'running', '2026-10-05T23:00:00Z')] }), { now: T0 }).held;
const live = currentness(held, { mode: 'live', now: T0 + 1000, connected: true });
assert.equal(live.current, true);
let summary = summarizeScopes(held, live);
assert.equal(summary.get('a').lanes, 3, 'three distinct fresh running works; the stale one is excluded');
assert.equal(summary.get('b').blocked, 1);
assert.equal(summary.get('root').lanes, 3);
const again = applyEnvelope(applyEnvelope(createAtlasState(), envelope({ topology: scopes, observations: obs }), { now: T0 }), envelope({ topology: scopes, observations: obs }), { now: T0 });
assert.equal(summarizeScopes(again.held, live).get('a').lanes, 3, 'redelivery does not add work');
for (const [options, reason] of [
  [{ mode: 'live', now: T0, connected: false }, /disconnected/u],
  [{ mode: 'live', now: T0 + 600001, connected: true }, /older than maxAgeMs/u],
  [{ mode: 'live', now: T0 - 1, connected: true }, /future/u],
]) {
  const unknown = currentness(held, options);
  assert.equal(unknown.current, false);
  assert.match(unknown.reason, reason);
  summary = summarizeScopes(held, unknown);
  assert.equal(summary.get('a').lanes, null, 'unknown is not zero');
  const projected = projectAtlas(held, unknown, { zoom: 1, scale: 1 });
  assert.ok(projected.scene.representations.every(item => (item.visual?.motion ?? 'none') === 'none'), 'no motion without current activity');
  assert.ok([...projected.status.values()].every(item => item.token === '?'));
}
const sampleNow = currentness(held, { mode: 'sample' });
assert.equal(sampleNow.now, held.asOfMs);
assert.match(sampleNow.reason, /sample as of/u);
assert.equal(currentness(applyEnvelope(createAtlasState(), envelope({ topology: scopes }), { now: T0 }).held, { mode: 'live', now: T0, connected: true }).reason, 'observations absent');

// --- fixture history: all six lifecycle changes on stable ids ---
const sample = loadHistory(history);
assert.deepEqual(sample.history.map(item => item.rev), [1, 2, 3, 5]);
assert.equal(sample.complete, false, 'the sample has a revision gap');
assert.equal(sample.held.channels.control.records.length, lines(control), 'the sample embeds the canonical Control file');
assert.equal(sample.held.raw.control, control, 'exact Control bytes');
assert.equal(sample.held.raw.claims, claims, 'exact claims bytes');
const changes = historyChanges(sample.history);
const has = (id, kind, extra = {}) => assert.ok(changes.some(change => change.id === id && change.kind === kind && Object.entries(extra).every(([key, value]) => change[key] === value)), `${id} ${kind}`);
has('w-audit-1', 'created', { at: '2026-10-06T00:15:00Z' });
has('w-history-1', 'activity', { from: 'blocked', to: 'running' });
has('r-2', 'retarget', { from: 't-policy', to: 't-code' });
has('w-ci-2', 'status', { from: 'running', to: 'blocked' });
has('w-render-3', 'status', { from: 'running', to: 'completed' });
has('ws-deploy', 'status', { from: 'stopped', to: 'residual' });
has('w-ci-2', 'appeared');
has('w-render-1', 'notReported', { from: 'running' });
has('ws-deploy', 'topology', { change: 'changed', gap: true });
assert.ok(!changes.some(change => change.id === 'w-render-1' && change.kind === 'status'), 'disappearance is not completion');
assert.ok(changes.filter(change => change.kind !== 'created').every(change => change.at == null), 'no invented exact times');
assert.ok(timelineFor(sample.history, 'ws-render').some(change => change.id === 'w-render-3'), 'scope timeline includes its work');
const scope = summarizeScopes(sample.held, currentness(sample.held, { mode: 'sample' }));
assert.equal(scope.get('ws-render').lanes, 3);
assert.equal(scope.get('ws-docs').reported, false);

// --- layout: topology only, permutation invariant, valid per revision ---
const layoutOf = rows => layoutTopology(parseTopology(jsonl(rows)));
const shuffled = [...scopes].reverse();
assert.deepEqual([...layoutOf(shuffled).scopes], [...layoutOf(scopes).scopes], 'row order does not move anything');
const withObservations = projectAtlas(held, live, { zoom: 1, scale: 1 });
const bare = applyEnvelope(createAtlasState(), envelope({ topology: scopes }), { now: T0 }).held;
const without = projectAtlas(bare, currentness(bare, { mode: 'live', now: T0, connected: true }), { zoom: 3, scale: 2 });
const bounds = projection => Object.fromEntries(projection.scene.representations.filter(item => ['scope', 'actor', 'target'].includes(item.atlas?.kind) || item.mode === 'boundary').map(item => [item.regionId, item.bounds]));
assert.deepEqual(bounds(withObservations), bounds(without), 'observations and camera never move scopes, actors or targets');
assert.deepEqual(projectAtlas(held, live, { zoom: 1, scale: 1 }).scene, withObservations.scene, 'same input and view, same scene');
const [first, last] = [sample.history[2], sample.history[3]];
assert.notEqual(first.topology.scopes.get('ws-deploy').parent, last.topology.scopes.get('ws-deploy').parent);
for (const snapshot of [first, last]) {
  const layout = layoutTopology(snapshot.topology);
  const deploy = layout.scopes.get('ws-deploy').area;
  const parent = layout.scopes.get(snapshot.topology.scopes.get('ws-deploy').parent).area;
  assert.ok(deploy.x >= parent.x && deploy.y >= parent.y && deploy.x + deploy.width <= parent.x + parent.width && deploy.y + deploy.height <= parent.y + parent.height, `rev ${snapshot.rev}: inside its own parent`);
}

// --- every scope at every LOD, unique actors, budget and coverage ---
const largeRows = (scopeCount, actorCount) => {
  const rows = [];
  for (let a = 0; rows.length < scopeCount; a += 1) {
    rows.push({ t: 'scope', id: `p${a}`, label: `P${a}`, parent: null });
    for (let b = 0; b < 3 && rows.length < scopeCount; b += 1) {
      rows.push({ t: 'scope', id: `p${a}.${b}`, label: `P${a}.${b}`, parent: `p${a}` });
      for (let c = 0; c < 4 && rows.length < scopeCount; c += 1) {
        rows.push({ t: 'scope', id: `p${a}.${b}.${c}`, label: `P${a}.${b}.${c}`, parent: `p${a}.${b}` });
        for (let d = 0; d < 7 && rows.length < scopeCount; d += 1) rows.push({ t: 'scope', id: `p${a}.${b}.${c}.${d}`, label: `Leaf ${d}`, parent: `p${a}.${b}.${c}` });
      }
    }
  }
  for (let i = 0; i < actorCount; i += 1) rows.push({ t: 'actor', id: `a${i}`, label: `a${i}` });
  for (let i = 1; i < actorCount; i += 1) rows.push({ t: 'org', id: `o${i}`, from: `a${Math.floor((i - 1) / 3)}`, to: `a${i}` });
  rows.push({ t: 'target', id: 't', label: 'T', class: 'purpose' });
  return rows;
};
assert.equal(MAX_SCENE_PRIMITIVES, PROJECTOR_BUDGET, 'same scene budget as the semantic-map projector');
for (const [scopeCount, actorCount] of [[300, 40], [300, 900]]) {
  const rows = largeRows(scopeCount, actorCount);
  const leaves = rows.filter(row => row.t === 'scope' && row.id.split('.').length === 4);
  const works = leaves.flatMap((leaf, i) => Array.from({ length: 1 + (i % 4) }, (_, k) => work(`w${i}.${k}`, leaf.id, k % 3 ? 'running' : 'blocked')).map(item => ({ ...item, actors: [`a${(i + 1) % actorCount}`] })));
  const snapshot = applyEnvelope(createAtlasState(), envelope({ topology: rows, observations: works }), { now: T0 }).held;
  assert.ok(snapshot.channels.observations.state === 'accepted', snapshot.channels.observations.diagnostic);
  const now = currentness(snapshot, { mode: 'sample' });
  for (const zoom of [1, 3, 8]) {
    for (const selected of [null, 'p2.1.3.6', `a${actorCount - 1}`, 'w5.0']) {
      const projection = projectAtlas(snapshot, now, { zoom, scale: 1, selected });
      const ids = projection.scene.representations.map(item => item.regionId);
      assert.ok(projection.primitives <= MAX_SCENE_PRIMITIVES, `${projection.primitives} primitives`);
      assert.equal(new Set(ids).size, ids.length, 'one representation per id');
      for (const row of rows.filter(item => item.t === 'scope')) assert.ok(ids.includes(row.id) && ids.includes(`area:${row.id}`), `scope ${row.id} at ${lodFor(zoom)}`);
      const actorsDrawn = rows.filter(item => item.t === 'actor' && ids.includes(item.id)).length;
      const covered = projection.aggregates.reduce((sum, item) => sum + item.covers.length, 0);
      assert.equal(actorsDrawn + covered, actorCount, 'every actor drawn once or covered once');
      if (selected) assert.ok(ids.includes(selected) || zoom === 1, `selection ${selected} reachable at ${lodFor(zoom)}`);
      if (selected?.startsWith('a')) assert.ok(ids.includes(selected), 'a selected actor is materialized even when aggregated');
      assert.ok(projection.coverage.works.shown <= projection.coverage.works.total);
    }
  }
}
const huge = applyEnvelope(createAtlasState(), envelope({ topology: largeRows(1100, 1) }), { now: T0 }).held;
const unsupported = projectAtlas(huge, currentness(huge, { mode: 'sample' }), { zoom: 1, scale: 1 });
assert.equal(unsupported.supported, false);
assert.match(unsupported.diagnostic, /scene budget is 2048/u);

// Readability arithmetic only; the browser proof measures painted labels.
const fitted = (rows, viewport) => {
  const leaves = rows.filter(row => row.t === 'scope' && !rows.some(child => child.parent === row.id));
  const observations = leaves.flatMap((leaf, i) => Array.from({ length: 1 + (i % 4) }, (_, k) => ({ ...work(`w${i}.${k}`, leaf.id, k === 3 ? 'blocked' : 'running'), actors: [] })));
  const snapshot = applyEnvelope(createAtlasState(), envelope({ topology: rows, observations }), { now: T0 }).held;
  const projection = projectAtlas(snapshot, currentness(snapshot, { mode: 'sample' }), { zoom: 1, scale: 1 });
  const camera = fitCamera(projection.layout.world, viewport);
  return projection.scene.representations.filter(item => item.atlas?.kind === 'scope')
    .filter(item => !displayedRegionLabel(item, camera.scale, DEFAULT_THEME, false).startsWith(item.atlas.token)).length;
};
assert.equal(fitted(largeRows(300, 40), { width: 1280, height: 756 }), 0, '300 scopes estimated readable at 1280x800');
assert.equal(fitted(largeRows(300, 40), { width: 1440, height: 856 }), 0, '300 scopes estimated readable at 1440x900');
const chain = Array.from({ length: 100 }, (_, i) => ({ t: 'scope', id: `c${i}`, label: `C${i}`, parent: i ? `c${i - 1}` : null }));
assert.ok(fitted(chain, { width: 1280, height: 756 }) > 0, 'a 100-deep chain is reported unreadable, not passed');

// --- renderer primitives: explicit paint, defaults unchanged ---
const node = { shape: 'graph-node', kind: 'node', depth: 1, readOnly: true, bounds: { x: 0, y: 0, width: 10, height: 10 } };
const plainStyle = vertexStyle(node, 1, DEFAULT_THEME);
assert.deepEqual([plainStyle.fillColor, plainStyle.strokeColor], paletteFor(DEFAULT_THEME, 'node'));
const painted = vertexStyle({ ...node, visual: { appearance: { fillColor: '#123456', strokeColor: '#abcdef', strokeWidth: 3, dashed: true } } }, 2, DEFAULT_THEME);
assert.deepEqual([painted.fillColor, painted.strokeColor, painted.strokeWidth, painted.dashed], ['#123456', '#abcdef', 1.5, true]);
const unpainted = vertexStyle(node, 2, DEFAULT_THEME);
for (const key of Object.keys(unpainted)) {
  if (!['fillColor', 'strokeColor', 'strokeWidth'].includes(key)) assert.deepEqual(painted[key], unpainted[key], `paint leaves ${key} alone`);
}
const translucent = vertexStyle({ ...node, visual: { appearance: { fillColor: '#123456', fillOpacity: 40, strokeOpacity: 25 } } }, 1, DEFAULT_THEME);
assert.deepEqual([translucent.fillColor, translucent.fillOpacity, translucent.strokeOpacity], ['#123456', 40, 25], 'explicit colour keeps the appearance opacity');
for (const appearance of [{ fillColor: 'red' }, { strokeColor: '#12345' }, { strokeWidth: 0 }, { strokeWidth: 13 }, { dashed: 'yes' }]) {
  assert.throws(() => vertexStyle({ ...node, visual: { appearance } }, 1, DEFAULT_THEME), /appearance/u);
}
const relation = { relationIds: ['r'], from: 'a', to: 'b', directed: true, readOnly: true };
assert.equal(edgeStyle(relation, 1, DEFAULT_THEME).strokeColor, DEFAULT_THEME.edge.stroke);
assert.equal(edgeStyle({ ...relation, visual: { appearance: { strokeColor: '#ae3ec9', dashed: true } } }, 1, DEFAULT_THEME).strokeColor, '#ae3ec9');
assert.throws(() => edgeStyle({ ...relation, visual: { appearance: { fillColor: '#ffffff' } } }, 1, DEFAULT_THEME), /fillColor/u);
for (const item of projectAtlas(sample.held, currentness(sample.held, { mode: 'sample' }), { zoom: 8, scale: 1 }).scene.representations) {
  assert.equal(item.readOnly, true);
  assert.notEqual(item.geometryEditable, true);
  assert.notEqual(item.labelEditable, true);
  vertexStyle(item, 1, DEFAULT_THEME);
}

// --- single-file pack: closure parity, notices, escaping, no external code ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-live-atlas-'));
const created = [];
const own = file => { created.unshift(file); return file; };
try {
  const hostile = '</script><script>alert(1)</script> 漢字   $& $1';
  const hostileHistory = { kind: 'ui.liveAtlasHistory.v1', complete: true, snapshots: [envelope({ topology: [{ t: 'scope', id: 's', label: hostile, parent: null }] })] };
  hostileHistory.snapshots[0].channels.control = { source: 'examples/control/control.jsonl' };
  const input = own(path.join(tmp, 'hostile.json'));
  fs.writeFileSync(input, JSON.stringify(hostileHistory), { flag: 'wx' });
  const out = path.join(tmp, 'out');
  own(out);
  const receipt = await buildLiveAtlas({ input, out });
  own(path.join(out, 'index.html')); own(path.join(out, 'receipt.json'));
  await assert.rejects(buildLiveAtlas({ input, out }), /EEXIST/u, 'never overwrites an existing output');
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.equal(receipt.output.bytes, Buffer.byteLength(html));
  assert.equal((html.match(/<\/script>/gu) ?? []).length, (html.match(/<script/gu) ?? []).length, 'the hostile label cannot close a script element');
  const inputJson = html.match(/<script type="application\/json" id="live-atlas-input">([\s\S]*?)<\/script>/u)[1];
  assert.equal(JSON.parse(inputJson).snapshots[0].channels.topology.text, jsonl([{ t: 'scope', id: 's', label: hostile, parent: null }]));
  assert.equal(JSON.parse(inputJson).snapshots[0].channels.control.text, control);
  assert.ok(html.includes('id="embedded-third-party-notices"'));
  assert.ok(html.includes(fs.readFileSync(path.join(repoRoot, 'packages', 'semantic-map', 'LICENSE.maxGraph'), 'utf8').split('\n')[0]));
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/u.test(html), 'no external executable or style source');
  const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/u)[1].replaceAll('<\\/', '</')).imports;
  const specifier = /(["'])(?:ui:|\.{1,2}\/)[^"']*\1/gu;
  for (const [key, url] of Object.entries(imports)) {
    const relative = key.slice('ui:'.length);
    assert.ok(ATLAS_MODULE_ROOTS.some(root => relative.startsWith(root)), relative);
    assert.ok(url.startsWith('data:text/javascript;charset=utf-8;base64,'));
    const packed = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8');
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    assert.equal(packed.replace(specifier, '""'), source.replace(specifier, '""'), `${relative}: only specifiers differ`);
  }
  for (const required of ['packages/control/atlas.mjs', 'packages/semantic-map/renderer-maxgraph/adapter.js', 'packages/control/src/control-graph.mjs']) assert.ok(imports[`ui:${required}`], required);

  // --- real WHATWG EventSource against the finite producer (child process) ---
  const child = `
    import { applyEnvelope, connectLiveAtlas, createAtlasState, currentness } from ${JSON.stringify(pathToFileURL(path.join(repoRoot, 'packages/control/src/live-atlas.mjs')).href)};
    import { resolveHistory } from ${JSON.stringify(pathToFileURL(path.join(repoRoot, 'scripts/build-live-atlas.mjs')).href)};
    import { restamp, startAtlasProducer } from ${JSON.stringify(pathToFileURL(path.join(repoRoot, 'tests/fixtures/live-atlas/sse-producer.mjs')).href)};
    const history = await resolveHistory(${JSON.stringify(fixturePath)});
    const base = history.snapshots.at(-1);
    const fresh = rev => restamp(base, rev, Date.now());
    const withTopology = (rev, text) => ({ ...fresh(rev), channels: { ...fresh(rev).channels, topology: { text } } });
    const withObservations = (rev, text) => ({ ...fresh(rev), channels: { ...fresh(rev).channels, observations: { text } } });
    const producer = await startAtlasProducer({ connections: [
      [{ data: fresh(1) }, { data: fresh(3) }, { data: fresh(2) }, { data: withTopology(4, '{"t":"scope"}\\n') }, { data: fresh(4) },
       { data: withObservations(5, '{"t":"work","id":"bad"}\\n') }, { data: 'not json' }, { data: fresh(6) }, { delayMs: 50 }, { close: true }],
      [{ data: fresh(7) }],
    ] });
    let state = createAtlasState();
    let connected = false;
    const log = [];
    const record = event => log.push({ event, held: state.held?.rev ?? null, outcome: state.attempt?.outcome ?? null, connected,
      current: currentness(state.held, { mode: 'live', now: Date.now(), connected }) });
    const done = new Promise(resolve => {
      const client = connectLiveAtlas({ url: producer.url,
        onConnection: value => { connected = value; record(value ? 'open' : 'error'); },
        onSnapshot: data => { state = applyEnvelope(state, data, { now: Date.now() }); record('snapshot'); if (state.held?.rev === 7) { client.close(); resolve(); } } });
    });
    await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error('EventSource timeout')), 20000))]);
    await producer.close();
    console.log(JSON.stringify({ log, served: producer.served(), observations: state.history.find(item => item.rev === 5)?.channels.observations.state }));
  `;
  const run = spawnSync(process.execPath, ['--experimental-eventsource', '--no-warnings', '--input-type=module', '-e', child], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const { log, served, observations } = JSON.parse(run.stdout.trim().split('\n').at(-1));
  const snapshots = log.filter(item => item.event === 'snapshot').map(item => [item.held, item.outcome]);
  assert.deepEqual(snapshots, [[1, 'accepted'], [3, 'accepted'], [3, 'stale'], [3, 'rejected'], [4, 'accepted'], [5, 'accepted'], [5, 'rejected'], [6, 'accepted'], [7, 'accepted']]);
  assert.equal(observations, 'rejected', 'a corrupt optional channel is rejected as a whole');
  const afterBadObservations = log.find(item => item.event === 'snapshot' && item.held === 5 && item.outcome === 'accepted');
  assert.equal(afterBadObservations.current.current, false, 'rejected observations make activity unknown immediately');
  const error = log.find(item => item.event === 'error');
  assert.ok(error && error.current.current === false && /disconnected/u.test(error.current.reason), 'a closed stream makes activity unknown');
  assert.ok(log.filter(item => item.event === 'open').length >= 2, 'EventSource reconnects');
  assert.equal(log.findLast(item => item.event === 'snapshot').current.current, true, 'a fresh revision after reconnect is current');
  assert.equal(served, 2);
} finally {
  for (const file of created) {
    try { if (fs.lstatSync(file).isDirectory()) fs.rmdirSync(file); else fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  fs.rmdirSync(tmp);
}

console.log(JSON.stringify({ status: 'live-atlas-check-pass', snapshots: sample.history.map(item => item.rev), changes: changes.length }));
