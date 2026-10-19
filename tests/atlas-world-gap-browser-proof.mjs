// The gap view, phases, band and ui clock as drawn (adrs#647 contract v3-v6).
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-gap-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON>]
// Chrome-free builds opened over HTTP in windows of 1280x720, 1500x1000 and
// 1920x1080. Every frame is reached with `[`/`]` and read from the drawn SVG
// text and rectangles (not page state):
// - the phase line, 目的, 理想状態, 差, 現在状態 and each open part are drawn
//   whole inside their boxes, with the fixture's wording per frame: every
//   phase; the ideal alone moving (t3); matched with its freshness (t5);
//   stale observation back to approximating (t6);
// - each part names the cause of each side, and 差 counts both sides (v6);
// - the band's phase segments and journal marks are drawn inside their cells,
//   each mark at the frame carrying the entry, and a mark opens its entries'
//   author and source; 現在状態 counts the journal up to the frame shown,
//   also after stepping back (v6);
// - on the browser's clock, the present matched frame turns stale after its
//   matched_until without any input.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';

const argv = process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
});
const arg = name => argv.find(([key]) => key === name)?.[1];
if (!arg('out')) throw new Error('--out is required');
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
if (!driverRoot || !path.isAbsolute(driverRoot) || !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

const fixture = !arg('input');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gap-'));
fs.mkdirSync(arg('out'));
const serve = async (name, world, chrome = 'none') => {
  const input = path.join(scratch, name + '.json');
  fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
  await buildLiveAtlas({ input, out: path.join(arg('out'), name), consumer: 'app', chrome });
  const body = fs.readFileSync(path.join(path.resolve(arg('out')), name, 'index.html'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
};
// `--compat=1` uses the fixture without what contract v5 added and with each
// cause as the earlier list (read as v6's sides); `--page=<index.html>` serves
// an existing build (from the same fixture) instead of building from this checkout.
const compat = argv.some(([key]) => key === 'compat');
const servePage = file => { const body = fs.readFileSync(file); const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' }); response.end(body); });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server))); };
const all = arg('page') ? await servePage(arg('page'))
  : await serve('all', arg('input') ? JSON.parse(fs.readFileSync(arg('input'), 'utf8')) : gapWorld({ v5: !compat, sides: !compat }));
const matched = fixture && !arg('page') ? await serve('matched', gapWorld({ through: 't5', v5: !compat, sides: !compat })) : null;
// The before-ideal wording, read at the present t5 on two stories: only the
// ideal moves (same purpose), and the purpose itself changes. Prebuilt pages
// (`--page-ideal-only=`, `--page-new-purpose=`) apply it to an earlier build.
const wording = compat ? [] : [
  ['ideal only', arg('page-ideal-only') ? await servePage(arg('page-ideal-only')) : arg('page') ? null : await serve('ideal-only', gapWorld({ through: 't5' }))],
  ['new purpose', arg('page-new-purpose') ? await servePage(arg('page-new-purpose')) : arg('page') ? null : await serve('new-purpose', gapWorld({ through: 't5', newPurpose: true }))],
].filter(([, server]) => server);
// current = record(agent): the claims fixture (`--page-current=` applies the
// check to an earlier build of it).
const claims = compat ? null : arg('page-current') ? await servePage(arg('page-current')) : arg('page') ? null : await serve('current', gapWorld({ current: true }));
// L3: plans bound to no ideal state (the fixture's unbound plans), as the HUD
// draws them (the band and its rows; `--page-unbound-hud=` / `--page-unbound=`
// apply the checks to earlier builds) and in the chrome-free view.
const unbound = compat || (arg('page') && !arg('page-unbound')) ? null : {
  hud: arg('page-unbound-hud') ? await servePage(arg('page-unbound-hud')) : await serve('unbound-hud', gapWorld({ unbound: true }), 'full'),
  none: arg('page-unbound') ? await servePage(arg('page-unbound')) : await serve('unbound', gapWorld({ unbound: true })),
};
const urlOf = server => 'http://127.0.0.1:' + server.address().port + '/';

// What each fixture frame must read, as drawn (whitespace ignored).
const expected = {
  t0: { phase: '局面：目的変更 · 差 不明', gap: '差 不明', 'current-state': '現在状態観測の仕訳なし' },
  t1: { phase: '局面：定義中 · 差 不明', 'ideal-state': '照らし合わせる理想状態なし（定義中）' },
  // 差 is the difference only; 現在状態 holds the contrast with the ideal state.
  t2: { phase: '局面：一致・維持 · 新規 0 · 次の鮮度切れ 02:41Z', 'ideal-state': 'v1 · 条件 2', gap: '差 0（前 不明）',
    'current-state': '現在状態観測 1 件 · 最新 01:40Z理想の条件 2 件のうち一致 2 件' },
  // v6: a part names the cause of each side.
  t3: { phase: '局面：近似中 · 差 1 · v2', 'ideal-state': 'v1→v2 移動 · 条件 3（追加 1）', gap: '差 1（前 0）! c3 · 理想に追加 · 未観測',
    'current-state': '現在状態観測 1 件 · 最新 01:40Z理想の条件 3 件のうち一致 2 件', purpose: '宣言だけで回る組織rev 1 · 過去の評価：理想状態が不十分',
    'gap-part': 'windows repo を退役する未達 · 理想に追加 · 未観測 · この時点から' },
  // v6: the journal accumulates: t4 carries one more observation.
  t4: { phase: '局面：近似中 · 差 3 · v2', gap: '差 3（前 1）! c3 · 継続! c1 · 現在の後退? c4 · 未観測', 'current-state': '現在状態観測 2 件 · 最新 03:40Z理想の条件 4 件のうち一致 1 件' },
  t5: { phase: '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z', purpose: 'rev 1 · 評価：到達', 'gap-closed': '閉じた差 3（この時点 3）', 'current-state': '現在状態観測 2 件 · 最新 03:40Z' },
  t6: { gap: '! c1 · 鮮度切れ', 'gap-part': '端末で直接入力できる未達 · 鮮度切れ' },
  t7: { phase: '局面：目的の終了 · Scope は凍結（履歴）', gap: '差 対象外', 'gap-closed': 'c1 目的の終了', 'current-state': '現在状態観測 2 件 · 最新 03:40Z' },
};
// v6: each journal entry is marked at the frame that carries it.
const expectedMarks = { 'timeline:journal:0:purpose.set': '◎1', 'timeline:journal:2:observation': '·1', 'timeline:journal:3:purpose.evaluated': '★1',
  'timeline:journal:4:observation': '·1', 'timeline:journal:4:plan.set': '◇1', 'timeline:journal:5:purpose.evaluated': '★1' };
// What only contract v5 adds; checked unless --compat.
if (!compat) {
  expected.t5.phase += ' · 理想状態の確定前の観測で一致 1 件';
  Object.assign(expected.t6, { phase: '局面：近似中 · 差 2 · v2', gap: '! c1 · 鮮度切れ? c4 · 照合不能' });
}
const flat = value => String(value ?? '').replace(/\s/gu, '');
// Fixed words, so the check does not depend on the module under test.
const ADMISSION_WORDS = { observed_not_admitted: '未採択' };
const markedFrames = new Set();
const inside = item => item.box && item.shape && item.box.left >= item.shape.left - 2 && item.box.right <= item.shape.right + 2
  && item.box.top >= item.shape.top - 2 && item.box.bottom <= item.shape.bottom + 2;

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
let interruption = null;
const read = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const rect = node => { const box = node?.getBoundingClientRect?.(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null; };
  const screen = rect(document.getElementById('atlas-world'));
  const drawn = item => {
    const state = view.getState(adapter.cellsByRegionId.get(item.regionId));
    return { id: item.regionId, kind: item.atlas?.ref?.kind ?? item.atlas?.part ?? null, label: item.label, text: state?.text?.node?.textContent ?? '',
      box: rect(state?.text?.node), shape: rect(state?.shape?.node) };
  };
  const frameId = atlas.page.side === 'before' ? atlas.page.pair.before.id : atlas.page.pair.after.id;
  const reps = atlas.projection.scene.representations;
  return { frameId, screen, nodes: reps.filter(item => item.atlas?.kind === 'entity').map(drawn),
    band: reps.filter(item => /^timeline:(phase|journal)/u.test(item.regionId)).map(drawn),
    timeline: reps.filter(item => item.regionId.startsWith('timeline:')).length, graph: atlas.projection.viewport.graph };
});
try {
  for (const size of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }, { width: 1920, height: 1080 }]) {
    const browser = await chromium.launch({ headless: true, args: ['--window-size=' + size.width + ',' + size.height] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(urlOf(all), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      const frames = await page.evaluate(() => window.liveAtlas.input.frames.map(item => item.id));
      const currentByFrame = {};
      await page.focus('#atlas-world');
      for (let step = 0; step < frames.length - 1; step += 1) await page.keyboard.press('[');
      for (let index = 0; index < frames.length; index += 1) {
        if (index > 0) { await page.focus('#atlas-world'); await page.keyboard.press(']'); }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = await read(page);
        const where = size.width + 'x' + size.height + ' ' + state.frameId;
        check(where + ': the frame reached is the one asked for', state.frameId === frames[index], state.frameId);
        const gapNodes = state.nodes.filter(node => ['phase', 'purpose', 'ideal-state', 'gap', 'current-state', 'gap-part', 'gap-closed'].includes(node.kind));
        const bad = gapNodes.filter(node => flat(node.text) !== flat(node.label) || !inside(node));
        check(where + ': gap nodes drawn whole inside their boxes', gapNodes.length >= 5 && bad.length === 0, bad.slice(0, 4));
        // The chrome-free view draws no strip or band (未設計のため。設計の合意後に戻す),
        // and the graph takes the screen down to its bottom margin.
        const strip = await page.evaluate(() => [...window.liveAtlas.adapter.cellsByRegionId.keys()].filter(id => id.startsWith('timeline:')).length);
        check(where + ': no strip or band is drawn and the graph reaches the bottom of the screen',
          state.timeline === 0 && strip === 0 && Math.abs(state.graph.y + state.graph.height - (state.screen.bottom - state.screen.top - 16)) <= 1,
          { timeline: state.timeline, strip, graph: state.graph, screen: state.screen });
        const current = state.nodes.find(node => node.kind === 'current-state');
        currentByFrame[state.frameId] = current?.text ?? null;
        check(where + ': 現在状態 carries no verdict mark', current && !/[✓?!]\d/u.test(current.text), current?.text);
        const purpose = state.nodes.find(node => node.kind === 'purpose');
        check(where + ': 目的 carries no satisfaction mark', purpose && flat(purpose.text).startsWith('目的'), purpose?.text);
        check(where + ': the word 目標 is not drawn in the gap view', !gapNodes.some(node => node.text.includes('目標')), null);
        check(where + ': no 目的の変更前の観測 wording (the count is of observations before the ideal.set)',
          !gapNodes.some(node => flat(node.text).includes('目的の変更前の観測')), gapNodes.map(node => node.text));
        // For any input, against the frame's own supplied fields: the phase
        // line names the supplied phase, and with no parts no 差 0 is drawn.
        const supplied = await page.evaluate(id => {
          const item = window.liveAtlas.input.frames.find(frame => frame.id === id);
          return { phase: item.phase ?? null, partsNull: item.gap ? item.gap.parts === null : null,
            conditions: item.gap?.parts ? item.gap.summary.conditions : null, satisfied: item.gap?.parts ? item.gap.summary.satisfied : null,
            differing: item.gap?.parts ? item.gap.parts.map(part => (part.state === 'unmet' ? '!' : '?') + ' ' + part.condition) : null,
            // The newest purpose.set, up to this frame, of the purpose drawn, and its source's admission (A3).
            admission: (() => {
              const purposeId = item.gap?.basis.purpose_id ?? window.liveAtlas.input.presentation.directionTargets[0].id;
              const upTo = window.liveAtlas.input.frames.slice(0, window.liveAtlas.input.frames.indexOf(item) + 1).flatMap(each => each.journal ?? []);
              return upTo.filter(entry => entry.kind === 'purpose.set' && (entry.purpose_id ?? entry.purpose?.id) === purposeId).at(-1)?.source.admission ?? null;
            })() };
        }, state.frameId);
        // A3: 目的 is marked exactly when its purpose.set's source was not admitted.
        const purposeNode = state.nodes.find(node => node.kind === 'purpose');
        const mark = supplied.admission === null ? null : '（' + (ADMISSION_WORDS[supplied.admission] ?? supplied.admission) + '）';
        if (mark) markedFrames.add(state.frameId);
        check(where + ': 目的 shows an unadmitted purpose.set\'s mark, and no mark otherwise',
          purposeNode && (mark ? flat(purposeNode.text).includes(flat(mark)) : !/（未採択）/u.test(purposeNode.text)), { admission: supplied.admission, text: purposeNode?.text });
        // The ideal state's conditions face, in 現在状態, how many of them match
        // (as supplied); 差 names each differing condition and holds no match
        // count and no counter reading 0.
        if (supplied.conditions !== null && supplied.satisfied !== null) {
          const ideal = state.nodes.find(node => node.kind === 'ideal-state');
          check(where + ': 理想状態 names its conditions and 現在状態 how many match them',
            flat(ideal?.text).includes(flat('条件 ' + supplied.conditions)) && flat(current?.text).includes(flat('理想の条件 ' + supplied.conditions + ' 件のうち一致 ' + supplied.satisfied + ' 件')),
            { ideal: ideal?.text, current: current?.text, supplied });
        }
        if (supplied.differing) {
          const delta = state.nodes.find(node => node.kind === 'gap');
          const lines = flat(delta?.text).split(/(?=[!?](?!\d))/u);
          check(where + ': 差 names each differing condition and nothing but the difference',
            delta && supplied.differing.every(item => flat(delta.text).includes(flat(item))) && !/✓\d/u.test(flat(delta.text))
              && !/(追加|改訂|後退|未観測|照合不能|鮮度切れ|継続)0/u.test(flat(delta.text)), { text: delta?.text, differing: supplied.differing, lines: lines.length });
        }
        const phaseNode = state.nodes.find(node => node.kind === 'phase');
        const PHASE_WORDS = { 'purpose-changed': '目的変更', defining: '定義中', approximating: '近似中', matched: '一致・維持', ended: '目的の終了' };
        check(where + ': the phase line names the supplied phase', phaseNode
          && flat(phaseNode.text).includes(flat('局面：' + (supplied.phase ? PHASE_WORDS[supplied.phase] : '未供給'))), { supplied, text: phaseNode?.text });
        if (supplied.partsNull) check(where + ': with parts null no 差 0 is drawn', !gapNodes.some(node => /差0/u.test(flat(node.text))), gapNodes.map(node => node.text));
        if (fixture) {
          for (const [kind, words] of Object.entries(expected[state.frameId] ?? {})) {
            const node = state.nodes.find(item => item.kind === kind && flat(item.text).includes(flat(words)));
            check(where + ': ' + kind + ' reads ' + words, node, state.nodes.filter(item => item.kind === kind).map(item => item.text));
          }
          if (['t0', 't1', 't7'].includes(state.frameId)) check(where + ': with no ideal state the gap never reads 0',
            !gapNodes.some(node => /差0/u.test(flat(node.text))), gapNodes.map(node => node.text));
        }
      }
      // Only its contrast with the moved ideal changes, never its observations.
      const observed = text => text?.split('理想の条件')[0] ?? null;
      if (fixture) check(size.width + 'x' + size.height + ': only the ideal moving (t2 -> t3) leaves the drawn observations of 現在状態 unchanged',
        observed(currentByFrame.t2) && observed(currentByFrame.t2) === observed(currentByFrame.t3), { t2: currentByFrame.t2, t3: currentByFrame.t3 });
      if (fixture) {
        // Stopped: the chrome-free view draws no band (未設計のため。設計の合意後に戻す).
        // const band = (await read(page)).band;
        // for (const [id, words] of Object.entries(expectedMarks)) {
        //   const cell = band.find(item => item.id === id);
        //   check(size.width + 'x' + size.height + ': journal mark ' + id + ' reads ' + words, cell && flat(cell.text) === flat(words), cell ?? band.map(item => item.id));
        // }
        // Going back, 現在状態 is that frame's own total, not the newest.
        await page.focus('#atlas-world');
        for (let step = 0; step < frames.length - 1 - frames.indexOf('t3'); step += 1) await page.keyboard.press('[');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const back = await read(page);
        const backCurrent = back.nodes.find(node => node.kind === 'current-state');
        check(size.width + 'x' + size.height + ': back at t3, 現在状態 counts the journal up to t3 only',
          back.frameId === 't3' && flat(backCurrent?.text) === flat('現在状態観測 1 件 · 最新 01:40Z理想の条件 3 件のうち一致 2 件') && inside(backCurrent), { frameId: back.frameId, text: backCurrent?.text });
        await page.keyboard.press('L');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // Stopped: the chrome-free view draws no band, so no journal mark to open (未設計のため。設計の合意後に戻す).
        // // A journal mark opens its entries: kind, time, author and source.
        // const mark = (await read(page)).band.find(cell => cell.id === 'timeline:journal:3:purpose.evaluated');
        // check(size.width + 'x' + size.height + ': the evaluation mark is drawn', mark && flat(mark.text) === '★1', mark);
        // if (mark) {
        //   await page.mouse.click((mark.shape.left + mark.shape.right) / 2, (mark.shape.top + mark.shape.bottom) / 2);
        //   await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        //   const rows = (await read(page)).band.filter(cell => cell.id.startsWith('timeline:journal-line:'));
        //   check(size.width + 'x' + size.height + ': the mark opens its entry with author and source, drawn inside its row',
        //     rows.length === 1 && flat(rows[0].text).includes(flat('★ 評価 · 2026-10-17T02:50:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530')) && inside(rows[0]), rows);
        // }
      }
      check(size.width + 'x' + size.height + ': no page or console errors', errors.length === 0, errors);
    } finally {
      await browser.close();
    }
  }
  for (const [story, server] of wording) {
    const browser = await chromium.launch({ headless: true, args: ['--window-size=1500,1000'] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      // Before t5's matched_until (05:41Z), so the line is not the stale one.
      await page.clock.install({ time: new Date('2026-10-17T05:30:00Z') });
      await page.goto(urlOf(server), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      const node = (await read(page)).nodes.find(item => item.kind === 'phase');
      check(story + ': the present phase line reads 理想状態の確定前の観測で一致 1 件, never 目的の変更前',
        flat(node?.text).includes(flat('理想状態の確定前の観測で一致 1 件')) && !flat(node?.text).includes('目的の変更前') && inside(node), node?.text);
    } finally {
      await browser.close();
    }
  }
  for (const size of claims ? [{ width: 1500, height: 1000 }, { width: 1280, height: 720 }] : []) {
    // At t6 each work's latest claim is a line of 現在状態, with source line
    // and day-time; c's invalid latest line reads 不明. No status look, and
    // 差 reads as without claims (a claim is not an achievement).
    const browser = await chromium.launch({ headless: true, args: ['--window-size=' + size.width + ',' + size.height] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      await page.goto(urlOf(claims), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      await page.focus('#atlas-world');
      await page.keyboard.press('[');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await read(page);
      const where = 'current claims ' + size.width + 'x' + size.height + ' ' + state.frameId;
      const node = state.nodes.find(item => item.kind === 'current-state');
      const look = await page.evaluate(() => {
        const atlas = window.liveAtlas;
        const rep = atlas.projection.scene.representations.find(item => item.atlas?.ref?.kind === 'current-state');
        return { status: rep?.atlas.status ?? null, fill: atlas.adapter.graph.getView().getState(atlas.adapter.cellsByRegionId.get(rep?.regionId))?.style?.fillColor ?? null };
      });
      // a's state (L1) and evidence (L4) come from different lines: each is drawn with its own.
      const lines = ['作業の主張（current） 3 件', 'b · 完了と報告（出所 current:P#L2） · 10-17 05:30Z', 'c · 不明（最新の行が不正）（出所 current:P#L3） · 10-17 05:30Z',
        'a · 作成（出所 current:P#L1） · 証拠 roccho-dev/apps#124（出所 current:P#L4） · 10-17 05:30Z'];
      check(where + ': 現在状態 draws each claim, its state and its evidence each with its own source line, whole inside its box',
        state.frameId === 't6' && node && lines.every(line => flat(node.text).includes(flat(line))) && flat(node.text) === flat(node.label) && inside(node), node?.text);
      check(where + ': 現在状態 has no status look and no ✓', look.status === null && !/[✓]/u.test(node?.text ?? ''), look);
      const delta = state.nodes.find(item => item.kind === 'gap');
      check(where + ': 差 reads as without claims', flat(delta?.text) === flat('? · 差 2（前 0）! c1 · 鮮度切れ? c4 · 照合不能'), delta?.text);
    } finally {
      await browser.close();
    }
  }
  if (unbound) {
    const browser = await chromium.launch({ headless: true });
    try {
      // The HUD at 1920x1080 (three marks fit in a frame): t4's two unbound
      // plans are their own mark, beside the bound plan's unmarked one, and
      // opening it lists them marked, with their plan, drawn inside each row.
      const hud = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await hud.goto(urlOf(unbound.hud), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await hud.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      await hud.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const cells = (await read(hud)).band;
      const unboundCell = cells.find(cell => cell.id === 'timeline:journal:4:plan.set:unbound');
      const boundCell = cells.find(cell => cell.id === 'timeline:journal:4:plan.set');
      check('unbound plans: the HUD band draws their own mark, marked 未結合, inside its cell',
        unboundCell && flat(unboundCell.text).includes('未結合') && flat(unboundCell.text) === flat(unboundCell.label) && inside(unboundCell), unboundCell ?? cells.map(cell => cell.id));
      check('unbound plans: the bound plan beside them keeps its unmarked mark', boundCell && flat(boundCell.text) === '◇1', boundCell);
      if (unboundCell) {
        await hud.mouse.click((unboundCell.shape.left + unboundCell.shape.right) / 2, (unboundCell.shape.top + unboundCell.shape.bottom) / 2);
        await hud.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const rows = (await read(hud)).band.filter(cell => cell.id.startsWith('timeline:journal-line:'));
        check('unbound plans: opening the mark lists each plan marked （宣言に未結合）, drawn inside its row',
          rows.length === 2 && ['resources#71:tool-split', 'nixos#12:fork-surface'].every(plan => rows.some(row => flat(row.text).includes(flat('◇ 計画（宣言に未結合） ' + plan))))
            && rows.every(row => flat(row.text) === flat(row.label) && inside(row)), rows.map(row => row.text));
      }
      await hud.close();
      // The chrome-free view: every frame draws the same texts and colors as
      // the World without the unbound plans.
      const drawnFrames = async server => {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        await page.goto(urlOf(server), { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
        const out = {};
        const count = await page.evaluate(() => window.liveAtlas.input.frames.length);
        for (let step = 0; step < count; step += 1) {
          if (step > 0) { await page.focus('#atlas-world'); await page.keyboard.press('['); }
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const state = await read(page);
          out[state.frameId] = await page.evaluate(() => {
            const atlas = window.liveAtlas, view = atlas.adapter.graph.getView();
            return atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
              const drawn = view.getState(atlas.adapter.cellsByRegionId.get(item.regionId));
              return [item.regionId, drawn?.text?.node?.textContent ?? '', drawn?.style?.fillColor ?? null, drawn?.style?.strokeColor ?? null];
            });
          });
        }
        await page.close();
        return out;
      };
      const [withUnbound, without] = [await drawnFrames(unbound.none), await drawnFrames(all)];
      check('unbound plans: the chrome-free view draws every frame\'s texts and colors as without them',
        Object.keys(without).length === 8 && JSON.stringify(withUnbound) === JSON.stringify(without), Object.keys(withUnbound));
    } finally {
      await browser.close();
    }
  }
  if (matched) {
    // The ui clock alone turns the present matched frame stale.
    const browser = await chromium.launch({ headless: true, args: ['--window-size=1500,1000'] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      await page.clock.install({ time: new Date('2026-10-17T05:30:00Z') });
      await page.goto(urlOf(matched), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      const phaseText = async () => flat((await read(page)).nodes.find(node => node.kind === 'phase')?.text);
      check('before matched_until the present reads matched with its freshness', (await phaseText()).includes(flat('一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z')), await phaseText());
      await page.clock.fastForward(12 * 60 * 1000);
      await page.waitForTimeout(300);
      const stale = await read(page);
      const node = stale.nodes.find(item => item.kind === 'phase');
      check('after matched_until, with no input, it reads stale and not known latest, drawn inside its box',
        flat(node?.text).includes(flat('鮮度切れ・最新か不明（05:41Z を過ぎた）')) && !flat(node?.text).includes('次の鮮度切れ') && inside(node), node);
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await new Promise(resolve => all.close(resolve));
  if (matched) await new Promise(resolve => matched.close(resolve));
  for (const [, server] of wording) await new Promise(resolve => server.close(resolve));
  if (claims) await new Promise(resolve => claims.close(resolve));
  if (unbound) for (const server of Object.values(unbound)) await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-gap-browser-proof/2', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  checks: checks.length, admissionMarkedFrames: [...markedFrames], failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
