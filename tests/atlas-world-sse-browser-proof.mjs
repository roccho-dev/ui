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
const url = 'http://127.0.0.1:' + page.address().port + '/index.html?events='
  + encodeURIComponent('http://127.0.0.1:' + producer.address().port + '/events');

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
  await new Promise(resolve => producer.close(resolve));
  producer.closeAllConnections?.();
  await new Promise(resolve => page.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-sse-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  output: receipt.output, checks, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
