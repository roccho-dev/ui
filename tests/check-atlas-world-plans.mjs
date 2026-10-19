// Supplied plans (frames[i].plans) in the timeline. Pure; no browser. The
// browser journey is tests/atlas-world-plan-browser-proof.mjs.
import assert from 'node:assert/strict';
import { parseAtlasWorldInput, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { PLAN_NONE, PLAN_UNDECLARED, TIMELINE_ID_PREFIX, fitCellLabel, planDetailLines, planSummary } from '../packages/control/src/atlas-timeline.mjs';
import { linePx } from '../packages/control/src/atlas-text.mjs';
import { PLAN_SHA, knownPlan, planWorld, unknownPlan } from './fixtures/atlas-plan-worlds.mjs';
import { worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

// Contract parsing: absent stays absent, null and [] are kept apart.
const input = parseAtlasWorldInput(planWorld());
assert.equal(input.frames[0].plans, null, 'null is undeclared');
assert.deepEqual(input.frames[1].plans, [], '[] is declared with none in force');
assert.equal(input.frames[2].plans.length, 2);
assert.equal(input.frames[2].plans[1].nodes, null, 'nodes null stays unknown, not empty');
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(input))), input, 'normalized plans are stable');
assert.equal(Object.hasOwn(parseAtlasWorldInput(worldWithFrames(2)).frames[0], 'plans'), false, 'a frame without plans normalizes as before');
const reject = (mutate, pattern) => { const raw = planWorld(); mutate(raw.frames[2].plans); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
reject(plans => plans.push(structuredClone(knownPlan)), /duplicate plan id/);
reject(plans => { plans[0].status = 'done'; }, /unknown field status/);
reject(plans => { plans[0].nodes = {}; }, /nodes must be an array or null/);
reject(plans => { plans[0].version = -1; }, /version must be a non-negative integer/);

// The plan cell's line for each case.
assert.equal(planSummary(null), PLAN_UNDECLARED);
assert.equal(planSummary(undefined), PLAN_UNDECLARED);
assert.equal(planSummary([]), PLAN_NONE);
assert.equal(planSummary(input.frames[2].plans), '予定 2 件・内容 UNKNOWN 1', 'count and unknown-content count; sources go to the detail');
assert.equal(planSummary([structuredClone(knownPlan)]), '予定 1 件');

// Every timeline cell's drawn label fits its cell at the label estimate, at
// every checked width and in a narrow one where the short variants are used.
for (const width of [1280, 1500, 1920, 760]) {
  for (const chrome of ['none', 'full']) for (const index of [0, 1, 2]) {
    const frame = index === 0 ? worldPair(input).before : worldPair(input, index).after;
    const projection = projectAtlasWorld({ input, frame, latest: index === 2, chrome, selected: 'none', viewport: { width, height: 900 } });
    // Default camera (scale 1): bounds are screen pixels.
    for (const item of projection.scene.representations.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX))) {
      assert.ok(linePx(item.label) + 24 <= item.bounds.width + 1e-9,
        width + ' ' + chrome + ' frame ' + index + ': ' + item.regionId + ' fits: ' + item.label);
    }
  }
}
assert.equal(fitCellLabel(['long label here', 'short'], 10), 'short', 'nothing fits: the shortest variant');

// Each displayed frame shows its own plans; the detail opens per plan.
const frameAt = index => index === 0 ? worldPair(input).before : worldPair(input, index).after;
const cell = (projection, part) => projection.scene.representations.find(item => item.regionId === TIMELINE_ID_PREFIX + part);
const lines = projection => projection.scene.representations.filter(item => item.regionId.startsWith(TIMELINE_ID_PREFIX + 'plan-line:'))
  .sort((a, b) => a.atlas.line - b.atlas.line).map(item => item.label.replace(/\n/gu, ''));
const expected = [PLAN_UNDECLARED, PLAN_NONE, planSummary(input.frames[2].plans)];
let cases = 0;
for (const chrome of ['none', 'full']) {
  for (let index = 0; index < 3; index += 1) {
    const frame = frameAt(index);
    const closed = projectAtlasWorld({ input, frame, latest: index === 2, chrome, selected: 'none' });
    // The chrome-free view draws no strip, so no plan cell or rows (未設計のため。設計の合意後に戻す).
    if (chrome === 'none') {
      assert.equal(cell(closed, 'plan'), undefined, 'none: no plan cell');
      assert.equal(lines(projectAtlasWorld({ input, frame, latest: index === 2, chrome, selected: 'none', planOpen: true })).length, 0, 'none: no plan rows');
      continue;
    }
    assert.equal(cell(closed, 'plan').label, expected[index] + ' · 詳細', chrome + ' frame ' + index + ': plan line');
    assert.equal(cell(closed, 'plan').activation.type, 'atlas.world.plan-toggle');
    assert.equal(cell(closed, 'plan').visual.appearance.dashed, true, 'the plan keeps the dashed plan look');
    assert.equal(lines(closed).length, 0, 'closed: no detail rows');
    const open = projectAtlasWorld({ input, frame, latest: index === 2, chrome, selected: 'none', planOpen: true });
    assert.equal(cell(open, 'plan').label, expected[index] + ' · 閉じる');
    assert.deepEqual(lines(open), planDetailLines(frame.plans ?? null).map(line => line.replace(/\n/gu, '')), 'open: one row per detail line, whole');
    for (const row of open.scene.representations.filter(item => item.regionId.startsWith(TIMELINE_ID_PREFIX + 'plan-line:'))) {
      assert.ok(row.bounds.y + row.bounds.height <= cell(open, 'plan').bounds.y, 'rows sit above the strip');
      assert.equal(row.visual.appearance.dashed, true, 'rows use the plan look');
    }
    cases += 1;
  }
}
const detail = planDetailLines(input.frames[2].plans).join('\n');
for (const fact of ['refactor-windows-retired', 'atlas-hq-loop、input-semcmp', 'resources#25 · comment 4411', PLAN_SHA,
  '内容：ノード 2 件 · 辺 1 件', '内容 UNKNOWN：marker 付きの節が見つからない', 'adrs#646 · comment UNKNOWN', 'sha256 UNKNOWN', knownPlan.plan, unknownPlan.label]) {
  assert.ok(detail.includes(fact), 'detail names ' + fact);
}

// A plan is never a fact: removing the plans changes nothing but the strip.
const bare = parseAtlasWorldInput(worldWithFrames(3));
for (let index = 0; index < 3; index += 1) {
  const withPlans = frameAt(index);
  const withoutPlans = index === 0 ? worldPair(bare).before : worldPair(bare, index).after;
  assert.deepEqual(projectWorldScene({ input, frame: withPlans }), projectWorldScene({ input: bare, frame: withoutPlans }), 'scene ignores plans');
  const a = projectAtlasWorld({ input, frame: withPlans, selected: 'none' });
  const b = projectAtlasWorld({ input: bare, frame: withoutPlans, selected: 'none' });
  for (const key of ['coverage', 'selected', 'direction', 'world', 'omittedRelationIds', 'omittedEntityIds']) assert.deepEqual(a[key], b[key], key + ' ignores plans');
}
console.log(JSON.stringify({ status: 'atlas-world-plans-checks-pass', cases }));
