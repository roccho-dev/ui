// Supplied plans (frames[i].plans): read exactly, never a fact. With a gap
// they are lines of 理想状態 (S7: an attribute of the ideal state); a World
// without a gap draws none. Pure; no browser. The browser journey is the
// time-axis proof.
import assert from 'node:assert/strict';
import { parseAtlasWorldInput, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { knownPlan, planWorld, unknownPlan } from './fixtures/atlas-plan-worlds.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
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

// 理想状態 names, for each case, the plans of the frame: nothing when none is
// declared (no unbound plan either), none in force, or one line per plan (label · serves · content · source).
const frameAt = index => index === 0 ? worldPair(input).before : worldPair(input, index).after;
const idealWith = plans => {
  const raw = gapWorld();
  if (plans !== undefined) raw.frames[4].plans = plans;
  return parseAtlasWorldInput(raw).frames[4].entities.find(entity => entity.ref.kind === 'ideal-state').label.split('\n').slice(2);
};
let cases = 0;
for (const [plans, lines] of [[undefined, []], [null, []], [[], ['計画：有効な計画 0 件']],
  [[structuredClone(knownPlan), structuredClone(unknownPlan)], ['計画：2 件',
    '計画 windows repo 退役の閉包グラフ（resources#25 v3） · 寄与 refactor-windows-retired · 内容 ノード 2 件 · 出所 resources#25 comment 4411',
    '計画 Atlas 閉包グラフ（adrs#646 v1） · 寄与 atlas-hq-loop、input-semcmp · 内容 UNKNOWN · 出所 adrs#646']]]) {
  assert.deepEqual(idealWith(plans), lines, JSON.stringify(plans)?.slice(0, 40) ?? 'absent');
  cases += 1;
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
