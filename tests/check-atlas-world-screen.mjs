// The one World screen (contract 3, revised, adrs#647 comment 6305441262) and
// its elements (S6, comment 6306887827). Pure; no browser.
// - Every projection draws the three areas only: no HUD, detail panel, strip
//   or band region, and no record panel to read.
// - The kinds of box and line drawn are the display section's table
//   (packages/control/src/atlas-screen-table.mjs): every line drawn is of a
//   kind in it, every kind in it is drawn by some World here, none of the
//   removed P elements is drawn, and the relations carry no label.
// - What the 30 divergence cases need is read where the User reads it: the
//   text drawn in the boxes, or the rows of 仕訳 ▸.
// Every check is reported; one failing does not hide the others.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { SCREEN_CONTROLS, SCREEN_LINES } from '../packages/control/src/atlas-screen-table.mjs';
import * as gapModule from '../packages/control/src/atlas-gap.mjs';
import * as timeline from '../packages/control/src/atlas-timeline.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { bundledWorld, worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

const failures = [];
const check = (name, pass, detail = null) => { if (!pass) failures.push({ name, ...(detail === null ? {} : { detail }) }); };
const project = (world, item, extra = {}) => projectAtlasWorld({ input: world, frame: item, selected: 'none', ...extra });

// No HUD, panel, strip or band: only area and entity regions, never a guide,
// at any size; no record, detail or direction is projected.
const worlds = [parseAtlasWorldInput(bundledWorld()), parseAtlasWorldInput(worldWithFrames(3)),
  parseAtlasWorldInput(gapWorld({ judged: true, held: true, evaluator: true, physical: true, unbound: true, drafting: true, lastObserved: true, upkeep: true })),
  parseAtlasWorldInput(JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8')))];
let regions = 0;
for (const world of worlds) for (const item of world.frames) for (const viewport of [{ width: 800, height: 900 }, { width: 1500, height: 1000 }]) {
  const projection = project(world, item, { viewport });
  const kinds = new Set(projection.scene.representations.map(rep => rep.atlas?.kind ?? 'none'));
  assert.deepEqual([...kinds].filter(kind => !['area', 'entity'].includes(kind)), [], item.id + ': only the three areas are drawn');
  assert.equal(projection.scene.representations.filter(rep => rep.isGuide || rep.zIndex >= 10000).length, 0, item.id + ': no HUD region');
  for (const key of ['detail', 'direction', 'selected', 'worldComparison', 'aggregateRelationIds']) assert.ok(!(key in projection), item.id + ': no ' + key);
  assert.deepEqual(Object.keys(projection.viewport), ['graph'], 'one layout: the graph alone');
  regions += projection.scene.representations.length;
}
assert.deepEqual(worldViewport({ width: 800, height: 600 }), { graph: { x: 16, y: 16, width: 768, height: 568 } });

// The table. A box is named by what gapView draws in it; any other box is the
// producer's (supplied), and so is every box of a frame without a gap. Lines are read as gapView writes them, before the
// layout wraps them; the stale present's heading as the projection writes it.
const GAP_BOXES = new Set(['purpose', 'purpose-adequacy', 'ideal-state', 'gap', 'current-state', 'gap-part', 'gap-closed']);
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
    { physical: true, lastObserved: true }].map(options => parseAtlasWorldInput(gapWorld(options))),
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
    check(frame.id + ': ' + box + ' is a box of the table', boxes.has(box), entity.ref);
    for (const line of labels.flatMap(label => label.split('\n'))) {
      const kind = boxes.has(box) ? kindOf(box, line) : null;
      if (kind) seen.add(kind);
      else check(frame.id + ' ' + box + ': the line is of a kind in the table', false, line);
      for (const [name, where, pattern] of REMOVED) if (!where || where.includes(box)) check(frame.id + ' ' + box + ': ' + name + ' is not drawn', !pattern.test(line), line);
    }
  }
  for (const relation of project(world, frame).scene.relations) check(frame.id + ': a relation is drawn without a label', relation.label === '', relation.label);
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
// Cases 15 and 29 (S6): what was held is a row of 仕訳 ▸, one per declaration
// held up to the frame shown, never drawn in a box.
const heldWorld = parseAtlasWorldInput(gapWorld({ held: true }));
const t5 = heldWorld.frames.find(item => item.id === 't5');
const rows = timeline.heldLines?.(heldWorld.frames, t5) ?? [];
for (const [number, row] of [[15, '保持 actor-mismatch · ideal.set · 2026-10-17T02:40:00Z · 出所 adrs#647'], [29, '保持 proposal · ideal.set · 2026-10-17T04:20:00Z · 出所 ops#552'],
  [15, '保持 author-unknown · 種類不明 · 2026-10-17T04:30:00Z · 出所 adrs#647']]) {
  check('case ' + number + ' at t5: 仕訳 ▸ has the row ' + row, rows.includes(row), rows);
}
// The button says the two counts differ in kind (R, I2d): 仕訳 is the frame's,
// 保持 is accumulated up to it; the table's row says the same.
check('仕訳 n · 保持 m（累計）▸: the button reads both counts, 保持 as accumulated',
  timeline.journalButtonText(1, rows.length, false) === '仕訳 1 · 保持 3（累計）▸' && timeline.journalButtonText(0, 0, true) === '仕訳 0 · 保持 0（累計）▾'
    && SCREEN_CONTROLS.find(item => item.id === 'atlas-world-journal')?.carries.startsWith('仕訳 n · 保持 m（累計）▸'));
check('cases 15 and 29: no box draws what was held', !drawn({ held: true }, 't5').includes(flat('保持')));
for (const failure of failures) console.error(JSON.stringify(failure));
assert.equal(failures.length, 0, failures.length + ' screen checks fail');
console.log(JSON.stringify({ status: 'atlas-world-screen-checks-pass', regions, kinds: seen.size, cases: new Set([...CASES.map(([number]) => number), 15, 29]).size }));
