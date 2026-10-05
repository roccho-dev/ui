// Real-browser proof of the Live Agent Organization Atlas on the actual
// maxGraph renderer: the built single-file HTML opened from file:// with no
// network, a generated 300-scope depth-4 topology at desktop viewports, and the
// served live mode against the finite fixture producer.
//
//   nix develop .#semantic-map-browser-proof --command node tests/live-atlas-browser-e2e.mjs
//
// Supplementary to the Node checks; it does not replace a person using a browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildLiveAtlas, resolveHistory } from '../scripts/build-live-atlas.mjs';
import { restamp, startAtlasProducer } from './fixtures/live-atlas/sse-producer.mjs';

const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
const fontConfig = process.env.FONTCONFIG_FILE;
if (!fontConfig || !fontConfig.startsWith('/nix/store/') || !fs.lstatSync(fontConfig).isFile()) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell (FONTCONFIG_FILE)');
}
if (!driverRoot || !path.isAbsolute(driverRoot) || !browsersRoot || !path.isAbsolute(browsersRoot)) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell (Playwright roots)');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'live-atlas', 'history.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-atlas-e2e-'));
const created = [];
const own = file => { created.unshift(file); return file; };

const checks = [];
const check = (name, ok, detail = null) => { checks.push({ name, ok: Boolean(ok), detail }); };

// 3 portfolios x 3 products x 4 projects x 7 workstreams = 300 scopes, depth 4.
const largeHistory = () => {
  const rows = [];
  const scope = (id, parent) => rows.push({ t: 'scope', id, label: `Scope ${id}`, parent });
  for (let a = 0; a < 3; a += 1) {
    scope(`p${a}`, null);
    for (let b = 0; b < 3; b += 1) {
      scope(`p${a}.${b}`, `p${a}`);
      for (let c = 0; c < 4; c += 1) {
        scope(`p${a}.${b}.${c}`, `p${a}.${b}`);
        for (let d = 0; d < 7; d += 1) scope(`p${a}.${b}.${c}.${d}`, `p${a}.${b}.${c}`);
      }
    }
  }
  for (let i = 0; i < 40; i += 1) rows.push({ t: 'actor', id: `a${i}`, label: `agent ${i}` });
  for (let i = 1; i < 40; i += 1) rows.push({ t: 'org', id: `o${i}`, from: `a${Math.floor((i - 1) / 4)}`, to: `a${i}` });
  ['purpose', 'meta', 'policy', 'code'].forEach((cls, i) => rows.push({ t: 'target', id: `t${i}`, label: cls, class: cls }));
  const leaves = rows.filter(row => row.t === 'scope' && row.id.split('.').length === 4);
  const statuses = ['running', 'running', 'blocked', 'stopped', 'completed', 'residual'];
  const work = leaves.flatMap((leaf, i) => (i % 5 === 4 ? [] : Array.from({ length: 1 + (i % 4) }, (_, k) => ({
    t: 'work', id: `w${i}.${k}`, scope: leaf.id, actors: [`a${(i + k) % 40}`], status: statuses[(i + k) % statuses.length], observedAt: '2026-10-06T00:09:00Z',
  }))));
  const refs = Array.from({ length: 40 }, (_, i) => ({ t: 'ref', id: `r${i}`, actor: `a${i}`, target: `t${i % 4}`, observedAt: '2026-10-06T00:09:00Z' }));
  return {
    kind: 'ui.liveAtlasHistory.v1', complete: true,
    snapshots: [{ kind: 'ui.liveAtlasInput.v1', rev: 1, asOf: '2026-10-06T00:10:00Z', maxAgeMs: 900000, channels: {
      topology: { rows }, observations: { rows: [...work, ...refs] },
    } }],
  };
};

