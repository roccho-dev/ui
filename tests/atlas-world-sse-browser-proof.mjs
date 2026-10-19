// Live updates over the User's path. Run inside the semantic-map-browser-proof
// Nix shell:
//   node tests/atlas-world-sse-browser-proof.mjs --out=<fresh absent directory>
// A chrome-free build of a two-frame World is served over HTTP and opened with
// `?events=` pointing at a separate-origin SSE producer that, like the HQ
// producer, sends its current World on connect and again whenever it changes.
// The producer's World is then rewritten with a newer frame. Read from the
// drawn timeline cell (its text and rectangle), not from page state:
// - following the present, the screen moves to the newer frame by itself;
// - holding a past frame, it stays, and 現在へ戻る then reaches the newest;
// - a page opened after the change shows the newest frame at once.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { TIMELINE_ID_PREFIX } from '../packages/control/src/atlas-timeline.mjs';
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

// Stopped: the chrome-free view draws no strip (未設計のため。設計の合意後に戻す);
// this journey reads the strip's position cell. The code below is kept.
// Exit 78 (stopped), never 0: a stopped proof must not read as a pass.
console.log(JSON.stringify({ schema: 'atlas-world-sse-browser-proof/1', status: 'STOPPED', reason: 'chrome-free view draws no strip (undesigned)' }));
process.exit(78);

// Built: frames 1..3. Streamed first: the same. Then: frames 1..4, the new
// frame later in rev and asOf, as a producer reading an updated file sends.
// `--input`/`--events-input` replace both, e.g. with a recorded HQ pair.
const readWorld = file => JSON.parse(fs.readFileSync(file, 'utf8'));
// Fixed words, so the check does not depend on the module under test.
const RECEIVING = '受信中';
const DISCONNECTED = 'SSE 未接続';
const built = args.input ? readWorld(args.input) : worldWithFrames(3);
const newer = args['events-input'] ? readWorld(args['events-input']) : worldWithFrames(4);
const lastOf = world => world.frames.at(-1);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sse-'));
fs.writeFileSync(path.join(scratch, 'world.json'), JSON.stringify(built), { flag: 'wx' });
// `--page=<index.html>` serves an existing build (its embedded World must be
// `--input`) instead of building one from this checkout.
const receipt = args.page ? { output: { path: args.page } }
  : await buildLiveAtlas({ input: path.join(scratch, 'world.json'), out: args.out, consumer: 'app', chrome: 'none' });
const body = fs.readFileSync(args.page ?? path.join(path.resolve(args.out), 'index.html'));
const page = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => page.listen(0, '127.0.0.1', resolve));

// A producer like the HQ one: current World on connect, then on each change.
let current = JSON.stringify(built);
const clients = new Set();
const event = data => 'event: snapshot\n' + data.split('\n').map(line => 'data: ' + line).join('\n') + '\n\n';
const producer = http.createServer((request, response) => {
  if (new URL(request.url, 'http://x').pathname !== '/events') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  response.write('retry: 500\n\n');
  clients.add(response);
  request.on('close', () => clients.delete(response));
  response.write(event(current));
});
await new Promise(resolve => producer.listen(0, '127.0.0.1', resolve));
const publish = world => { current = JSON.stringify(world); for (const client of clients) client.write(event(current)); };
// The HQ producer's keep-alive: `heartbeat` with the time and held World size.
// `bytes` is, as there, the length of the held World's one-line JSON string.
const heartbeat = (bytes = current.length) => {
  for (const client of clients) client.write('event: heartbeat\ndata: ' + JSON.stringify({ at: new Date().toISOString(), bytes }) + '\n\n');
};
const url = 'http://127.0.0.1:' + page.address().port + '/index.html?events='
  + encodeURIComponent('http://127.0.0.1:' + producer.address().port + '/events');
