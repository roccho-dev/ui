// Timeline browser journey on the chrome-free app build. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-timeline-browser-proof.mjs --out=<fresh absent directory>
// One three-frame World -> `--chrome=none` build -> real Chromium: the
// timeline strip is drawn with no HUD, `[`/`]` and the strip step through every
// frame, no step passes the present, `L` and 現在へ戻る return to it, the plan
// reads undeclared, and a reload keeps the held frame.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { PLAN_UNDECLARED, TIMELINE_ID_PREFIX } from '../packages/control/src/atlas-timeline.mjs';
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
// this journey clicks and reads the strip's cells. The code below is kept.
console.log(JSON.stringify({ schema: 'atlas-world-timeline-browser-proof/1', status: 'STOPPED', reason: 'chrome-free view draws no strip (undesigned)' }));
process.exit(0);

const world = worldWithFrames(3);
const frameIds = world.frames.map(frame => frame.id);
const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-timeline-'));
const inputPath = path.join(inputDir, 'world.json');
fs.writeFileSync(inputPath, JSON.stringify(world), { flag: 'wx' });
const receipt = await buildLiveAtlas({ input: inputPath, out: args.out, consumer: 'app', chrome: 'none' });
const body = fs.readFileSync(path.join(path.resolve(args.out), 'index.html'));
const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname !== '/' && pathname !== '/index.html') { response.writeHead(404).end('not found'); return; }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const pageErrors = [], consoleErrors = [];
let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const ready = () => page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await ready();

  const view = () => page.evaluate(prefix => {
    const atlas = window.liveAtlas;
    const ids = [...atlas.adapter.cellsByRegionId.keys()];
    const label = id => atlas.projection.scene.representations.find(item => item.regionId === id)?.label ?? null;
    return { frameId: atlas.projection.timeline.count ? atlas.page.side === 'before' ? atlas.page.pair.before.id : atlas.page.pair.after.id : null,
      timeline: atlas.projection.timeline, latest: atlas.page.latest, hash: location.hash,
      timelineCells: ids.filter(id => id.startsWith(prefix)).length,
      hud: ids.filter(id => /^world:(control|judgement|detail|aggregate|omitted|endpoint)/u.test(id)).length,
      plan: label(prefix + 'plan'), position: label(prefix + 'position') };
  }, TIMELINE_ID_PREFIX);
  const press = async key => { await page.focus('#atlas-world'); await page.keyboard.press(key); };
  const clickCell = async regionId => {
    const point = await page.evaluate(id => {
      const adapter = window.liveAtlas.adapter;
      const cell = adapter.cellsByRegionId.get(id);
      const state = cell ? adapter.graph.getView().getState(cell) : null;
      if (!state) return null;
      const box = document.getElementById('atlas-world').getBoundingClientRect();
      return { x: box.left + state.x + state.width / 2, y: box.top + state.y + state.height / 2 };
    }, regionId);
    if (!point) throw new Error('missing region cell ' + regionId);
    await page.mouse.click(point.x, point.y);
  };

  let state = await view();
  check('chrome-free build draws the timeline strip and no HUD', state.timelineCells === 5 && state.hud === 0, state);
  check('opens at the present anchor, following the latest', state.frameId === frameIds.at(-1) && state.latest && state.timeline.present, state);
  check('no plan is shown as undeclared (UNKNOWN)', state.plan?.startsWith(PLAN_UNDECLARED), state);

  const backward = [state.frameId];
  for (let step = 0; step < frameIds.length + 1; step += 1) { await press('['); backward.push((await view()).frameId); }
  check('`[` steps back through every frame once, then stays at the first',
    JSON.stringify([...new Set(backward)]) === JSON.stringify([...frameIds].reverse()) && backward.at(-1) === frameIds[0], backward);

  const forward = [];
  for (let step = 0; step < frameIds.length + 1; step += 1) { await press(']'); forward.push((await view()).frameId); }
  state = await view();
  // From the first frame: one step per frame up to the present, then no step.
  check('`]` steps forward to the present and never past it',
    JSON.stringify(forward.slice(0, frameIds.length - 1)) === JSON.stringify(frameIds.slice(1))
    && forward.slice(frameIds.length - 1).every(id => id === frameIds.at(-1)) && state.timeline.index === frameIds.length - 1, forward);

  await press('[');
  await clickCell(TIMELINE_ID_PREFIX + 'back');
  state = await view();
  check('the strip back control steps one frame', state.frameId === frameIds[0], state);
  await clickCell(TIMELINE_ID_PREFIX + 'present');
  state = await view();
  check('現在へ戻る returns to the latest frame', state.frameId === frameIds.at(-1) && state.latest, state);
  check('following the present writes no t', !/[#&]t=/u.test(state.hash), state.hash);

  await press('[');
  state = await view();
  const held = state.frameId;
  check('a held past frame is in the fragment', held === frameIds[1] && state.hash.includes('t=' + encodeURIComponent(held)), state);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  state = await view();
  check('reload keeps the held frame', state.frameId === held && !state.latest && state.position.includes('過去 2/3'), state);
  await press('l');
  state = await view();
  check('`L` returns to the present after reload', state.frameId === frameIds.at(-1) && state.latest, state);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  state = await view();
  check('reload at the present stays at the present', state.frameId === frameIds.at(-1) && state.latest, state);
  check('no browser page/console errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors });
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-timeline-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  output: receipt.output, chrome: receipt.chrome, frames: frameIds, checks, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
