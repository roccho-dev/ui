// Readability checks for the World projection. Pure; no browser. Rendered text
// (overlap, empty and cut labels) is tests/atlas-world-readability-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtlasWorldInput, worldPair } from '../packages/control/src/atlas-world.mjs';
import { ATLAS_STATUS, projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { TIMELINE_ID_PREFIX } from '../packages/control/src/atlas-timeline.mjs';
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

// The planned side says nothing has happened: no done/happened words and no
// fact colors, only the dashed plan look.
const FUTURE_FACT_WORDS = /完了|起きた|済み|達成/u;
const timelineInput = parseAtlasWorldInput(worldWithFrames(3));
let futureCells = 0;
for (const [index, latest] of [[0, false], [1, false], [2, true]]) {
  const pair = index === 0 ? worldPair(timelineInput) : worldPair(timelineInput, index);
  const frame = index === 0 ? pair.before : pair.after;
  for (const chrome of ['none', 'full']) {
    const cells = projectAtlasWorld({ input: timelineInput, frame, latest, chrome, selected: 'none' }).scene.representations
      .filter(item => item.regionId.startsWith(TIMELINE_ID_PREFIX));
    // The chrome-free view draws no strip (未設計のため。設計の合意後に戻す).
    if (chrome === 'none') { assert.equal(cells.length, 0, 'none: no strip'); continue; }
    const plan = cells.find(item => item.regionId === TIMELINE_ID_PREFIX + 'plan');
    assert.ok(plan.label.startsWith('予定') && plan.visual.appearance.dashed, 'the plan reads 予定 and is dashed');
    assert.ok(!Object.values(ATLAS_STATUS).some(item => item.appearance.fillColor === plan.visual.appearance.fillColor
      && item.appearance.strokeColor === plan.visual.appearance.strokeColor), 'the plan uses no status color');
    for (const item of cells.filter(cell => ['forward', 'plan'].some(part => cell.regionId === TIMELINE_ID_PREFIX + part))) {
      assert.equal(FUTURE_FACT_WORDS.test(item.label), false, 'future side says nothing happened: ' + item.label);
      futureCells += 1;
    }
  }
}
console.log(JSON.stringify({ status: 'atlas-world-readability-checks-pass', statusCases, crossings, futureCells }));
