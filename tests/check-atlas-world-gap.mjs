// The gap view (frames[i].gap). Pure; no browser. The drawn journey is
// tests/atlas-world-gap-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityKey, parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';

const input = parseAtlasWorldInput(gapWorld());
const labels = frame => Object.fromEntries(frame.entities.map(item => [item.ref.kind + ':' + item.ref.id, item.label]));
const expected = {
  t0: { 'ideal-state:hq': '理想状態\nv1 · 追加 0 · 改訂 0', 'gap:hq': '差 0（初回）\n理想の移動 0・現在の後退 0・未観測 0',
    'current-state:hq': '現在状態\n00:00Z · ?0 !0 · ✓ 未供給', 'purpose:hq': '目的\nhq · rev 1' },
  t1: { 'ideal-state:hq': '理想状態\nv1→v2 移動 · 追加 1 · 改訂 0', 'gap:hq': '差 1（前 0）\n理想の移動 1・現在の後退 0・未観測 0',
    'current-state:hq': '現在状態\n01:00Z · ?0 !1 · ✓ 未供給', 'gap-part:c3': 'c3\n未達 · 理想に追加 · since t1 · scope:atlas' },
  t2: { 'ideal-state:hq': '理想状態\nv2 · 追加 0 · 改訂 0', 'gap:hq': '差 3（前 1）\n理想の移動 0・現在の後退 1・未観測 1・継続 1',
    'gap-part:c1': 'c1\n未達 · 現在の後退 · since t2 · 担当なし', 'gap-part:c4': 'c4\n不明 · 未観測 · since t2 · scope:envs' },
  t3: { 'gap:hq': '差 2（前 3）\n理想の移動 0・現在の後退 0・未観測 0・継続 2', 'gap-closed:t3': '閉じた差 1（この時点 1）\nc3 現在が充足' },
};
for (const frame of input.frames) {
  const drawn = labels(frame);
  for (const [key, label] of Object.entries(expected[frame.id])) assert.equal(drawn[key], label, frame.id + ' ' + key);
  // Scopes are exactly the open parts (plus the history node once anything closed).
  const scopes = frame.entities.filter(item => item.area === 'scopes').map(item => item.ref.kind + ':' + item.ref.id);
  assert.deepEqual(scopes.filter(key => key.startsWith('gap-part:')), frame.gap.parts.map(part => 'gap-part:' + part.condition), frame.id + ': Scopes are the open parts');
  // The purpose is never given a satisfaction mark.
  const purposeNode = frame.entities.find(item => item.ref.kind === 'purpose');
  assert.deepEqual(purposeNode.flags, [], frame.id + ': purpose has no status');
  const projected = projectWorldScene({ input, frame }).representations.find(item => item.atlas?.ref?.kind === 'purpose');
  assert.equal(projected.label, purposeNode.label, frame.id + ': purpose drawn without a symbol');
  // Other areas keep their supplied entities.
  assert.deepEqual(frame.entities.filter(item => item.area === 'agents').map(item => item.ref.id), ['atlas.W', 'envs.W']);
}
// t1 against t0: the current-state observation is the same kind of reading,
// the ideal moved, and the whole gap is attributed to the ideal's move.
assert.match(labels(input.frames[1])['ideal-state:hq'], /v1→v2/u);
assert.match(labels(input.frames[1])['gap:hq'], /^差 1（前 0）\n理想の移動 1・現在の後退 0/u);
// History is cumulative and never erased.
assert.ok(input.frames[3].entities.some(item => item.ref.kind === 'gap-closed'));
assert.ok(!input.frames[2].entities.some(item => item.ref.kind === 'gap-closed'), 'no history node before anything closed');

// Normalizing a normalized World changes nothing; a World without gap is untouched.
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(input))), input, 'gap view is idempotent');
const plain = JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8'));
const parsedPlain = parseAtlasWorldInput(plain);
assert.ok(parsedPlain.frames.every(frame => !Object.hasOwn(frame, 'gap')), 'no gap: frames as supplied');
assert.deepEqual(parsedPlain.frames.map(frame => frame.entities.map(item => entityKey(item.ref))),
  plain.frames.map(frame => frame.entities.map(item => entityKey(item.ref))), 'no gap: entities as supplied');

// The contract is read exactly; anything else is rejected.
const reject = (mutate, pattern) => { const raw = gapWorld(); mutate(raw.frames[2].gap); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
reject(gap => { gap.parts[0].state = 'satisfied'; }, /state must be unmet\|unknown/);
reject(gap => { gap.parts[0].cause = []; }, /cause must be a non-empty array/);
reject(gap => { gap.parts[0].cause = ['guessed']; }, /unknown cause guessed/);
reject(gap => { gap.parts[0].plans = []; }, /unknown field plans/);
reject(gap => { gap.parts[1].since = 'later'; }, /since must name this or an earlier frame/);
reject(gap => { gap.basis.prev_frame = 't9'; }, /prev_frame must name an earlier frame/);
reject(gap => { gap.closed.push({ condition: 'c9', at: 't2', by: 'guessed' }); }, /by must be/);
reject(gap => { delete gap.summary; }, /summary is required/);

// A summary that disagrees with the parts is shown as disagreeing; counts come
// from the parts.
const off = gapWorld();
off.frames[2].gap.summary.open = 9;
const offLabels = labels(parseAtlasWorldInput(off).frames[2]);
assert.equal(offLabels['gap:hq'], '差 3（前 1） · 集計不一致\n理想の移動 0・現在の後退 1・未観測 1・継続 1');

// Plans never enter the gap view.
const planned = gapWorld();
planned.frames[1].plans = [];
assert.deepEqual(parseAtlasWorldInput(planned).frames[1].entities, input.frames[1].entities, 'plans change no gap entity');
console.log(JSON.stringify({ status: 'atlas-world-gap-checks-pass', frames: input.frames.length }));
