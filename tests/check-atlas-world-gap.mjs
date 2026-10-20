// The gap view on adrs#647 contract v3-v6 (frames[i].gap / phase / journal /
// matched_until). Pure; no browser. The drawn journey, the band and the ui
// clock are tests/atlas-world-gap-browser-proof.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityKey, parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene } from '../packages/control/src/atlas-world-projection.mjs';
import { TIMELINE_ID_PREFIX } from '../packages/control/src/atlas-timeline.mjs';
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
    'gap-part:c1': '端末で直接入力できる\n未達 · 現在の後退 · この時点から（04:00Z） · 担当なし' },
  t5: { 'phase:hq': '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z · 理想状態の確定前の観測で一致 1 件', 'purpose:hq': '目的\n宣言だけで回る組織\nrev 1 · 評価：到達',
    'gap:hq': '差 0（前 3）', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z\n理想の条件 4 件のうち一致 4 件', 'gap-closed:t5': '閉じた差 3（この時点 3）\nc1 現在が充足・c4 現在が充足' },
  t6: { 'phase:hq': '局面：近似中 · 差 2 · v2', 'gap:hq': '差 2（前 0）\n! c1 · 鮮度切れ\n? c4 · 照合不能',
    'gap-part:c4': 'envs のスコープ主張\n不明 · 照合不能 · この時点から（06:00Z） · scope:envs' },
  t7: { 'phase:hq': '局面：目的の終了 · Scope は凍結（履歴）', 'gap:hq': '差 対象外\n目的は終了した',
    'ideal-state:hq': '理想状態\n照らし合わせる理想状態なし（目的は終了）', 'current-state:hq': '現在状態\n観測 2 件 · 最新 03:40Z',
    'gap-closed:t7': '閉じた差 4（この時点 1）\nc4 現在が充足・c1 目的の終了' },
};
for (const item of Object.values(expected)) if (item['gap:hq']) item['gap:hq'] = '理想↔現在の差\n' + item['gap:hq'];
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
assert.equal(groupedLabel('t4', 'unassigned-change', 'c1'), '端末で直接入力できる\n未達\n未達 · 現在の後退 · この時点から（04:00Z） · 担当なし');
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
// L3 (adrs#647, CLAIM v3): a plan.set bound to no ideal state, with its time
// and author like any journal entry, is a current-side fact: 現在状態 lists,
// up to the frame, each such plan id at its newest version, leaving out an id
// the frame's plans carry. Display only: 差, 理想状態, the Scopes, the Agents,
// the match count n/m, every flag, status, color and the plan cell are as
// without them; the band has no mark of its own for them.
const unboundWorld = parseAtlasWorldInput(gapWorld({ unbound: true }));
const unboundLine = { t4: '宣言に未結合の計画 2 件：resources#71:tool-split v1 · nixos#12:fork-surface v2',
  t6: '宣言に未結合の計画 3 件：resources#71:tool-split v2 · nixos#12:fork-surface v2 · mieru#3:release v1' };
