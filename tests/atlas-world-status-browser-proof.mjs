// The one screen's status rows and time controls, as drawn and visible.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-status-browser-proof.mjs --out=<fresh absent directory>
// Contract 3 (revised, adrs#647 comment 6305441262). A chrome-free build (as
// /hq/) of the gap fixture, served over HTTP; the live case reads the repo's
// SSE fixture producer (fixtures/live-atlas/sse-producer.mjs). A word counts as
// shown only when its text Range lies inside the row's visible rectangle
// (left of the ellipsis when the row overflows), never by textContent alone,
// at 1500 and 800 px:
// - row 1 is the status: warnings first (更新停止・最新か不明, the SSE warning),
//   then LATEST / HELD, the frame shown (表示中：…) and the last receipt;
// - row 2 holds the search and ◀ 前へ / 次へ ▶ / 現在へ;
// - ◀ 前へ shows the previous frame: the time text and the three areas read
//   that frame; 次へ ▶ steps back toward the present; 現在へ returns to the latest;
// - the phase line names when its phase began.
// Every file it writes is under --out; the World it builds from is removed.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { startAtlasProducer } from './fixtures/live-atlas/sse-producer.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
if (!args.out) throw new Error('--out is required');
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
if (!driverRoot || !path.isAbsolute(driverRoot) || !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

// Fixed words, so the check does not depend on the module under test.
const STALLED = '更新停止・最新か不明';
const SILENT = 'SSE 応答なし';
const MINUTE = 60_000;
const world = gapWorld();
const asOf = Date.parse(world.frames.at(-1).asOf);
fs.mkdirSync(args.out);
const input = path.join(args.out, 'world.json');
fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
await buildLiveAtlas({ input, out: path.join(args.out, 'page'), consumer: 'app', chrome: 'none', updateIntervalMinutes: 10 });
fs.rmSync(input);
const body = fs.readFileSync(path.join(path.resolve(args.out), 'page', 'index.html'));
const site = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
// One scripted connection per live page: the World once, then silence.
const producer = await startAtlasProducer({ connections: Array.from({ length: 4 }, () => [{ data: world }]) });
const urlOf = live => 'http://127.0.0.1:' + site.address().port + '/' + (live ? '?events=' + encodeURIComponent(producer.url) : '');

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
// Each word of the status row: whether its Range lies inside the row's visible
// rectangle, left of the ellipsis when the row overflows.
const shown = (page, words) => page.evaluate(words => {
  const node = document.getElementById('atlas-world-status');
  if (!node) return { row: null, words: words.map(word => ({ word, inside: false })) };
  const row = node.getBoundingClientRect();
  const right = node.scrollWidth > node.clientWidth + 0.5 ? row.right - 16 : row.right;
  const text = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
  return { row: { left: row.left, right: row.right, text: node.textContent, overflow: node.scrollWidth > node.clientWidth + 0.5 },
    words: words.map(word => {
      const at = text ? text.data.indexOf(word) : -1;
      if (at < 0) return { word, inside: false, found: false };
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + word.length);
      const box = range.getBoundingClientRect();
      return { word, inside: box.width > 0 && box.left >= row.left - 0.5 && box.right <= right + 0.5 && box.top >= row.top - 0.5 && box.bottom <= row.bottom + 0.5 };
    }) };
}, words);
const allShown = result => result.words.every(item => item.inside);
// The text each drawn three-area box shows, by entity kind.
const boxes = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  return Object.fromEntries(atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity')
    .map(item => [item.atlas.ref.kind, (view.getState(adapter.cellsByRegionId.get(item.regionId))?.text?.node?.textContent ?? '').replace(/\s/gu, '')]));
});
const flat = text => text.replace(/\s/gu, '');

