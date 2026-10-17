// The gap view on adrs#647 contract v3-v6 (frames[i].gap / phase / journal /
// matched_until). Pure; no browser. The drawn journey, the band and the ui
// clock are tests/atlas-world-gap-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityKey, parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { TIMELINE_ID_PREFIX } from '../packages/control/src/atlas-timeline.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';

const input = parseAtlasWorldInput(gapWorld());
const byKind = frame => Object.fromEntries(frame.entities.map(item => [item.ref.kind + ':' + item.ref.id, item.label]));
const frame = id => input.frames.find(item => item.id === id);
const byKindKeys = item => item.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id);
const expected = {
  t0: { 'phase:hq': '局面：目的変更 · 差 不明', 'gap:hq': '差 不明\n照らし合わせる理想状態がまだ無い', 'current-state:hq': '現在状態\n観測の仕訳なし',
    'purpose:hq': '目的\n宣言だけで回る組織\nrev 1' },
  t1: { 'phase:hq': '局面：定義中 · 差 不明', 'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（定義中）' },
  t2: { 'phase:hq': '局面：一致・維持 · 新規 0 · 次の鮮度切れ 02:41Z', 'ideal-state:hq': '理想状態\nv1 · 条件 2（追加 0 · 改訂 0）',
    'gap:hq': '差 0（前 不明） · ✓2 ?0 !0\n理想の側 追加 0・改訂 0 · 現在の側 後退 0・未観測 0', 'current-state:hq': '現在状態\n観測 1 件 · 最新 01:40Z' },
  t3: { 'phase:hq': '局面：近似中 · 差 1 · v2', 'ideal-state:hq': '理想状態\nv1→v2 移動 · 条件 3（追加 1 · 改訂 0）',
    'gap:hq': '差 1（前 0） · ✓2 ?0 !1\n理想の側 追加 1・改訂 0 · 現在の側 後退 0・未観測 1', 'current-state:hq': '現在状態\n観測 1 件 · 最新 01:40Z',
    'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 過去の評価：理想状態が不十分',
    'gap-part:c3': 'windows repo を退役する\n未達 · 理想に追加 · 未観測 · この時点から（03:00Z） · scope:atlas' },
  t4: { 'phase:hq': '局面：近似中 · 差 3 · v2', 'gap:hq': '差 3（前 1） · ✓1 ?1 !2\n理想の側 追加 0・改訂 0 · 現在の側 後退 1・未観測 1 · 継続 1',
    'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z',
    'gap-part:c3': 'windows repo を退役する\n未達 · 継続 · 1 時点前から（03:00Z） · scope:atlas',
    'gap-part:c1': '端末で直接入力できる\n未達 · 現在の後退 · この時点から（04:00Z） · 担当なし' },
  t5: { 'phase:hq': '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z · 理想状態の確定前の観測で一致 1 件', 'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 評価：到達',
    'gap:hq': '差 0（前 3） · ✓4 ?0 !0\n理想の側 追加 0・改訂 0 · 現在の側 後退 0・未観測 0', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z', 'gap-closed:t5': '閉じた差 3（この時点 3）\nc1 現在が充足・c4 現在が充足' },
  t6: { 'phase:hq': '局面：近似中 · 差 2 · v2', 'gap:hq': '差 2（前 0） · ✓2 ?1 !1\n理想の側 追加 0・改訂 0 · 現在の側 後退 0・未観測 0・照合不能 1・鮮度切れ 1',
    'gap-part:c4': 'envs のスコープ主張\n不明 · 照合不能 · この時点から（06:00Z） · scope:envs' },
  t7: { 'phase:hq': '局面：目的の終了 · Scope は凍結（履歴）', 'gap:hq': '差 対象外\n目的は終了した',
    'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（目的は終了）', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z',
    'gap-closed:t7': '閉じた差 4（この時点 1）\nc4 現在が充足・c1 目的の終了' },
};
for (const item of input.frames) {
  const drawn = byKind(item);
  for (const [key, label] of Object.entries(expected[item.id])) assert.equal(drawn[key], label, item.id + ' ' + key);
  // Scopes are exactly the open parts (plus the history node once anything closed).
  const scopes = item.entities.filter(entity => entity.area === 'scopes' && entity.ref.kind === 'gap-part').map(entity => entity.ref.id);
  assert.deepEqual(scopes, (item.gap?.parts ?? []).map(part => part.condition), item.id + ': Scopes are the open parts');
  // The purpose is never given a satisfaction mark, in data or drawn.
  const purposeNode = item.entities.find(entity => entity.ref.kind === 'purpose');
  assert.deepEqual(purposeNode.flags, ['gap-view'], item.id + ': purpose has no status flag');
  assert.equal(projectWorldScene({ input, frame: item }).representations.find(rep => rep.atlas?.ref?.kind === 'purpose').label,
    purposeNode.label, item.id + ': purpose drawn without a symbol');
  // No ideal state (parts null): unknown, never zero.
  if (item.gap.parts === null) assert.ok(!Object.values(drawn).some(label => /差 0/u.test(label)), item.id + ': parts null never reads 差 0');
  assert.deepEqual(item.entities.filter(entity => entity.area === 'agents').map(entity => entity.ref.id), ['atlas.W', 'envs.W']);
}
// v5: the verdict (✓?!) is on 差, never on 現在状態; when only the ideal
// moves (t2 -> t3), the current-state line does not change.
assert.equal(byKind(frame('t3'))['current-state:hq'], byKind(frame('t2'))['current-state:hq'], 'ideal-only move leaves 現在状態 unchanged');
for (const item of input.frames) assert.ok(!/[✓?!]\d/u.test(byKind(item)['current-state:hq']), item.id + ': no verdict on 現在状態');
// The before-ideal count is of observations older than the ideal.set: the
// wording says so whether only the ideal moved or the purpose changed.
for (const newPurpose of [false, true]) {
  const story = parseAtlasWorldInput(gapWorld({ newPurpose }));
  const t5 = story.frames.find(item => item.id === 't5').entities.find(item => item.ref.kind === 'phase').label;
  assert.ok(t5.endsWith(' · 理想状態の確定前の観測で一致 1 件') && !t5.includes('目的の変更前'), (newPurpose ? 'new purpose' : 'ideal only') + ': ' + t5);
}
// v6: a part shows the cause of each side it has; the earlier single list is
// still read and, split by the cause names, drawn the same.
const legacy = parseAtlasWorldInput(gapWorld({ sides: false }));
for (const item of legacy.frames) assert.deepEqual(byKind(item), byKind(frame(item.id)), item.id + ': cause list draws as the sides');
const sided = gapWorld();
sided.frames[3].gap.parts[0].cause = { ideal: ['ideal-added'], current: [] };
sided.frames[3].gap.summary.by_cause = { 'ideal-added': 1 };
assert.equal(byKind(parseAtlasWorldInput(sided).frames[3])['gap-part:c3'], 'windows repo を退役する\n未達 · 理想に追加 · この時点から（03:00Z） · scope:atlas',
  'one side only: that side alone');
// v6: the journal is accumulated from each frame's new entries, up to the
// frame shown; going back draws that frame's own total.
assert.deepEqual(input.frames.map(item => item.journal.length), [1, 1, 2, 2, 2, 1, 0, 0], 'each frame carries only its new entries');
assert.equal(byKind(frame('t3'))['current-state:hq'], '現在状態\n観測 1 件 · 最新 01:40Z', 't3: the 03:40Z observation is not yet counted');
// A frame that carries an earlier frame's entry again (a producer still on the
// whole list) is refused, never counted twice.
const cumulative = gapWorld();
cumulative.frames.forEach((item, index) => { item.journal = cumulative.frames.slice(0, index + 1).flatMap(each => structuredClone(each.journal)); });
assert.throws(() => parseAtlasWorldInput(cumulative), /t1: journal\[0\] repeats an entry of frame t0/);
// A Scope area the frame supplies (nested per owner, K8) is kept as supplied,
// with its containment; Scopes are derived from the parts only otherwise. The
// purpose area is drawn from the gap either way.
const grouped = parseAtlasWorldInput(gapWorld({ groups: true }));
for (const item of grouped.frames) {
  const raw = gapWorld({ groups: true }).frames.find(each => each.id === item.id);
  const suppliedScopes = raw.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id);
  const drawnScopes = item.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id);
  if (suppliedScopes.length) {
    assert.deepEqual(drawnScopes, suppliedScopes, item.id + ': supplied Scopes kept as supplied');
    assert.equal(item.relations.filter(relation => relation.containment).length, raw.relations.filter(relation => relation.containment).length, item.id + ': containment kept');
  } else assert.deepEqual(drawnScopes, byKindKeys(frame(item.id)), item.id + ': no supplied Scopes: derived from the parts');
  assert.deepEqual(item.entities.filter(entity => entity.area === 'purpose').map(entity => entity.label),
    frame(item.id).entities.filter(entity => entity.area === 'purpose').map(entity => entity.label), item.id + ': purpose area from the gap');
}
assert.ok(grouped.frames.some(item => item.relations.some(relation => relation.containment)), 'the grouped fixture supplies containment');
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(grouped))), grouped, 'grouped gap view is idempotent');
// v5: unmatchable is its own cause, not unobserved.
assert.ok(/照合不能 1/u.test(byKind(frame('t6'))['gap:hq']) && /未観測 0/u.test(byKind(frame('t6'))['gap:hq']));
// History stays: c3/c1/c4 closed at t5 are still listed at t6.
assert.equal(byKind(frame('t6'))['gap-closed:t6'], '閉じた差 3（この時点 0）\nc1 現在が充足・c4 現在が充足');