unboundLine.t5 = unboundLine.t4;
unboundLine.t7 = unboundLine.t6;
for (const item of unboundWorld.frames) {
  const plain = frame(item.id);
  const currentOf = each => each.entities.find(entity => entity.ref.kind === 'current-state').label;
  assert.equal(currentOf(item), currentOf(plain) + (unboundLine[item.id] ? '\n' + unboundLine[item.id] : ''), item.id + ': 現在状態 lists the unbound plans');
  assert.deepEqual(item.entities.filter(entity => entity.ref.kind !== 'current-state').map(entity => [entity.ref.kind, entity.ref.id, entity.label, entity.flags]),
    plain.entities.filter(entity => entity.ref.kind !== 'current-state').map(entity => [entity.ref.kind, entity.ref.id, entity.label, entity.flags]), item.id + ': every other entity as without them');
  assert.deepEqual(item.entities.map(entity => entity.flags), plain.entities.map(entity => entity.flags), item.id + ': no flag changes');
  for (const chrome of ['none', 'full']) {
    const scene = world => projectAtlasWorld({ input: world, frame: world.frames.find(each => each.id === item.id), selected: 'none', chrome }).scene.representations
      .filter(rep => !rep.regionId.startsWith(TIMELINE_ID_PREFIX + 'journal')).map(rep => [rep.regionId, rep.atlas?.ref?.kind === 'current-state' ? null : rep.label,
        rep.atlas?.status ?? null, rep.visual?.appearance ?? null]);
    assert.deepEqual(scene(unboundWorld), scene(input), item.id + ' ' + chrome + ': same drawing, status, color and plan cell besides 現在状態\'s text');
  }
}
// An id the frame's plans carry (bound later) is not listed as unbound.
const laterBound = gapWorld({ unbound: true });
laterBound.frames[7].plans = [{ ...knownPlan, ref: 'mieru#3', plan: 'mieru#3:release', label: 'mieru release (mieru#3 v1)', version: 1 }];
assert.ok(parseAtlasWorldInput(laterBound).frames[7].entities.find(entity => entity.ref.kind === 'current-state').label
  .endsWith('\n宣言に未結合の計画 2 件：resources#71:tool-split v2 · nixos#12:fork-surface v2'), 'an id in the frame\'s plans is left out');
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
assert.equal(phaseLabel(matchedNow, 't5', Date.parse('2026-10-17T05:40:59Z')), '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z · 理想状態の確定前の観測で一致 1 件');
assert.equal(phaseLabel(matchedNow, 't5', Date.parse('2026-10-17T05:41:01Z')), '? · 局面：一致・維持 → 鮮度切れ・最新か不明（05:41Z を過ぎた）');
assert.equal(phaseLabel(matchedNow, 't2', Date.parse('2026-10-17T05:41:01Z')), '局面：一致・維持 · 新規 0 · 次の鮮度切れ 02:41Z', 'a past frame is not judged by today');

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
assert.equal(byKind(parseAtlasWorldInput(off).frames[4])['phase:hq'], '局面：一致・維持 · 新規 0 · 次の鮮度切れ 不明 · gap と不整合');
// A summary that disagrees with the parts is shown as disagreeing.
const offSummary = gapWorld();
offSummary.frames[4].gap.summary.open = 9;
assert.match(byKind(parseAtlasWorldInput(offSummary).frames[4])['gap:hq'], /^理想↔現在の差\n差 3（前 1） · 集計不一致\n/u);
// Plans never enter the gap view.
const planned = gapWorld();
planned.frames[3].plans = [];
assert.deepEqual(parseAtlasWorldInput(planned).frames[3].entities, frame('t3').entities, 'plans change no gap entity');

// GapA (目的↔理想の差) is the producer's purpose-adequacy (apps#129): drawn as
// supplied between 理想状態 and 理想↔現在の差, never judged here from the
// journal, a match or CI. When none is supplied there is no GapA and the ideal
// state approximates the purpose directly, as before.
const ofKind = (world, id, kind) => world.frames.find(item => item.id === id).entities.filter(entity => entity.ref.kind === kind);
const gapRelations = item => item.relations.filter(relation => relation.kind === 'gap').map(relation => relation.from.kind + '>' + relation.to.kind + ' ' + relation.label);
for (const item of input.frames) {
  assert.deepEqual(ofKind(input, item.id, 'purpose-adequacy'), [], item.id + ': no GapA supplied, none drawn');
  assert.ok(gapRelations(item).includes('ideal-state>purpose 近似'), item.id + ': ideal approximates the purpose');
}
const suppliedAdequacy = gapWorld({ adequacy: true });
const adequate = parseAtlasWorldInput(suppliedAdequacy);
const purposeOrder = item => item.entities.filter(entity => entity.area === 'purpose').sort((a, b) => a.order - b.order).map(entity => entity.ref.kind);
for (const item of adequate.frames) {
  const [drawn] = ofKind(adequate, item.id, 'purpose-adequacy');
  const raw = suppliedAdequacy.frames.find(each => each.id === item.id).entities.find(entity => entity.ref.kind === 'purpose-adequacy');
  assert.deepEqual([drawn.label, drawn.flags, drawn.summary], [raw.label, raw.flags, raw.summary], item.id + ': GapA as supplied');
  assert.deepEqual(purposeOrder(item), ['phase', 'purpose', 'purpose-adequacy', 'ideal-state', 'gap', 'current-state'], item.id + ': declared as the chain P, GapA, I, GapB, C');
  const relations = gapRelations(item);
  assert.ok(relations.includes('ideal-state>purpose-adequacy 照らす') && relations.includes('purpose-adequacy>purpose 十分性')
    && !relations.some(relation => relation.endsWith(' 近似')), item.id + ': one path P–GapA–I: ' + relations.join(', '));
  assert.deepEqual(item.entities.filter(entity => entity.ref.kind !== 'purpose-adequacy').map(entity => [entity.ref.kind, entity.ref.id, entity.label, entity.flags]),
    frame(item.id).entities.map(entity => [entity.ref.kind, entity.ref.id, entity.label, entity.flags]), item.id + ': GapA changes no other entity');
}
assert.deepEqual(ofKind(adequate, 't4', 'purpose-adequacy')[0].flags, ['purpose_adequacy=insufficient', 'role=whole-purpose-evaluation']);
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(adequate))), adequate, 'GapA is idempotent');
// The journal never judges GapA: a current, unadmitted evaluation leaves it as supplied.
const rejudged = gapWorld({ adequacy: true });
Object.assign(rejudged.frames[3].journal.find(entry => entry.kind === 'purpose.evaluated'), { ideal_version: 2 });
rejudged.frames[3].journal.find(entry => entry.kind === 'purpose.evaluated').source.admission = 'observed_not_admitted';
const rejudgedWorld = parseAtlasWorldInput(rejudged);
for (const item of rejudgedWorld.frames) assert.deepEqual(ofKind(rejudgedWorld, item.id, 'purpose-adequacy'), ofKind(adequate, item.id, 'purpose-adequacy'), item.id + ': no GapA judgment here');
// Admission is a mark only (adrs#647): on the evaluation in 目的, never on GapA's state.
const markedWorld = parseAtlasWorldInput(gapWorld({ adequacy: true, admission: true }));
for (const item of markedWorld.frames) assert.deepEqual(ofKind(markedWorld, item.id, 'purpose-adequacy'), ofKind(adequate, item.id, 'purpose-adequacy'), item.id + ': admission leaves GapA as supplied');
assert.equal(byKind(markedWorld.frames[3])['purpose:hq'], '目的\n宣言だけで回る組織\nrev 1（未採択） · 過去の評価：理想状態が不十分（pending-review）');

