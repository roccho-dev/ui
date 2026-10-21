// The gap view on adrs#647 contract v3-v6 (frames[i].gap / phase / journal /
// matched_until). Pure; no browser. The drawn journey, the band and the ui
// clock are tests/atlas-world-gap-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { TIMELINE_ID_PREFIX, forecastLines, journalLines } from '../packages/control/src/atlas-timeline.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { knownPlan } from './fixtures/atlas-plan-worlds.mjs';

const input = parseAtlasWorldInput(gapWorld());
const byKind = frame => Object.fromEntries(frame.entities.map(item => [item.ref.kind + ':' + item.ref.id, item.label]));
const frame = id => input.frames.find(item => item.id === id);
const byKindKeys = item => item.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id);
const expected = {
  t0: { 'phase:hq': '局面：目的変更 · 差 不明', 'gap:hq': '差 不明\n照らし合わせる理想状態がまだ無い', 'current-state:hq': '現在状態\n観測の仕訳なし',
    'purpose:hq': '目的\n宣言だけで回る組織\nrev 1' },
  t1: { 'phase:hq': '局面：定義中 · 差 不明', 'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（定義中）' },
  // 理想状態: version and conditions (additions / revisions only when any). 差:
  // which conditions differ and why, nothing else. 現在状態: observations and
  // the contrast with the ideal state (how many conditions match).
  t2: { 'phase:hq': '局面：一致・維持 · 新規 0 · 次の鮮度切れ 02:41Z', 'ideal-state:hq': '理想状態\nv1 · 条件 2',
    'gap:hq': '差 0（前 不明）', 'current-state:hq': '現在状態\n観測 1 件 · 最新 01:40Z\n理想の条件 2 件のうち一致 2 件' },
  t3: { 'phase:hq': '局面：近似中 · 差 1 · v2', 'ideal-state:hq': '理想状態\nv1→v2 移動 · 条件 3（追加 1）',
    'gap:hq': '差 1（前 0）\n! c3 · 理想に追加 · 未観測', 'current-state:hq': '現在状態\n観測 1 件 · 最新 01:40Z\n理想の条件 3 件のうち一致 2 件',
    'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 過去の評価：理想状態が不十分',
    'gap-part:c3': 'windows repo を退役する\n未達 · 理想に追加 · 未観測 · この時点から（03:00Z） · scope:atlas' },
  t4: { 'phase:hq': '局面：近似中 · 差 3 · v2', 'ideal-state:hq': '理想状態\nv2 · 条件 4', 'gap:hq': '差 3（前 1）\n! c3 · 継続\n! c1 · 現在の後退\n? c4 · 未観測',
    'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z\n理想の条件 4 件のうち一致 1 件',
    'gap-part:c3': 'windows repo を退役する\n未達 · 継続 · 1 時点前から（03:00Z） · scope:atlas',
    'gap-part:c1': '端末で直接入力できる\n未達 · 現在の後退 · この時点から（04:00Z） · 担当未確定' },
  t5: { 'phase:hq': '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z · 理想状態の確定前の観測で一致 1 件', 'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 評価：到達',
    'gap:hq': '差 0（前 3）', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z\n理想の条件 4 件のうち一致 4 件', 'gap-closed:t5': '閉じた差 3（この時点 3）\nc1 現在が充足・c4 現在が充足' },
  t6: { 'phase:hq': '局面：近似中 · 差 2 · v2', 'gap:hq': '差 2（前 0）\n! c1 · 鮮度切れ\n? c4 · 照合不能',
    'gap-part:c4': 'envs のスコープ主張\n不明 · 照合不能 · この時点から（06:00Z） · scope:envs' },
  t7: { 'phase:hq': '局面：目的の終了 · Scope は凍結（履歴）', 'gap:hq': '差 対象外\n目的は終了した',
    'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（目的は終了）', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z',
    'gap-closed:t7': '閉じた差 4（この時点 1）\nc4 現在が充足・c1 目的の終了' },
};
for (const item of Object.values(expected)) if (item['gap:hq']) item['gap:hq'] = '理想↔現在の差\n' + item['gap:hq'];
// Contract 3 (revised, adrs#647 comment 6305441262): with no band on screen the
// phase line names when its phase began, the first received frame, going back
// from the one drawn, in the same phase. t4 is still in t3's approximation.
const PHASE_SINCE = { t0: '10-17 00:00Z', t1: '10-17 01:00Z', t2: '10-17 02:00Z', t3: '10-17 03:00Z', t4: '10-17 03:00Z', t5: '10-17 05:00Z',
  t6: '10-17 06:00Z', t7: '10-17 07:00Z' };
for (const [id, item] of Object.entries(expected)) item['phase:hq'] = item['phase:hq'].replace(/^(局面：[^ ]+)/u, '$1（' + PHASE_SINCE[id] + ' から）');
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
// No verdict mark on 現在状態; when only the ideal moves (t2 -> t3), its
// observations do not change, only its contrast with the (moved) ideal.
const observedLine = id => byKind(frame(id))['current-state:hq'].split('\n')[1];
assert.equal(observedLine('t3'), observedLine('t2'), 'ideal-only move leaves the observations unchanged');
for (const item of input.frames) assert.ok(!/[✓?!]\d/u.test(byKind(item)['current-state:hq']), item.id + ': no verdict on 現在状態');
// 差 draws the difference only: no satisfied count (that contrast is in
// 現在状態) and no counter that reads 0 below its heading and count lines.
for (const item of input.frames) {
  const delta = byKind(item)['gap:hq'];
  assert.ok(delta.startsWith('理想↔現在の差\n差 '), item.id + ': the second gap is named apart from the first: ' + delta);
  assert.ok(!/✓/u.test(delta) && !/[^\d（]0(?=[・ ）]|$)/u.test(delta.split('\n').slice(2).join('\n')), item.id + ': 差 is the difference only: ' + delta);
  assert.ok(!/（追加 0|改訂 0/u.test(byKind(item)['ideal-state:hq']), item.id + ': 理想状態 writes no zero count');
}
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
assert.equal(observedLine('t3'), '観測 1 件 · 最新 01:40Z', 't3: the 03:40Z observation is not yet counted');
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
// Each open part is shown on the one supplied Scope whose id is its scope or
// condition: its state, causes and since; 担当なし when it has no scope.
const groupedLabel = (id, entityKind, entityId) => grouped.frames.find(item => item.id === id).entities
  .find(entity => entity.ref.kind === entityKind && entity.ref.id === entityId).label;
assert.equal(groupedLabel('t4', 'semantic-scope', 'c3'), 'windows repo を退役する\n未達\n未達 · 継続 · 1 時点前から（03:00Z）');
assert.equal(groupedLabel('t4', 'unassigned-change', 'c1'), '端末で直接入力できる\n未達\n未達 · 現在の後退 · この時点から（04:00Z） · 担当未確定');
assert.equal(groupedLabel('t6', 'closed-change', 'c3@t5'), 'c3\ncurrent-satisfied', 'no open part: nothing attached');
assert.equal(groupedLabel('t6', 'scope-group', 'owner:none'), '担当なし', 'a container is not a part');
// An open part on no supplied Scope is counted on 差 (not when there is none)
// and its condition and causes are in 差's record, shown in its detail.
const unplacedWorld = parseAtlasWorldInput(gapWorld({ groups: 'unplaced' }));
const deltaOf = world => world.frames[4].entities.find(entity => entity.ref.kind === 'gap');
assert.match(deltaOf(unplacedWorld).label, /\nScope に付かない差 1 件$/u);
assert.ok(!deltaOf(grouped).label.includes('Scope に付かない差'), 'all placed: no unplaced line');
assert.ok(!byKind(frame('t4'))['gap:hq'].includes('Scope に付かない差'), 'derived Scopes: no unplaced line');
assert.match(deltaOf(unplacedWorld).summary, /Scope に付かない差: condition=c4 · state=unknown · cause=ideal:なし,current:current-unobserved/u);
const unplacedDetail = projectAtlasWorld({ input: unplacedWorld, frame: unplacedWorld.frames[4], selected: entityKey(deltaOf(unplacedWorld).ref) }).detail;
assert.ok(unplacedDetail.logicalLines.join('\n').includes('condition=c4 · state=unknown · cause=ideal:なし,current:current-unobserved'),
  'the detail of 差 names the unplaced condition and causes');
// Two Scopes a part could belong to: it is shown on neither.
const ambiguous = gapWorld({ groups: true });
ambiguous.frames[4].entities.push({ ref: { space: 'fixture:gap', kind: 'semantic-scope', id: 'scope:atlas' }, label: '別の主張', area: 'scopes', order: 9, visible: true, activity: 'none' });
const ambiguousT4 = parseAtlasWorldInput(ambiguous).frames[4].entities;
assert.equal(ambiguousT4.find(entity => entity.ref.id === 'c3').label, 'windows repo を退役する\n未達', 'ambiguous: not on the condition match');
assert.equal(ambiguousT4.find(entity => entity.ref.id === 'scope:atlas').label, '別の主張', 'ambiguous: not on the scope match');
assert.match(ambiguousT4.find(entity => entity.ref.kind === 'gap').label, /\nScope に付かない差 1 件$/u, 'ambiguous: counted on 差');
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(grouped))), grouped, 'grouped gap view is idempotent');
// current = record(agent): each work's latest claim is a line of 現在状態,
// with evidence, day-time and, for the state and the evidence each, the line
// it comes from (a's are different lines); no value reads 不明. Claims are not
// achievements: 差, the match count and every Scope are the same with or without them,
// and 現在状態 carries no status.
const claimed = parseAtlasWorldInput(gapWorld({ current: true }));
const claimedState = id => byKind(claimed.frames.find(item => item.id === id))['current-state:hq'];
assert.equal(claimedState('t4'), '現在状態\n観測 4 件 · 最新 03:50Z\n理想の条件 4 件のうち一致 1 件\n作業の主張（current） 2 件\n'
  + 'b · 進行（出所 current:P#L2） · 10-17 03:50Z\nc · 進行（出所 current:P#L3） · 10-17 03:50Z');