let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  const open = async (width, live, time = null) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    if (time !== null) await page.clock.install({ time: new Date(time) });
    await page.goto(urlOf(live), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    if (live) await page.waitForFunction(() => window.liveAtlas.page.snapshotBytes !== null, null, { timeout: 60000 });
    await settle(page);
    return page;
  };
  for (const width of [1500, 800]) {
    // A sample page: plain LATEST and the frame shown, on row 1; the time controls on row 2.
    const page = await open(width, false);
    const sample = await shown(page, ['LATEST', '表示中：現在 8/8 · t7']);
    check(width + 'px sample: LATEST and the frame shown are visible on the status row', allShown(sample) && !sample.row.text.includes('（最新か不明）'), sample);
    const controls = await page.evaluate(() => ['◀ 前へ', '次へ ▶', '現在へ'].map(name => {
      const button = [...document.querySelectorAll('#atlas-world-search-bar button')].find(item => item.textContent === name);
      const box = button?.getBoundingClientRect();
      return { name, visible: Boolean(box && box.width > 0 && box.right <= window.innerWidth + 0.5) };
    }));
    check(width + 'px: ◀ 前へ, 次へ ▶ and 現在へ are visible buttons on the search row', controls.every(item => item.visible), controls);
    // Back: the previous frame, in the time text and the three areas.
    await page.getByRole('button', { name: '◀ 前へ' }).click();
    await settle(page);
    const back = await shown(page, ['HELD', '表示中：過去 7/8 · t6']);
    const backBoxes = await boxes(page);
    check(width + 'px ◀ 前へ: HELD and 表示中：過去 7/8 · t6 are visible', allShown(back), back);
    check(width + 'px ◀ 前へ: the three areas read t6', backBoxes.gap?.includes(flat('差 2（前 0）! c1 · 鮮度切れ? c4 · 照合不能'))
      && backBoxes.phase?.includes(flat('局面：近似中（10-17 06:00Z から）')), backBoxes);
    for (let n = 0; n < 2; n += 1) { await page.getByRole('button', { name: '◀ 前へ' }).click(); await settle(page); }
    const t4 = await boxes(page);
    check(width + 'px: at t4 the phase line names that its approximation began at t3', t4.phase?.startsWith(flat('局面：近似中（10-17 03:00Z から）')), t4.phase);
    await page.getByRole('button', { name: '次へ ▶' }).click();
    await settle(page);
    const forward = await shown(page, ['表示中：過去 6/8 · t5']);
    check(width + 'px 次へ ▶: one frame toward the present (t5)', allShown(forward) && (await boxes(page)).gap?.includes(flat('差 0（前 3）')), forward);
    await page.getByRole('button', { name: '現在へ' }).click();
    await settle(page);
    const present = await shown(page, ['LATEST', '表示中：現在 8/8 · t7']);
    check(width + 'px 現在へ: back at the latest', allShown(present) && (await boxes(page)).phase?.includes(flat('局面：目的の終了（10-17 07:00Z から）')), present);
    // The key shortcuts do what the buttons do.
    await page.focus('#atlas-world');
    await page.keyboard.press('[');
    await settle(page);
    const keyed = await shown(page, ['表示中：過去 7/8 · t6']);
    await page.keyboard.press('L');
    await settle(page);
    check(width + 'px: [ and L are the shortcuts of ◀ 前へ and 現在へ', allShown(keyed) && allShown(await shown(page, ['表示中：現在 8/8 · t7'])), keyed);
    await page.close();

    // Live, built with 10 minutes, the clock past asOf + 3 periods and nothing
    // received since the World: both warnings lead the row, then LATEST qualified.
    const live = await open(width, true, asOf + 29 * MINUTE);
    const fresh = await shown(live, ['LATEST', '最終受信']);
    check(width + 'px live, receiving: LATEST and the last receipt are visible', allShown(fresh) && !fresh.row.text.includes(STALLED), fresh);
    await live.clock.fastForward(2 * MINUTE);
    await settle(live);
    const stalled = await shown(live, [STALLED, SILENT, 'LATEST（最新か不明）']);
    check(width + 'px live, stalled and silent: 更新停止・最新か不明, SSE 応答なし and LATEST（最新か不明） are visible, warnings first',
      allShown(stalled) && stalled.row.text.indexOf(STALLED) < stalled.row.text.indexOf('LATEST'), stalled);
    await live.close();
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await producer.close();
  await new Promise(resolve => site.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-status-browser-proof/1', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