// Physical Scope (apps#129): each declared repo/package is a Scope card naming
// the gaps and the parts it is declared for; a part without a declaration reads
// 未特定 on 理想↔現在の差. Nothing is matched by name, owner or scope.
const physicalWorld = parseAtlasWorldInput(gapWorld({ physical: true }));
const physicalT4 = physicalWorld.frames[4];
assert.deepEqual(physicalT4.entities.filter(entity => entity.area === 'scopes').map(entity => entity.ref.kind + ':' + entity.ref.id),
  ['package:roccho-dev/apps:packages/atlas', 'package:roccho-dev/ui:packages/control'], 't4: the declared packages are the Scopes');
assert.equal(byKind(physicalT4)['package:roccho-dev/apps:packages/atlas'],
  'roccho-dev/apps\npackages/atlas\n対象: 目的↔理想の差・理想↔現在の差\n! c3 · 未達 · 継続 · 担当 scope:atlas\n! c1 · 未達 · 現在の後退 · 担当なし');
assert.equal(byKind(physicalT4)['package:roccho-dev/ui:packages/control'], 'roccho-dev/ui\npackages/control\n対象: 理想↔現在の差\n! c3 · 未達 · 継続 · 担当 scope:atlas');
assert.equal(byKind(physicalT4)['gap:hq'], '理想↔現在の差\n差 3（前 1）\n! c3 · 継続 · 物理Scope roccho-dev/apps/packages/atlas / roccho-dev/ui/packages/control'
  + '\n! c1 · 現在の後退 · 物理Scope roccho-dev/apps/packages/atlas\n? c4 · 未観測 · 物理Scope 未特定');
assert.deepEqual(gapRelations(physicalT4).filter(relation => relation.startsWith('package>')),
  ['package>gap この差を埋める対象', 'package>purpose-adequacy この差を埋める対象', 'package>gap この差を埋める対象']);
assert.deepEqual(parseAtlasWorldInput(JSON.parse(JSON.stringify(physicalWorld))), physicalWorld, 'physical Scope is idempotent');

// Position is computed from the relations alone (no order fixed per area, kind
// or name): GapA is drawn above GapB, and no other relation of the purpose
// area runs through GapB's box.
const through = (box, a, b) => Array.from({ length: 99 }, (_, n) => (n + 1) / 100)
  .some(t => { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; return x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height; });
for (const world of [adequate, physicalWorld]) for (const item of world.frames) {
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