const sample = await buildLiveAtlas({ input: fixture, out: own(path.join(tmp, 'sample')) });
own(path.join(tmp, 'sample', 'index.html')); own(path.join(tmp, 'sample', 'receipt.json'));
const largeInput = own(path.join(tmp, 'large.json'));
fs.writeFileSync(largeInput, JSON.stringify(largeHistory()), { flag: 'wx' });
await buildLiveAtlas({ input: largeInput, out: own(path.join(tmp, 'large')) });
own(path.join(tmp, 'large', 'index.html')); own(path.join(tmp, 'large', 'receipt.json'));
const sampleUrl = pathToFileURL(path.join(tmp, 'sample', 'index.html')).href;
const largeUrl = pathToFileURL(path.join(tmp, 'large', 'index.html')).href;

// Painted chip geometry, label text and motion, read from maxGraph's own states.
const readChips = () => {
  const atlas = window.liveAtlas;
  const view = atlas.adapter.graph.getView();
  return [...atlas.projection.scene.representations].filter(item => item.atlas?.kind === 'scope').map(item => {
    const cell = atlas.adapter.cellsByRegionId.get(item.regionId);
    const state = view.getState(cell);
    const shape = state?.shape?.node;
    const box = shape?.getBoundingClientRect();
    const textNode = state?.text?.node;
    const textBox = textNode?.getBoundingClientRect();
    return {
      id: item.regionId, token: item.atlas.token,
      box: box && { x: box.x, y: box.y, w: box.width, h: box.height },
      text: textNode?.textContent ?? '',
      textBox: textBox && { x: textBox.x, y: textBox.y, w: textBox.width, h: textBox.height },
      motion: shape?.getAttribute('data-visual-motion') ?? 'none',
      animation: shape?.firstElementChild ? getComputedStyle(shape.firstElementChild).animationName : null,
      world: cell?.getGeometry() && { x: cell.getGeometry().x, y: cell.getGeometry().y },
    };
  });
};

const readable = (chips, viewport) => {
  const problems = [];
  for (const chip of chips) {
    if (!chip.box || !(chip.box.w > 0 && chip.box.h > 0)) problems.push(`${chip.id}: not painted`);
    else if (chip.box.x < -1 || chip.box.y < -1 || chip.box.x + chip.box.w > viewport.width + 1 || chip.box.y + chip.box.h > viewport.height + 1) problems.push(`${chip.id}: outside viewport`);
    if (!chip.text.startsWith(chip.token)) problems.push(`${chip.id}: label ${JSON.stringify(chip.text)} lacks ${chip.token}`);
    if (chip.textBox && chip.box && (chip.textBox.w > chip.box.w + 1 || chip.textBox.h > chip.box.h + 2)) problems.push(`${chip.id}: label clipped`);
  }
  const sorted = [...chips].filter(chip => chip.box).sort((a, b) => a.box.x - b.box.x);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length && sorted[j].box.x < sorted[i].box.x + sorted[i].box.w; j += 1) {
      const a = sorted[i].box; const b = sorted[j].box;
      if (a.y < b.y + b.h && b.y < a.y + a.h) problems.push(`${sorted[i].id} overlaps ${sorted[j].id}`);
    }
  }
  return problems;
};

