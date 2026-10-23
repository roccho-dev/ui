// The gap view on adrs#647 contract v3-v6 (frames[i].gap / phase / journal /
// matched_until). Pure; no browser. The drawn journey, the band and the ui
// clock are tests/atlas-world-gap-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { searchAtlasWorld } from '../packages/control/src/atlas-world-search.mjs';
import * as timeline from '../packages/control/src/atlas-timeline.mjs';
import * as gapModule from '../packages/control/src/atlas-gap.mjs';
// The rows of a frame's journal as the changes draws them.
const journalRows = item => (item.journal ?? []).map(gapModule.journalRow);
// Every box but the changes (S7), which draws the frame's journal and held.
const noChange = entity => entity.ref.kind !== 'frame-change';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { knownPlan } from './fixtures/atlas-plan-worlds.mjs';

const input = parseAtlasWorldInput(gapWorld());
const byKind = frame => Object.fromEntries(frame.entities.map(item => [item.ref.kind + ':' + item.ref.id, item.label]));
const frame = id => input.frames.find(item => item.id === id);
const byKindKeys = item => item.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id);
// S6 (adrs#647 comment 6306887827): no phase box. 理想↔現在の差's heading
// names the phase and when it began (the first received frame, going back from
// the one drawn, in the same phase; t4 is still in t3's approximation), and a
// matched phase's next stale time. 理想状態: version and conditions. 差: which
// conditions differ and why, and the previous frame's count. 現在状態: the
// observations, and the matches resting on observations older than the ideal.
// A part's card: since when, and whose.
const HEADING = { t0: '目的変更・10-17 00:00Z から', t1: '定義中・10-17 01:00Z から', t2: '一致・維持・10-17 02:00Z から・次の鮮度切れ 10-17 02:41Z',
  t3: '近似中・10-17 03:00Z から', t4: '近似中・10-17 03:00Z から', t5: '一致・維持・10-17 05:00Z から・次の鮮度切れ 10-17 05:41Z',
  t6: '近似中・10-17 06:00Z から', t7: '目的の終了・10-17 07:00Z から' };