assert.equal(claimedState('t6'), '現在状態\n観測 8 件 · 最新 05:30Z\n理想の条件 4 件のうち一致 2 件\n作業の主張（current） 3 件\n'
  + 'b · 完了と報告（出所 current:P#L2） · 10-17 05:30Z\nc · 不明（最新の行が不正）（出所 current:P#L3） · 10-17 05:30Z\n'
  + 'a · 作成（出所 current:P#L1） · 証拠 roccho-dev/apps#124（出所 current:P#L4） · 10-17 05:30Z');
for (const item of claimed.frames) {
  const plainKinds = Object.entries(byKind(frame(item.id))).filter(([entityKey]) => !entityKey.startsWith('current-state:'));
  assert.deepEqual(Object.entries(byKind(item)).filter(([entityKey]) => !entityKey.startsWith('current-state:')), plainKinds, item.id + ': claims change nothing but 現在状態');
  const currentNode = item.entities.find(entity => entity.ref.kind === 'current-state');
  assert.deepEqual(currentNode.flags, [], item.id + ': 現在状態 has no status flag');
  assert.equal(projectWorldScene({ input: claimed, frame: item }).representations.find(rep => rep.atlas?.ref?.kind === 'current-state').atlas.status, null,
    item.id + ': 現在状態 is drawn with no status');
}
// A3 (apps#120): a decision whose source was observed but not admitted is
// marked where it is drawn (observed_not_admitted reads 未採択; another value
// is shown as is), for display only: every flag, count and other label is as
// without the field.
const admitted = parseAtlasWorldInput(gapWorld({ admission: true }));
const admittedKinds = id => byKind(admitted.frames.find(item => item.id === id));
assert.equal(admittedKinds('t2')['purpose:hq'], '目的\n宣言だけで回る組織\nrev 1（未採択）', 'purpose.set from an unadmitted source');
assert.equal(admittedKinds('t3')['ideal-state:hq'], '理想状態\nv1→v2（未採択） 移動 · 条件 3（追加 1）', 'ideal.set v2 from an unadmitted source');
assert.equal(admittedKinds('t3')['purpose:hq'], '目的\n宣言だけで回る組織\nrev 1（未採択） · 過去の評価：理想状態が不十分（pending-review）', 'an unknown admission value is shown as is');
assert.equal(admittedKinds('t2')['ideal-state:hq'], '理想状態\nv1 · 条件 2', 'ideal.set v1 has no admission: no mark');
for (const item of admitted.frames) {
  const plain = frame(item.id);
  assert.deepEqual(item.entities.map(entity => [entity.ref.kind, entity.flags]), plain.entities.map(entity => [entity.ref.kind, entity.flags]), item.id + ': admission changes no flag');
  assert.deepEqual(item.entities.filter(entity => !['purpose', 'ideal-state'].includes(entity.ref.kind)).map(entity => entity.label),
    plain.entities.filter(entity => !['purpose', 'ideal-state'].includes(entity.ref.kind)).map(entity => entity.label), item.id + ': 差, 現在状態, Scopes as without admission');
  assert.deepEqual(projectWorldScene({ input: admitted, frame: item }).representations.map(rep => [rep.regionId, rep.atlas?.status ?? null, rep.visual?.appearance ?? null]),
    projectWorldScene({ input, frame: plain }).representations.map(rep => [rep.regionId, rep.atlas?.status ?? null, rep.visual?.appearance ?? null]), item.id + ': same status and color');
}
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(admitted))), admitted, 'admission marks are idempotent');
// The HUD's journal row names the source's admission after the source.
const admittedRow = projectAtlasWorld({ input: admitted, frame: admitted.frames[6], selected: 'none', chrome: 'full', journalOpen: '0:purpose.set' })
  .scene.representations.find(rep => rep.regionId === TIMELINE_ID_PREFIX + 'journal-line:0');
