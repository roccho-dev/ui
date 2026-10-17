// The gap view, phases, band and ui clock as drawn (adrs#647 contract v3).
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-gap-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON>]
// Chrome-free builds opened over HTTP in windows of 1280x720, 1500x1000 and
// 1920x1080. Every frame is reached with `[`/`]` and read from the drawn SVG
// text and rectangles (not page state):
// - the phase line, 目的, 理想状態, 差, 現在状態 and each open part are drawn
//   whole inside their boxes, with the fixture's wording per frame: every
//   phase; the ideal alone moving (t3); matched with its freshness (t5);
//   stale observation back to approximating (t6);
// - the band's phase segments and journal marks are drawn inside their cells,
//   and a mark opens its entries' author and source;
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
const serve = async (name, world) => {
  const input = path.join(scratch, name + '.json');
  fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
  await buildLiveAtlas({ input, out: path.join(arg('out'), name), consumer: 'app', chrome: 'none' });
  const body = fs.readFileSync(path.join(path.resolve(arg('out')), name, 'index.html'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
};
const all = await serve('all', arg('input') ? JSON.parse(fs.readFileSync(arg('input'), 'utf8')) : gapWorld());
const matched = fixture ? await serve('matched', gapWorld({ through: 't5' })) : null;
const urlOf = server => 'http://127.0.0.1:' + server.address().port + '/';

// What each fixture frame must read, as drawn (whitespace ignored).
const expected = {
  t0: { phase: '局面：目的変更 · 差 不明', gap: '差 不明', 'current-state': '00:00Z · 判定 不明' },
  t1: { phase: '局面：定義中 · 差 不明', 'ideal-state': '照らし合わせる理想状態なし（定義中）' },
  t2: { phase: '局面：一致・維持 · 新規 0 · 次の鮮度切れ 02:41Z', 'ideal-state': 'v1 · 条件 2', 'current-state': '02:00Z · ✓2 ?0 !0' },
  t3: { phase: '局面：近似中 · 差 1 · v2', 'ideal-state': 'v1→v2 移動 · 条件 3（追加 1', gap: '差 1（前 0）理想の移動 1・現在の後退 0・未観測 0',
    purpose: '宣言だけで回る組織rev 1 · 過去の評価：理想状態が不十分' },
  t4: { phase: '局面：近似中 · 差 3 · v2', gap: '差 3（前 1）理想の移動 0・現在の後退 1・未観測 1', 'current-state': '✓1 ?1 !2' },
  t5: { phase: '局面：一致・維持 · 新規 0 · 次の鮮度切れ 05:41Z', purpose: 'rev 1 · 評価：到達', 'gap-closed': '閉じた差 3（この時点 3）' },
  t6: { phase: '局面：近似中 · 差 1 · v2', gap: '鮮度切れ 1', 'gap-part': '端末で直接入力できる未達 · 鮮度切れ' },
  t7: { phase: '局面：目的の終了 · Scope は凍結（履歴）', gap: '差 対象外', 'gap-closed': 'c1 目的の終了' },
};
const flat = value => String(value ?? '').replace(/\s/gu, '');
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
    band: reps.filter(item => /^timeline:(phase|journal)/u.test(item.regionId)).map(drawn) };
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
        const badBand = state.band.filter(cell => flat(cell.text) !== flat(cell.label) || !inside(cell) || cell.box.right > state.screen.right + 1);
        check(where + ': band cells drawn whole inside their cells and the screen', state.band.length > 0 && badBand.length === 0, badBand.slice(0, 4));
        const purpose = state.nodes.find(node => node.kind === 'purpose');
        check(where + ': 目的 carries no satisfaction mark', purpose && flat(purpose.text).startsWith('目的'), purpose?.text);
        check(where + ': the word 目標 is not drawn in the gap view', !gapNodes.some(node => node.text.includes('目標')), null);
        // For any input, against the frame's own supplied fields: the phase
        // line names the supplied phase, and with no parts no 差 0 is drawn.
        const supplied = await page.evaluate(id => {
          const item = window.liveAtlas.input.frames.find(frame => frame.id === id);
          return { phase: item.phase ?? null, partsNull: item.gap ? item.gap.parts === null : null };
        }, state.frameId);
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
      if (fixture) {
        // A journal mark opens its entries: kind, time, author and source.
        const mark = (await read(page)).band.find(cell => cell.id === 'timeline:journal:3:purpose.evaluated');
        check(size.width + 'x' + size.height + ': the evaluation mark is drawn', mark && flat(mark.text) === '★1', mark);
        if (mark) {
          await page.mouse.click((mark.shape.left + mark.shape.right) / 2, (mark.shape.top + mark.shape.bottom) / 2);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const rows = (await read(page)).band.filter(cell => cell.id.startsWith('timeline:journal-line:'));
          check(size.width + 'x' + size.height + ': the mark opens its entry with author and source, drawn inside its row',
            rows.length === 1 && flat(rows[0].text).includes(flat('★ 評価 · 2026-10-17T02:50:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530')) && inside(rows[0]), rows);
        }
      }
      check(size.width + 'x' + size.height + ': no page or console errors', errors.length === 0, errors);
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
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-gap-browser-proof/2', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
