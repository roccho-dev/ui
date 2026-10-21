// Readability checks for the World projection. Pure; no browser. Rendered text
// (overlap, empty and cut labels) is tests/atlas-world-readability-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { ATLAS_STATUS, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { forecastLines } from '../packages/control/src/atlas-timeline.mjs';
import { planWorld } from './fixtures/atlas-plan-worlds.mjs';
import { countRelationCrossings } from './fixtures/atlas-crossings.mjs';
import { STATUS_FLAGS, crossingWorld, statusWorld } from './fixtures/atlas-readability-worlds.mjs';
import { worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

// Every status has its own color pair and its own symbol, and each supplied
// flag set is drawn with both.
const looks = Object.values(ATLAS_STATUS).map(item => JSON.stringify([item.appearance.fillColor, item.appearance.strokeColor, item.appearance.dashed]));
assert.equal(new Set(looks).size, looks.length, 'each status has a distinct color/dash');
const symbols = Object.values(ATLAS_STATUS).map(item => item.symbol);
assert.ok(symbols.every(Boolean) && new Set(symbols).size === symbols.length, 'each status has a distinct symbol');
const statusInput = parseAtlasWorldInput(statusWorld());
let statusCases = 0;
for (const frame of statusInput.frames) {
  const entities = projectWorldScene({ input: statusInput, frame }).representations.filter(item => item.atlas?.kind === 'entity');
  for (const status of Object.keys(STATUS_FLAGS)) {
    const drawn = entities.filter(item => item.atlas.status === status);
    assert.ok(drawn.length >= 1, frame.id + ': ' + status + ' is drawn');
    for (const item of drawn) {
      assert.ok(item.label.startsWith(ATLAS_STATUS[status].symbol + ' · '), status + ' label carries its symbol');
      assert.deepEqual(item.visual.appearance, ATLAS_STATUS[status].appearance, status + ' carries its color');
      statusCases += 1;
    }
  }
  // Live activity keeps its own look; no status is claimed over it.
  for (const item of entities.filter(entity => entity.atlas.activity !== 'none')) assert.equal(item.atlas.status, null);
}
// A conflict or unassigned unit that is also unmet is never shown as plain unmet.
assert.equal(projectWorldScene({ input: statusInput, frame: statusInput.frames[0] }).representations
  .find(item => item.atlas?.status === 'unknown')?.atlas.status, 'unknown', 'unresolved standing outranks a satisfied status');

// Relation ordering: measured against the supplied order on the same input.
const crossings = {};
for (const [name, input] of [['crossing-fixture', crossingWorld()], ['bundled', JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8'))]]) {
  const world = parseAtlasWorldInput(input);
  for (const frame of world.frames) {
    const before = countRelationCrossings(projectWorldScene({ input: world, frame, ordering: 'supplied' }));
    const after = countRelationCrossings(projectWorldScene({ input: world, frame }));
    assert.ok(after <= before, name + '/' + frame.id + ': ordering never adds crossings');
    assert.deepEqual(projectWorldScene({ input: world, frame }), projectWorldScene({ input: world, frame }), 'ordering is deterministic');
    crossings[name + '/' + frame.id] = { before, after };
  }
}
assert.deepEqual(crossings['crossing-fixture/crossing'], { before: 1, after: 0 }, 'the avoidable crossing is removed');
// The bundled World nests its areas, so it keeps its supplied order.
assert.deepEqual(crossings['bundled/before'], { before: 5, after: 5 }, 'nested areas keep their supplied order');
assert.ok(Object.values(crossings).reduce((sum, item) => sum + item.before - item.after, 0) > 0, 'total crossings decrease');
assert.throws(() => projectWorldScene({ input: statusInput, frame: statusInput.frames[0], ordering: 'names' }), /unsupported ordering/);

// The planned side (予定 ▸) says nothing has happened: no done/happened
// words, and it names itself as plans, not facts.
const FUTURE_FACT_WORDS = /完了|起きた|済み|達成/u;
let futureLines = 0;
for (const world of [parseAtlasWorldInput(worldWithFrames(3)), parseAtlasWorldInput(planWorld())]) {
  const lines = forecastLines(world.frames);
  assert.ok(lines[0].includes('計画であって事実ではない'), 'the planned side names itself: ' + lines[0]);
  for (const line of lines) {
    assert.equal(FUTURE_FACT_WORDS.test(line), false, 'future side says nothing happened: ' + line);
    futureLines += 1;
  }
}
console.log(JSON.stringify({ status: 'atlas-world-readability-checks-pass', statusCases, crossings, futureLines }));