assert.match(admittedRow.label.replace(/\n/gu, ''), /出所 adrs#647（未採択） comment 6230983530/u);
const badAdmission = gapWorld({ admission: true });
badAdmission.frames[0].journal[0].source.admission = '';
assert.throws(() => parseAtlasWorldInput(badAdmission), /source.admission must be non-empty text/);
// L3 (adrs#647, contract v12): a plan.set bound to no ideal state, with its
// time and author like any journal entry, is counted as 未結合 n 件: up to the
// frame, each such plan id once, leaving out an id the frame's plans carry. It
// is never one of the frame's plans and never in 現在状態. Plans are an
// attribute of the ideal state, so the count is the last line of 理想状態 —
// drawn in every chrome, the chrome-free /hq/ view included — and the HUD's
// plan cell. Every other entity, flag, status and color is as without them.
const unboundWorld = parseAtlasWorldInput(gapWorld({ unbound: true }));
const unboundCount = { t4: 2, t5: 2, t6: 3, t7: 3 };
const planCell = (world, item, viewport) => projectAtlasWorld({ input: world, frame: world.frames.find(each => each.id === item.id), selected: 'none', chrome: 'full', viewport })
  .scene.representations.find(rep => rep.regionId === TIMELINE_ID_PREFIX + 'plan');
// What the chrome-free view draws as text: every representation's label.
const drawnText = (world, item, chrome = 'none') => projectAtlasWorld({ input: world, frame: world.frames.find(each => each.id === item.id), selected: 'none', chrome })
  .scene.representations.map(rep => rep.label ?? '').join('\n');
const idealOf = each => each.entities.find(entity => entity.ref.kind === 'ideal-state').label;
for (const item of unboundWorld.frames) {
  const count = unboundCount[item.id];
  assert.ok(count ? drawnText(unboundWorld, item).includes('未結合 ' + count + ' 件') : !drawnText(unboundWorld, item).includes('未結合'),
    item.id + ': the chrome-free view shows the unbound count');
  assert.equal(idealOf(item), idealOf(frame(item.id)) + (count ? '\n計画：未宣言（UNKNOWN） · 未結合 ' + count + ' 件' : ''), item.id + ': 理想状態 counts the unbound plans');
  assert.deepEqual(item.entities.filter(entity => entity.ref.kind !== 'ideal-state'), frame(item.id).entities.filter(entity => entity.ref.kind !== 'ideal-state'),
    item.id + ': every other entity as without them');
  assert.ok(!item.entities.find(entity => entity.ref.kind === 'current-state').label.includes('未結合'), item.id + ': not in 現在状態');
  const scene = (world, chrome) => projectAtlasWorld({ input: world, frame: world.frames.find(each => each.id === item.id), selected: 'none', chrome }).scene.representations
    .filter(rep => !rep.regionId.startsWith(TIMELINE_ID_PREFIX + 'journal') && rep.regionId !== TIMELINE_ID_PREFIX + 'plan' && rep.atlas?.ref?.kind !== 'ideal-state')
    .map(rep => [rep.regionId, rep.label, rep.atlas?.status ?? null, rep.visual?.appearance ?? null]);
  for (const chrome of ['none', 'full']) assert.deepEqual(scene(unboundWorld, chrome), scene(input, chrome), item.id + ' ' + chrome + ': same drawing besides 理想状態 and the plan cell');
  const cell = planCell(unboundWorld, item, { width: 1920, height: 1080 });
  assert.equal(cell.atlas.unbound, count ?? 0, item.id + ': unbound count');
  assert.equal(cell.atlas.plan, 'undeclared', item.id + ': unbound plans are not mixed into plans');
  assert.ok(count ? cell.label.replace(/\n/gu, '').includes('未結合 ' + count + ' 件') : !cell.label.includes('未結合'), item.id + ': ' + cell.label);
}
// An id the frame's plans carry (bound later) is not counted as unbound; the
// frame's own plans are shown as supplied.
const laterBound = gapWorld({ unbound: true });
laterBound.frames[7].plans = [{ ...knownPlan, ref: 'mieru#3', plan: 'mieru#3:release', label: 'mieru release (mieru#3 v1)', version: 1 }];
const laterBoundWorld = parseAtlasWorldInput(laterBound);
assert.equal(planCell(laterBoundWorld, laterBoundWorld.frames[7], { width: 1920, height: 1080 }).atlas.unbound, 2, 'an id in the frame\'s plans is left out');
assert.ok(idealOf(laterBoundWorld.frames[7]).endsWith('\n計画：1 件 · 未結合 2 件'), idealOf(laterBoundWorld.frames[7]));
// Plans supplied with none unbound: the plans alone; neither: no line (no zero count).
const onlyPlans = gapWorld();
onlyPlans.frames[4].plans = [];
assert.ok(idealOf(parseAtlasWorldInput(onlyPlans).frames[4]).endsWith('\n計画：有効な計画 0 件'), 'supplied plans are shown');
assert.ok(!input.frames.some(item => idealOf(item).includes('計画：')), 'no plans and none unbound: no plan line');
// The band keeps one plan mark per frame (no mark of its own for unbound
// plans); its rows name each entry, the unbound ones marked, with time and author.
const unboundBand = projectAtlasWorld({ input: unboundWorld, frame: unboundWorld.frames.at(-1), selected: 'none', chrome: 'full', journalOpen: '4:plan.set',
  viewport: { width: 1920, height: 1080 } }).scene.representations.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX));
