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
const exampleFixture = path.join(repoRoot, 'examples', 'atlas', 'input', 'example.jsonl');
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
const example = await buildLiveAtlas({ input: exampleFixture, out: own(path.join(tmp, 'example')), consumer: 'example' });
own(path.join(tmp, 'example', 'index.html')); own(path.join(tmp, 'example', 'receipt.json'));
const sampleUrl = pathToFileURL(path.join(tmp, 'sample', 'index.html')).href;
const largeUrl = pathToFileURL(path.join(tmp, 'large', 'index.html')).href;
const exampleUrl = pathToFileURL(path.join(tmp, 'example', 'index.html')).href;

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

// Every drawn maxGraph cell against the actual browser viewport, without scrolling.
const readScreen = () => {
  const atlas = window.liveAtlas;
  const view = atlas.adapter.graph.getView();
  const outside = [];
  let cells = 0;
  for (const item of atlas.projection.scene.representations) {
    const box = view.getState(atlas.adapter.cellsByRegionId.get(item.regionId))?.shape?.node?.getBoundingClientRect();
    if (!box || !(box.width > 0 && box.height > 0)) { outside.push(`${item.regionId}: not painted`); continue; }
    cells += 1;
    if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) outside.push(`${item.regionId} (${item.atlas?.kind ?? item.mode}) at ${Math.round(box.left)},${Math.round(box.top)}-${Math.round(box.right)},${Math.round(box.bottom)}`);
  }
  const atlasBox = document.getElementById('atlas').getBoundingClientRect();
  const kinds = {};
  for (const item of atlas.projection.scene.representations) kinds[item.atlas?.kind ?? item.mode] = (kinds[item.atlas?.kind ?? item.mode] ?? 0) + 1;
  return { cells, outside, kinds, scrollY, viewport: { width: innerWidth, height: innerHeight }, atlas: { top: atlasBox.top, bottom: atlasBox.bottom } };
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
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    const required = viewport.height !== 720;
    const context = await browser.newContext({ viewport });
    await context.setOffline(true);
    const requests = [];
    context.on('request', request => { if (!/^(?:file|data):/u.test(request.url())) requests.push(request.url()); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(largeUrl, { timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    const screen = await page.evaluate(readScreen);
    check(`300-scope far scene entirely inside the browser viewport at ${viewport.width}x${viewport.height}`,
      screen.outside.length === 0 && screen.scrollY === 0 && screen.atlas.bottom <= viewport.height + 1 && screen.kinds.scope === 300 && screen.kinds.actor === 40 && screen.kinds.target === 4,
      { ...screen, outside: screen.outside.slice(0, 10) });
    const chips = await page.evaluate(readChips);
    const problems = readable(chips, viewport);
    const banner = await page.locator('#atlas-banners').textContent();
    if (required) {
      check(`300 scopes all drawn and readable at ${viewport.width}x${viewport.height}`, chips.length === 300 && problems.length === 0, { chips: chips.length, problems: problems.slice(0, 10) });
      check(`no degraded/unsupported banner at ${viewport.width}x${viewport.height}`, !/Degraded|Unsupported/u.test(banner), banner);
    } else {
      const unreadable = problems.filter(problem => /lacks/u.test(problem)).length;
      check(`at ${viewport.width}x${viewport.height} every chip is readable or the degrade is announced with its count`,
        chips.length === 300 && problems.every(problem => /lacks/u.test(problem)) && (unreadable === 0 ? !/Degraded/u.test(banner) : banner.includes(`Degraded: ${unreadable} of 300`)),
        { unreadable, problems: problems.slice(0, 5), banner: banner.slice(0, 300) });
    }
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
    check('mode is labelled sample as of', /^activity current · SAMPLE · rev 5 · as of 2026-10-06T00:50:00Z/u.test(await page.locator('#atlas-mode').innerText()));
    const sampleScreen = await page.evaluate(readScreen);
    check('sample far scene inside the 1280x800 browser viewport (scopes, actors, all four reference targets)',
      sampleScreen.outside.length === 0 && sampleScreen.scrollY === 0 && sampleScreen.kinds.target === 4 && sampleScreen.kinds.actor === 10, sampleScreen);
    const actorStatus = await page.evaluate(() => {
      const atlas = window.liveAtlas;
      const item = atlas.projection.scene.representations.find(rep => rep.regionId === 'agent-4');
      const node = atlas.adapter.graph.getView().getState(atlas.adapter.cellsByRegionId.get('agent-4'))?.text?.node;
      return { status: item.atlas.status, stroke: item.visual.appearance.strokeColor, text: node?.textContent ?? '' };
    });
    check('a blocked actor status is drawn on its glyph', actorStatus.status === 'blocked' && actorStatus.stroke === '#c2255c', actorStatus);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(() => innerHeight === 720);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const shortScreen = await page.evaluate(readScreen);
    check('sample far scene refits inside a 1280x720 browser viewport', shortScreen.outside.length === 0 && shortScreen.scrollY === 0 && shortScreen.kinds.target === 4, shortScreen);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(() => innerHeight === 800);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

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


  // Application-usecase example: same SharedAtlasUI, small deterministic fixture.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.setOffline(true);
    const requests = [];
    context.on('request', request => { if (!/^(?:file|data):/u.test(request.url())) requests.push(request.url()); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(exampleUrl);
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true');

    const initial = Object.fromEntries((await page.evaluate(readChips)).map(chip => [chip.id, chip]));
    check('example shows parallel/residual/missing Atlas states',
      initial['lane-a']?.token === '▶2' && initial['lane-b']?.token === '~' && initial.quiet?.token === '—', initial);

    const controlsGeometry = await page.evaluate(() => {
      const search = document.getElementById('atlas-search').getBoundingClientRect();
      const controls = document.getElementById('atlas-example-controls').getBoundingClientRect();
      const button = document.getElementById('atlas-example-next').getBoundingClientRect();
      const overlap = !(search.right <= controls.left || controls.right <= search.left || search.bottom <= controls.top || controls.bottom <= search.top);
      return {
        search: { x: search.x, y: search.y, width: search.width, height: search.height },
        controls: { x: controls.x, y: controls.y, width: controls.width, height: controls.height },
        button: { x: button.x, y: button.y, width: button.width, height: button.height },
        overlap,
        provenance: document.getElementById('atlas-example-provenance').textContent,
        buttonDisabled: document.getElementById('atlas-example-next').disabled,
      };
    });
    check('example replay controls do not obstruct Search and provenance is visible',
      !controlsGeometry.overlap
      && controlsGeometry.search.width > 0
      && controlsGeometry.button.width > 0
      && controlsGeometry.provenance === 'fixture · synthetic'
      && !controlsGeometry.buttonDisabled,
      controlsGeometry);

    const organization = await page.evaluate(() => ({
      actors: window.liveAtlas.projection.scene.representations.filter(item => item.atlas?.kind === 'actor').map(item => item.regionId),
      org: window.liveAtlas.projection.scene.relations.filter(item => item.relationIds?.[0]?.startsWith('org:')).length,
      targets: window.liveAtlas.projection.scene.representations
        .filter(item => item.atlas?.kind === 'target')
        .map(item => ({ id: item.regionId, class: item.atlas.class })),
    }));
    const targetClasses = organization.targets.map(item => item.class).sort();
    check('example shows actors, org relations and all four observable target classes',
      organization.actors.length === 3
      && organization.org === 2
      && JSON.stringify(targetClasses) === JSON.stringify(['code', 'meta', 'policy', 'purpose']),
      organization);

    const laneA = initial['lane-a'];
    await page.mouse.click(laneA.box.x + laneA.box.w / 2, laneA.box.y + laneA.box.h / 2);
    await page.waitForFunction(() => window.liveAtlas.page.selected === 'lane-a');
    check('example SVG selection updates HTML Inspector', (await page.locator('#atlas-inspector h3').first().innerText()) === 'lane-a');
    await page.locator('#atlas-scopes button').filter({ hasText: 'Ops lane' }).first().click();
    await page.waitForFunction(() => window.liveAtlas.page.selected === 'lane-b');
    check('example HTML scope selection updates SVG focus', await page.locator('[data-semantic-focus-region="lane-b"]').count() === 1);

    await page.evaluate(() => window.liveAtlas.select('project'));
    const projectInspector = await page.locator('#atlas-inspector').innerText();
    check('example Inspector shows real Control claim and pin',
      /Control ui: Example UI/u.test(projectInspector) && /claim claim-ui active by fixture/u.test(projectInspector) && /given: Atlas fixture control anchor/u.test(projectInspector),
      projectInspector);

    await page.evaluate(() => window.liveAtlas.select('work-new'));
    check('example Inspector shows work evidence', /wt\/example/u.test(await page.locator('#atlas-inspector').innerText()));

    await page.fill('#atlas-search', 'opaque demo property');
    check('example search finds unknown producer property', await page.locator('#atlas-audit tbody tr').count() === 1);
    await page.fill('#atlas-search', 'lane-a');
    await page.press('#atlas-search', 'Enter');
    check('example exact-id search selects through shared screen', await page.evaluate(() => window.liveAtlas.page.selected) === 'lane-a');
    await page.fill('#atlas-search', '');

    await page.evaluate(() => window.liveAtlas.select('work-new'));
    const workTimeline = await page.locator('#atlas-timeline').innerText();
    check('example timeline shows creation/activity and revision gap', /created/u.test(workTimeline) && /created → running/u.test(workTimeline) && /2→4 \(gap\)/u.test(workTimeline), workTimeline);
    await page.evaluate(() => window.liveAtlas.select('ref-b'));
    check('example timeline shows reference retarget', /retarget policy → purpose|retarget purpose → policy/u.test(await page.locator('#atlas-timeline').innerText()));
    check('example history visibly records incomplete gap', /history 3 rev · incomplete · gaps 2→4/u.test(await page.locator('#atlas-rev-label').innerText()));

    await page.evaluate(() => { window.liveAtlas.fit(); window.liveAtlas.zoomBy(2.5); window.liveAtlas.select('agent-a'); });
    const middle = await page.evaluate(() => ({
      lod: window.liveAtlas.projection.lod,
      membership: window.liveAtlas.projection.scene.relations.some(item => item.relationIds?.includes('member:member-a')),
      work: window.liveAtlas.adapter.cellsByRegionId.has('work-new'),
    }));
    check('example middle LOD shows focused membership and work', middle.lod === 'middle' && middle.membership && middle.work, middle);
    await page.evaluate(() => window.liveAtlas.zoomBy(3));
    const nearEvidence = await page.evaluate(() => window.liveAtlas.projection.scene.representations.find(item => item.regionId === 'work-new')?.label ?? '');
    check('example near LOD shows work evidence', /wt\/example/u.test(nearEvidence), nearEvidence);

    const atlasBox = await page.locator('#atlas').boundingBox();
    const cameraBefore = await page.evaluate(() => window.liveAtlas.adapter.camera());
    await page.mouse.move(atlasBox.x + 30, atlasBox.y + 30);
    await page.mouse.down();
    await page.mouse.move(atlasBox.x + 110, atlasBox.y + 75, { steps: 4 });
    await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const cameraAfter = await page.evaluate(() => window.liveAtlas.adapter.camera());
    check('example performs actual pan interaction',
      cameraAfter.scale === cameraBefore.scale && (cameraAfter.translateX !== cameraBefore.translateX || cameraAfter.translateY !== cameraBefore.translateY),
      { before: cameraBefore, after: cameraAfter });
    await page.evaluate(() => window.liveAtlas.fit());
    check('example Fit returns to far LOD', await page.evaluate(() => window.liveAtlas.projection.lod) === 'far');

    await page.evaluate(() => window.liveAtlas.select('lane-a'));
    const liveWorldBefore = await page.evaluate(() => {
      const cell = window.liveAtlas.adapter.cellsByRegionId.get('lane-a');
      const geometry = cell.getGeometry();
      return { x: geometry.x, y: geometry.y };
    });

    await page.locator('#atlas-example-next').click();
    await page.waitForFunction(() => window.liveAtlas.state.held?.rev === 5);
    check('example scripted accepted update becomes current',
      /^activity current · LIVE · connected · rev 5/u.test(await page.locator('#atlas-mode').innerText()));

    await page.locator('#atlas-example-next').click();
    await page.waitForFunction(() => window.liveAtlas.state.attempt?.outcome === 'rejected');
    check('example rejected update retains rev5 and becomes UNKNOWN',
      await page.evaluate(() => window.liveAtlas.state.held.rev) === 5 && /activity UNKNOWN \(latest update rejected\)/u.test(await page.locator('#atlas-mode').innerText()));

    await page.locator('#atlas-example-next').click();
    check('example disconnect is UNKNOWN not stopped', /activity UNKNOWN \(producer disconnected\)/u.test(await page.locator('#atlas-mode').innerText()));

    await page.locator('#atlas-example-next').click();
    check('example reconnect preserves rejected UNKNOWN until recovery',
      /activity UNKNOWN \(latest update rejected\)/u.test(await page.locator('#atlas-mode').innerText()));

    await page.locator('#atlas-example-next').click();
    await page.waitForFunction(() => window.liveAtlas.state.held?.rev === 7);
    const recovered = await page.evaluate(() => {
      const cell = window.liveAtlas.adapter.cellsByRegionId.get('lane-a');
      const geometry = cell.getGeometry();
      return {
        selected: window.liveAtlas.page.selected,
        world: { x: geometry.x, y: geometry.y },
        connected: window.liveAtlas.page.connected,
      };
    });
    check('example accepted recovery restores current with stable world/selection',
      /^activity current · LIVE · connected · rev 7/u.test(await page.locator('#atlas-mode').innerText())
      && recovered.selected === 'lane-a'
      && recovered.connected
      && JSON.stringify(recovered.world) === JSON.stringify(liveWorldBefore),
      { before: liveWorldBefore, after: recovered });

    check('example file proof raised no error', errors.length === 0, errors);
    check('example file proof made no network request', requests.length === 0, requests);
    check('example artifact receipt came from exact fixture', example.input.path === 'examples/atlas/input/example.jsonl', example);
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
      [{ delayMs: 200 }, { data: fresh(3) }, { delayMs: 900 }, { data: fresh(4) }],
    ] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${sampleUrl}?events=${encodeURIComponent(producer.url)}`);
    await page.waitForFunction(() => window.liveAtlas?.state.held?.rev === 1, null, { timeout: 15000 });
    const mode = () => page.locator('#atlas-mode').innerText();
    check('live connected and current', /^activity current · LIVE · connected · rev 1/u.test(await mode()), await mode());
    const liveBefore = (await page.evaluate(readChips)).find(chip => chip.id === 'ws-render');
    await page.waitForFunction(() => window.liveAtlas.state.attempt?.outcome === 'rejected', null, { timeout: 15000 });
    check('invalid topology rejected, previous revision kept', /rejected/u.test(await page.locator('#atlas-banners').textContent()) && await page.evaluate(() => window.liveAtlas.state.held.rev) === 1);
    const afterReject = await page.evaluate(readChips);
    check('a rejected update makes held activity unknown at once',
      /^activity UNKNOWN \((?:latest update rejected|producer disconnected)\)/u.test(await mode()) && afterReject.every(chip => chip.token === '?' && chip.motion === 'none'), await mode());
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

    await page.locator('#atlas-rev').fill('0');
    check('live history browsing is explicit before another publication', /HISTORY · rev 1/u.test(await mode()), await mode());
    await page.waitForFunction(() => window.liveAtlas.state.held?.rev === 4, null, { timeout: 15000 });
    check('incoming live publication preserves explicit history browsing',
      /HISTORY · rev 1/u.test(await mode()) && await page.locator('#atlas-rev').inputValue() === '0', await mode());
    await page.locator('#atlas-rev').fill('2');
    check('choosing latest returns to current live revision', /^activity current · LIVE · connected · rev 4/u.test(await mode()), await mode());

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
