// Supplied plans in the chrome-free app. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-plan-browser-proof.mjs --out=<fresh absent directory>
// One three-frame World with the three contract cases (null, [], two plans
// with one of unknown content) -> `--chrome=none` build -> real Chromium: the
// plan cell follows the displayed frame through `[`, `]`, 現在へ戻る and `L`;
// its detail opens and follows the frame too; nothing else changes.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';
import { PLAN_NONE, PLAN_UNDECLARED, TIMELINE_ID_PREFIX, planDetailLines, planSummary } from '../packages/control/src/atlas-timeline.mjs';
import { planWorld } from './fixtures/atlas-plan-worlds.mjs';

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
// this journey clicks and reads the strip's plan cell. The code below is kept.
console.log(JSON.stringify({ schema: 'atlas-world-plan-browser-proof/1', status: 'STOPPED', reason: 'chrome-free view draws no strip (undesigned)' }));
process.exit(0);

const world = planWorld();
const parsed = parseAtlasWorldInput(world);
const summaries = parsed.frames.map(frame => planSummary(frame.plans ?? null));
const details = parsed.frames.map(frame => planDetailLines(frame.plans ?? null));
const inputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-plan-')), 'world.json');
fs.writeFileSync(inputPath, JSON.stringify(world), { flag: 'wx' });
const receipt = await buildLiveAtlas({ input: inputPath, out: args.out, consumer: 'app', chrome: 'none' });
const body = fs.readFileSync(path.join(path.resolve(args.out), 'index.html'));
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const pageErrors = [], consoleErrors = [];
let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });

  const view = () => page.evaluate(prefix => {
    const atlas = window.liveAtlas, adapter = atlas.adapter;
    const drawn = id => {
      const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(id));
      return state?.text?.node?.textContent ?? null;
    };
    const rows = atlas.projection.scene.representations.filter(item => item.regionId.startsWith(prefix + 'plan-line:'))
      .sort((a, b) => a.atlas.line - b.atlas.line);
    // Every timeline text rectangle against its own cell and the screen, so a
    // label drawn outside its cell fails even when its text is right.
    const screen = document.getElementById('atlas-world').getBoundingClientRect();
    const outside = atlas.projection.scene.representations.filter(item => item.regionId.startsWith(prefix)).filter(item => {
      const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(item.regionId));
      const box = state?.text?.node?.getBoundingClientRect?.(), shape = state?.shape?.node?.getBoundingClientRect?.();
      return !box || !shape || box.left < shape.left - 2 || box.right > shape.right + 2 || box.top < shape.top - 2
        || box.bottom > shape.bottom + 2 || box.left < screen.left - 1 || box.right > screen.right + 1;
    }).map(item => item.regionId);
    return { index: atlas.projection.timeline.index, plan: drawn(prefix + 'plan'),
      rows: rows.map(item => drawn(item.regionId)), coverage: atlas.projection.coverage, outside };
  }, TIMELINE_ID_PREFIX);
  const press = async key => { await page.focus('#atlas-world'); await page.keyboard.press(key); };
  const clickCell = async regionId => {
    const point = await page.evaluate(id => {
      const adapter = window.liveAtlas.adapter;
      const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(id));
      if (!state) return null;
      const box = document.getElementById('atlas-world').getBoundingClientRect();
      return { x: box.left + state.x + state.width / 2, y: box.top + state.y + state.height / 2 };
    }, regionId);
    if (!point) throw new Error('missing region cell ' + regionId);
    await page.mouse.click(point.x, point.y);
  };
  const flat = value => String(value ?? '').replace(/\s/gu, '');
  const seen = [];
  const shows = (state, index) => { seen.push(state.outside); return state.outside.length === 0 && flat(state.plan).startsWith(flat(summaries[index])); };

  let state = await view();
  const presentCoverage = JSON.stringify(state.coverage);
  check('present frame shows its two plans, one with unknown content', state.index === 2 && shows(state, 2) && state.plan.includes('内容 UNKNOWN'), state);
  await press('[');
  state = await view();
  check('stepping back shows that frame\'s declared empty plan list', state.index === 1 && shows(state, 1) && summaries[1] === PLAN_NONE, state);
  await press('[');
  state = await view();
  check('stepping back again shows undeclared (UNKNOWN)', state.index === 0 && shows(state, 0) && summaries[0] === PLAN_UNDECLARED, state);
  await clickCell(TIMELINE_ID_PREFIX + 'plan');
  state = await view();
  check('opening the plan detail of an undeclared frame says so', JSON.stringify(state.rows.map(flat)) === JSON.stringify(details[0].map(flat)), state);
  await press(']');
  await press(']');
  state = await view();
  check('the open detail follows the frame to the present plans', state.index === 2
    && JSON.stringify(state.rows.map(flat)) === JSON.stringify(details[2].map(flat)), state);
  check('the detail names serves, unknown reasons and sources', ['refactor-windows-retired', 'atlas-hq-loop', 'marker付きの節が見つからない', 'comment4411', 'sha256UNKNOWN']
    .every(text => state.rows.some(row => flat(row).includes(text))), state.rows);
  await press('[');
  await clickCell(TIMELINE_ID_PREFIX + 'present');
  state = await view();
  check('現在へ戻る returns to the present plans', state.index === 2 && shows(state, 2), state);
  await clickCell(TIMELINE_ID_PREFIX + 'plan');
  state = await view();
  check('the detail closes', state.rows.length === 0, state);
  await press('[');
  await press('l');
  state = await view();
  check('`L` returns to the present plans', state.index === 2 && shows(state, 2), state);
  check('plans change no coverage', JSON.stringify(state.coverage) === presentCoverage, { presentCoverage, coverage: state.coverage });
  check('every timeline text stayed inside its cell and the screen', seen.length >= 5 && seen.every(list => list.length === 0), seen);
  check('no browser page/console errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors });
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-plan-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  output: receipt.output, checks, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
