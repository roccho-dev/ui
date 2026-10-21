// The one World screen (contract 3, revised, adrs#647 comment 6305441262).
// Pure; no browser. Every projection draws the three areas only: no HUD,
// detail panel, strip or band region, and no record panel to read. What the
// 30 divergence cases need is read where the User reads it: the text drawn in
// the boxes. The browser journeys are the status, regression and gap proofs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { bundledWorld, worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

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
  [4, '目的の改訂に理想が未追随', { judged: true }, 't0', ['局面：目的変更', '照らす理想状態が無い']],
  [5, '差が開いたまま到達', { judged: true }, 't6', ['差が開いたまま到達と評価']],
  [8, '観測なし・古い・照合不能', {}, 't6', ['鮮度切れ', '照合不能']],
  [8, '観測なし', {}, 't4', ['未観測']],
  [10, '後退', {}, 't4', ['現在の後退']],
  [11, '理想の改訂で差が増える', {}, 't3', ['理想に追加']],
  [12, '担当なし', {}, 't4', ['担当未確定']],
  [13, '目的の達成評価', {}, 't5', ['評価：到達']],
  [13, '目的の終了', { judged: true }, 't7', ['目的は終了した', '局面：目的の終了']],
  [14, '理想の改訂中', { drafting: true }, 't6', ['改訂中 v3']],
  [15, '保持', { held: true }, 't5', ['保持 3 件（actor-mismatch 1 · author-unknown 1 · proposal 1）', '保持 actor-mismatch · ideal.set · adrs#647']],
  [16, '理想より前の観測', {}, 't5', ['理想状態の確定前の観測で一致 1 件']],
  [19, '評価の後に理想が改訂', { judged: true }, 't3', ['過去の評価（版が違う）']],
  [20, 'GapB が開いている間の評価', { judged: true }, 't5', ['十分性の評価なし']],
  [21, '未結合の計画', { unbound: true }, 't7', ['計画：未宣言（UNKNOWN） · 未結合 3 件']],
  [22, '鮮度切れ（最新の frame）', { through: 't5' }, 't5', ['鮮度切れ・最新か不明'], { now: Date.parse('2026-10-17T05:41:01Z') }],
  [23, '評価者の評価', { judged: true, evaluator: true }, 't3', ['評価者の評価（未検証） adequacy=problem（出所 jev:ops#573 · jev · 10-17 02:45Z）']],
  [24, '評価者が止まる', { judged: true, evaluator: true }, 't7', ['評価者の評価（未検証） adequacy=ok（出所 jev:ops#573 · jev · 10-17 05:10Z）']],
  [25, 'operation の運用物', { physical: true }, 't4', ['native:serve-static 保つ: c1 対象: 理想↔現在の差']],
  [26, '観測者が止まる', { lastObserved: true }, 't6', ['最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）']],
  [27, 'development の変更対象', { physical: true }, 't4', ['roccho-dev/apps packages/atlas 対象: 理想↔現在の差']],
  [29, '機械の提案は保持', { held: true }, 't5', ['保持 proposal · ideal.set · ops#552']],
  [30, 'operation を保つ間', { physical: true }, 't2', ['native:serve-static 保つ: c1']],
];
for (const [number, name, options, id, words, extra = {}] of CASES) {
  const text = drawn(options, id, extra);
  for (const word of words) assert.ok(text.includes(flat(word)), 'case ' + number + ' (' + name + ') at ' + id + ': ' + word + ' is drawn');
}
console.log(JSON.stringify({ status: 'atlas-world-screen-checks-pass', regions, cases: new Set(CASES.map(([number]) => number)).size }));