let browser = null;
let producer = null;
try {
  browser = await chromium.launch({ headless: true });

  // Offline sample and 300 scopes from file:// with every network request refused.
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    await context.setOffline(true);
    const requests = [];
    context.on('request', request => { if (!/^(?:file|data):/u.test(request.url())) requests.push(request.url()); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(largeUrl);
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    const chips = await page.evaluate(readChips);
    const box = await page.locator('#atlas').boundingBox();
    const problems = readable(chips, { width: viewport.width, height: box.y + box.height });
    check(`300 scopes all drawn and readable at ${viewport.width}x${viewport.height}`, chips.length === 300 && problems.length === 0, { chips: chips.length, problems: problems.slice(0, 10) });
    const banner = await page.locator('#atlas-banners').innerText();
    check(`no degraded/unsupported banner at ${viewport.width}x${viewport.height}`, !/Degraded|Unsupported/u.test(banner), banner);
    const summary = await page.locator('#atlas-summary').innerText();
    check(`far summary without interaction at ${viewport.width}x${viewport.height}`, /300 scopes/u.test(summary) && /blocked [1-9]/u.test(summary) && /missing [1-9]/u.test(summary) && /parallel≥3 [1-9]/u.test(summary), summary);
    check(`no page errors at ${viewport.width}x${viewport.height}`, errors.length === 0, errors);
    check(`no network at ${viewport.width}x${viewport.height}`, requests.length === 0, requests);
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.setOffline(true);
    const requests = [];
    context.on('request', request => { if (!/^(?:file|data):/u.test(request.url())) requests.push(request.url()); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(sampleUrl);
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true');
    const chips = await page.evaluate(readChips);
    const byId = Object.fromEntries(chips.map(chip => [chip.id, chip]));
    check('sample tokens: parallel, blocked, residual, missing', byId['ws-render']?.token === '▶3' && /!1/u.test(byId['ws-ci']?.token ?? '') && byId['ws-deploy']?.token === '~' && byId['ws-docs']?.token === '—', Object.fromEntries(chips.map(chip => [chip.id, chip.token])));
    check('running chip pulses on its maxGraph shape node', byId['ws-render'].motion === 'pulse' && byId['ws-render'].animation === 'atlas-pulse', byId['ws-render']);
    check('mode is labelled sample as of', /SAMPLE · rev 5 · as of 2026-10-06T00:50:00Z · activity current/u.test(await page.locator('#atlas-mode').innerText()));

    const before = byId['ws-render'];
    await page.mouse.click(before.box.x + before.box.w / 2, before.box.y + before.box.h / 2);
    await page.waitForFunction(() => window.liveAtlas.page.selected === 'ws-render');
    check('click on a maxGraph chip selects it', (await page.locator('#atlas-inspector h3').first().innerText()) === 'ws-render');
    check('focus marker drawn for the selection', await page.locator('[data-semantic-focus-region="ws-render"]').count() === 1);
    const events = await page.evaluate(() => new Promise(resolve => {
      document.getElementById('atlas').addEventListener('a2ui-client-action', event => resolve(event.detail), { once: true });
      window.liveAtlas.select('ws-ci');
    }));
    check('selection emits an a2ui client action', events.action === 'atlas.select' && events.context.id === 'ws-ci', events);

    await page.evaluate(() => window.liveAtlas.zoomBy(2.5));
    const middle = await page.evaluate(() => ({ lod: window.liveAtlas.projection.lod, work: window.liveAtlas.adapter.cellsByRegionId.has('w-render-2') }));
    check('zoom in reaches middle with work lanes', middle.lod === 'middle' && middle.work, middle);
    await page.evaluate(() => window.liveAtlas.zoomBy(3));
    const near = await page.evaluate(() => ({ lod: window.liveAtlas.projection.lod, label: window.liveAtlas.projection.scene.representations.find(item => item.regionId === 'w-render-4')?.label }));
    check('near shows work evidence', near.lod === 'near' && /wt\/atlas-motion/u.test(near.label ?? ''), near);
    const afterZoom = await page.evaluate(readChips);
    const renderAfter = afterZoom.find(chip => chip.id === 'ws-render');
    check('motion mark survives camera changes', renderAfter.motion === 'pulse', renderAfter);
    check('world coordinates unchanged by camera', JSON.stringify(renderAfter.world) === JSON.stringify(before.world), { before: before.world, after: renderAfter.world });
    await page.evaluate(() => window.liveAtlas.fit());
    check('fit returns to far', await page.evaluate(() => window.liveAtlas.projection.lod) === 'far');

    // Motion marks live on maxGraph's native shape nodes through every redraw path.
    const marks = async () => Object.fromEntries((await page.evaluate(readChips)).map(chip => [chip.id, chip]));
    await page.evaluate(() => window.liveAtlas.select('ws-docs'));
    let mark = await marks();
    check('motion marks survive a selection change', mark['ws-render'].motion === 'pulse' && mark['ws-docs'].motion === 'none', { render: mark['ws-render'].motion, docs: mark['ws-docs'].motion });
    await page.locator('#atlas-rev').fill('0');
    mark = await marks();
    check('status transition clears motion (rev 1: ws-history blocked)', mark['ws-history'].token === '!1' && mark['ws-history'].motion === 'none', mark['ws-history']);
    await page.locator('#atlas-rev').fill('3');
    mark = await marks();
    check('status transition sets motion (rev 5: ws-history running)', mark['ws-history'].token === '▶1' && mark['ws-history'].motion === 'pulse', mark['ws-history']);
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.waitForFunction(() => document.getElementById('atlas').clientWidth === 1100);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    mark = await marks();
    check('motion marks survive a viewport resize', mark['ws-render'].motion === 'pulse' && mark['ws-docs'].motion === 'none', { render: mark['ws-render'].motion, docs: mark['ws-docs'].motion });
    await page.setViewportSize({ width: 1280, height: 800 });

    // An invalid paint value is rejected before render mutates anything.
    const rollback = await page.evaluate(() => {
      const adapter = window.liveAtlas.adapter;
      const snapshot = () => ({
        regions: [...adapter.cellsByRegionId.keys()].join('|'),
        edges: [...adapter.edgesByProjectionKey.keys()].join('|'),
        cells: adapter.graph.getChildCells(adapter.graph.getDefaultParent(), true, true).length,
        connected: [...adapter.cellsByRegionId.values()].every(cell => adapter.graph.getDataModel().contains(cell)),
      });
      const previous = adapter.lastScene;
      const before = snapshot();
      const bad = { ...previous, relations: [], representations: previous.representations.map((item, index) => (index === 0 ? { ...item, visual: { appearance: { fillColor: 'red' } } } : item)) };
      let error = null;
      try { adapter.render(bad); } catch (thrown) { error = String(thrown.message); }
      const after = snapshot();
      const kept = adapter.lastScene === previous;
      window.liveAtlas.fit();
      return { error, before, after, kept, recovered: adapter.lastScene !== previous && snapshot().cells === before.cells };
    });
    check('invalid paint throws and leaves graph, cell maps and lastScene unchanged',
      /fillColor must be #rrggbb/u.test(rollback.error ?? '') && rollback.kept && JSON.stringify(rollback.before) === JSON.stringify(rollback.after) && rollback.before.edges.length > 0 && rollback.after.connected, rollback);
    check('a following valid render recovers', rollback.recovered && (await marks())['ws-render'].motion === 'pulse', rollback);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = (await page.evaluate(readChips)).find(chip => chip.id === 'ws-render');
    check('reduced motion stops animation but keeps the static token', reduced.animation === 'none' && reduced.text.startsWith('▶3'), reduced);

    const audit = await page.evaluate(() => {
      const held = window.liveAtlas.state.held;
      const expected = Object.values(held.raw).reduce((sum, text) => sum + text.split(/\r?\n/u).filter(line => line.trim()).length, 0);
      return { expected, rows: document.querySelectorAll('#atlas-audit tbody tr').length };
    });
    check('audit holds every non-empty source line', audit.rows === audit.expected && audit.expected > 129 + 97, audit);
    await page.fill('#atlas-search', 'opaque producer property');
    const found = await page.locator('#atlas-audit tbody tr').count();
    check('search finds an unknown producer property', found === 1, found);
    await page.fill('#atlas-search', '');

    await page.evaluate(() => window.liveAtlas.select('w-audit-1'));
    const timeline = await page.locator('#atlas-timeline').innerText();
    check('timeline shows creation then activity for the same work', /created/u.test(timeline) && /activity created → running/u.test(timeline), timeline);
    await page.evaluate(() => window.liveAtlas.select('r-2'));
    check('timeline shows reference retarget', /retarget t-policy → t-code/u.test(await page.locator('#atlas-timeline').innerText()));
    await page.evaluate(() => window.liveAtlas.select('ws-deploy'));
    const deploy = await page.locator('#atlas-timeline').innerText();
    check('timeline shows residual and topology change with revision gap', /stopped → residual/u.test(deploy) && /topology changed/u.test(deploy) && /3→5 \(gap\)/u.test(deploy), deploy);
    await page.locator('#atlas-rev').fill('0');
    check('history playback is labelled', /HISTORY · rev 1/u.test(await page.locator('#atlas-mode').innerText()));
    check('sample page raised no error', errors.length === 0, errors);
    check('sample page made no network request', requests.length === 0, requests);
    await context.close();
  }

  // Served live mode: the same file consumes an external producer.
  {
    const history = await resolveHistory(fixture);
    const latest = history.snapshots.at(-1);
    const fresh = rev => restamp(latest, rev, Date.now());
    const badTopology = { ...fresh(2), channels: { ...fresh(2).channels, topology: { text: '{"t":"scope","id":"x","label":"x","parent":"missing"}\n' } } };
    producer = await startAtlasProducer({ connections: [
      [{ data: fresh(1) }, { delayMs: 800 }, { data: badTopology }, { delayMs: 800 }, { close: true }],
      [{ delayMs: 200 }, { data: fresh(3) }],
    ] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${sampleUrl}?events=${encodeURIComponent(producer.url)}`);
    await page.waitForFunction(() => window.liveAtlas?.state.held?.rev === 1, null, { timeout: 15000 });
    const mode = () => page.locator('#atlas-mode').innerText();
    check('live connected and current', /LIVE · connected · rev 1 .* activity current/u.test(await mode()), await mode());
    const liveBefore = (await page.evaluate(readChips)).find(chip => chip.id === 'ws-render');
    await page.waitForFunction(() => window.liveAtlas.state.attempt?.outcome === 'rejected', null, { timeout: 15000 });
    check('invalid topology rejected, previous revision kept', /rejected/u.test(await page.locator('#atlas-banners').innerText()) && await page.evaluate(() => window.liveAtlas.state.held.rev) === 1);
    // Read the disconnected frame inside the page before EventSource reconnects.
    const disconnected = await (await page.waitForFunction(() => {
      const atlas = window.liveAtlas;
      if (atlas.page.connected) return null;
      const view = atlas.adapter.graph.getView();
      const chips = atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'scope').map(item => ({
        token: item.atlas.token,
        motion: view.getState(atlas.adapter.cellsByRegionId.get(item.regionId))?.shape?.node?.getAttribute('data-visual-motion') ?? 'none',
      }));
      return { mode: document.getElementById('atlas-mode').textContent, chips };
    }, null, { timeout: 15000, polling: 'raf' })).jsonValue();
    check('disconnect makes activity unknown, not stopped, and stops motion',
      /activity UNKNOWN \(producer disconnected\)/u.test(disconnected.mode) && disconnected.chips.every(chip => chip.token === '?' && chip.motion === 'none'), disconnected.mode);
    await page.waitForFunction(() => window.liveAtlas.state.held?.rev === 3 && window.liveAtlas.page.connected, null, { timeout: 15000 });
    const liveAfter = (await page.evaluate(readChips)).find(chip => chip.id === 'ws-render');
    check('reconnect resumes current activity without moving the world', /activity current/u.test(await mode()) && JSON.stringify(liveAfter.world) === JSON.stringify(liveBefore.world), { before: liveBefore.world, after: liveAfter.world });
    check('live page raised no error', errors.length === 0, errors);
    await context.close();
  }
} finally {
  try { if (browser) await browser.close(); } finally {
    if (producer) await producer.close();
    for (const file of created) {
      try { if (fs.lstatSync(file).isDirectory()) fs.rmdirSync(file); else fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    fs.rmdirSync(tmp);
  }
}

const failed = checks.filter(item => !item.ok);
console.log(JSON.stringify({ schema: 'live-atlas-browser-e2e/1', status: failed.length ? 'FAIL' : 'PASS', sampleBuild: sample.output, checks: checks.length, failed }, null, 1));
if (failed.length) process.exitCode = 1;
