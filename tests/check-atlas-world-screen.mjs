// The one World screen (contract 3, revised, adrs#647 comment 6305441262) and
// its elements (S6, comment 6306887827). Pure; no browser.
// - Every projection draws the three areas only: no HUD, detail panel, strip
//   or band region, and no record panel to read.
// - The kinds of box and line drawn are the display section's table
//   (packages/control/src/atlas-screen-table.mjs): every line drawn is of a
//   kind in it, every kind in it is drawn by some World here, none of the
//   removed P elements is drawn, and the relations carry no label.
// - What the 30 divergence cases need is read where the User reads it: the
//   text drawn in the boxes (S7: what was held, in the changes).
// Every check is reported; one failing does not hide the others.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { ATLAS_STATUS, projectAtlasWorld, selectionText, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { SCREEN_CONTROLS, SCREEN_LINES } from '../packages/control/src/atlas-screen-table.mjs';
import * as gapModule from '../packages/control/src/atlas-gap.mjs';
import * as timeline from '../packages/control/src/atlas-timeline.mjs';
import { crowdedGapWorld, gapWorld } from './fixtures/atlas-gap-world.mjs';
import { knownPlan, unknownPlan } from './fixtures/atlas-plan-worlds.mjs';

// The gap story with two plans at t4 (one with unknown content).
const plannedWorld = () => { const raw = gapWorld(); raw.frames[4].plans = [structuredClone(knownPlan), structuredClone(unknownPlan)]; return parseAtlasWorldInput(raw); };
import { bundledWorld, worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

const failures = [];
const check = (name, pass, detail = null) => { if (!pass) failures.push({ name, ...(detail === null ? {} : { detail }) }); };
const project = (world, item, extra = {}) => projectAtlasWorld({ input: world, frame: item, selected: 'none', ...extra });

// No HUD, panel, strip or band: only area and entity regions, never a guide,
// at any size; no record, detail or direction is projected.
const worlds = [parseAtlasWorldInput(bundledWorld()), parseAtlasWorldInput(worldWithFrames(3)),
  parseAtlasWorldInput(gapWorld({ judged: true, held: true, evaluator: true, physical: true, unbound: true, drafting: true, lastObserved: true, upkeep: true })),
  // v4 (adrs#647 c6339644103): the current claims, and from t6 the stopped route's last ones.
  parseAtlasWorldInput(gapWorld({ current: true, retired: true })),
  parseAtlasWorldInput(JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8')))];
let regions = 0;
const STATUS_SYMBOLS = Object.values(ATLAS_STATUS).map(status => status.symbol);
const drawnSymbols = new Map();
const drawnActivity = new Set();
for (const world of worlds) for (const item of world.frames) for (const viewport of [{ width: 800, height: 900 }, { width: 1500, height: 1000 }]) {
  const projection = project(world, item, { viewport });
  const kinds = new Set(projection.scene.representations.map(rep => rep.atlas?.kind ?? 'none'));
  assert.deepEqual([...kinds].filter(kind => !['area', 'entity'].includes(kind)), [], item.id + ': only the three areas are drawn');
  assert.equal(projection.scene.representations.filter(rep => rep.isGuide || rep.zIndex >= 10000).length, 0, item.id + ': no HUD region');
  for (const key of ['detail', 'direction', 'selected', 'worldComparison', 'aggregateRelationIds']) assert.ok(!(key in projection), item.id + ': no ' + key);
  assert.deepEqual(Object.keys(projection.viewport), ['graph'], 'one layout: the graph alone');
  regions += projection.scene.representations.length;
  // D5 (apps#73; adrs#647 R c6344515321): a still image tells the states apart
  // by the symbol, never by the colour alone; one state is drawn with one symbol.
  for (const rep of projection.scene.representations.filter(rep => rep.atlas?.kind === 'entity')) {
    const head = rep.label.split(' · ')[0];
    if (rep.atlas.status !== null) {
      check(item.id + ': D5 ' + rep.regionId + ' carries its state\'s symbol', rep.label.startsWith(ATLAS_STATUS[rep.atlas.status].symbol + ' · '), rep.label);
      drawnSymbols.set(rep.atlas.status, new Set([...(drawnSymbols.get(rep.atlas.status) ?? []), head]));
    } else if (rep.atlas.activity !== 'none') {
      // Activity has its own symbols; only the unknown one shares `?`, which means unknown there too.
      drawnActivity.add(rep.atlas.activity);
      check(item.id + ': D5 ' + rep.regionId + ' activity symbol is no state\'s', !STATUS_SYMBOLS.includes(head) || (rep.atlas.activity === 'unknown' && head === ATLAS_STATUS.unknown.symbol), rep.label);
    }
  }
}
check('D5: every state has its own symbol', new Set(STATUS_SYMBOLS).size === STATUS_SYMBOLS.length, STATUS_SYMBOLS);
check('D5: every state is drawn by some World here', drawnSymbols.size === STATUS_SYMBOLS.length, [...drawnSymbols.keys()]);
check('D5: some World here draws activity', drawnActivity.size > 0);
check('D5: every drawn state is drawn with one symbol', [...drawnSymbols.values()].every(symbols => symbols.size === 1), Object.fromEntries([...drawnSymbols].map(([status, symbols]) => [status, [...symbols]])));
assert.deepEqual(worldViewport({ width: 800, height: 600 }), { graph: { x: 16, y: 16, width: 768, height: 568 } });

// The table. A box is named by what gapView draws in it; any other box is the
// producer's (supplied), and so is every box of a frame without a gap. Lines are read as gapView writes them, before the
// layout wraps them; the stale present's heading as the projection writes it.
const GAP_BOXES = new Set(['purpose', 'purpose-adequacy', 'ideal-state', 'gap', 'current-state', 'gap-part', 'gap-closed', 'history-hidden', 'p-series', 'p-summary']);
const boxOf = (entity, frame) => !Object.hasOwn(frame, 'gap') ? 'supplied' : GAP_BOXES.has(entity.ref.kind) && (entity.ref.kind !== 'purpose' || entity.flags.includes('gap-view')) ? entity.ref.kind
  : entity.flags.includes('gap-view') ? (entity.flags.includes('physical-scope') ? 'physical' : 'scope-card')
    : entity.ref.kind === 'phase' ? 'phase' : 'supplied';
const boxes = new Set(SCREEN_LINES.map(item => item.box));
const kindOf = (box, line) => SCREEN_LINES.find(item => item.box === box && item.line.test(line))?.id ?? null;
// The removed P elements (S6), as they were written, by the boxes they were in.
const REMOVED = [
  ['局面の箱', null, /^局面：/u],
  ['理想の箱の追加 n・改訂 n', ['ideal-state'], /（(追加|改訂) \d+/u],
  ['差の箱の差 n', ['gap'], /^差 \d+/u],
  ['現在状態の一致 m/n', ['current-state'], /^理想の条件.*一致/u],
  ['part のカードの原因・状態の再掲', ['gap-part', 'scope-card', 'physical'], /^((未達|不明) · |[!?] \S+ · (未達|不明) · )/u],
];
const lineWorlds = [
  ...worlds,
  ...[{}, { groups: true }, { groups: 'unplaced' }, { current: true, admission: true }, { newPurpose: true }, { sides: false, v5: false },
    { physical: true, lastObserved: true }, { held: true, upkeep: true }, { pRecords: true }, { pRecords: 'waiting', judged: true }, { pRecords: 'series', judged: true }, { pRecords: 'redacted', judged: true }].map(options => parseAtlasWorldInput(gapWorld(options))),
  plannedWorld(),
  parseAtlasWorldInput(crowdedGapWorld()),
  // D1 (R c6343482688): GapA waits for the User, and the owner source held an evaluation back.
  (() => { const raw = gapWorld({ judged: true });
    raw.frames[2].held = [{ reason: 'owner-readback-missing', kind: null, recordedAt: '2026-10-17T01:50:00Z', source: { ref: 'roccho-dev/atlas-owner#1', commentId: 7, sha256: null } }];
    return parseAtlasWorldInput(raw); })(),
];
const seen = new Set();
for (const world of lineWorlds) for (const frame of world.frames) {
  for (const entity of frame.entities) {
    const box = boxOf(entity, frame);
    const labels = [entity.label];
    if (entity.ref.kind === 'gap' && frame.phase === 'matched' && frame.matched_until) {
      const { staleDeltaLabel } = gapModule;
      check('the stale present is named on the 差 heading (staleDeltaLabel)', typeof staleDeltaLabel === 'function');
      if (typeof staleDeltaLabel === 'function') labels.push(staleDeltaLabel(entity.label, frame));
    }
    check(frame.id + ': no box of changes is drawn in the graph (S7c)', entity.ref.kind !== 'frame-change');
    check(frame.id + ': ' + box + ' is a box of the table', boxes.has(box), entity.ref);
    for (const line of labels.flatMap(label => label.split('\n'))) {
      const kind = boxes.has(box) ? kindOf(box, line) : null;
      if (kind) seen.add(kind);
      else check(frame.id + ' ' + box + ': the line is of a kind in the table', false, line);
      for (const [name, where, pattern] of REMOVED) if (!where || where.includes(box)) check(frame.id + ' ' + box + ': ' + name + ' is not drawn', !pattern.test(line), line);
    }
  }
  for (const relation of project(world, frame).scene.relations) check(frame.id + ': a relation is drawn without a label', relation.label === '', relation.label);
  // S7c: the lines of #atlas-world-change: the frame's changes and, were it
  // the present, each step past it.
  if (Object.hasOwn(frame, 'gap')) {
    const index = world.frames.indexOf(frame);
    const lines = [gapModule.frameChangeLabel?.(world.frames.slice(0, index), frame, world.frames) ?? '',
      ...(timeline.forecastSteps?.(frame, null) ?? []).map(step => gapModule.forecastChangeLabel(step))].flatMap(text => text.split('\n')).filter(Boolean);
    check(frame.id + ': the changes have their lines (frameChangeLabel)', lines.length > 0);
    for (const line of lines) {
      const kind = kindOf('atlas-world-change', line);
      if (kind) seen.add(kind);
      else check(frame.id + ' atlas-world-change: the line is of a kind in the table', false, line);
    }
  }
  // D6 (R c6342315491): an area heading is its name, then only the table's
  // phrases for what is not drawn.
  for (const rep of project(world, frame).scene.representations.filter(item => item.atlas?.kind === 'area')) {
    const [name, ...phrases] = rep.label.split(' · ');
    if (kindOf('area', name) === 'area-name') seen.add('area-name');
    for (const phrase of phrases) {
      const kind = kindOf('area', phrase);
      if (kind === 'area-omitted') seen.add(kind);
      else check(frame.id + ' area: the heading phrase is of a kind in the table', false, phrase);
    }
  }
}
const unseen = SCREEN_LINES.filter(item => !seen.has(item.id)).map(item => item.id);
check('every kind of line in the table is drawn by some World here', unseen.length === 0, unseen);

// The 30 cases (comments 6303801344, 6304588582): each one the screen can
// show, with the words that show it, as drawn. ○ and △ cases; the － and ×
// ones (3, 6, 7, 17, 18) are not drawn by design.
const drawn = (options, id, { mutate = null, now = null } = {}) => {
  const raw = gapWorld(options);
  mutate?.(raw);
  const world = parseAtlasWorldInput(raw);
  const item = world.frames.find(each => each.id === id);
  return flat(project(world, item, now === null ? {} : { now }).scene.representations.map(rep => rep.label ?? '').join('\n'));
};
// Drawn labels are wrapped at any character: compare without white space.
const flat = text => text.replace(/\s+/gu, '');
const setAdequacy = (id, state, reason) => raw => { Object.assign(raw.frames.find(item => item.id === id).adequacy, { state, reason }); };
const CASES = [
  [1, '人の評価で理想が不十分', { judged: true }, 't4', ['目的↔理想の差 不十分 · 人の評価：理想状態が不十分'], { mutate: setAdequacy('t4', 'unmet', 'evaluated') }],
  [2, '一致のまま未到達', { judged: true }, 't5', ['一致のまま未到達と評価'], { mutate: setAdequacy('t5', 'unknown', 'not-yet-while-matched') }],
  [4, '目的の改訂に理想が未追随', { judged: true }, 't0', ['理想↔現在の差（目的変更・10-17 00:00Z から）', '照らす理想状態が無い']],
  [5, '差が開いたまま到達', { judged: true }, 't6', ['差が開いたまま到達と評価']],
  [8, '観測なし・古い・照合不能', {}, 't6', ['鮮度切れ', '照合不能']],
  [8, '観測なし', {}, 't4', ['未観測']],
  [10, '後退', {}, 't4', ['現在の後退']],
  [11, '理想の改訂で差が増える', {}, 't3', ['理想に追加']],
  [12, '担当なし', {}, 't4', ['担当未確定']],
  [13, '目的の達成評価', {}, 't5', ['評価：到達']],
  [13, '目的の終了', { judged: true }, 't7', ['目的は終了した', '理想↔現在の差（目的の終了・10-17 07:00Z から）']],
  [14, '理想の改訂中', { drafting: true }, 't6', ['改訂中 v3']],
  [16, '理想より前の観測', {}, 't5', ['現在状態', '理想状態の確定前の観測で一致 1 件']],
  [19, '評価の後に理想が改訂', { judged: true }, 't3', ['過去の評価（版が違う）']],
  [20, 'GapB が開いている間の評価', { judged: true }, 't5', ['十分性の評価なし']],
  [21, '未結合の計画', { unbound: true }, 't7', ['計画：未宣言（UNKNOWN） · 未結合 3 件']],
  [22, '鮮度切れ（最新の frame）', { through: 't5' }, 't5', ['理想↔現在の差（一致・維持・10-17 05:00Z から・鮮度切れ・最新か不明（10-17 05:41Z を過ぎた））'],
    { now: Date.parse('2026-10-17T05:41:01Z') }],
  [22, '次の鮮度切れ', { through: 't5' }, 't5', ['理想↔現在の差（一致・維持・10-17 05:00Z から・次の鮮度切れ 10-17 05:41Z）']],
  [23, '評価者の評価', { judged: true, evaluator: true }, 't3', ['評価者の評価（未検証） adequacy=problem（出所 jev:ops#573 · jev · 10-17 02:45Z）']],
  [24, '評価者が止まる', { judged: true, evaluator: true }, 't7', ['評価者の評価（未検証） adequacy=ok（出所 jev:ops#573 · jev · 10-17 05:10Z）']],
  [25, 'operation の運用物', { physical: true }, 't4', ['native:serve-static 保つ: c1 対象: 理想↔現在の差']],
  [26, '観測者が止まる', { lastObserved: true }, 't6', ['最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）']],
  [27, 'development の変更対象', { physical: true }, 't4', ['roccho-dev/apps packages/atlas 対象: 理想↔現在の差']],
  [30, 'operation を保つ間', { physical: true }, 't2', ['native:serve-static 保つ: c1']],
];
for (const [number, name, options, id, words, extra = {}] of CASES) {
  const text = drawn(options, id, extra);
  for (const word of words) check('case ' + number + ' (' + name + ') at ' + id + ': ' + word + ' is drawn', text.includes(flat(word)));
}
// Cases 15 and 29 (S7, S7c): what was held is a row of the changes of the
// frame it was held at, and their heading counts what was held up to there.
const changeText = (options, id) => {
  const world = parseAtlasWorldInput(gapWorld(options));
  const index = world.frames.findIndex(item => item.id === id);
  return flat(gapModule.frameChangeLabel?.(world.frames.slice(0, index), world.frames[index]) ?? '');
};
const heldText = id => changeText({ held: true }, id);
for (const [number, id, row] of [[15, 't3', '保持 actor-mismatch · ideal.set · 2026-10-17T02:40:00Z · 出所 adrs#647'],
  [29, 't5', '保持 proposal · ideal.set · 2026-10-17T04:20:00Z · 出所 ops#552'], [15, 't5', '保持 author-unknown · 種類不明 · 2026-10-17T04:30:00Z · 出所 adrs#647']]) {
  check('case ' + number + ' at ' + id + ': the changes has the row ' + row, heldText(id).includes(flat(row)));
}
check('cases 15 and 29: the heading counts what was held up to the frame', heldText('t4').includes(flat('この時点の変化 2 件 · 保持 累計 1'))
  && heldText('t6').includes(flat('保持 累計 3')) && !changeText({}, 't6').includes(flat('保持 累計')) && !drawn({ held: true }, 't5').includes(flat('保持')));
// S7: the time controls are three; 予定 ▸ and 仕訳 ▸ are gone. S7c: the
// changes of the time shown are the panel right under them.
check('the controls are the status, the search, the selection (D4), ◀ 前へ / 次へ ▶ / 現在へ and the changes', JSON.stringify(SCREEN_CONTROLS.map(item => item.id))
  === JSON.stringify(['atlas-world-status', 'atlas-world-search', 'atlas-world-search-results', 'atlas-world-search-count', 'atlas-world-selection', 'atlas-world-step-back', 'atlas-world-step-forward', 'atlas-world-present', 'atlas-world-change']));
// D4 (apps#73; adrs#647 W c6344580290, R c6345797392): a selection the frame
// shown does not draw says so, under the same id: absent, with the received
// frame it was last in; a history unit kept but not drawn (B1), as history.
{
  const world = parseAtlasWorldInput(gapWorld({ groups: true }));
  const selectionAt = (frame, selected) => project(world, frame, { selected }).selection;
  const keyOf = entity => entityKey(entity.ref);
  const present = world.frames.at(-1);
  const inPresent = new Set([...present.entities.map(keyOf), ...present.relations.map(relation => relationKey(relation.ref))]);
  const gone = [...new Set(world.frames.flatMap(item => item.entities.filter(entity => entity.visible).map(keyOf)).filter(key => !inPresent.has(key)))];
  check('D4: the fixture has drawn records gone from the present', gone.length > 0);
  for (const key of gone) {
    const lastIndex = world.frames.findLastIndex(item => item.entities.some(entity => keyOf(entity) === key));
    const last = world.frames[lastIndex];
    const label = last.entities.find(entity => keyOf(entity) === key).label.split('\n')[0];
    const selection = selectionAt(present, key);
    check('D4 ' + key + ': absent from the present, named with the frame it was last in', selection?.state === 'absent'
      && selection.last?.index === lastIndex && selection.last.id === last.id
      && selectionText(selection) === '選択 ' + label + ' はこの時点に無い（最後 ' + last.id + ' · ' + gapModule.dayClockText(last.asOf) + '）', selection);
    check('D4 ' + key + ': in the frame it was last in, it is not absent', selectionAt(last, key)?.state !== 'absent');
  }
  const t6 = world.frames.find(item => item.id === 't6');
  const history = t6.entities.filter(entity => !entity.visible && ['closed-change', 'obligation'].includes(entity.ref.kind));
  check('D4: the fixture has history units at t6', history.length > 0);
  for (const entity of history) {
    const selection = selectionAt(t6, keyOf(entity));
    check('D4 ' + keyOf(entity) + ': a history unit not drawn reads as history, with no frame to open', selection?.state === 'history' && selection.last === null
      && selectionText(selection) === '選択 ' + entity.label.split('\n')[0] + ' は描かれない（履歴）', selection);
  }
  const drawnEntity = t6.entities.find(entity => entity.visible);
  check('D4: a drawn selection has no line', selectionAt(t6, keyOf(drawnEntity)) === null && selectionText(null) === '');
  const never = selectionAt(t6, 'entity:none');
  check('D4: a selection in no received frame is absent, its last frame unknown', never?.state === 'absent' && never.last === null
    && selectionText(never) === '選択 entity:none はこの時点に無い（最後 不明）', never);
}
// P's records (p-record-v1; adrs#647 W c6346827237, R c6346841107): the records that entered at a frame are
// rows of its changes, each P's unverified claim; one held back is one of the frame's held (保持 累計 counts it).
{
  const raw = () => gapWorld({ pRecords: true });
  const world = parseAtlasWorldInput(raw());
  const index = world.frames.findIndex(item => item.id === 't4');
  const lines = (gapModule.frameChangeLabel?.(world.frames.slice(0, index), world.frames[index]) ?? '').split('\n');
  const journal = world.frames[index].journal?.length ?? 0;
  check('P records: the heading counts the journal, the eight records and the one held', lines[0] === 'この時点の変化 ' + (journal + 9) + ' 件 · 保持 累計 1', lines[0]);
  const at = ' · 2026-10-17T03:45:00Z · P の記録（未照合） · 出所 ';
  for (const row of [
    '✋ User の判断待ち · 試験の値 · 推奨 a · 10-17 03:20Z から · 聞き直し 10-24 03:20Z · atlas' + at + 'roccho-dev/adrs#647',
    '◆ User の判断 · 「atlas go ahead」→ C5 段 1 を採る · atlas' + at + 'roccho-dev/adrs#647',
    '✎ P の自己訂正 · 逸脱 1 · atlas' + at + 'hq:p-records.jsonl 行 3',
    '❞ 貼られたレビュー · 評者不明 · readback なし · atlas' + at + 'roccho-dev/adrs#647',
    '◈ User の基準 · 「偽陽性がなく迷わずシンプル」→ 鍵の選び方 · 系列なし' + at + 'roccho-dev/adrs#647',
    '⏸ loop の停止 · sys1.W · USER（不要）· 確認のため · P が再開 · sys1' + at + 'roccho-dev/adrs#647',
    '▣ P の receipt · hq-refresh v3 · PASS · 戻していない · sha256 ' + '7'.repeat(64) + ' · atlas' + at + 'roccho-dev/adrs#647',
    '♡ 心拍 · run 稼働 · tunnel 稼働 · HQ ループ 不明 · reap 0 · 張り直し 1 · 系列なし' + at + 'roccho-dev/adrs#647',
  ]) check('P records: the row reads ' + row.slice(0, 12), lines.includes(row), lines);
  check('P records: no row of P\'s says it was verified', !lines.some(line => line.includes('照合済み')));
  check('P records: the record held back is a held row', lines.some(line => line.startsWith('保持 p-record: at · 種類不明 · ')), lines);
  // The marks: every journal and P-record mark differs; only ✋ is also a state symbol, with the same meaning.
  const marks = [...Object.values(gapModule.JOURNAL_MARK), ...Object.values(gapModule.P_RECORD_MARK ?? {})];
  check('P records: the change marks are all different', new Set(marks).size === marks.length, marks);
  check('P records: only ✋ is also a state symbol, the human\'s judgment waiting', JSON.stringify(marks.filter(mark => STATUS_SYMBOLS.includes(mark))) === '["✋"]'
    && ATLAS_STATUS.awaitingUser.symbol === '✋' && gapModule.P_RECORD_MARK?.['user.decision.requested'] === '✋', marks);
  // Closed per kind, P's claim only: anything else refuses the World as any unknown field does.
  const refused = mutate => { const value = raw(); mutate(value.frames[index].p_records); try { parseAtlasWorldInput(value); return ''; } catch (error) { return error.message; } };
  check('P records: an extra field is refused', refused(records => { records[0].note = 'x'; }).includes('unknown field note'));
  check('P records: a missing field is refused', refused(records => { delete records[5].needed; }).includes('needed is required'));
  check('P records: authority other than false is refused', refused(records => { records[1].authority = true; }).includes('authority must be false'));
  check('P records: an unknown kind is refused', refused(records => { records[2].kind = 'user.decision.guessed'; }).includes('p-record-v1 kind'));
  check('P records: an id twice in a frame is refused', refused(records => { records[3].id = 'p-1'; }).includes('duplicate p-record id'));
  // The values too (R c6347788839), as apps reads them.
  check('P records: a value of the wrong type is refused (needed)', refused(records => { records[5].needed = 'no'; }).includes('needed must be true or false or null'));
  check('P records: a value of the wrong type is refused (reaped)', refused(records => { records[7].reaped = -1; }).includes('reaped must be a non-negative integer'));
  check('P records: a time that is not ISO UTC is refused (since)', refused(records => { records[0].since = 'yesterday'; }).includes('since must be an ISO UTC time'));
  check('P records: an unknown value is refused (result)', refused(records => { records[6].result = 'OK'; }).includes('result must be PASS|FAIL'));
}
// P's records in the boxes (adrs#647 v2 c6346263403, R c6348033913): a judgment P recorded as waiting is a line of
// 目的↔理想の差 until a recorded judgment names it; the latest heartbeat and the day's loop stops are lines of 現在状態.
// All are P's record: GapA's state, symbol and flags stay what its adequacy makes them.
{
  const box = (options, id, kind) => parseAtlasWorldInput(gapWorld(options)).frames.find(item => item.id === id)?.entities.find(entity => entity.ref.kind === kind);
  const lines = (options, id, kind) => box(options, id, kind)?.label.split('\n') ?? [];
  const WAITING = 'User の判断待ち：試験の値（atlas・10-17 03:20Z から・P の記録）';
  check('P in boxes: a judgment P recorded as waiting is on 目的↔理想の差 from its frame on', lines({ pRecords: 'waiting', judged: true }, 't4', 'purpose-adequacy').includes(WAITING)
    && !lines({ pRecords: 'waiting', judged: true }, 't3', 'purpose-adequacy').includes(WAITING), lines({ pRecords: 'waiting', judged: true }, 't4', 'purpose-adequacy'));
  check('P in boxes: a recorded judgment that names it closes it', !lines({ pRecords: true, judged: true }, 't4', 'purpose-adequacy').some(line => line.startsWith('User の判断待ち：')));
  check('P in boxes: GapA\'s flags are its adequacy\'s alone (no ✋ or flag from P\'s record)',
    JSON.stringify(box({ pRecords: 'waiting', judged: true }, 't4', 'purpose-adequacy')?.flags) === JSON.stringify(box({ judged: true }, 't4', 'purpose-adequacy')?.flags));
  const current = lines({ pRecords: true }, 't4', 'current-state');
  check('P in boxes: 現在状態 has the latest heartbeat P recorded', current.includes('心拍（P の記録）：run 稼働 · tunnel 稼働 · HQ ループ 不明 · reap 0 · 張り直し 1 · 10-17 03:45Z'), current);
  check('P in boxes: 現在状態 counts the day\'s loop stops and the unneeded ones', current.includes('loop の停止（P の記録）：10-17 1 件（不要 1）'), current);
  check('P in boxes: nothing before P recorded it', !lines({ pRecords: true }, 't3', 'current-state').some(line => line.includes('P の記録')));
}
// P's series list and P's replacements (adrs#647 W c6349826755, R c6349841686): one card per series in the Scope
// area, P's record, no session id; a replaced record's text is drawn in no frame, before the replacement too.
{
  const raw = () => gapWorld({ pRecords: 'series', judged: true });
  const world = parseAtlasWorldInput(raw());
  const at = id => world.frames.find(item => item.id === id);
  const changeOf = id => { const index = world.frames.findIndex(item => item.id === id); return gapModule.frameChangeLabel(world.frames.slice(0, index), world.frames[index], world.frames).split('\n'); };
  const drawnText = world.frames.flatMap(item => [...item.entities.flatMap(entity => [entity.label, entity.summary ?? '']),
    gapModule.frameChangeLabel(world.frames.slice(0, world.frames.indexOf(item)), item, world.frames)]).join('\n');
  check('replaced: p-1\'s text is drawn in no frame, before its replacement too', !drawnText.includes('試験の値'));
  check('replaced: t4\'s changes show only that p-1 was replaced, and by what',
    changeOf('t4').includes('⊘ 置き換えられた P の記録 p-1 → p-11 · 2026-10-17T03:45:00Z · P の記録（未照合） · 出所 hq:p-records.jsonl 行 1'), changeOf('t4'));
  const gapA = id => at(id).entities.find(entity => entity.ref.kind === 'purpose-adequacy')?.label.split('\n') ?? [];
  check('replaced: at t4 the judgment still waits, without its text', gapA('t4').includes('User の判断待ち：置き換えられた P の記録 p-1 → p-11（atlas・10-17 03:20Z から・P の記録）'), gapA('t4'));
  check('replaced: from t5 it no longer waits; sys1\'s does', !gapA('t5').some(line => line.includes('p-1'))
    && gapA('t5').includes('User の判断待ち：H のやり直し（sys1・10-17 04:20Z から・P の記録）'), gapA('t5'));
  check('replaced: the replacement and the list are rows of t5\'s changes', changeOf('t5').includes('↷ 置き換え · p-1 → p-11 · atlas · 2026-10-17T04:30:00Z · P の記録（未照合） · 出所 roccho-dev/adrs#647')
    && changeOf('t5').includes('☰ 系列の一覧 · 3 系列（atlas・sys1・host） · 系列なし · 2026-10-17T04:30:00Z · P の記録（未照合） · 出所 hq:p-series.json 行 1'), changeOf('t5'));
  const cards = id => at(id).entities.filter(entity => entity.ref.kind === 'p-series');
  check('series: no card before P\'s list, one per series from it', cards('t4').length === 0 && JSON.stringify(cards('t5').map(card => card.ref.id)) === '["atlas","sys1","host"]');
  const sys1 = cards('t5').find(card => card.ref.id === 'sys1');
  check('series: a card reads its name and record, state, waiting judgments, where its cost is, and that it is P\'s record',
    sys1?.label === 'sys1（roccho-dev/adrs#664）\n状態 待ち\n能力 exec：確かめ済み（根拠 run:39864108348）\n能力 mcp：未試験（根拠 なし）\nUser の判断待ち 1 件（P の記録）'
      + '\n費用：roccho-dev/adrs#664（数は正本、Atlas では UNKNOWN）\n系列の一覧（P の記録） · 10-17 04:30Z', sys1?.label);
  // R c6353944717: the node with when and where P read it.
  check('series: a card reads the node as P read it', cards('t5').find(card => card.ref.id === 'atlas')?.label.split('\n')
    .includes('MMD：D7（P の記録 · 10-17 04:30Z · 読んだ回 roccho-dev/adrs#647#c6353944717）'), cards('t5').find(card => card.ref.id === 'atlas')?.label);
  const refusedAtT5 = mutate => { const value = raw(); mutate(value.frames.find(item => item.id === 't5').p_records); try { parseAtlasWorldInput(value); return ''; } catch (error) { return error.message; } };
  check('capability: verified without evidence is refused', refusedAtT5(records => { records.find(item => item.id === 'p-14').evidence = null; }).includes('evidence is required for verified'));
  check('capability: a state outside the closed list is refused', refusedAtT5(records => { records.find(item => item.id === 'p-15').state = 'done'; }).includes('state must be'));
  check('node: where P read it is required, in an exact form', refusedAtT5(records => { records.find(item => item.id === 'p-13').seen = 'yesterday'; }).includes('seen must be'));
  // Condition 3: P's nodes and capabilities change no judgment.
  const parts = options => (parseAtlasWorldInput(gapWorld(options)).frames.find(item => item.id === 't5').gap?.parts ?? []).map(part => [part.condition, part.state]);
  check('node, capability: the conditions are as they were', JSON.stringify(parts({ pRecords: 'series', judged: true })) === JSON.stringify(parts({ judged: true })));
  check('series: no session id is drawn', !drawnText.includes('session-0001'));
  const symbols = Object.fromEntries(project(world, at('t5')).scene.representations.filter(rep => rep.atlas?.ref?.kind === 'p-series').map(rep => [rep.atlas.ref.id, rep.atlas.status]));
  check('series: ✋ where a judgment waits, ⟲ when closed, none otherwise', JSON.stringify(symbols) === JSON.stringify({ atlas: null, sys1: 'awaitingUser', host: 'history' }), symbols);
  const refused = mutate => { const value = raw(); mutate(value.frames.find(item => item.id === 't5').p_records); try { parseAtlasWorldInput(value); return ''; } catch (error) { return error.message; } };
  check('series: a series with another field is refused', refused(records => { records[0].entries[0].token = 'x'; }).includes('entries must be'));
  check('series: two series with one id are refused', refused(records => { records[0].entries[1].id = 'atlas'; }).includes('entries must be'));
  check('replaced: a replacement without what it replaces is refused', refused(records => { records[1].replaces = ''; }).includes('replaces must be non-empty text'));
}
// P's report at a glance (User c6351593265, R c6352966769): one box, first in the area after the Scopes, with the
// latest of each kind up to the frame and "無し" for a kind there is none of; 目的 and GapA are where they were.
{
  const summaryOf = (options, id) => parseAtlasWorldInput(gapWorld(options)).frames.find(item => item.id === id).entities.find(entity => entity.ref.kind === 'p-summary');
  const t5 = summaryOf({ pRecords: 'series', judged: true }, 't5');
  check('summary: at t5 it reads every kind\'s latest', t5?.label === [
    'P の報告の要約（P の記録・未照合）',
    '系列 3 · 閉じた 1（host）',
    'User の判断待ち 1 件：sys1 1',
    'loop の停止 10-17 1 件（不要 1）',
    '心拍：run 稼働 · tunnel 稼働 · HQ ループ 不明（10-17 03:45Z）',
    '直近の判断：「atlas go ahead」→ C5 段 1 を採る（10-17 03:45Z）',
    '直近の撤回・訂正：自己訂正 · 逸脱 1（10-17 03:45Z）',
    '直近の receipt：hq-refresh v3 · PASS · 戻していない（10-17 03:45Z）',
    '直近のレビュー：評者不明 · readback なし（10-17 03:45Z）',
    '直近の User の基準：「偽陽性がなく迷わずシンプル」→ 鍵の選び方（10-17 03:45Z）',
    '置き換え 1 件：p-1 → p-11',
    '費用（数は正本、Atlas では UNKNOWN）：atlas roccho-dev/adrs#647 · sys1 roccho-dev/adrs#664 · host roccho-dev/adrs#663',
    'MMD の今のノード：atlas D7',
    '能力：sys1 確かめ済み 1・未試験 1',
  ].join('\n'), t5?.label);
  check('summary: it is in the area after the Scopes, at its head', t5?.area === 'agents' && t5?.order === 0, t5 && [t5.area, t5.order]);
  // The app normalizes the World it is sent again: that must hold (an order must be non-negative there).
  const once = parseAtlasWorldInput(gapWorld({ pRecords: 'series', judged: true }));
  let again = null;
  try { again = parseAtlasWorldInput(JSON.parse(JSON.stringify(once))); } catch (error) { again = error.message; }
  check('summary: the drawn World normalizes again', typeof again === 'object' && again !== null, again);
  const t4 = summaryOf({ pRecords: true }, 't4')?.label.split('\n') ?? [];
  check('summary: a kind there is none of reads 無し', ['系列の一覧 無し', '置き換え 無し', '費用の在りか 不明（系列の一覧 無し）', 'MMD の今のノード 無し', '能力 無し'].every(line => t4.includes(line)), t4);
  check('summary: no box before P recorded anything', !summaryOf({ pRecords: true }, 't3') && !summaryOf({}, 't7'));
  const gapA = options => parseAtlasWorldInput(gapWorld(options)).frames.find(item => item.id === 't5').entities.find(entity => entity.ref.kind === 'purpose-adequacy');
  check('summary: GapA is as it was', JSON.stringify(gapA({ pRecords: 'series', judged: true })?.flags) === JSON.stringify(gapA({ judged: true })?.flags));
  check('summary: no replaced text, no session id', !t5?.label.includes('試験の値') && !t5?.label.includes('session-0001'));
}
// A record apps sends without its text (adrs#647 W c6350841730, R c6350853997): the data carries no text, the ui marks
// it replaced at once, though the replacement itself is in no frame yet; the form is closed.
{
  const raw = () => gapWorld({ pRecords: 'redacted', judged: true });
  check('redacted: the input has no text of p-1', !JSON.stringify(raw()).includes('試験の値'));
  const world = parseAtlasWorldInput(raw());
  const index = world.frames.findIndex(item => item.id === 't4');
  const change = gapModule.frameChangeLabel(world.frames.slice(0, index), world.frames[index], world.frames).split('\n');
  check('redacted: t4\'s changes show it replaced at once', change.includes('⊘ 置き換えられた P の記録 p-1 → p-11 · 2026-10-17T03:45:00Z · P の記録（未照合） · 出所 hq:p-records.jsonl 行 1'), change);
  const gapA = id => world.frames.find(item => item.id === id).entities.find(entity => entity.ref.kind === 'purpose-adequacy')?.label.split('\n') ?? [];
  const WAITING = 'User の判断待ち：置き換えられた P の記録 p-1 → p-11（atlas・10-17 03:45Z から・P の記録）';
  check('redacted: until the replacement is placed it still waits, without text, from P\'s write time', gapA('t4').includes(WAITING) && gapA('t5').includes(WAITING), [gapA('t4'), gapA('t5')]);
  const refused = mutate => { const value = raw(); mutate(value.frames[index].p_records.find(item => item.id === 'p-1')); try { parseAtlasWorldInput(value); return ''; } catch (error) { return error.message; } };
  check('redacted: a field of its own beside superseded_by is refused', refused(record => { record.question = '試験の値'; }).includes('unknown field question'));
  check('redacted: superseded_by must be text or null', refused(record => { record.superseded_by = 3; }).includes('superseded_by must be non-empty text or null'));
}
// The panel's row says what the page draws: six lines, fixed (116 px,
// atlas-ui.mjs), the rest scrolled inside it (S7c).
{
  const carries = SCREEN_CONTROLS.find(item => item.id === 'atlas-world-change')?.carries ?? '';
  const style = readFileSync(new URL('../packages/control/atlas-ui.mjs', import.meta.url), 'utf8');
  check('the changes panel is 6 lines, fixed, as the table says', carries.includes('6 行（固定）') && !carries.includes('6 行まで')
    && /#atlas-world-change\{[^}]*\bheight:116px/u.test(style) && !/#atlas-world-change\{[^}]*max-height/u.test(style), carries);
}
// The steps past the present: the present's upkeep by stale_at minute,
// earliest first; fresh up to stale_at itself (≦); passed ones left out.
const stepsOf = (options, now) => (timeline.forecastSteps?.(parseAtlasWorldInput(gapWorld(options)).frames.at(-1), now) ?? []).map(step => [step.at, step.items.map(item => item.condition)]);
check('t5 present: two steps, c1 at 05:41 then c3 at 06:10', JSON.stringify(stepsOf({ through: 't5', upkeep: true }, Date.parse('2026-10-17T05:30:00Z')))
  === JSON.stringify([['10-17 05:41Z', ['c1']], ['10-17 06:10Z', ['c3']]]));
check('a stale_at is fresh up to itself, then its step is gone', stepsOf({ through: 't5', upkeep: true }, Date.parse('2026-10-17T05:41:00Z')).length === 2
  && JSON.stringify(stepsOf({ through: 't5', upkeep: true }, Date.parse('2026-10-17T05:41:00.001Z'))) === JSON.stringify([['10-17 06:10Z', ['c3']]]));
check('an approximating present with conditions met has its steps', JSON.stringify(stepsOf({ through: 't6', upkeep: true }, Date.parse('2026-10-17T06:30:00Z')))
  === JSON.stringify([['10-17 07:10Z', ['c3']], ['10-17 07:40Z', ['c2']]]));
// On a step the graph is the present's (S7c: the step is said in the panel).
{
  const world = parseAtlasWorldInput(gapWorld({ through: 't5', upkeep: true }));
  const present = world.frames.at(-1);
  const step = timeline.forecastSteps?.(present, Date.parse('2026-10-17T05:30:00Z'))[0] ?? null;
  check('a step reads 予定 <minute> and its conditions', gapModule.forecastChangeLabel(step) === '予定 10-17 05:41Z（観測が無ければ unknown）\n鮮度切れの予定 c1 · 観測 10-17 03:40Z');
}
// S7: each plan of the frame is a line of 理想状態 (label, serves, content, source).
{
  const world = plannedWorld();
  const text = flat(project(world, world.frames[4]).scene.representations.map(rep => rep.label).join('\n'));
  check('理想状態 lists each plan of the frame (label, serves, content, source)', text.includes(flat('計画：2 件'
    + '計画 windows repo 退役の閉包グラフ（resources#25 v3） · 寄与 refactor-windows-retired · 内容 ノード 2 件 · 出所 resources#25 comment 4411'
    + '計画 Atlas 閉包グラフ（adrs#646 v1） · 寄与 atlas-hq-loop、input-semcmp · 内容 UNKNOWN · 出所 adrs#646')), text.slice(0, 300));
}
for (const failure of failures) console.error(JSON.stringify(failure));
assert.equal(failures.length, 0, failures.length + ' screen checks fail');
console.log(JSON.stringify({ status: 'atlas-world-screen-checks-pass', regions, kinds: seen.size, states: [...drawnSymbols.keys()].sort().join(','), activity: [...drawnActivity].sort().join(','), cases: new Set([...CASES.map(([number]) => number), 15, 29]).size }));