assert.ok(!unboundBand.some(rep => String(rep.atlas?.group).endsWith(':unbound')), 'no band mark of their own');
const unboundRows = unboundBand.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX + 'journal-line:')).map(rep => rep.label.replace(/\n/gu, ''));
assert.ok(unboundRows.includes('◇ 計画（宣言に未結合） resources#71:tool-split v1 · 2026-10-17T03:20:00Z · 作者 roccho-dev · 出所 roccho-dev/resources#71 · sha256 ' + 'c'.repeat(64))
  && unboundRows.includes('◇ 計画（宣言に未結合） nixos#12:fork-surface v2 · 2026-10-17T03:30:00Z · 作者 不明 · 出所 roccho-dev/nixos#12 comment 4100 · sha256 ' + 'd'.repeat(64))
  && unboundRows.some(row => row.startsWith('◇ 計画 resources#25:migration · ')), JSON.stringify(unboundRows));
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(unboundWorld))), unboundWorld, 'unbound plans are idempotent');
const rejectUnbound = (mutate, pattern) => { const raw = gapWorld({ unbound: true }); mutate(raw.frames[4].journal); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
rejectUnbound(list => { list.find(entry => entry.kind === 'observation').unbound = true; }, /unbound is for plan.set only/);
rejectUnbound(list => { list.find(entry => entry.unbound).unbound = 'yes'; }, /unbound must be true/);
rejectUnbound(list => { delete list.find(entry => entry.unbound).plan; }, /\.plan must be non-empty text/);
rejectUnbound(list => { delete list.find(entry => entry.unbound).recordedAt; }, /recordedAt must be/);
rejectUnbound(list => { delete list.find(entry => entry.unbound).actor; }, /actor must be/);
rejectUnbound(list => { delete list.find(entry => entry.kind === 'plan.set' && !entry.unbound).recordedAt; }, /recordedAt must be/);
// v5: unmatchable is its own cause, not unobserved.
assert.ok(/\? c4 · 照合不能/u.test(byKind(frame('t6'))['gap:hq']) && !/未観測/u.test(byKind(frame('t6'))['gap:hq']));
// History stays: c3/c1/c4 closed at t5 are still listed at t6.
assert.equal(byKind(frame('t6'))['gap-closed:t6'], '閉じた差 3（この時点 0）\nc1 現在が充足・c4 現在が充足');

// The ui clock: past matched_until, the present matched frame reads stale;
// before it, or for a frame that is not the present, it does not.
const matchedNow = parseAtlasWorldInput(gapWorld({ through: 't5' }));
const phaseLabel = (world, id, now) => projectAtlasWorld({ input: world, frame: world.frames.find(item => item.id === id), selected: 'none', now, chrome: 'none' })
  .scene.representations.find(rep => rep.atlas?.ref?.kind === 'phase').label.replace(/\s+/gu, ' ');
assert.equal(phaseLabel(matchedNow, 't5', Date.parse('2026-10-17T05:40:59Z')), '局面：一致・維持（10-17 05:00Z から） · 新規 0 · 次の鮮度切れ 05:41Z · 理想状態の確定前の観測で一致 1 件');
assert.equal(phaseLabel(matchedNow, 't5', Date.parse('2026-10-17T05:41:01Z')), '? · 局面：一致・維持 → 鮮度切れ・最新か不明（05:41Z を過ぎた）');
assert.equal(phaseLabel(matchedNow, 't2', Date.parse('2026-10-17T05:41:01Z')), '局面：一致・維持（10-17 02:00Z から） · 新規 0 · 次の鮮度切れ 02:41Z', 'a past frame is not judged by today');

// The band: phase segments merge, journal marks group per frame and kind,
// and a mark opens its entries' kind, time, author and source. It is drawn in
// the HUD only; the chrome-free view draws no band (未設計のため。設計の合意後に戻す).
assert.equal(projectAtlasWorld({ input, frame: frame('t6'), selected: 'none', chrome: 'none', journalOpen: '3:purpose.evaluated' })
  .scene.representations.filter(rep => rep.regionId.startsWith(TIMELINE_ID_PREFIX)).length, 0, 'none: no band, no strip');
const band = projectAtlasWorld({ input, frame: frame('t6'), selected: 'none', chrome: 'full', journalOpen: '3:purpose.evaluated' })
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
const unnamedRow = projectAtlasWorld({ input: namedInput, frame: namedInput.frames[3], selected: 'none', chrome: 'full', journalOpen: '0:purpose.set' })
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
assert.equal(byKind(parseAtlasWorldInput(off).frames[4])['phase:hq'], '局面：一致・維持（10-17 04:00Z から） · 新規 0 · 次の鮮度切れ 不明 · gap と不整合');
// The phase's start is read from the received frames alone: a World cut at
// t4 says the same, and a frame whose phase is not supplied names none.
assert.equal(byKind(parseAtlasWorldInput(gapWorld({ through: 't4' })).frames[4])['phase:hq'], expected.t4['phase:hq'], 'received frames only');
const unsupplied = gapWorld();
delete unsupplied.frames[4].phase;
assert.ok(!byKind(parseAtlasWorldInput(unsupplied).frames[4])['phase:hq'].includes('から）'), 'no phase: no start');
// A summary that disagrees with the parts is shown as disagreeing.
const offSummary = gapWorld();
offSummary.frames[4].gap.summary.open = 9;
assert.match(byKind(parseAtlasWorldInput(offSummary).frames[4])['gap:hq'], /^理想↔現在の差\n差 3（前 1） · 集計不一致\n/u);
// Plans never enter the gap: they are named on 理想状態 only (an attribute of the ideal).
const planned = gapWorld();
planned.frames[3].plans = [];
assert.deepEqual(parseAtlasWorldInput(planned).frames[3].entities.filter(entity => entity.ref.kind !== 'ideal-state'),
  frame('t3').entities.filter(entity => entity.ref.kind !== 'ideal-state'), 'plans change no gap entity');

// GapA (目的↔理想の差) comes only from a frame's `adequacy` (contract v12).
// Without it there is no GapA and the ideal state approximates the purpose
// directly; a producer's purpose-adequacy entity (the earlier path, removed at
// ④) is neither drawn nor kept.
const ofKind = (world, id, kind) => world.frames.find(item => item.id === id).entities.filter(entity => entity.ref.kind === kind);
const gapRelations = item => item.relations.filter(relation => relation.kind === 'gap').map(relation => relation.from.kind + '>' + relation.to.kind + ' ' + relation.label);
const purposeOrder = item => item.entities.filter(entity => entity.area === 'purpose').sort((a, b) => a.order - b.order).map(entity => entity.ref.kind);
for (const item of input.frames) {
  assert.deepEqual(ofKind(input, item.id, 'purpose-adequacy'), [], item.id + ': no GapA supplied, none drawn');
  assert.ok(gapRelations(item).includes('ideal-state>purpose 近似'), item.id + ': ideal approximates the purpose');
}
const earlierPath = gapWorld();
for (const item of earlierPath.frames) item.entities.push({ ref: { space: 'fixture:gap', kind: 'purpose-adequacy', id: 'hq' }, label: '目的↔理想の差\n未評価',
  area: 'purpose', order: 9, visible: true, activity: 'none', flags: ['purpose_adequacy=unassessed'] });
assert.deepEqual(parseAtlasWorldInput(earlierPath).frames.map(item => item.entities), input.frames.map(item => item.entities), 'the earlier purpose-adequacy entity draws nothing');
// Admission is a mark only (adrs#647): on the evaluation in 目的.
assert.equal(byKind(parseAtlasWorldInput(gapWorld({ admission: true })).frames[3])['purpose:hq'], '目的\n宣言だけで回る組織\nrev 1（未採択） · 過去の評価：理想状態が不十分（pending-review）');

// Contract v12 (adrs#647): a frame's `adequacy` is GapA as the producer judged
// it. The ui draws its state and reason only (no count) and judges nothing.
const judgedRaw = gapWorld({ judged: true });
const judged = parseAtlasWorldInput(judgedRaw);
const gapALabel = { t0: '不明 · 照らす理想状態が無い', t1: '不明 · 照らす理想状態が無い', t2: '不明 · 人の評価なし', t3: '不明 · 過去の評価（版が違う）',
  t4: '不明 · 過去の評価（版が違う）', t5: '不明 · 十分性の評価なし', t6: '不明 · 差が開いたまま到達と評価', t7: '不明 · 目的は終了した' };
for (const item of judged.frames) {
  const [drawn, ...others] = ofKind(judged, item.id, 'purpose-adequacy');
  assert.equal(others.length, 0, item.id + ': one GapA');
  assert.equal(drawn.label, '目的↔理想の差\n' + gapALabel[item.id], item.id + ': GapA state and reason');
  assert.deepEqual(drawn.flags, ['scope_status=unknown'], item.id + ': GapA status from its state only');
  assert.ok(!/\d+ 件/u.test(drawn.label), item.id + ': GapA draws no count');
  assert.deepEqual(purposeOrder(item), ['phase', 'purpose', 'purpose-adequacy', 'ideal-state', 'gap', 'current-state'], item.id + ': the chain P, GapA, I, GapB, C');
  assert.ok(gapRelations(item).includes('ideal-state>purpose-adequacy 照らす') && gapRelations(item).includes('purpose-adequacy>purpose 十分性'), item.id);
  assert.deepEqual(item.entities.filter(entity => entity.ref.kind !== 'purpose-adequacy').map(entity => [entity.ref.kind, entity.ref.id, entity.label, entity.flags]),
    frame(item.id).entities.map(entity => [entity.ref.kind, entity.ref.id, entity.label, entity.flags]), item.id + ': adequacy changes no other entity');
}
const evaluatedRaw = gapWorld({ judged: true });
Object.assign(evaluatedRaw.frames[4].adequacy, { state: 'unmet', reason: 'evaluated' });
const evaluatedGapA = ofKind(parseAtlasWorldInput(evaluatedRaw), 't4', 'purpose-adequacy')[0];
assert.deepEqual([evaluatedGapA.label, evaluatedGapA.flags], ['目的↔理想の差\n不十分 · 人の評価：理想状態が不十分', ['scope_status=unmet']], 'evaluated: unmet');
// The evaluation's admission is a mark only, in GapA's reason line.
const admittedGapA = gapWorld({ judged: true });
admittedGapA.frames[3].adequacy.evidence.source.admission = 'observed_not_admitted';
const markedGapA = ofKind(parseAtlasWorldInput(admittedGapA), 't3', 'purpose-adequacy')[0];
assert.deepEqual([markedGapA.label, markedGapA.flags], ['目的↔理想の差\n不明 · 過去の評価（版が違う）（未採択）', ['scope_status=unknown']], 'admission is a mark only');
// S4: an evaluator's `evaluation:` observation (Jev) is a sign in GapA's box,
// as reported and unverified, the latest per question up to the frame. It
// changes no state, flag or other box.
const signed = parseAtlasWorldInput(gapWorld({ judged: true, evaluator: true }));
const signLine = { t3: '評価者の評価（未検証） adequacy=problem（出所 jev:ops#573 · jev · 10-17 02:45Z）',
  t6: '評価者の評価（未検証） adequacy=ok（出所 jev:ops#573 · jev · 10-17 05:10Z）' };
signLine.t4 = signLine.t3;
signLine.t5 = signLine.t3;
signLine.t7 = signLine.t6;
for (const item of signed.frames) {
  const drawn = ofKind(signed, item.id, 'purpose-adequacy')[0];
  assert.equal(drawn.label, '目的↔理想の差\n' + gapALabel[item.id] + (signLine[item.id] ? '\n' + signLine[item.id] : ''), item.id + ': evaluator sign');
  assert.deepEqual(drawn.flags, ['scope_status=unknown'], item.id + ': a sign changes no state');
  assert.equal(byKind(item)['gap:hq'], byKind(frame(item.id))['gap:hq'], item.id + ': a sign changes no GapB');
}
// held (contract v12): the declarations held back up to the frame, counted by
// reason on the phase line. Display only: every other label and flag as without.
const heldWorld = parseAtlasWorldInput(gapWorld({ held: true }));
// Cases 15 and 29: what was held is read on the phase box too, one line per
// declaration (reason · kind · source), in the order they entered, at most 5.
const heldLines = '\n保持 actor-mismatch · ideal.set · adrs#647';
const heldText = { t3: '\n保持 1 件（actor-mismatch 1）' + heldLines, t4: '\n保持 1 件（actor-mismatch 1）' + heldLines };
for (const id of ['t5', 't6', 't7']) heldText[id] = '\n保持 3 件（actor-mismatch 1 · author-unknown 1 · proposal 1）' + heldLines
  + '\n保持 proposal · ideal.set · ops#552\n保持 author-unknown · 種類不明 · adrs#647';
for (const item of heldWorld.frames) {
  assert.equal(byKind(item)['phase:hq'], byKind(frame(item.id))['phase:hq'] + (heldText[item.id] ?? ''), item.id + ': held by reason, accumulated');
  assert.deepEqual(item.entities.filter(entity => entity.ref.kind !== 'phase').map(entity => [entity.ref.kind, entity.label, entity.flags]),
    frame(item.id).entities.filter(entity => entity.ref.kind !== 'phase').map(entity => [entity.ref.kind, entity.label, entity.flags]), item.id + ': held changes nothing else');
}
assert.match(heldWorld.frames[5].entities.find(entity => entity.ref.kind === 'phase').summary, /保持 proposal · ideal.set · 2026-10-17T04:20:00Z · 出所 ops#552/u);
// A stale matched present replaces the phase line only: what was held stays.
const heldNow = parseAtlasWorldInput(gapWorld({ held: true, through: 't5' }));
const staleHeld = projectAtlasWorld({ input: heldNow, frame: heldNow.frames[5], selected: 'none', now: Date.parse('2026-10-17T05:41:01Z'), chrome: 'none' })
  .scene.representations.find(rep => rep.atlas?.ref?.kind === 'phase').label.replace(/\s+/gu, ' ');
assert.ok(staleHeld.includes('鮮度切れ・最新か不明') && staleHeld.includes('保持 3 件') && staleHeld.includes('保持 proposal · ideal.set · ops#552'), staleHeld);
const manyHeld = gapWorld({ held: true });
manyHeld.frames[6].held = Array.from({ length: 4 }, (_, n) => ({ reason: 'proposal', kind: 'plan.set', recordedAt: '2026-10-17T05:3' + n + ':00Z', source: { ref: 'ops#' + (600 + n), commentId: null, sha256: null } }));
const manyPhase = byKind(parseAtlasWorldInput(manyHeld).frames[6])['phase:hq'];
assert.ok(manyPhase.includes('\n保持 7 件（'), 'all counted: ' + manyPhase);
assert.equal(manyPhase.split('\n').filter(line => line.startsWith('保持 ') && !/^保持 \d+ 件/u.test(line)).length, 5, 'at most 5 held lines');
assert.ok(manyPhase.endsWith('\n他 2 件'), 'the rest counted: ' + manyPhase);
// Case 14: while an ideal is in force, a newer ideal.drafting with no ideal.set
// of its version yet reads 改訂中 on 理想状態. Display only.
const drafted = parseAtlasWorldInput(gapWorld({ drafting: true }));
assert.equal(byKind(drafted.frames[6])['ideal-state:hq'], byKind(frame('t6'))['ideal-state:hq'] + ' · 改訂中 v3', 't6: 改訂中 v3');
for (const id of ['t5', 't7']) assert.equal(byKind(drafted.frames.find(item => item.id === id))['ideal-state:hq'], byKind(frame(id))['ideal-state:hq'], id + ': not drafting, or no ideal in force');
assert.ok(!byKind(frame('t1'))['ideal-state:hq'].includes('改訂中'), 't1: drafting the first ideal is 定義中, not 改訂中');
// Case 26: parts[i].last_observed, the observation the judge last matched for
// the part, is drawn on its line: when, from where, by whom; null reads 最後の観測なし.
const observed = parseAtlasWorldInput(gapWorld({ lastObserved: true }));
assert.equal(byKind(observed.frames[4])['gap-part:c1'], expected.t4['gap-part:c1'] + ' · 最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）');
assert.equal(byKind(observed.frames[4])['gap-part:c3'], expected.t4['gap-part:c3'] + ' · 最後の観測なし');
assert.ok(byKind(observed.frames[6])['gap-part:c1'].endsWith('鮮度切れ · この時点から（06:00Z） · 担当未確定 · 最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）'),
  'case 26: the stale part names its last observer');
const observedPhysical = parseAtlasWorldInput(gapWorld({ lastObserved: true, physical: true }));
assert.ok(byKind(observedPhysical.frames[4])['package:roccho-dev/apps:packages/atlas'].includes('! c1 · 未達 · 現在の後退 · 担当未確定 · 最後の観測 10-17 03:40Z'), 'the card line too');
const groupedObserved = parseAtlasWorldInput(gapWorld({ lastObserved: true, groups: true }));
assert.ok(groupedObserved.frames[4].entities.find(entity => entity.ref.id === 'c1').label.endsWith('担当未確定 · 最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）'), 'a supplied Scope card too');
// frames[i].upkeep is read exactly and kept; 予定 ▸ lists it (below).
const kept = parseAtlasWorldInput(gapWorld({ upkeep: true }));
assert.deepEqual(kept.frames[5].upkeep.map(item => item.condition), ['c3', 'c1']);
assert.equal(kept.frames[4].upkeep, undefined, 'only the frames that carry it');
const fullV12 = parseAtlasWorldInput(gapWorld({ judged: true, held: true, evaluator: true, physical: true, drafting: true, lastObserved: true, upkeep: true }));
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(fullV12))), fullV12, 'contract v12 fields are idempotent');
// 予定 ▸ (contract 3, revised): the latest frame's planned side, not a frame:
// its plans, the plans bound to no ideal state, and the upkeep (per condition,
// earliest first) or, without it, matched_until alone. Not matched: none.
const forecastOf = world => forecastLines(world.frames);
assert.deepEqual(forecastOf(parseAtlasWorldInput(gapWorld({ through: 't5', upkeep: true, unbound: true }))), [
  '予定（最新 t5 · 計画であって事実ではない）', '予定：計画未宣言（UNKNOWN）', '未結合 2 件：resources#71:tool-split v1 · nixos#12:fork-surface v2',
  '維持の作業（鮮度切れの予定の早い順）', 'c1 · 観測 10-17 03:40Z · 鮮度切れの予定 10-17 05:41Z', 'c3 · 観測 10-17 03:40Z · 鮮度切れの予定 10-17 06:10Z']);