// The ui clock: past matched_until, the present matched frame reads stale;
// before it, or for a frame that is not the present, it does not.
const matchedNow = parseAtlasWorldInput(gapWorld({ through: 't5' }));
const phaseLabel = (world, id, now) => projectAtlasWorld({ input: world, frame: world.frames.find(item => item.id === id), selected: 'none', now, chrome: 'none' })
  .scene.representations.find(rep => rep.atlas?.ref?.kind === 'phase').label.replace(/\s+/gu, ' ');
assert.equal(phaseLabel(matchedNow, 't5', Date.parse('2026-10-17T05:40:59Z')), '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z · 理想状態の確定前の観測で一致 1 件');
assert.equal(phaseLabel(matchedNow, 't5', Date.parse('2026-10-17T05:41:01Z')), '? · 局面：一致・維持 → 鮮度切れ・最新か不明（05:41Z を過ぎた）');
assert.equal(phaseLabel(matchedNow, 't2', Date.parse('2026-10-17T05:41:01Z')), '局面：一致・維持 · 新規 0 · 次の鮮度切れ 02:41Z', 'a past frame is not judged by today');

// The band: phase segments merge, journal marks group per frame and kind,
// and a mark opens its entries' kind, time, author and source.
const band = projectAtlasWorld({ input, frame: frame('t6'), selected: 'none', chrome: 'none', journalOpen: '3:purpose.evaluated' })
  .scene.representations.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX));
