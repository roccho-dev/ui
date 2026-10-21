// A live World page follows the present over SSE, read on the status row.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-follow-browser-proof.mjs --out=<fresh absent directory>
// S6 (adrs#647 comment 6306887827). A build of the gap fixture, served over
// HTTP and opened with ?events= on the repo's SSE fixture producer
// (fixtures/live-atlas/sse-producer.mjs), which sends the World up to t5,
// then up to t6, then whole. A word counts as shown only when its text Range
// lies inside the status row's visible rectangle (left of the ellipsis when
// the row overflows), never by textContent alone, at 1500 and 800 px:
// - following the present, each accepted World moves the row to its latest
//   frame (LATEST · 表示中：現在 6/6 · t5, then 7/7 · t6), and 差 reads it;
// - on a step past the present (S7: 予定 1/2, from t5's upkeep, on a page
//   clock before its stale times), the next World returns to the present;
// - a past frame held with ◀ 前へ stays held when a newer World arrives
//   (HELD · 表示中：過去 6/8 · t5), and 現在へ reaches the new latest (8/8 · t7).
// Every file it writes is under --out (fixtures/proof-scratch.mjs).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
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

const { scratch, done } = proofScratch(args.out);
const input = path.join(scratch, 'world.json');
fs.writeFileSync(input, JSON.stringify(gapWorld({ through: 't5', upkeep: true })), { flag: 'wx' });
await buildLiveAtlas({ input, out: path.join(args.out, 'page'), consumer: 'app' });
const body = fs.readFileSync(path.join(path.resolve(args.out), 'page', 'index.html'));
const site = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
// One scripted connection per page: t0..t5, t0..t6 after a while, then t0..t7
// after long enough to step back in between.
const script = () => [{ data: gapWorld({ through: 't5', upkeep: true }) }, { delayMs: 2500 }, { data: gapWorld({ through: 't6' }) }, { delayMs: 4000 }, { data: gapWorld() }];
const producer = await startAtlasProducer({ connections: [script(), script()] });

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
// Waits until the status row says `word`, then reports whether each word's
// Range lies inside the row's visible rectangle.
const shown = async (page, words) => {
  await page.waitForFunction(word => document.getElementById('atlas-world-status')?.textContent.includes(word), words.at(-1), { timeout: 10000 }).catch(() => {});
  await settle(page);
  return page.evaluate(words => {
    const node = document.getElementById('atlas-world-status');
    const row = node.getBoundingClientRect();
    const right = node.scrollWidth > node.clientWidth + 0.5 ? row.right - 16 : row.right;
    const text = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
    return { text: node.textContent, words: words.map(word => {
      const at = text ? text.data.indexOf(word) : -1;
      if (at < 0) return { word, inside: false };
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + word.length);
      const box = range.getBoundingClientRect();
      return { word, inside: box.width > 0 && box.left >= row.left - 0.5 && box.right <= right + 0.5 && box.top >= row.top - 0.5 && box.bottom <= row.bottom + 0.5 };
    }) };
  }, words);
};
const allShown = result => result.words.every(item => item.inside);
// The text 差's box shows, when it lies inside the graph.
const delta = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const item = atlas.projection.scene.representations.find(rep => rep.atlas?.ref?.kind === 'gap');
  const text = item ? view.getState(adapter.cellsByRegionId.get(item.regionId))?.text?.node : null;
  const box = text?.getBoundingClientRect(), frame = document.getElementById('atlas-world').getBoundingClientRect();
  return box && box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1
    ? text.textContent.replace(/\s/gu, '') : null;
});

let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1500, 800]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    // Before t5's stale times, so its steps are ahead.
    await page.clock.install({ time: new Date('2026-10-17T05:30:00Z') });
    await page.goto('http://127.0.0.1:' + site.address().port + '/?events=' + encodeURIComponent(producer.url), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    // Synchronization only: the first snapshot was accepted.
    await page.waitForFunction(() => window.liveAtlas.page.snapshotBytes !== null, null, { timeout: 60000 });
    const first = await shown(page, ['LATEST', '表示中：現在 6/6 · t5']);
    check(width + 'px: the first World is followed: LATEST · 表示中：現在 6/6 · t5', allShown(first) && !first.text.includes('最新か不明'), first);
    await page.getByRole('button', { name: '次へ ▶', exact: true }).click();
    const step = await shown(page, ['LATEST', '表示中：予定 1/2 · 10-17 05:41Z（観測が無ければ）']);
    check(width + 'px 次へ ▶: on the first step past the present, 予定 1/2', allShown(step), step);
    const second = await shown(page, ['LATEST', '表示中：現在 7/7 · t6']);
    check(width + 'px: the next World returns from the step and moves the row to its latest: 表示中：現在 7/7 · t6', allShown(second) && !second.text.includes('予定'), second);
    check(width + 'px: 差 reads the frame followed (t6)', (await delta(page))?.includes('理想↔現在の差（近似中・10-17 06:00Z から）'.replace(/\s/gu, '')), await delta(page));
    await page.getByRole('button', { name: '◀ 前へ', exact: true }).click();
    const back = await shown(page, ['HELD', '表示中：過去 6/7 · t5']);
    check(width + 'px ◀ 前へ: HELD · 表示中：過去 6/7 · t5', allShown(back), back);
    const held = await shown(page, ['HELD', '表示中：過去 6/8 · t5']);
    check(width + 'px: a newer World keeps the past frame held: 表示中：過去 6/8 · t5', allShown(held), held);
    await page.getByRole('button', { name: '現在へ', exact: true }).click();
    const present = await shown(page, ['LATEST', '表示中：現在 8/8 · t7']);
    check(width + 'px 現在へ: the new latest, LATEST · 表示中：現在 8/8 · t7', allShown(present), present);
    await page.close();
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
const result = { schema: 'atlas-world-follow-browser-proof/1', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
