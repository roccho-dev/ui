import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { navigationFixture } from './navigation-fixtures.mjs';
import { inspectEnvelope } from '../protocol/index.js';

const driver = process.env.PLAYWRIGHT_DRIVER_ROOT;
assert(driver?.startsWith('/nix/store/'), 'Use the pinned semantic-map-browser-proof shell');
assert(process.env.PLAYWRIGHT_BROWSERS_PATH?.startsWith('/nix/store/'));
assert(process.env.FONTCONFIG_FILE?.startsWith('/nix/store/'));
const { chromium } = createRequire(import.meta.url)(driver);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-navigation-'));
const scale = process.argv.includes('--large') ? { count: 300, relations: 600 } : {};
const fixture = await navigationFixture(scale);
const b = await navigationFixture({ ...scale, name: 'B', kind: 'organization' });
const c = await navigationFixture({ ...scale, name: 'C' });
await fs.writeFile(path.join(directory, 'input.json'), JSON.stringify(fixture.envelope));
const build = spawnSync(process.execPath, ['packages/semantic-map/scripts/build-browser-example.mjs',
  `--input=${directory}/input.json`, `--out=${directory}`], { encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const server = http.createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'text/html');
  if (name === '/A.json') response.end(JSON.stringify(fixture.envelope));
  else if (name === '/B.json') response.end(JSON.stringify(b.envelope));
  else if (name === '/C.json') response.end(JSON.stringify(c.envelope));
  else response.end(await fs.readFile(path.join(directory, 'index.html')));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
const errors = [];
const ready = async page => {
  await page.waitForFunction(() => globalThis.semanticMapSite?.ready === true);
  await page.waitForFunction(() => globalThis.semanticMapSource?.ready && globalThis.semanticMapReview?.ready);
};
const snapshot = page => page.evaluate(() => ({ mapId: semanticMapRuntime.mapId, head: semanticMapRuntime.head,
  log: semanticMapRuntime.log, records: semanticMapApp.store.toRecords(), layout: semanticMapApp.store.layoutSnapshot(),
  draft: semanticMapRuntime.draftOperations(), camera: semanticMapApp.adapter.camera(), selection: semanticMapApp.adapter.selectionSnapshot() }));
const select = async (page, id, input = fixture) => {
  const active = page.locator(`[data-active-key="region:${id}"]`);
  if (await active.count()) { await active.click(); return; }
  await page.locator('#navigation-details').click();
  const root = page.getByRole('button', { name: `↑ ${input.records[0].title}`, exact: true });
  if (await root.count()) { await root.click(); await page.locator('#navigation-details').click(); }
  const label = input.records.find(r => r.id === id).label;
  await page.getByRole('button', { name: label, exact: true }).click();
};
try {
  browser = await chromium.launch();
  console.log(JSON.stringify({ stage: 'environment', node: process.version, browser: browser.version(), driver,
    browsers: process.env.PLAYWRIGHT_BROWSERS_PATH, fonts: process.env.FONTCONFIG_FILE, cpu: os.cpus()[0].model, memory: os.totalmem() }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await ready(page);
  const initial = await snapshot(page);
  await select(page, fixture.ids[1]); await page.locator('#navigation-relations').click();
  await page.getByRole('button', { name: 'Include internal', exact: true }).click();
  assert((await page.locator('#navigation-content').innerText()).includes('relations'));
  await page.locator('#navigation-close').click();
  await select(page, fixture.ids[7]);
  await page.locator('#navigation-details').click();
  await page.getByRole('button', { name: 'Focus selected', exact: true }).click();
  await page.locator('#navigation-details').click();
  await page.getByRole('button', { name: `Open supplied link · ${fixture.ids[7]}`, exact: true }).click();
  await page.waitForFunction(() => semanticMapRuntime.mapId === 'urn:navigation:organization:B' && document.documentElement.dataset.semanticNavigation === 'ready');
  await select(page, b.ids[7], b); await page.locator('#navigation-details').click();
  await page.getByRole('button', { name: `Open supplied link · ${b.ids[7]}`, exact: true }).click();
  await page.waitForFunction(() => semanticMapRuntime.mapId === 'urn:navigation:product:C' && document.documentElement.dataset.semanticNavigation === 'ready');
  await page.goBack(); await page.waitForFunction(() => semanticMapRuntime.mapId === 'urn:navigation:organization:B' && document.documentElement.dataset.semanticNavigation === 'ready');
  await page.goBack(); await page.waitForFunction(() => semanticMapRuntime.mapId === 'urn:navigation:product:A' && document.documentElement.dataset.semanticNavigation === 'ready');
  assert.deepEqual((await snapshot(page)).selection.regionIds, [fixture.ids[7]]);
  await page.reload(); await ready(page);
  assert.deepEqual((await snapshot(page)).selection.regionIds, [fixture.ids[7]]);
  let point = await page.evaluate(id => {
    const a = semanticMapApp.adapter, cell = a.cellsByRegionId.get(id), state = a.graph.getView().getState(cell);
    const box = a.container.getBoundingClientRect(); return { x: box.x + state.x + state.width / 2, y: box.y + state.y + state.height / 2 };
  }, fixture.ids[7]);
  await page.screenshot({ path: path.join(directory, 'before-drag.png') });
  console.log(JSON.stringify({ stage: 'before-pointer-drag', point, directory }));
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y + 30, { steps: 12 }); await page.mouse.up();
  console.log(JSON.stringify({ stage: 'after-pointer-drag', state: await page.evaluate(() => ({ draft: semanticMapRuntime.draftOperations(), tool: semanticMapApp.adapter.tool, toast: document.getElementById('toast').textContent })) }));
  await page.waitForFunction(() => semanticMapRuntime.draftCount() > 0);
  let moved = await snapshot(page);
  assert.equal(moved.head, initial.head);
  assert.equal(moved.draft[0].type, 'PinRegions');
  assert.deepEqual(moved.records.filter(r => r.type !== 'layout'), initial.records);
  await page.locator('#undo').click(); assert.equal((await snapshot(page)).draft.length, 0);
  await page.locator('#redo').click();
  await page.locator('#handoff-fab').click();
  // Pending review visibly refuses a Pattern change.
  await page.locator('#review-close').click();
  await page.locator('#pattern-select').selectOption('map/1');
  await page.waitForFunction(() => document.getElementById('pattern-select').value === 'graph/1');
  assert.equal(await page.evaluate(() => semanticMapRuntime.view.pattern), 'graph/1');
  await page.locator('#handoff-fab').click();
  await page.evaluate(() => {
    globalThis.savedReplaceState = history.replaceState;
    history.replaceState = () => { throw new DOMException('injected history quota', 'QuotaExceededError'); };
  });
  await page.locator('#review-reject').click();
  await page.waitForFunction(() => !semanticMapReview.pending() && semanticMapRuntime.draftCount() === 0);
  assert.match(await page.locator('#review-status').innerText(), /rejected; history synchronization failed/);
  assert.equal((await snapshot(page)).head, initial.head);
  await page.evaluate(() => { history.replaceState = globalThis.savedReplaceState; delete globalThis.savedReplaceState; });
  await page.locator('#review-close').click();
  point = await page.evaluate(id => {
    const a = semanticMapApp.adapter, cell = a.cellsByRegionId.get(id), state = a.graph.getView().getState(cell);
    const box = a.container.getBoundingClientRect(); return { x: box.x + state.x + state.width / 2, y: box.y + state.y + state.height / 2 };
  }, fixture.ids[7]);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y + 30, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(() => semanticMapRuntime.draftCount() > 0);
  await page.locator('#handoff-fab').click();
  await page.locator('#review-accept').click();
  await page.waitForFunction(head => semanticMapRuntime.head !== head, initial.head);
  assert.equal(await page.locator('#review-copy-after').isDisabled(), !!scale.count);
  await page.locator('#review-close').click();
  await page.locator('#source-open').click();
  const downloadEvent = page.waitForEvent('download'); await page.locator('#source-export').click();
  const download = await downloadEvent; const file = path.join(directory, 'accepted.json');
  await download.saveAs(file); assert.equal(await download.failure(), null);
  const saved = JSON.parse(await fs.readFile(file, 'utf8')); const verified = await inspectEnvelope(saved);
  const accepted = await snapshot(page); assert.equal(verified.base.head, accepted.head);
  assert.deepEqual(verified.base.records, accepted.records);
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const reopened = await fresh.newPage(); reopened.on('pageerror', e => errors.push(e.message));
  await reopened.goto(url); await ready(reopened); await reopened.locator('#source-open').click();
  await reopened.locator('#source-file').setInputFiles(file);
  await reopened.waitForFunction(head => semanticMapRuntime.head === head && document.documentElement.dataset.semanticNavigation === 'ready', accepted.head);
  assert.deepEqual((await snapshot(reopened)).records, accepted.records);
  assert.equal(new URL(reopened.url()).hash, '');
  await reopened.screenshot({ path: path.join(directory, 'reopened.png') });
  // Normal controls, with injected failures confined to external effects/rendering.
  await reopened.locator('#pattern-select').selectOption('map/1');
  await reopened.waitForFunction(() => semanticMapRuntime.view.pattern === 'map/1' && document.documentElement.dataset.semanticNavigation === 'ready');
  await reopened.reload(); await ready(reopened);
  assert.equal(await reopened.evaluate(() => semanticMapRuntime.view.pattern), 'map/1');
  await reopened.goBack();
  await reopened.waitForFunction(() => semanticMapRuntime.view.pattern === 'graph/1' && document.documentElement.dataset.semanticNavigation === 'ready');
  const retained = await snapshot(reopened);
  const failedRender = await reopened.evaluate(async () => {
    const app = semanticMapApp.adapter.graph.getDataModel(), original = app.beginUpdate;
    app.beginUpdate = (...args) => { if (semanticMapRuntime.mapId === 'urn:navigation:organization:B') throw new Error('injected render failure'); return original.apply(app, args); };
    try { await semanticMapNavigation.openHref('/B.json'); return 'unexpected success'; }
    catch (error) { return error.message; }
    finally { app.beginUpdate = original; }
  });
  assert.match(failedRender, /injected render failure/);
  assert.deepEqual((await snapshot(reopened)).records, retained.records);
  assert.equal((await snapshot(reopened)).mapId, retained.mapId);
  console.log(JSON.stringify({ stage: 'pattern-reload-back-and-render-failure', status: 'PASS' }));
  const race = await reopened.evaluate(async () => {
    const original = globalThis.fetch;
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    globalThis.fetch = async (...args) => {
      if (String(args[0]).endsWith('/B.json')) await delayed;
      return original(...args);
    };
    const originalPush = history.pushState; let pushes = 0;
    history.pushState = function (...args) { pushes++; return originalPush.apply(this, args); };
    try {
      const old = semanticMapNavigation.openHref('/B.json').then(() => 'unexpected success', e => e.message);
      await semanticMapNavigation.openHref('/C.json');
      release();
      return { old: await old, added: pushes, map: semanticMapRuntime.mapId,
        historyMap: history.state.semanticMapInput.mapId };
    } finally { release(); globalThis.fetch = original; history.pushState = originalPush; }
  });
  assert.match(race.old, /Superseded/);
  assert.equal(race.added, 1);
  assert.equal(race.map, 'urn:navigation:product:C');
  assert.equal(race.historyMap, race.map);
  console.log(JSON.stringify({ stage: 'delayed-obsolete-input-no-history-publication', status: 'PASS' }));

  assert.deepEqual(errors.filter(message => message !== 'injected render failure'), []);
  console.log(JSON.stringify({ schema: 'semantic-map-navigation-browser/1', status: 'PASS',
    scope: 'first slice: actual drag, local accept, completed download/fresh Open, cross-input/back/reload', directory,
    regions: scale.count ?? 30, relations: scale.relations ?? 45,
    sourceRevision: spawnSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    buildReceipt: JSON.parse(await fs.readFile(path.join(directory, 'receipt.json'), 'utf8')),
    head: accepted.head, layout: accepted.layout, errors }));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