const segments = band.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX + 'phase:')).map(rep => rep.atlas.fullLabel);
assert.deepEqual(segments, ['目的変更', '定義中', '一致・維持', '近似中', '一致・維持', '近似中', '目的の終了'], 'phase segments in order');
const marks = band.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX + 'journal:') && !rep.regionId.includes('-line')).map(rep => rep.atlas.group + '=' + rep.label);
assert.ok(marks.includes('0:purpose.set=◎1') && marks.includes('2:ideal.set=▲1') && marks.includes('3:purpose.evaluated=★1'), JSON.stringify(marks));
// v6: each entry is marked at the frame that carries it.
assert.ok(marks.includes('2:observation=·1') && marks.includes('4:observation=·1') && marks.includes('4:plan.set=◇1'), JSON.stringify(marks));
const rows = band.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX + 'journal-line:')).map(rep => rep.label.replace(/\n/gu, ''));
assert.deepEqual(rows, ['★ 評価 · 2026-10-17T02:50:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530 · sha256 ' + 'a'.repeat(64)]);

// A digest revision is shown short and named so; the whole value stays in the record.
const digest = gapWorld();
digest.frames[3].gap.basis.purpose_rev = 'sha256:' + 'c20f8992'.repeat(8);
const digestNode = parseAtlasWorldInput(digest).frames[3].entities.find(item => item.ref.kind === 'purpose');
assert.match(digestNode.label, /\nrev c20f8992（短縮）/u);
assert.ok(digestNode.summary.includes('sha256:' + 'c20f8992'.repeat(8)), 'full digest in the record');
// A supplied gap.basis.purpose_label is the purpose's text; an unnamed author
// is shown as unknown, never guessed.
const named = gapWorld();
named.frames[3].gap.basis.purpose_label = '人は目的を宣言するだけ';
named.frames[0].journal[0].actor = null;
const namedInput = parseAtlasWorldInput(named);
assert.equal(byKind(namedInput.frames[3])['purpose:hq'], '目的\n人は目的を宣言するだけ\nrev 1 · 過去の評価：理想状態が不十分');
const unnamedRow = projectAtlasWorld({ input: namedInput, frame: namedInput.frames[3], selected: 'none', chrome: 'none', journalOpen: '0:purpose.set' })
  .scene.representations.find(rep => rep.regionId === TIMELINE_ID_PREFIX + 'journal-line:0');
