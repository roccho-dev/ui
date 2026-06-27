import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_NODES,
  EVENTS,
  buildSnapshot,
  describeSelection,
  modelForTesting,
  pathExists,
} from '../src/domain/atlas-engine.js';

test('fixture preserves 40-event timeline and removes role-only nodes', () => {
  assert.equal(EVENTS.length, 40);
  assert.equal(BASE_NODES.some((node) => node.kind === 'role'), false);
  const final = buildSnapshot(40, {zoom: 1});
  assert.equal(final.counts.roleNodes, 0);
});

test('purpose transitions are deterministic and contract-aware', () => {
  const sale = buildSnapshot(2, {zoom: 1});
  assert.equal(sale.currentPurpose, '法人売却');
  assert.equal(sale.guard.status, 'ok');

  const orbit = buildSnapshot(7, {zoom: 1});
  assert.equal(orbit.currentPurpose, '衛星軌道投入');
  assert.equal(orbit.guard.status, 'missing');
  assert.deepEqual(orbit.guard.missing, [
    'cto_launch_readiness',
    'cpo_payload_validated',
    'ops_orbit_telemetry',
  ]);

  const orbitComplete = buildSnapshot(20, {zoom: 1});
  assert.equal(orbitComplete.guard.status, 'ok');

  const retirement = buildSnapshot(39, {zoom: 1});
  assert.equal(retirement.currentPurpose, '幸せな老後');
  assert.equal(retirement.guard.status, 'ok');
});

test('responsibility is projected from existing support subgraph', () => {
  const snapshot = buildSnapshot(39, {zoom: 1});
  const actors = snapshot.currentComposition.map((entry) => entry.actor);
  assert.ok(actors.length >= 5);
  assert.ok(actors.includes('CEO'));
  assert.ok(actors.includes('CFO'));
  assert.ok(actors.includes('CPO'));
  assert.ok(actors.includes('OPS'));
  assert.equal(snapshot.counts.roleNodes, 0);
});

test('support reachability changes as required evidence is connected', () => {
  const before = modelForTesting(18);
  assert.equal(pathExists(before, 'ops_orbit_telemetry', 'ceo_orbit_mission'), false);
  const after = modelForTesting(20);
  assert.equal(pathExists(after, 'ops_orbit_telemetry', 'ceo_orbit_mission'), true);
});

test('responsibility selection explains branch coverage', () => {
  const snapshot = buildSnapshot(39, {zoom: 1});
  const nodeId = snapshot.currentPurposeId;
  const actor = snapshot.currentComposition[0].actor;
  const details = describeSelection(snapshot, {type: 'responsibility', nodeId, actor});
  assert.equal(details.type, 'responsibility');
  assert.match(details.title, new RegExp(actor));
  assert.ok(details.coverage.length > 0);
});

test('layout snapshot is reproducible', () => {
  const first = buildSnapshot(39, {zoom: 1});
  const second = buildSnapshot(39, {zoom: 1});
  const project = (snapshot) => snapshot.nodes.map(({id, x, y, metaRank, status}) => ({id, x, y, metaRank, status}));
  assert.deepEqual(project(first), project(second));
});