assert.deepEqual(forecastOf(parseAtlasWorldInput(gapWorld({ through: 't5' }))).slice(-1), ['次の鮮度切れ 10-17 05:41Z'], 'no upkeep: matched_until alone');
assert.deepEqual(forecastOf(input).slice(-1), ['維持の作業：なし（一致・維持ではない）'], 'the latest is not matched');
// 仕訳 n ▸: the entries the displayed frame carries, one row each.
assert.deepEqual(journalLines(frame('t3')), [
  '▲ 理想の確定 · 2026-10-17T02:30:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530 · sha256 ' + 'a'.repeat(64),
  '★ 評価 · 2026-10-17T02:50:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530 · sha256 ' + 'a'.repeat(64)]);
assert.deepEqual(journalLines(frame('t6')), [], 't6 carries none');
// Search: a selected relation brings the camera to a drawn end of it (the
// chrome-free view has no record panel), its from box first.
const relationSelected = projectAtlasWorld({ input, frame: frame('t4'), selected: relationKey(frame('t4').relations.find(item => item.label === '差').ref), chrome: 'none' });
assert.equal(relationSelected.selectedRegionId, 'world:' + entityKey(frame('t4').relations.find(item => item.label === '差').from), 'a relation focuses its from box');
// A World without them is drawn as before (apps ② ships later): checked above on `input`.
// The fields are read exactly; anything else is rejected.
const rejectV12 = (mutate, pattern) => { const raw = gapWorld({ judged: true, held: true }); mutate(raw.frames[3]); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
rejectV12(item => { item.adequacy.guess = 1; }, /adequacy: unknown field guess/);
rejectV12(item => { delete item.adequacy.evidence; }, /adequacy.evidence is required/);
rejectV12(item => { item.adequacy.reason = 'guessed'; }, /adequacy.reason must be/);
rejectV12(item => { item.adequacy.state = 'satisfied'; }, /adequacy.state must be unmet\|unknown/);
rejectV12(item => { item.adequacy.state = 'unmet'; }, /adequacy.state is unmet exactly when reason is evaluated/);
rejectV12(item => { item.adequacy.basis.ideal_version = 'v9'; }, /adequacy.basis must be the gap's basis/);
rejectV12(item => { item.adequacy.basis.label = 'x'; }, /adequacy.basis: unknown field label/);
rejectV12(item => { item.adequacy.evidence = null; }, /adequacy.evidence is required for reason past/);
rejectV12(item => { item.adequacy.evidence.kind = 'purpose.evaluated'; }, /adequacy.evidence: unknown field kind/);
rejectV12(item => { delete item.adequacy.evidence.verdict; }, /adequacy.evidence.verdict is required/);
rejectV12(item => { item.adequacy.evidence.source.url = 'x'; }, /adequacy.evidence.source: unknown field url/);
rejectV12(item => { item.held = {}; }, /held must be an array/);
rejectV12(item => { delete item.held[0].source; }, /held\[0\].source is required/);
rejectV12(item => { item.held[0].plan = 'x'; }, /held\[0\]: unknown field plan/);
rejectV12(item => { item.held[0].recordedAt = 'later'; }, /held\[0\].recordedAt must be a parseable instant/);
const rejectT5 = (mutate, pattern) => { const raw = gapWorld({ upkeep: true }); mutate(raw.frames[5]); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
rejectT5(item => { item.upkeep = {}; }, /upkeep must be an array/);
rejectT5(item => { item.upkeep[0].maxAge = 'PT1H'; }, /upkeep\[0\]: unknown field maxAge/);
rejectT5(item => { delete item.upkeep[0].stale_at; }, /upkeep\[0\].stale_at is required/);
rejectT5(item => { item.upkeep[0].observedAt = 'soon'; }, /upkeep\[0\].observedAt must be a parseable instant/);
const rejectPart = (mutate, pattern) => { const raw = gapWorld({ lastObserved: true }); mutate(raw.frames[4].gap.parts.find(part => part.condition === 'c1')); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
rejectPart(part => { part.last_observed.value = 'x'; }, /last_observed: unknown field value/);
rejectPart(part => { part.last_observed.observedAt = 'then'; }, /last_observed.observedAt must be a parseable instant/);
rejectPart(part => { part.last_observed.source = { ref: 'x', url: 'y' }; }, /last_observed.source: unknown field url/);
rejectPart(part => { delete part.last_observed.actor; }, /last_observed.actor is required/);
const noEvaluation = gapWorld({ judged: true });
noEvaluation.frames[2].adequacy.evidence = noEvaluation.frames[3].adequacy.evidence;
assert.throws(() => parseAtlasWorldInput(noEvaluation), /adequacy.evidence must be null for reason no-evaluation/);

// Physical Scope (contract v12, S4): one relation from the physical thing to a
// condition id. development is drawn while its part is open (この差を埋める対象);
// operation keeps a condition of the ideal (この条件を保つもの, drawn on 理想状態
// for as long as the producer relates it to the purpose-state-target, and on
// 理想↔現在の差 too while the part is open). A part without a declaration reads
// 未特定. Nothing is matched by name, owner or scope; nothing points at GapA.
const physicalWorld = parseAtlasWorldInput(gapWorld({ judged: true, physical: true }));
const physicalT4 = physicalWorld.frames[4];
assert.deepEqual(physicalT4.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id),
  ['package:roccho-dev/apps:packages/atlas', 'package:roccho-dev/ui:packages/control', 'service:native:serve-static'], 't4: the declared physical things are the Scopes');
assert.equal(byKind(physicalT4)['package:roccho-dev/apps:packages/atlas'],
  'roccho-dev/apps\npackages/atlas\n対象: 理想↔現在の差\n! c3 · 未達 · 継続 · 担当 scope:atlas\n! c1 · 未達 · 現在の後退 · 担当未確定');
assert.equal(byKind(physicalT4)['package:roccho-dev/ui:packages/control'], 'roccho-dev/ui\npackages/control\n対象: 理想↔現在の差\n! c3 · 未達 · 継続 · 担当 scope:atlas');
assert.equal(byKind(physicalT4)['service:native:serve-static'], 'native:serve-static\n保つ: c1\n対象: 理想↔現在の差\n! c1 · 未達 · 現在の後退 · 担当未確定');
assert.equal(byKind(physicalT4)['gap:hq'], '理想↔現在の差\n差 3（前 1）\n! c3 · 継続 · 物理Scope roccho-dev/apps/packages/atlas / roccho-dev/ui/packages/control'
  + '\n! c1 · 現在の後退 · 物理Scope roccho-dev/apps/packages/atlas / native:serve-static\n? c4 · 未観測 · 物理Scope 未特定');
const physicalRelations = item => gapRelations(item).filter(relation => /^(package|service)>/u.test(relation));
assert.deepEqual(physicalRelations(physicalT4), ['package>gap この差を埋める対象', 'package>gap この差を埋める対象', 'service>gap この条件を保つもの', 'service>ideal-state この条件を保つもの']);
// Operation while the condition is kept (t2, t3: c1 not open): only 理想状態.
for (const id of ['t2', 't3', 't5']) {
  const item = physicalWorld.frames.find(each => each.id === id);
  assert.equal(byKind(item)['service:native:serve-static'], 'native:serve-static\n保つ: c1', id + ': the service keeps c1');
  assert.ok(physicalRelations(item).includes('service>ideal-state この条件を保つもの') && !physicalRelations(item).includes('service>gap この条件を保つもの'), id);
}
for (const item of physicalWorld.frames) {
  assert.ok(!item.relations.some(relation => relation.to.kind === 'purpose-adequacy' && relation.from.kind !== 'ideal-state'), item.id + ': no relation from a physical thing to GapA');
  assert.ok(!Object.values(byKind(item)).some(label => label.includes('目的↔理想の差') && !label.startsWith('目的↔理想の差')), item.id + ': no physical card names GapA');
}
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(physicalWorld))), physicalWorld, 'physical Scope is idempotent');
// The purpose-state-target is matched by kind and id alone (R, I1): the
// producer's own space for it does not stop the move onto 理想状態.
const otherSpace = gapWorld({ judged: true, physical: true });
for (const relation of otherSpace.frames[2].relations) if (relation.to.kind === 'purpose-state-target') relation.to = { ...relation.to, space: 'producer:atlas' };
otherSpace.frames[2].entities.find(entity => entity.ref.kind === 'purpose-state-target').ref.space = 'producer:atlas';
assert.ok(physicalRelations(parseAtlasWorldInput(otherSpace).frames[2]).includes('service>ideal-state この条件を保つもの'), 'kind and id alone');