assert.match(unnamedRow.label.replace(/\n/gu, ''), /作者 不明/u);
// Without a label, a part's headline is its condition id.
const unlabeled = gapWorld();
delete unlabeled.frames[3].gap.parts[0].label;
assert.match(byKind(parseAtlasWorldInput(unlabeled).frames[3])['gap-part:c3'], /^c3\n/u);

// Normalizing a normalized World changes nothing; a World without gap is untouched.
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(input))), input, 'gap view is idempotent');
const plain = JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8'));
const parsedPlain = parseAtlasWorldInput(plain);
assert.ok(parsedPlain.frames.every(item => !Object.hasOwn(item, 'gap')), 'no gap: frames as supplied');
assert.deepEqual(parsedPlain.frames.map(item => item.entities.map(entity => entityKey(entity.ref))),
  plain.frames.map(item => item.entities.map(entity => entityKey(entity.ref))), 'no gap: entities as supplied');

// The contract is read exactly; anything else is rejected.
const reject = (mutate, pattern) => { const raw = gapWorld(); mutate(raw.frames[4]); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
reject(item => { item.gap.parts[0].state = 'satisfied'; }, /state must be unmet\|unknown/);
reject(item => { item.gap.parts[0].cause = []; }, /cause must be a non-empty array/);
reject(item => { item.gap.parts[0].cause = ['guessed']; }, /unknown cause guessed/);
reject(item => { item.gap.parts[1].cause = {}; }, /must name a cause on at least one side/);
reject(item => { item.gap.parts[1].cause = { ideal: 'current-stale' }; }, /cause.ideal must be/);
reject(item => { item.gap.parts[1].cause = { current: 'ideal-added' }; }, /cause.current must be/);
reject(item => { item.gap.parts[1].cause = { ideal: ['ideal-added', 'ideal-revised'] }; }, /cause.ideal must hold at most one cause/);
reject(item => { item.gap.parts[1].cause = { ideal: 'carried', current: 'current-stale' }; }, /carried stands only when neither side has another cause/);
reject(item => { item.gap.parts[1].cause = { current: 'current-stale', guess: 'x' }; }, /unknown field guess/);
reject(item => { item.gap.parts[0].plans = []; }, /unknown field plans/);
reject(item => { item.gap.parts[1].since = 'later'; }, /since must name this or an earlier frame/);
reject(item => { item.gap.basis.prev_frame = 't9'; }, /prev_frame must name an earlier frame/);
reject(item => { item.gap.closed.push({ condition: 'c9', at: 't4', by: 'guessed' }); }, /by must be/);
reject(item => { delete item.gap.summary; }, /summary is required/);
reject(item => { item.phase = 'done'; }, /phase must be/);
reject(item => { item.journal[0].kind = 'guess'; }, /kind must be/);
reject(item => { item.journal[0].recordedAt = 'yesterday'; }, /recordedAt must be a parseable instant/);
// v4: parts null goes with no ideal version and no open count.
reject(item => { item.gap.parts = null; }, /parts and basis.ideal_version must both be null or both be present/);
const rejectT1 = (mutate, pattern) => { const raw = gapWorld(); mutate(raw.frames[1]); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
rejectT1(item => { item.gap.summary.open = 0; }, /summary.open must be null when parts is null/);
rejectT1(item => { item.gap.closed.push({ condition: 'c9', at: 't1', by: 'purpose-gone' }); }, /by must be/);

// A phase that disagrees with the gap is shown as disagreeing.
const off = gapWorld();
off.frames[4].phase = 'matched';
assert.equal(byKind(parseAtlasWorldInput(off).frames[4])['phase:hq'], '局面：一致・維持 · 新規 0 · 次の鮮度切れ 不明 · gap と不整合');
// A summary that disagrees with the parts is shown as disagreeing.
const offSummary = gapWorld();
offSummary.frames[4].gap.summary.open = 9;
assert.match(byKind(parseAtlasWorldInput(offSummary).frames[4])['gap:hq'], /^差 3（前 1） · ✓1 \?1 !2 · 集計不一致\n/u);
// Plans never enter the gap view.
const planned = gapWorld();
planned.frames[3].plans = [];
assert.deepEqual(parseAtlasWorldInput(planned).frames[3].entities, frame('t3').entities, 'plans change no gap entity');
console.log(JSON.stringify({ status: 'atlas-world-gap-checks-pass', frames: input.frames.length }));