// A producer that accepts the connection and never sends anything.
const silentClients = new Set();
const silent = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  response.write('retry: 500\n\n');
  silentClients.add(response);
  request.on('close', () => silentClients.delete(response));
});
await new Promise(resolve => silent.listen(0, '127.0.0.1', resolve));
const silentUrl = url.replace(/events=.*/u, 'events=' + encodeURIComponent('http://127.0.0.1:' + silent.address().port + '/events'));
// The window after the last snapshot or heartbeat in which the screen may say
// it is receiving: the HQ heartbeat interval (30 s) times three.
const QUIET_MS = 90_000;
const SILENT = 'SSE 応答なし';
const NO_DATA = 'データ未受信';
const UNSURE = '最新か不明';

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const pageErrors = [];
let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true, args: ['--window-size=1500,1000'] });
  const open = async () => {
    const tab = await (await browser.newContext({ viewport: null })).newPage();
    tab.on('pageerror', error => pageErrors.push(String(error)));
    tab.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await tab.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    return tab;
  };
  // What the screen shows: the drawn position cell's text and whether it lies
  // inside its cell, plus the search status line.
  const shown = tab => tab.evaluate(prefix => {
    const adapter = window.liveAtlas.adapter;
    const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(prefix + 'position'));
    const text = state?.text?.node, shape = state?.shape?.node;
    const box = text?.getBoundingClientRect(), cell = shape?.getBoundingClientRect();
    return { position: text?.textContent ?? '', inside: Boolean(box && cell && box.left >= cell.left - 2 && box.right <= cell.right + 2),
      status: document.getElementById('atlas-world-search-count')?.textContent ?? '' };
  }, TIMELINE_ID_PREFIX);
  const showsFrame = (view, frame, where) => view.inside && view.position.includes(frame.id) && view.position.includes(where)
    && view.status.includes(frame.id + ' rev ' + frame.rev);
  const settle = tab => tab.waitForTimeout(1500);
  const press = async (tab, key) => { await tab.focus('#atlas-world'); await tab.keyboard.press(key); };

  const [b, n] = [built.frames.length, newer.frames.length];
  const heldFrame = built.frames[b - 2];
  const heldAfter = newer.frames.findIndex(frame => frame.id === heldFrame.id);
  const following = await open();
  const held = await open();
  await settle(following);
  check('both pages start at the built present', showsFrame(await shown(following), lastOf(built), '現在 ' + b + '/' + b)
    && showsFrame(await shown(held), lastOf(built), '現在 ' + b + '/' + b), { following: await shown(following), held: await shown(held) });
  await press(held, '[');
  const heldBefore = await shown(held);
  check('the held page shows a past frame', showsFrame(heldBefore, heldFrame, '過去 ' + (b - 1) + '/' + b), heldBefore);

  publish(newer);
  await settle(following);
  const moved = await shown(following);
  check('following the present, the screen moves to the newer frame', showsFrame(moved, lastOf(newer), '現在 ' + n + '/' + n), { moved, expected: lastOf(newer) });
  const stayed = await shown(held);
  check('holding a past frame, the screen stays on it', showsFrame(stayed, heldFrame, heldAfter < 0 ? '保持中' : '過去 ' + (heldAfter + 1) + '/' + n), stayed);
  await press(held, 'l');
  const caught = await shown(held);
  check('現在へ戻る then reaches the newest frame', showsFrame(caught, lastOf(newer), '現在 ' + n + '/' + n), caught);

  const late = await open();
  await settle(late);
  const fresh = await shown(late);
  check('a page opened after the change shows the newest frame', showsFrame(fresh, lastOf(newer), '現在 ' + n + '/' + n), fresh);
  check('a connected page says it is receiving', fresh.position.includes(RECEIVING) && !fresh.position.includes(DISCONNECTED), fresh);
  check('a connected page names when it last received', /最終受信 \d\d:\d\d:\d\dZ/u.test(fresh.status), fresh);

  // Receiving means a snapshot or heartbeat arrived on this connection within
  // the window, not merely an open connection. Time is moved only inside this
  // test, with the browser's clock.
  const quiet = await (await browser.newContext({ viewport: null })).newPage();
  await quiet.goto(silentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await quiet.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true' && window.liveAtlas.page.connected, null, { timeout: 60000 });
  await settle(quiet);
  const mute = await shown(quiet);
  check('an open connection that never sends is not receiving', mute.inside && !mute.position.includes(RECEIVING)
    && mute.position.includes(SILENT) && mute.status.includes(SILENT) && !/最新に追従/u.test(mute.position), mute);

  // Heartbeats without any snapshot on this connection: malformed ones count
  // for nothing; well-formed ones show the stream is alive but never that the
  // World shown is the latest.
  const toSilent = text => { for (const client of silentClients) client.write(text); };
  for (let turn = 0; turn < 3; turn += 1) {
    toSilent('event: heartbeat\ndata: not-json garbage\n\n');
    toSilent('event: heartbeat\ndata: \n\n');
    toSilent('event: heartbeat\ndata: {"at":"yesterday","bytes":-1}\n\n');
    await quiet.waitForTimeout(300);
  }
  const junk = await shown(quiet);
  check('malformed heartbeats alone are not receiving', !junk.position.includes(RECEIVING) && !/最新に追従/u.test(junk.position)
    && junk.position.includes(SILENT) && !/LATEST(?!（最新か不明）)/u.test(junk.status), junk);
  toSilent('event: heartbeat\ndata: ' + JSON.stringify({ at: new Date().toISOString(), bytes: 1234 }) + '\n\n');
  await quiet.waitForTimeout(500);
  const alive = await shown(quiet);
  check('well-formed heartbeats without a snapshot say connected but no data, never latest', !/最新に追従/u.test(alive.position)
    && alive.position.includes(NO_DATA) && alive.status.includes(NO_DATA) && !/LATEST(?!（最新か不明）)/u.test(alive.status), alive);
  await quiet.close();

  // A heartbeat whose size differs from the accepted snapshot means a missed
  // snapshot: the screen must stop claiming the latest until it matches.
  const sized = await open();
  await settle(sized);
  heartbeat(current.length + 1);
  await sized.waitForTimeout(500);
  const off = await shown(sized);
  check('a heartbeat size unlike the accepted snapshot reads not known latest', !/最新に追従/u.test(off.position)
    && off.position.includes(UNSURE) && off.status.includes(UNSURE), off);
  heartbeat();
  await sized.waitForTimeout(500);
  const on = await shown(sized);
  // The cell may drop 最新に追従 for width; receiving, no doubt in the cell,
  // and an unqualified LATEST in the status line are what latest means.
  check('a matching heartbeat size (UTF-16 length of the snapshot data) is latest again', on.position.includes(RECEIVING)
    && !on.position.includes(UNSURE) && /LATEST(?!（)/u.test(on.status) && !on.status.includes(UNSURE), on);
  await sized.close();

  // A background tab: its clock moves on without timers firing; coming back
  // to the front must re-judge at once.
  const hidden = await (await browser.newContext({ viewport: null })).newPage();
  await hidden.clock.install({ time: new Date('2026-10-17T00:00:00Z') });
  await hidden.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await hidden.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true' && window.liveAtlas.page.connected, null, { timeout: 60000 });
  await settle(hidden);
  const pageNow = await hidden.evaluate(() => Date.now());
  await hidden.clock.pauseAt(new Date(pageNow + 1000));
  const before = await shown(hidden);
  check('in front before hiding, receiving', before.position.includes(RECEIVING), before);
  await hidden.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Move the wall clock only; no timer runs, as in a throttled background tab.
  await hidden.clock.setSystemTime(new Date(pageNow + 1000 + QUIET_MS * 2));
  await hidden.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await hidden.clock.resume();
  await hidden.waitForTimeout(300);
  const back = await shown(hidden);
  check('back in front after the window, it reads no response at once', !back.position.includes(RECEIVING)
    && back.position.includes(SILENT) && !/最新に追従/u.test(back.position), back);
  await hidden.close();

  const timed = await (await browser.newContext({ viewport: null })).newPage();
  await timed.clock.install({ time: new Date('2026-10-17T00:00:00Z') });
  await timed.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await timed.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true' && window.liveAtlas.page.connected, null, { timeout: 60000 });
  await settle(timed);
  const forward = async ms => { await timed.clock.fastForward(ms); await timed.waitForTimeout(300); return shown(timed); };
  check('after the connect snapshot, receiving', (await shown(timed)).position.includes(RECEIVING), await shown(timed));
  let view = await forward(QUIET_MS / 3 * 2);
  heartbeat();
  await timed.waitForTimeout(500);
  view = await forward(QUIET_MS / 3 * 2);
  check('heartbeats alone keep it receiving past the window since the snapshot', view.position.includes(RECEIVING) && !view.position.includes(SILENT), view);
  heartbeat();
  await timed.waitForTimeout(500);
  view = await forward(QUIET_MS + 1000);
  check('when heartbeats stop, after the window it reads no response', !view.position.includes(RECEIVING)
    && view.position.includes(SILENT) && view.status.includes(SILENT), view);
  heartbeat();
  await timed.waitForTimeout(500);
  view = await forward(1000);
  check('a later heartbeat makes it receiving again', view.position.includes(RECEIVING), view);
  await timed.close();
  check('no page or console errors while connected', pageErrors.length === 0, [...pageErrors]);
  // From here the network fails on purpose: only script errors count.
  pageErrors.length = 0;
  const scriptErrors = pageErrors;

  // The screen must never claim to follow the latest while nothing arrives:
  // an unreachable producer, or one that stops, reads as disconnected.
  const deadPort = await new Promise(resolve => { const probe = http.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
  const unreachable = await (await browser.newContext({ viewport: null })).newPage();
  await unreachable.goto(url.replace(/events=.*/u, 'events=' + encodeURIComponent('http://127.0.0.1:' + deadPort + '/events')), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await unreachable.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
  await settle(unreachable);
  const lost = await shown(unreachable);
  check('an unreachable producer reads as disconnected, not as following the latest', lost.inside && lost.position.includes(DISCONNECTED)
    && !lost.position.includes(RECEIVING) && lost.status.includes(DISCONNECTED), lost);
  for (const client of clients) client.destroy();
  producer.close();
  await settle(late);
  const dropped = await shown(late);
  check('a producer that stops reads as disconnected', dropped.position.includes(DISCONNECTED) && dropped.status.includes(DISCONNECTED), dropped);
  const thrown = scriptErrors.filter(text => !/^Failed to load resource: net::ERR_/u.test(text));
  check('no script errors while disconnected', thrown.length === 0, thrown);
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  for (const client of clients) client.end();
  for (const client of silentClients) client.end();
  await new Promise(resolve => producer.close(resolve));
  producer.closeAllConnections?.();
  await new Promise(resolve => silent.close(resolve));
  silent.closeAllConnections?.();
  await new Promise(resolve => page.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-sse-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  output: receipt.output, checks, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