const expected = {
  t0: { 'gap:hq': '差 不明\n照らし合わせる理想状態がまだ無い', 'current-state:hq': '現在状態\n観測の仕訳なし',
    'purpose:hq': '目的\n宣言だけで回る組織\nrev 1' },
  t1: { 'gap:hq': '差 不明\n照らし合わせる理想状態がまだ無い', 'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（定義中）' },
  t2: { 'ideal-state:hq': '理想状態\nv1 · 条件 2', 'gap:hq': '前 不明', 'current-state:hq': '現在状態\n観測 1 件 · 最新 01:40Z' },
  t3: { 'ideal-state:hq': '理想状態\nv1→v2 移動 · 条件 3',
    'gap:hq': '前 0\n! c3 · 理想に追加 · 未観測', 'current-state:hq': '現在状態\n観測 1 件 · 最新 01:40Z',
    'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 過去の評価：理想状態が不十分',
    'gap-part:c3': 'windows repo を退役する\nこの時点から（03:00Z） · scope:atlas' },
  t4: { 'ideal-state:hq': '理想状態\nv2 · 条件 4', 'gap:hq': '前 1\n! c3 · 継続\n! c1 · 現在の後退\n? c4 · 未観測',
    'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z',
    'gap-part:c3': 'windows repo を退役する\n1 時点前から（03:00Z） · scope:atlas',
    'gap-part:c1': '端末で直接入力できる\nこの時点から（04:00Z） · 担当未確定' },
  t5: { 'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 評価：到達',
    'gap:hq': '前 3', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z\n理想状態の確定前の観測で一致 1 件', 'gap-closed:t5': '閉じた差 3（この時点 3）\nc1 現在が充足・c4 現在が充足' },
  t6: { 'gap:hq': '前 0\n! c1 · 鮮度切れ\n? c4 · 照合不能',
    'gap-part:c4': 'envs のスコープ主張\nこの時点から（06:00Z） · scope:envs' },
  t7: { 'gap:hq': '差 対象外\n目的は終了した',
    'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（目的は終了）', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z',
    'gap-closed:t7': '閉じた差 4（この時点 1）\nc4 現在が充足・c1 目的の終了' },
};
for (const [id, item] of Object.entries(expected)) if (item['gap:hq']) item['gap:hq'] = '理想↔現在の差（' + HEADING[id] + '）\n' + item['gap:hq'];
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
  assert.ok(!item.entities.some(entity => entity.ref.kind === 'phase'), item.id + ': no phase box');
}
// No verdict mark on 現在状態; when only the ideal moves (t2 -> t3), its
// observations do not change.
const observedLine = id => byKind(frame(id))['current-state:hq'].split('\n')[1];
assert.equal(observedLine('t3'), observedLine('t2'), 'ideal-only move leaves the observations unchanged');
for (const item of input.frames) assert.ok(!/[✓?!]\d/u.test(byKind(item)['current-state:hq']), item.id + ': no verdict on 現在状態');
// 差 draws the difference only: no satisfied count and no count of its own
// rows (S6), and no counter that reads 0 below its heading and count lines.
for (const item of input.frames) {
  const delta = byKind(item)['gap:hq'];
  assert.ok(delta.startsWith('理想↔現在の差（'), item.id + ': the second gap is named apart from the first: ' + delta);
  assert.ok(!/✓/u.test(delta) && !/^差 \d/mu.test(delta) && !/[^\d（]0(?=[・ ）]|$)/u.test(delta.split('\n').slice(2).join('\n')), item.id + ': 差 is the difference only: ' + delta);
  assert.ok(!/（(追加|改訂) \d/u.test(byKind(item)['ideal-state:hq']), item.id + ': 理想状態 does not count the causes of 差');
}
// The before-ideal count is of observations older than the ideal.set: the
// wording says so whether only the ideal moved or the purpose changed.
for (const newPurpose of [false, true]) {
  const story = parseAtlasWorldInput(gapWorld({ newPurpose }));
  const t5 = story.frames.find(item => item.id === 't5').entities.find(item => item.ref.kind === 'current-state').label;
  assert.ok(t5.endsWith('\n理想状態の確定前の観測で一致 1 件') && !t5.includes('目的の変更前'), (newPurpose ? 'new purpose' : 'ideal only') + ': ' + t5);
}
// v6: a part shows the cause of each side it has; the earlier single list is
// still read and, split by the cause names, drawn the same.
const legacy = parseAtlasWorldInput(gapWorld({ sides: false }));
for (const item of legacy.frames) assert.deepEqual(byKind(item), byKind(frame(item.id)), item.id + ': cause list draws as the sides');
const sided = gapWorld();
sided.frames[3].gap.parts[0].cause = { ideal: ['ideal-added'], current: [] };
sided.frames[3].gap.summary.by_cause = { 'ideal-added': 1 };
assert.ok(byKind(parseAtlasWorldInput(sided).frames[3])['gap:hq'].endsWith('\n! c3 · 理想に追加'), 'one side only: that side alone');
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
// B1 (apps#73; adrs#647 c6341039299): the supplied history units — the
// `history` group, closed changes, prior obligations, Scopes completed into
// history — stay in the frame but are not drawn, in every frame; the closed
// differences' box and one count line stand for them.
const grouped = parseAtlasWorldInput(gapWorld({ groups: true }));
const HISTORY_KINDS = ['closed-change', 'obligation'];
const isHistoryUnit = entity => HISTORY_KINDS.includes(entity.ref.kind) || (entity.ref.kind === 'scope-group' && entity.ref.id === 'history');
for (const item of grouped.frames) {
  const raw = gapWorld({ groups: true }).frames.find(each => each.id === item.id);
  const suppliedScopes = raw.entities.filter(entity => entity.area === 'scopes' && !isHistoryUnit(entity)).map(entity => entity.ref.kind + ':' + entity.ref.id);
  // With supplied Scopes, the ui's own two (the box and the count) are not supplied ones.
  const drawnScopes = item.entities.filter(entity => entity.area === 'scopes' && entity.visible
    && !(suppliedScopes.length && ['gap-closed', 'history-hidden'].includes(entity.ref.kind))).map(entity => entity.ref.kind + ':' + entity.ref.id);
  const history = raw.entities.filter(entity => entity.area === 'scopes' && isHistoryUnit(entity));
  for (const unit of history) assert.equal(item.entities.find(entity => entity.ref.kind === unit.ref.kind && entity.ref.id === unit.ref.id)?.visible, false,
    item.id + ': ' + unit.ref.kind + ':' + unit.ref.id + ' is kept but not drawn');
  const counted = history.filter(unit => unit.ref.kind !== 'scope-group').length;
  assert.equal(item.entities.find(entity => entity.ref.kind === 'history-hidden')?.label, counted ? '履歴 ' + counted + ' 件（◀ 前へと検索で読める）' : undefined,
    item.id + ': the hidden history is counted, never dropped silently');
  if (suppliedScopes.length) {
    assert.deepEqual(drawnScopes, suppliedScopes, item.id + ': supplied Scopes kept as supplied');
    assert.equal(item.relations.filter(relation => relation.containment).length, raw.relations.filter(relation => relation.containment).length, item.id + ': containment kept');
  } else assert.deepEqual(drawnScopes, byKindKeys(frame(item.id)), item.id + ': no supplied Scopes: derived from the parts');
  assert.deepEqual(item.entities.filter(entity => entity.area === 'purpose').map(entity => entity.label),
    frame(item.id).entities.filter(entity => entity.area === 'purpose').map(entity => entity.label), item.id + ': purpose area from the gap');
}
assert.ok(grouped.frames.some(item => item.relations.some(relation => relation.containment)), 'the grouped fixture supplies containment');
// B1: the fixture has history at t6; it is not drawn there, the box is, and
// the hidden units are still found by search (the record is kept).
const t6Grouped = grouped.frames.find(item => item.id === 't6');
assert.ok(t6Grouped.entities.some(entity => entity.ref.kind === 'gap-closed' && entity.visible), 't6: the closed differences\' box is drawn');
assert.ok(searchAtlasWorld(t6Grouped, 'c3@t5').some(row => row.kind === 'entity' && row.record.ref.kind === 'closed-change'), 't6: search reaches the hidden closed change');
const drawnAt = (world, id) => projectAtlasWorld({ input: world, frame: world.frames.find(item => item.id === id), selected: 'none' })
  .scene.representations.map(rep => rep.atlas?.ref?.kind).filter(Boolean);