// Position is computed from the relations alone (no order fixed per area, kind
// or name): GapA is drawn above GapB, and no other relation of the purpose
// area runs through GapB's box.
const through = (box, a, b) => Array.from({ length: 99 }, (_, n) => (n + 1) / 100)
  .some(t => { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; return x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height; });
for (const world of [judged, physicalWorld]) for (const item of world.frames) {
  const scene = projectWorldScene({ input: world, frame: item });
  const bounds = new Map(scene.representations.map(rep => [rep.regionId, rep.bounds]));
  const regionOf = kind => scene.representations.find(rep => rep.atlas?.ref?.kind === kind).regionId;
  const center = id => [bounds.get(id).x + bounds.get(id).width / 2, bounds.get(id).y + bounds.get(id).height / 2];
  const gapB = regionOf('gap');
  assert.ok(bounds.get(regionOf('purpose-adequacy')).y < bounds.get(gapB).y, item.id + ': 目的↔理想の差 above 理想↔現在の差');
  const purposeArea = new Set(item.entities.filter(entity => entity.area === 'purpose').map(entity => 'world:' + entityKey(entity.ref)));
  for (const relation of scene.relations.filter(each => purposeArea.has(each.from) && purposeArea.has(each.to) && ![each.from, each.to].includes(gapB)))
    assert.ok(!through(bounds.get(gapB), center(relation.from), center(relation.to)), item.id + ': ' + relation.from + ' → ' + relation.to + ' crosses 理想↔現在の差');
}
console.log(JSON.stringify({ status: 'atlas-world-gap-checks-pass', frames: input.frames.length }));
