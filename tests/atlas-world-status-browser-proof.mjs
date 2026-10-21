// The one screen's status rows and time controls, as drawn and visible.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-status-browser-proof.mjs --out=<fresh absent directory>
// Contract 3 (revised, adrs#647 comment 6305441262). A build (as
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
// - 差's heading names when its phase began (S6: no phase box);
// - the changes under the time controls name the entries the frame carries (S7, S7c; the steps
//   past the present are tests/atlas-world-time-axis-browser-proof.mjs);
// - the status and search rows hold exactly the controls of the display
//   section's table (packages/control/src/atlas-screen-table.mjs), and the
//   search count names no frame id or rev.
// Every file it writes is under --out (fixtures/proof-scratch.mjs): the World
// it builds from and the browser's temporary files, removed at the end.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { SCREEN_CONTROLS } from '../packages/control/src/atlas-screen-table.mjs';
import { startAtlasProducer } from './fixtures/live-atlas/sse-producer.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { proofScratch } from './fixtures/proof-scratch.mjs';

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
const { scratch, done } = proofScratch(args.out);
// One build per story, so a field a build does not accept stops only the
// checks that need it: the plain story (status rows, time controls);
// `judged`, GapA from frames[i].adequacy as the HQ World carries it; `history`,
// the whole story with a drafting ideal (改訂中, the changes, search);
// `observed`, with the parts' last observations.
const worlds = { page: world, judged: gapWorld({ judged: true }), history: gapWorld({ drafting: true, held: true }), observed: gapWorld({ lastObserved: true }) };
const bodies = {};
const buildFailures = {};
for (const [name, value] of Object.entries(worlds)) {
  const input = path.join(scratch, name + '.json');
  fs.writeFileSync(input, JSON.stringify(value), { flag: 'wx' });
  try {
    await buildLiveAtlas({ input, out: path.join(args.out, name), consumer: 'app', updateIntervalMinutes: 10 });
    bodies[name] = fs.readFileSync(path.join(path.resolve(args.out), name, 'index.html'));
  } catch (error) {
    buildFailures[name] = String(error.message).split('\n')[0];
  }
}
const site = http.createServer((request, response) => {
  const body = bodies[new URL(request.url, 'http://localhost').pathname.split('/')[1] || 'page'] ?? bodies.page;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
// One scripted connection per live page: the World once, then silence.
const producer = await startAtlasProducer({ connections: Array.from({ length: 4 }, () => [{ data: world }]) });
const urlOf = (live, name = '') => 'http://127.0.0.1:' + site.address().port + '/' + (name ? name + '/' : '') + (live ? '?events=' + encodeURIComponent(producer.url) : '');

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
// A visible button pressed, or false when the page has none by that name.
const press = (page, name) => page.getByRole('button', { name, exact: true }).click({ timeout: 2000 }).then(() => true, () => false);
// The text each drawn three-area box shows, by entity kind.
const boxes = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const out = {};
  for (const item of atlas.projection.scene.representations.filter(each => each.atlas?.kind === 'entity')) {
    out[item.atlas.ref.kind] = (out[item.atlas.ref.kind] ?? '') + (view.getState(adapter.cellsByRegionId.get(item.regionId))?.text?.node?.textContent ?? '').replace(/\s/gu, '');
  }
  return out;
});
const flat = text => text.replace(/\s/gu, '');