assert.ok(!drawnAt(grouped, 't6').some(kind => HISTORY_KINDS.includes(kind)), 't6: no history unit is drawn');
// B3 (#73 counter-example 3; R c6341212243): a Scope completed into history
// is a satisfied condition kept by its upkeep; it is not hidden with the history.
const kept = gapWorld({ groups: true });
kept.frames.find(item => item.id === 't6').entities.push({ ref: { space: 'fixture:gap', kind: 'semantic-scope', id: 'kept-service' }, label: '維持する service',
  area: 'scopes', order: 20, visible: true, activity: 'none', flags: ['standing=completed-history', 'scope_status=declared_satisfied'] });
// apps puts it in the `history` group (semantic-scope-world-core.mjs:224): the
// group stays drawn then, so what it contains is not hidden with it.
kept.frames.find(item => item.id === 't6').relations.push({ ref: { space: 'fixture:gap', kind: 'scope-contains', id: 't6:history:kept-service' },
  from: { space: 'fixture:gap', kind: 'scope-group', id: 'history' }, to: { space: 'fixture:gap', kind: 'semantic-scope', id: 'kept-service' },
  kind: 'contains', path: false, containment: 'from-contains-to' });
const keptWorld = parseAtlasWorldInput(kept);
const keptT6 = keptWorld.frames.find(item => item.id === 't6');
assert.equal(keptT6.entities.find(entity => entity.ref.id === 'kept-service').visible, true, 't6: a completed-history Scope stays');
assert.equal(keptT6.entities.find(entity => entity.ref.kind === 'scope-group' && entity.ref.id === 'history').visible, true, 't6: its history group stays');
const keptDrawn = projectAtlasWorld({ input: keptWorld, frame: keptT6, selected: 'none' }).scene.representations.map(rep => rep.atlas?.ref).filter(Boolean);
assert.ok(keptDrawn.some(ref => ref.id === 'kept-service'), 't6: the kept service is drawn inside the history group');
assert.ok(!keptDrawn.some(ref => HISTORY_KINDS.includes(ref.kind)), 't6: the closed changes beside it are still not drawn');
// ◀ 前へ: t7 holds the same history; moving back to t6 does not bring it back.
assert.ok(!drawnAt(grouped, 't7').some(kind => HISTORY_KINDS.includes(kind)) && !drawnAt(grouped, 't6').some(kind => HISTORY_KINDS.includes(kind)),
  'stepping back from t7 to t6 draws no history unit');
// Each open part is shown on the one supplied Scope whose id is its scope or
// condition: since when; 担当未確定 when it has no scope. Its state and causes
// are 差's row (S6).
const groupedLabel = (id, entityKind, entityId) => grouped.frames.find(item => item.id === id).entities
  .find(entity => entity.ref.kind === entityKind && entity.ref.id === entityId).label;
assert.equal(groupedLabel('t4', 'semantic-scope', 'c3'), 'windows repo を退役する\n未達\n1 時点前から（03:00Z）');
assert.equal(groupedLabel('t4', 'unassigned-change', 'c1'), '端末で直接入力できる\n未達\nこの時点から（04:00Z） · 担当未確定');
assert.equal(groupedLabel('t6', 'closed-change', 'c3@t5'), 'c3\ncurrent-satisfied', 'no open part: nothing attached');
assert.equal(groupedLabel('t6', 'scope-group', 'owner:none'), '担当なし', 'a container is not a part');
// An open part on no supplied Scope is counted on 差 (not when there is none)
// and its condition and causes are in 差's record. 差 lists every differing
// condition and each placed one is on its Scope card, so the unplaced one is
// the condition no card carries.
const unplacedWorld = parseAtlasWorldInput(gapWorld({ groups: 'unplaced' }));
const deltaOf = world => world.frames[4].entities.find(entity => entity.ref.kind === 'gap');
assert.match(deltaOf(unplacedWorld).label, /\nScope に付かない差 1 件$/u);
assert.ok(!deltaOf(grouped).label.includes('Scope に付かない差'), 'all placed: no unplaced line');
assert.ok(!byKind(frame('t4'))['gap:hq'].includes('Scope に付かない差'), 'derived Scopes: no unplaced line');
assert.match(deltaOf(unplacedWorld).summary, /Scope に付かない差: condition=c4 · state=unknown · cause=ideal:なし,current:current-unobserved/u);
const sinceCards = world => world.frames[4].entities.filter(entity => entity.area === 'scopes' && /\n(この時点から|\d+ 時点前から)（/u.test(entity.label)).length;
assert.ok(deltaOf(unplacedWorld).label.includes('? c4 · 未観測') && sinceCards(unplacedWorld) === 2 && sinceCards(grouped) === 3, 'c4 is on 差 and on no card');
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
assert.equal(claimedState('t4'), '現在状態\n観測 4 件 · 最新 03:50Z\n作業の主張（current） 2 件\n'
  + 'b · 進行（出所 current:P#L2） · 10-17 03:50Z\nc · 進行（出所 current:P#L3） · 10-17 03:50Z');
assert.equal(claimedState('t6'), '現在状態\n観測 8 件 · 最新 05:30Z\n作業の主張（current） 3 件\n'
  + 'b · 完了と報告（出所 current:P#L2） · 10-17 05:30Z\nc · 不明（最新の行が不正）（出所 current:P#L3） · 10-17 05:30Z\n'
  + 'a · 作成（出所 current:P#L1） · 証拠 roccho-dev/apps#124（出所 current:P#L4） · 10-17 05:30Z');
