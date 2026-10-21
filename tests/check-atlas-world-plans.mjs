// Supplied plans (frames[i].plans): read exactly, never a fact, listed by
// 予定 ▸. Pure; no browser. The browser journey is the status proof.
import assert from 'node:assert/strict';
import { parseAtlasWorldInput, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { PLAN_NONE, PLAN_UNDECLARED, forecastLines, planDetailLines, planSummary } from '../packages/control/src/atlas-timeline.mjs';
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

// 予定 ▸ lists the latest frame's plans, one line per fact (planDetailLines).
const frameAt = index => index === 0 ? worldPair(input).before : worldPair(input, index).after;
assert.deepEqual(planDetailLines(null), [PLAN_UNDECLARED]);
assert.deepEqual(planDetailLines([]), [PLAN_NONE]);
assert.deepEqual(forecastLines(input.frames).slice(1, -1), planDetailLines(input.frames[2].plans), '予定 ▸ carries the latest plans as their detail lines');
let cases = 3;
const detail = planDetailLines(input.frames[2].plans).join('\n');
for (const fact of ['refactor-windows-retired', 'atlas-hq-loop、input-semcmp', 'resources#25 · comment 4411', PLAN_SHA,
  '内容：ノード 2 件 · 辺 1 件', '内容 UNKNOWN：marker 付きの節が見つからない', 'adrs#646 · comment UNKNOWN', 'sha256 UNKNOWN', knownPlan.plan, unknownPlan.label]) {
  assert.ok(detail.includes(fact), 'detail names ' + fact);
}

// A plan is never a fact: removing the plans changes nothing drawn (this
// World has no gap, so no 理想状態 box names them).
const bare = parseAtlasWorldInput(worldWithFrames(3));
for (let index = 0; index < 3; index += 1) {
  const withPlans = frameAt(index);
  const withoutPlans = index === 0 ? worldPair(bare).before : worldPair(bare, index).after;
  assert.deepEqual(projectWorldScene({ input, frame: withPlans }), projectWorldScene({ input: bare, frame: withoutPlans }), 'scene ignores plans');
  const a = projectAtlasWorld({ input, frame: withPlans, selected: 'none' });
  const b = projectAtlasWorld({ input: bare, frame: withoutPlans, selected: 'none' });
  for (const key of ['coverage', 'scene', 'world', 'omittedRelationIds', 'omittedEntityIds']) assert.deepEqual(a[key], b[key], key + ' ignores plans');
}
console.log(JSON.stringify({ status: 'atlas-world-plans-checks-pass', cases }));