let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  const open = async (width, live, time = null, name = '') => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    if (time !== null) await page.clock.install({ time: new Date(time) });
    await page.goto(urlOf(live, name), { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    const rowIds = await page.evaluate(() => [...document.querySelectorAll('#atlas-world-status-bar > *, #atlas-world-search-bar > *, #atlas-world-screen > #atlas-world-change')].map(item => item.id).sort());
    check(width + 'px: the status and search rows hold the table\'s controls, no more', JSON.stringify(rowIds) === JSON.stringify(SCREEN_CONTROLS.map(item => item.id).sort()), rowIds);
    // Back: the previous frame, in the time text and the three areas.
    await page.getByRole('button', { name: '◀ 前へ' }).click();
    await settle(page);
    const back = await shown(page, ['HELD', '表示中：過去 7/8 · t6']);
    const backBoxes = await boxes(page);
    check(width + 'px ◀ 前へ: HELD and 表示中：過去 7/8 · t6 are visible', allShown(back), back);
    check(width + 'px ◀ 前へ: the three areas read t6', backBoxes.gap?.includes(flat('理想↔現在の差（近似中・10-17 06:00Z から）前 0! c1 · 鮮度切れ? c4 · 照合不能'))
      && !backBoxes.phase, backBoxes);
    for (let n = 0; n < 2; n += 1) { await page.getByRole('button', { name: '◀ 前へ' }).click(); await settle(page); }
    const t4 = await boxes(page);
    check(width + 'px: at t4 差\'s heading names that its approximation began at t3', t4.gap?.includes(flat('理想↔現在の差（近似中・10-17 03:00Z から）')), t4.gap);
    await page.getByRole('button', { name: '次へ ▶' }).click();
    await settle(page);
    const forward = await shown(page, ['表示中：過去 6/8 · t5']);
    check(width + 'px 次へ ▶: one frame toward the present (t5)', allShown(forward) && (await boxes(page)).gap?.includes(flat('次の鮮度切れ 10-17 05:41Z）前 3')), forward);
    await page.getByRole('button', { name: '現在へ' }).click();
    await settle(page);
    const present = await shown(page, ['LATEST', '表示中：現在 8/8 · t7']);
    check(width + 'px 現在へ: back at the latest', allShown(present) && (await boxes(page)).gap?.includes(flat('理想↔現在の差（目的の終了・10-17 07:00Z から）')), present);
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

    // Each story below is checked on its own page; a story whose build was
    // refused fails its own checks only.
    const story = async (name, label, body) => {
      if (!bodies[name]) { check(width + 'px ' + label + ': built', false, buildFailures[name]); return; }
      const page = await open(width, false, null, name);
      try { await body(page); } finally { await page.close(); }
    };
    // GapA comes from frames[i].adequacy (as in the HQ World) and its box is
    // drawn, inside the graph.
    await story('judged', 'GapA from frames[i].adequacy', async page => {
      const gapA = await page.evaluate(() => {
        const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
        const item = atlas.projection.scene.representations.find(rep => rep.atlas?.ref?.kind === 'purpose-adequacy');
        const state = item ? view.getState(adapter.cellsByRegionId.get(item.regionId)) : null;
        const text = state?.text?.node, box = text?.getBoundingClientRect(), frame = document.getElementById('atlas-world').getBoundingClientRect();
        return { text: text?.textContent ?? null, inside: Boolean(box && box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1
          && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1) };
      });
      check(width + 'px: GapA (目的↔理想の差) is drawn from frames[i].adequacy, visible in the graph', gapA.inside && flat(gapA.text ?? '').includes(flat('目的↔理想の差')), gapA);
    });
    // The past: 改訂中 (case 14) and the changes; then search.
    await story('history', '改訂中, the changes and search', async page => {
      await press(page, '◀ 前へ');
      await settle(page);
      const t6 = await boxes(page);
      check(width + 'px t6: 理想状態 reads 改訂中 v3 while v2 is in force', t6['ideal-state']?.includes(flat('v2 · 条件 4 · 改訂中 v3')), t6['ideal-state']);
      const panel = flat(await page.evaluate(() => document.getElementById('atlas-world-change')?.textContent ?? ''));
      check(width + 'px t6: the changes under the time controls name the entry t6 carries, and what was held so far', panel === flat('この時点の変化 1 件 · 保持 累計 3'
        + '△ 理想の定義開始 · 2026-10-17T05:20:00Z · 作者 roccho · 出所 adrs#647 comment 6230983530 · sha256 ' + 'a'.repeat(64)), panel);
      // Search: choosing a relation brings the camera to its from box, drawn
      // inside the graph.
      await press(page, '現在へ');
      await page.fill('#atlas-world-search', 'current-delta');
      await settle(page);
      const count = await page.evaluate(() => document.getElementById('atlas-world-search-count')?.textContent ?? '');
      check(width + 'px search: the count names no frame id or rev (they are on the status row)', /^\d+ /u.test(count) && !count.includes('t7') && !count.includes('rev'), count);
      const relationKey = await page.evaluate(() => window.liveAtlas.page.searchResults.find(row => row.kind === 'relation')?.key ?? null);
      if (relationKey) await page.selectOption('#atlas-world-search-results', relationKey);
      await settle(page);
      const focused = await page.evaluate(() => {
        const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
        const id = atlas.projection.selectedRegionId;
        const box = id ? view.getState(adapter.cellsByRegionId.get(id))?.shape?.node?.getBoundingClientRect() : null;
        const frame = document.getElementById('atlas-world').getBoundingClientRect();
        return { id, inside: Boolean(box && box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1) };
      });
      check(width + 'px search: a chosen relation focuses its from box (現在状態)', relationKey && /current-state/u.test(focused.id ?? '') && focused.inside, { relationKey, focused });
    });
    // The last observation (case 26), on the stale part at t6.
    await story('observed', 'the last observation', async page => {
      await press(page, '◀ 前へ');
      await settle(page);
      const t6 = await boxes(page);
      check(width + 'px t6: the stale part names its last observation', t6['gap-part']?.includes(flat('最後の観測 10-17 03:40Z（hq:observations.jsonl · atlas.events）')), t6['gap-part']);
    });
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await producer.close();
  await new Promise(resolve => site.close(resolve));
  done();
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-status-browser-proof/1', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