// v4 (R, adrs#647 c6339644103): once the producer records route:current =
// retired, the claims from current: are the last claims of a stopped route,
// never current ones; frames before it are as they were.
const retired = parseAtlasWorldInput(gapWorld({ current: true, retired: true }));
const retiredState = id => byKind(retired.frames.find(item => item.id === id))['current-state:hq'];
assert.equal(retiredState('t4'), claimedState('t4'), 'a frame before the retirement is as before');
assert.equal(retiredState('t6'), '現在状態\n観測 9 件 · 最新 05:40Z\n止まった経路の最後の主張（current） 3 件 · 10-17 05:40Z 以後は更新されない\n'
  + 'b · 完了と報告（出所 current:P#L2） · 10-17 05:30Z\nc · 不明（最新の行が不正）（出所 current:P#L3） · 10-17 05:30Z\n'
  + 'a · 作成（出所 current:P#L1） · 証拠 roccho-dev/apps#124（出所 current:P#L4） · 10-17 05:30Z');
assert.ok(!retiredState('t6').includes('作業の主張（current）'), 'none of them is shown as a current claim');
for (const item of claimed.frames) {
  const plainKinds = Object.entries(byKind(frame(item.id))).filter(([entityKey]) => !/^(current-state|frame-change):/u.test(entityKey));
  assert.deepEqual(Object.entries(byKind(item)).filter(([entityKey]) => !/^(current-state|frame-change):/u.test(entityKey)), plainKinds, item.id + ': claims change nothing but 現在状態');
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
assert.equal(admittedKinds('t3')['ideal-state:hq'], '理想状態\nv1→v2（未採択） 移動 · 条件 3', 'ideal.set v2 from an unadmitted source');
assert.equal(admittedKinds('t3')['purpose:hq'], '目的\n宣言だけで回る組織\nrev 1（未採択） · 過去の評価：理想状態が不十分（pending-review）', 'an unknown admission value is shown as is');
assert.equal(admittedKinds('t2')['ideal-state:hq'], '理想状態\nv1 · 条件 2', 'ideal.set v1 has no admission: no mark');
for (const item of admitted.frames) {
  const plain = frame(item.id);
  assert.deepEqual(item.entities.map(entity => [entity.ref.kind, entity.flags]), plain.entities.map(entity => [entity.ref.kind, entity.flags]), item.id + ': admission changes no flag');
  assert.deepEqual(item.entities.filter(entity => !['purpose', 'ideal-state', 'frame-change'].includes(entity.ref.kind)).map(entity => entity.label),
    plain.entities.filter(entity => !['purpose', 'ideal-state', 'frame-change'].includes(entity.ref.kind)).map(entity => entity.label), item.id + ': 差, 現在状態, Scopes as without admission');
  assert.deepEqual(projectWorldScene({ input: admitted, frame: item }).representations.map(rep => [rep.regionId, rep.atlas?.status ?? null, rep.visual?.appearance ?? null]),
    projectWorldScene({ input, frame: plain }).representations.map(rep => [rep.regionId, rep.atlas?.status ?? null, rep.visual?.appearance ?? null]), item.id + ': same status and color');
}
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(admitted))), admitted, 'admission marks are idempotent');
// A journal row names the source's admission after the source.
assert.match(journalRows(admitted.frames[0])[0], /出所 adrs#647（未採択） comment 6230983530/u);
const badAdmission = gapWorld({ admission: true });
badAdmission.frames[0].journal[0].source.admission = '';
assert.throws(() => parseAtlasWorldInput(badAdmission), /source.admission must be non-empty text/);
// L3 (adrs#647, contract v12): a plan.set bound to no ideal state, with its
// time and author like any journal entry, is counted as 未結合 n 件: up to the
// frame, each such plan id once, leaving out an id the frame's plans carry. It
// is never one of the frame's plans and never in 現在状態. Plans are an
// attribute of the ideal state, so the count is the last line of 理想状態.
// Every other entity, flag, status and color is as without them.
const unboundWorld = parseAtlasWorldInput(gapWorld({ unbound: true }));
const unboundCount = { t4: 2, t5: 2, t6: 3, t7: 3 };
// What the screen draws as text: every representation's label.
const drawnText = (world, item) => projectAtlasWorld({ input: world, frame: world.frames.find(each => each.id === item.id), selected: 'none' })
  .scene.representations.map(rep => rep.label ?? '').join('\n');
const idealOf = each => each.entities.find(entity => entity.ref.kind === 'ideal-state').label;
for (const item of unboundWorld.frames) {
  const count = unboundCount[item.id];
  assert.ok(count ? drawnText(unboundWorld, item).includes('未結合 ' + count + ' 件') : !drawnText(unboundWorld, item).includes('未結合'),
    item.id + ': the screen shows the unbound count');
  assert.equal(idealOf(item), idealOf(frame(item.id)) + (count ? '\n計画：未宣言（UNKNOWN） · 未結合 ' + count + ' 件' : ''), item.id + ': 理想状態 counts the unbound plans');
  assert.deepEqual(item.entities.filter(entity => entity.ref.kind !== 'ideal-state' && noChange(entity)), frame(item.id).entities.filter(entity => entity.ref.kind !== 'ideal-state' && noChange(entity)),
    item.id + ': every other entity as without them');
  assert.ok(!item.entities.find(entity => entity.ref.kind === 'current-state').label.includes('未結合'), item.id + ': not in 現在状態');
  const scene = world => projectAtlasWorld({ input: world, frame: world.frames.find(each => each.id === item.id), selected: 'none' }).scene.representations
    .filter(rep => !['ideal-state', 'frame-change'].includes(rep.atlas?.ref?.kind)).map(rep => [rep.regionId, rep.label, rep.atlas?.status ?? null, rep.visual?.appearance ?? null]);
  assert.deepEqual(scene(unboundWorld), scene(input), item.id + ': same drawing besides 理想状態');
  assert.equal(item.plans, undefined, item.id + ': unbound plans are not mixed into plans');
}
// An id the frame's plans carry (bound later) is not counted as unbound; the
// frame's own plans are shown as supplied.
const laterBound = gapWorld({ unbound: true });
laterBound.frames[7].plans = [{ ...knownPlan, ref: 'mieru#3', plan: 'mieru#3:release', label: 'mieru release (mieru#3 v1)', version: 1 }];
const laterBoundWorld = parseAtlasWorldInput(laterBound);
// S7: the plan's own line follows (label · serves · content · source).
assert.ok(idealOf(laterBoundWorld.frames[7]).endsWith('\n計画：1 件 · 未結合 2 件\n計画 mieru release (mieru#3 v1) · 寄与 refactor-windows-retired · 内容 ノード 2 件 · 出所 resources#25 comment 4411'),
  idealOf(laterBoundWorld.frames[7]));
// Plans supplied with none unbound: the plans alone; neither: no line (no zero count).
const onlyPlans = gapWorld();
onlyPlans.frames[4].plans = [];
assert.ok(idealOf(parseAtlasWorldInput(onlyPlans).frames[4]).endsWith('\n計画：有効な計画 0 件'), 'supplied plans are shown');
assert.ok(!input.frames.some(item => idealOf(item).includes('計画：')), 'no plans and none unbound: no plan line');
// The journal rows name each entry of the frame, the unbound ones marked, with
// time and author.
const unboundRows = journalRows(unboundWorld.frames[4]);
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
// The stale present is named on 理想↔現在の差's heading (S6), in place of its
// next stale time, and its box reads unknown.
const flat = text => text.replace(/\s+/gu, '');
const deltaDrawn = (world, id, now) => flat(projectAtlasWorld({ input: world, frame: world.frames.find(item => item.id === id), selected: 'none', now })
  .scene.representations.find(rep => rep.atlas?.ref?.kind === 'gap').label);
assert.ok(deltaDrawn(matchedNow, 't5', Date.parse('2026-10-17T05:40:59Z')).endsWith(flat('理想↔現在の差（一致・維持・10-17 05:00Z から・次の鮮度切れ 10-17 05:41Z）\n前 3')));
assert.equal(deltaDrawn(matchedNow, 't5', Date.parse('2026-10-17T05:41:01Z')), flat('? · 理想↔現在の差（一致・維持・10-17 05:00Z から・鮮度切れ・最新か不明（10-17 05:41Z を過ぎた））\n前 3'));
assert.ok(deltaDrawn(matchedNow, 't2', Date.parse('2026-10-17T05:41:01Z')).endsWith(flat('理想↔現在の差（一致・維持・10-17 02:00Z から・次の鮮度切れ 10-17 02:41Z）\n前 不明')),
  'a past frame is not judged by today');

// No band (contract 3, revised): the changes lists each frame's own entries (v6: at
// the frame that carries them).
assert.deepEqual(input.frames.map(item => journalRows(item).map(row => row.split(' ')[0])),
  [['◎'], ['△'], ['▲', '·'], ['▲', '★'], ['◇', '·'], ['★'], [], []], 'each frame lists the entries it carries');

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
assert.match(journalRows(namedInput.frames[0])[0], /作者 不明/u);
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
assert.equal(byKind(parseAtlasWorldInput(off).frames[4])['gap:hq'].split('\n')[0], '理想↔現在の差（一致・維持・10-17 04:00Z から・次の鮮度切れ 不明） · gap と不整合');
// The phase's start is read from the received frames alone: a World cut at
// t4 says the same, and a frame whose phase is not supplied names none.
assert.equal(byKind(parseAtlasWorldInput(gapWorld({ through: 't4' })).frames[4])['gap:hq'], expected.t4['gap:hq'], 'received frames only');
const unsupplied = gapWorld();
delete unsupplied.frames[4].phase;
assert.equal(byKind(parseAtlasWorldInput(unsupplied).frames[4])['gap:hq'].split('\n')[0], '理想↔現在の差', 'no phase: no start');
// A summary that disagrees with the parts is shown as disagreeing.
const offSummary = gapWorld();
offSummary.frames[4].gap.summary.open = 9;
assert.match(byKind(parseAtlasWorldInput(offSummary).frames[4])['gap:hq'], /^理想↔現在の差（[^\n]+）\n前 1 · 集計不一致\n/u);
// Plans never enter the gap: they are named on 理想状態 only (an attribute of the ideal).
const planned = gapWorld();
planned.frames[3].plans = [];
assert.deepEqual(parseAtlasWorldInput(planned).frames[3].entities.filter(entity => entity.ref.kind !== 'ideal-state'),
  frame('t3').entities.filter(entity => entity.ref.kind !== 'ideal-state'), 'plans change no gap entity');

// GapA (目的↔理想の差) comes only from a frame's `adequacy` (contract v12).
// Without it there is no GapA and the ideal state approximates the purpose
// directly; a producer's purpose-adequacy entity (the earlier path, removed at
// ④ once the HQ World carries `adequacy`) is neither drawn nor kept.
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
// D1 (apps#73; R c6343482688): only no-evaluation (t2) and past (t3, t4) wait for the User's evaluation.
const AWAIT = '\n人の判断待ち：User の評価（入力源）';
const AWAITING = new Set(['t2', 't3', 't4']);
const gapALabel = { t0: '不明 · 照らす理想状態が無い', t1: '不明 · 照らす理想状態が無い', t2: '不明 · 人の評価なし' + AWAIT, t3: '不明 · 過去の評価（版が違う）' + AWAIT,
  t4: '不明 · 過去の評価（版が違う）' + AWAIT, t5: '不明 · 十分性の評価なし', t6: '不明 · 差が開いたまま到達と評価', t7: '不明 · 目的は終了した' };
const gapAFlags = id => ['scope_status=unknown', ...(AWAITING.has(id) ? ['awaiting=user-evaluation'] : [])];
for (const item of judged.frames) {
  const [drawn, ...others] = ofKind(judged, item.id, 'purpose-adequacy');
  assert.equal(others.length, 0, item.id + ': one GapA');
  assert.equal(drawn.label, '目的↔理想の差\n' + gapALabel[item.id], item.id + ': GapA state and reason');
  assert.deepEqual(drawn.flags, gapAFlags(item.id), item.id + ': GapA status from its state (and, D1, the wait for the User)');
  assert.ok(!/\d+ 件/u.test(drawn.label), item.id + ': GapA draws no count');
  assert.deepEqual(purposeOrder(item), ['purpose', 'purpose-adequacy', 'ideal-state', 'gap', 'current-state'], item.id + ': the chain P, GapA, I, GapB, C (S7c: the changes are not a box)');
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
assert.deepEqual([markedGapA.label, markedGapA.flags], ['目的↔理想の差\n不明 · 過去の評価（版が違う）（未採択）' + AWAIT, gapAFlags('t3')], 'admission is a mark only');
// D1 (apps#73; adrs#647 c6343466521, R c6343482688): GapA waiting for the User
// is drawn ※ (was ✋; R c6355481524), not the ? of an unknown observation; every other reason keeps
// its own mark. An evaluation the owner source held back after the latest
// counted one says why (the User's next act).
const symbolOf = (world, id) => projectAtlasWorld({ input: world, frame: world.frames.find(item => item.id === id), selected: 'none' })
  .scene.representations.find(rep => rep.atlas?.ref?.kind === 'purpose-adequacy').label.split(' · ')[0];
for (const item of judged.frames) assert.equal(symbolOf(judged, item.id), AWAITING.has(item.id) ? '※' : '?', item.id + ': GapA symbol');
for (const [reason, state] of [['not-yet-while-matched', 'unknown'], ['achieved-while-open', 'unknown'], ['no-adequacy-verdict', 'unknown'], ['evaluated', 'unmet'],
  ['no-ideal', 'unknown'], ['purpose-ended', 'unknown']]) {
  const raw = gapWorld({ judged: true });
  Object.assign(raw.frames[5].adequacy, { state, reason });
  const world = parseAtlasWorldInput(raw);
  const drawn = ofKind(world, 't5', 'purpose-adequacy')[0];
  assert.ok(!drawn.label.includes('人の判断待ち') && !drawn.flags.includes('awaiting=user-evaluation'), reason + ': no wait for the User');
  assert.equal(symbolOf(world, 't5'), state === 'unmet' ? '!' : '?', reason + ': its own mark');
}
const withHeld = gapWorld({ judged: true });
withHeld.frames[2].held = [{ reason: 'owner-readback-missing', kind: null, recordedAt: '2026-10-17T01:50:00Z', source: { ref: 'roccho-dev/atlas-owner#1', commentId: 7, sha256: null } }];
const heldGapA = parseAtlasWorldInput(withHeld);
assert.equal(ofKind(heldGapA, 't2', 'purpose-adequacy')[0].label, '目的↔理想の差\n' + gapALabel.t2 + '\n評価は保持：readback が無い', 't2: the held evaluation says why');
assert.ok(!ofKind(heldGapA, 't3', 'purpose-adequacy')[0].label.includes('評価は保持'), 't3: a hold older than the counted evaluation (02:50Z) is not shown');
// R c6344084041: a later hold of someone else's writing (an evaluation on #647,
// another login, an App) does not replace the User's next act.
const othersLater = gapWorld({ judged: true });
othersLater.frames[2].held = [{ reason: 'owner-readback-missing', kind: null, recordedAt: '2026-10-17T01:50:00Z', source: { ref: 'roccho-dev/atlas-owner#1', commentId: 7, sha256: null } },
  ...['evaluation-not-from-owner', 'owner-other-author', 'owner-via-app'].map((reason, index) => ({ reason, kind: null,
    recordedAt: '2026-10-17T01:5' + (5 + index) + ':00Z', source: { ref: 'roccho-dev/adrs#647', commentId: 8 + index, sha256: null } }))];
assert.equal(ofKind(parseAtlasWorldInput(othersLater), 't2', 'purpose-adequacy')[0].label, '目的↔理想の差\n' + gapALabel.t2 + '\n評価は保持：readback が無い',
  't2: holds of others\' writing do not replace the User\'s next act');
const othersOnly = gapWorld({ judged: true });
othersOnly.frames[2].held = [{ reason: 'evaluation-not-from-owner', kind: null, recordedAt: '2026-10-17T01:55:00Z', source: { ref: 'roccho-dev/adrs#647', commentId: 8, sha256: null } }];
assert.ok(!ofKind(parseAtlasWorldInput(othersOnly), 't2', 'purpose-adequacy')[0].label.includes('評価は保持'), 't2: someone else\'s held writing alone draws no line');
assert.ok(projectAtlasWorld({ input: judged, frame: judged.frames.find(item => item.id === 't4'), selected: 'none' }).scene.representations
  .some(rep => rep.atlas?.ref?.kind === 'gap-part' && rep.label.startsWith('? · ')), 't4: an unknown difference keeps its ?');
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
  assert.deepEqual(drawn.flags, gapAFlags(item.id), item.id + ': a sign changes no state');
  assert.equal(byKind(item)['gap:hq'], byKind(frame(item.id))['gap:hq'], item.id + ': a sign changes no GapB');
}
// held (contract v12): the declarations held back up to the frame. Display
// only, and never in a box (S6): every label and flag as without.
const heldWorld = parseAtlasWorldInput(gapWorld({ held: true }));
for (const item of heldWorld.frames) {
  assert.deepEqual(item.entities.filter(noChange).map(entity => [entity.ref.kind, entity.label, entity.flags]),
    frame(item.id).entities.filter(noChange).map(entity => [entity.ref.kind, entity.label, entity.flags]), item.id + ': held changes no box but the changes');
}

// I2b-1 (contract 3 revised, v12): each feature is checked on its own, so each
// one that is missing fails by itself (and all are reported together).
const missing = [];
const feature = (name, body) => {
  try { body(); } catch (error) { missing.push(name + ': ' + String(error.message).split('\n')[0]); }
};
// S7, S7c: the changes of a frame (#atlas-world-change) are, every one, the journal entries it
// carries (v6) and what was held at it (v12), and its heading counts them
// and what was held up to it (cases 15, 29).
feature('the changes (S7, cases 15, 29)', () => {
  const change = (world, id) => { const index = world.frames.findIndex(item => item.id === id); return gapModule.frameChangeLabel(world.frames.slice(0, index), world.frames[index]); };
  const t3Held = '保持 actor-mismatch · ideal.set · 2026-10-17T02:40:00Z · 出所 adrs#647';
  assert.equal(change(heldWorld, 't3'), 'この時点の変化 3 件 · 保持 累計 1\n' + [...journalRows(frame('t3')), t3Held].join('\n'));
  assert.equal(change(heldWorld, 't4').split('\n')[0], 'この時点の変化 2 件 · 保持 累計 1', 't4: its own two entries, one held so far');
  assert.equal(change(heldWorld, 't5'), 'この時点の変化 3 件 · 保持 累計 3\n' + [...journalRows(frame('t5')),
    '保持 proposal · ideal.set · 2026-10-17T04:20:00Z · 出所 ops#552', '保持 author-unknown · 種類不明 · 2026-10-17T04:30:00Z · 出所 adrs#647'].join('\n'));
  assert.equal(change(heldWorld, 't7'), 'この時点の変化 0 件 · 保持 累計 3', 't7: nothing entered, three held so far');
  assert.equal(change(input, 't6'), 'この時点の変化 0 件', 'none held: no 保持 累計');
});
// Case 14: while an ideal is in force, a newer ideal.drafting with no ideal.set
// of its version yet reads 改訂中 on 理想状態. Display only.
feature('改訂中 (case 14)', () => {
  const drafted = parseAtlasWorldInput(gapWorld({ drafting: true }));
  assert.equal(byKind(drafted.frames[6])['ideal-state:hq'], byKind(frame('t6'))['ideal-state:hq'] + ' · 改訂中 v3', 't6: 改訂中 v3');
  for (const id of ['t5', 't7']) assert.equal(byKind(drafted.frames.find(item => item.id === id))['ideal-state:hq'], byKind(frame(id))['ideal-state:hq'], id + ': not drafting, or no ideal in force');
  assert.ok(!byKind(frame('t1'))['ideal-state:hq'].includes('改訂中'), 't1: drafting the first ideal is 定義中, not 改訂中');
});
// Case 26: parts[i].last_observed, the observation the judge last matched for
// the part, is read exactly and drawn on its line: when, from where, by whom;
// null reads 最後の観測なし.
feature('最後の観測 (case 26)', () => {
  const observed = parseAtlasWorldInput(gapWorld({ lastObserved: true }));
  assert.equal(byKind(observed.frames[4])['gap-part:c1'], expected.t4['gap-part:c1'] + ' · 最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）');
  assert.equal(byKind(observed.frames[4])['gap-part:c3'], expected.t4['gap-part:c3'] + ' · 最後の観測なし');
  assert.ok(byKind(observed.frames[6])['gap-part:c1'].endsWith('\nこの時点から（06:00Z） · 担当未確定 · 最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）'),
    'case 26: the stale part names its last observer');
  const observedPhysical = parseAtlasWorldInput(gapWorld({ lastObserved: true, physical: true }));
  assert.ok(byKind(observedPhysical.frames[4])['package:roccho-dev/apps:packages/atlas'].includes('! c1 · 担当未確定 · 最後の観測 10-17 03:40Z'), 'the card line too');
  const groupedObserved = parseAtlasWorldInput(gapWorld({ lastObserved: true, groups: true }));
  assert.ok(groupedObserved.frames[4].entities.find(entity => entity.ref.id === 'c1').label.endsWith('担当未確定 · 最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）'), 'a supplied Scope card too');
  const rejectPart = (mutate, pattern) => { const raw = gapWorld({ lastObserved: true }); mutate(raw.frames[4].gap.parts.find(part => part.condition === 'c1')); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
  rejectPart(part => { part.last_observed.value = 'x'; }, /last_observed: unknown field value/);
  rejectPart(part => { part.last_observed.observedAt = 'then'; }, /last_observed.observedAt must be a parseable instant/);
  rejectPart(part => { part.last_observed.source = { ref: 'x', url: 'y' }; }, /last_observed.source: unknown field url/);
  rejectPart(part => { delete part.last_observed.actor; }, /last_observed.actor is required/);
});
// frames[i].upkeep is read exactly and kept (S7: on any frame with a condition met).
feature('upkeep', () => {
  const kept = parseAtlasWorldInput(gapWorld({ upkeep: true }));
  assert.deepEqual(kept.frames[5].upkeep.map(item => item.condition), ['c3', 'c1']);
  assert.equal(kept.frames[4].upkeep, undefined, 'only the frames that carry it');
  assert.deepEqual(kept.frames[6].upkeep.map(item => item.condition), ['c3', 'c2'], 'an approximating frame with conditions met');
  const rejectT5 = (mutate, pattern) => { const raw = gapWorld({ upkeep: true }); mutate(raw.frames[5]); assert.throws(() => parseAtlasWorldInput(raw), pattern); };
  rejectT5(item => { item.upkeep = {}; }, /upkeep must be an array/);
  rejectT5(item => { item.upkeep[0].maxAge = 'PT1H'; }, /upkeep\[0\]: unknown field maxAge/);
  rejectT5(item => { delete item.upkeep[0].stale_at; }, /upkeep\[0\].stale_at is required/);
  rejectT5(item => { item.upkeep[0].observedAt = 'soon'; }, /upkeep\[0\].observedAt must be a parseable instant/);
  const fullV12 = parseAtlasWorldInput(gapWorld({ judged: true, held: true, evaluator: true, physical: true, drafting: true, lastObserved: true, upkeep: true }));
  assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(fullV12))), fullV12, 'contract v12 fields are idempotent');
});
// S7: the steps past the present are its upkeep by stale_at minute; on a step
// the changes says its minute and the conditions read unknown then.
feature('steps past the present (S7)', () => {
  const present = parseAtlasWorldInput(gapWorld({ through: 't5', upkeep: true })).frames.at(-1);
  const steps = timeline.forecastSteps(present, Date.parse('2026-10-17T05:00:00Z'));
  assert.deepEqual(steps.map(step => gapModule.forecastChangeLabel(step)), [
    '予定 10-17 05:41Z（観測が無ければ unknown）\n鮮度切れの予定 c1 · 観測 10-17 03:40Z', '予定 10-17 06:10Z（観測が無ければ unknown）\n鮮度切れの予定 c3 · 観測 10-17 03:40Z']);
  assert.equal(timeline.viewedText([present], present, steps[1], steps.length), '表示中：予定 2/2 · 10-17 06:10Z（観測が無ければ）');
  assert.deepEqual(timeline.forecastSteps(frame('t7'), null), [], 'no upkeep: no step');
});
// The journal rows: the entries the frame carries, one row each.
feature('journal rows', () => {
  assert.deepEqual(journalRows(frame('t3')), [
    '▲ 理想の確定 · 2026-10-17T02:30:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530 · sha256 ' + 'a'.repeat(64),
    '★ 評価 · 2026-10-17T02:50:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530 · sha256 ' + 'a'.repeat(64)]);
  assert.deepEqual(journalRows(frame('t6')), [], 't6 carries none');
});
// Search: a selected relation brings the camera to a drawn end of it (the one
// screen has no record panel), its from box first.
feature('search focuses a relation', () => {
  const chosen = frame('t4').relations.find(item => item.label === '差');
  const relationSelected = projectAtlasWorld({ input, frame: frame('t4'), selected: relationKey(chosen.ref) });
  assert.equal(relationSelected.selectedRegionId, 'world:' + entityKey(chosen.from), 'a relation focuses its from box');
});
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
  'roccho-dev/apps\npackages/atlas\n対象: 理想↔現在の差\n! c3 · 担当 scope:atlas\n! c1 · 担当未確定');
