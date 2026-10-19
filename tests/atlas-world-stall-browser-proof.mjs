// Update stalled, on the browser's clock. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-stall-browser-proof.mjs --out=<fresh absent directory>
// A chrome-free build (as /hq/) opened over HTTP with `?events=` pointing at a
// separate-origin SSE producer that sends its World on connect and then
// heartbeats on demand. The browser clock is installed just before the newest
// frame's asOf + 3 update intervals (10 minutes by default):
// - before that moment the status line claims LATEST and no stall;
// - past it, with heartbeats still arriving (the stream reads receiving), the
//   status line reads 更新停止・最新か不明 and LATEST is qualified, with no input;
// - a build with --update-interval-minutes=2 reads stalled 6 minutes after asOf;
// - a page opened without `?events=` (a sample) claims no update, so no stall.
// Read from the drawn status line, not from page state.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

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
const MINUTE = 60_000;
// Receiving, as the status line states it: the time of the last arrival and
// no SSE warning (未接続 / 応答なし / データ未受信).
const receiving = (text, at) => text.includes('最終受信 ' + new Date(at).toISOString().slice(11, 16)) && !text.includes('SSE');
const world = worldWithFrames(3);
const asOf = Date.parse(world.frames.at(-1).asOf);
const data = JSON.stringify(world);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stall-'));
fs.writeFileSync(path.join(scratch, 'world.json'), data, { flag: 'wx' });
fs.mkdirSync(args.out);
const build = async (name, options) => {
  await buildLiveAtlas({ input: path.join(scratch, 'world.json'), out: path.join(args.out, name), consumer: 'app', chrome: 'none', ...options });
  return fs.readFileSync(path.join(path.resolve(args.out), name, 'index.html'));
};
const pages = { default: await build('default', {}), short: await build('short', { updateIntervalMinutes: 2 }) };

let current = null;
const site = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(pages[current]);
});
const streams = new Set();
const producer = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  response.write('retry: 100\n\nevent: snapshot\ndata: ' + data + '\n\n');
  streams.add(response);
  response.on('close', () => streams.delete(response));
});
const heartbeat = () => { for (const response of streams) response.write('event: heartbeat\ndata: ' + JSON.stringify({ at: new Date().toISOString(), bytes: data.length }) + '\n\n'); };
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
await new Promise(resolve => producer.listen(0, '127.0.0.1', resolve));
const events = 'http://127.0.0.1:' + producer.address().port + '/events';
const urlOf = live => 'http://127.0.0.1:' + site.address().port + '/' + (live ? '?events=' + encodeURIComponent(events) : '');

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const status = page => page.evaluate(() => {
  const node = document.getElementById('atlas-world-search-count');
  const box = node?.getBoundingClientRect();
  return { text: node?.textContent ?? '', visible: Boolean(box && box.width > 0 && box.height > 0) };
});
let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  const open = async (name, live, time) => {
    current = name;
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.clock.install({ time: new Date(time) });
    await page.goto(urlOf(live), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    if (live) await page.waitForFunction(() => window.liveAtlas.page.snapshotBytes !== null, null, { timeout: 60000 });
    await settle(page);
    return page;
  };

  // Default interval (10 minutes): stalled after asOf + 30 minutes.
  const page = await open('default', true, asOf + 29 * MINUTE);
  heartbeat();
  await page.waitForFunction(() => window.liveAtlas.page.heartbeatBytes !== null, null, { timeout: 60000 });
  await settle(page);
  const before = await status(page);
  check('before asOf + 3 intervals, receiving, the status line claims LATEST and no stall',
    before.visible && receiving(before.text, asOf + 29 * MINUTE) && /LATEST(?!（)/u.test(before.text) && !before.text.includes(STALLED), before);
  // Heartbeats keep arriving across the moment; no input is given.
  await page.clock.fastForward(80_000);
  heartbeat();
  await page.waitForFunction(at => window.liveAtlas.page.receivedAt >= at, asOf + 29 * MINUTE + 80_000, { timeout: 60000 });
  await page.clock.fastForward(45_000);
  await settle(page);
  const after = await status(page);
  check('past asOf + 3 intervals, still receiving heartbeats, the status line reads 更新停止・最新か不明 and qualifies LATEST',
    after.visible && receiving(after.text, asOf + 29 * MINUTE + 80_000) && after.text.includes(STALLED) && after.text.includes('LATEST（最新か不明）'), after);
  await page.close();

  // A build with a 2-minute interval: stalled 6 minutes after asOf.
  const short = await open('short', true, asOf + 7 * MINUTE);
  const shortStatus = await status(short);
  check('--update-interval-minutes=2: stalled 7 minutes after asOf', shortStatus.text.includes(STALLED), shortStatus);
  await short.close();
  const shortFresh = await open('short', true, asOf + 5 * MINUTE);
  const freshStatus = await status(shortFresh);
  check('--update-interval-minutes=2: not stalled 5 minutes after asOf', !freshStatus.text.includes(STALLED) && freshStatus.text.includes('LATEST'), freshStatus);
  await shortFresh.close();

  // A sample page (no ?events=) is not an updated page: no stall claimed.
  const sample = await open('default', false, asOf + 60 * MINUTE);
  const sampleStatus = await status(sample);
  check('a sample page claims no update stall', !sampleStatus.text.includes(STALLED), sampleStatus);
  await sample.close();
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  for (const response of streams) response.end();
  await new Promise(resolve => producer.close(resolve));
  producer.closeAllConnections?.();
  await new Promise(resolve => site.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-stall-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL', checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