assert.equal(byKind(physicalT4)['package:roccho-dev/ui:packages/control'], 'roccho-dev/ui\npackages/control\n対象: 理想↔現在の差\n! c3 · 担当 scope:atlas');
assert.equal(byKind(physicalT4)['service:native:serve-static'], 'native:serve-static\n保つ: c1\n対象: 理想↔現在の差\n! c1 · 担当未確定');
assert.equal(byKind(physicalT4)['gap:hq'], '理想↔現在の差（近似中・10-17 03:00Z から）\n前 1\n! c3 · 継続 · 物理Scope roccho-dev/apps/packages/atlas / roccho-dev/ui/packages/control'
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
feature('operation matched by kind and id', () => {
  const otherSpace = gapWorld({ judged: true, physical: true });
  for (const relation of otherSpace.frames[2].relations) if (relation.to.kind === 'purpose-state-target') relation.to = { ...relation.to, space: 'producer:atlas' };
  otherSpace.frames[2].entities.find(entity => entity.ref.kind === 'purpose-state-target').ref.space = 'producer:atlas';
  assert.ok(physicalRelations(parseAtlasWorldInput(otherSpace).frames[2]).includes('service>ideal-state この条件を保つもの'), 'kind and id alone');
});

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
assert.deepEqual(missing, [], 'I2b-1 features: ' + missing.join(' | '));
console.log(JSON.stringify({ status: 'atlas-world-gap-checks-pass', frames: input.frames.length }));
