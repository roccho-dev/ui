// a2 combined UI acceptance gate.
// Builds the same public Atlas app artifact, opens it in Chromium, and proves
// the one World screen (contract 3, revised: the three areas, the status and
// search rows, no HUD, panel, strip or band) without a test-only renderer:
// composition and nesting, actual-click selection, the held frame across
// input updates, admission, resize, transport state and SSE, as drawn.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-a2-ui-composition-gate.mjs --out=<fresh absent directory>

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { proofScratch } from './fixtures/proof-scratch.mjs';
import { startAtlasProducer } from './fixtures/live-atlas/sse-producer.mjs';
import { containmentIndex, entityKey, parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';

const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
const fontConfig = process.env.FONTCONFIG_FILE;
if (!driverRoot || !path.isAbsolute(driverRoot) || !browsersRoot || !path.isAbsolute(browsersRoot)) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
if (!fontConfig || !path.isAbsolute(fontConfig) || !fs.existsSync(fontConfig)) {
  throw new Error('semantic-map-browser-proof font configuration is required');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);
if (!fs.existsSync(chromium.executablePath())) throw new Error('provided Chromium is unavailable');

// --out=<fresh absent directory>: its scratch (the build, the browser's
// temporary files) sits there, never the system temp directory, and is removed at the end.
const out = process.argv.slice(2).find(argument => argument.startsWith('--out='))?.slice('--out='.length);
if (!out) throw new Error('--out=<fresh absent directory> is required');
const { scratch: tempRoot, done } = proofScratch(out);
const output = path.join(tempRoot, 'dist');
const receipt = await buildLiveAtlas({
  input: 'examples/atlas/input/a2-world.json',
  out: path.relative(process.cwd(), output),
  consumer: 'app',
});

const simClients = new Set();
let simAvailable = true;
const transport = [];
let phase = 'World composition and interaction';
const recordTransport = (event, detail) => transport.push({ at: new Date().toISOString(), phase, event, ...detail });
const emitPrepared = data => {
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of simClients) client.write('event: snapshot\n' + raw.split(/\r?\n/u).map(line => 'data: ' + line).join('\n') + '\n\n');
};
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);
const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/prepared-events') {
    recordTransport('prepared request', { available: simAvailable });
    // A non-200 response terminates EventSource reconnection. Model a network
    // interruption by dropping the connection before sending HTTP headers.
    if (!simAvailable) { response.destroy(); return; }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    response.write('retry: 250\n\n');
    simClients.add(response);
    response.on('close', () => simClients.delete(response));
    return;
  }
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolved = path.resolve(output, file);
  if (!resolved.startsWith(output + path.sep) && resolved !== path.join(output, 'index.html')) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = fs.readFileSync(resolved);
    response.writeHead(200, {
      'content-type': types.get(path.extname(resolved)) ?? 'application/octet-stream',
      'content-length': body.byteLength,
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';

const failed = [];
let checks = 0;
let lastCheck = null;
const check = (name, condition, detail = null) => {
  checks += 1;
  lastCheck = name;
  if (!condition) failed.push({ name, detail });
};

let observedPage = null;
const observeTransport = (page, label) => {
  observedPage = page;
  const record = (event, request, detail = {}) => {
    const type = request.resourceType();
    if (type === 'document' || type === 'eventsource') {
      recordTransport(event, { page: label, type, url: request.url(), ...detail });
    }
  };
  page.on('request', request => record('request', request));
  page.on('response', response => record('response', response.request(), {
    status: response.status(), contentType: response.headers()['content-type'] ?? null,
  }));
  page.on('requestfailed', request => record('request failed', request, { failure: request.failure() }));
};

const rawWorldInput = JSON.parse(fs.readFileSync('examples/atlas/input/a2-world.json', 'utf8'));
const parsedWorldInput = parseAtlasWorldInput(rawWorldInput);
const afterContainment = containmentIndex(parsedWorldInput.frames.at(-1));

let browser;
let producer;
let completed = false;
let interruption = null;
const cleanupErrors = [];
const pageErrors = [];
const consoleErrors = [];
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  observeTransport(page, 'World');
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });

  check('public app artifact loaded', response?.status() === 200 && receipt.inputKind === 'ui.atlasWorldInput.v1', receipt);
  check('same public entry selected world screen', await page.evaluate(() => window.liveAtlas?.page?.kind) === 'world');

  const world = await page.evaluate(() => {
    const scene = window.liveAtlas.projection.scene;
    const areas = scene.representations.filter(item => item.atlas?.kind === 'area')
      .map(item => ({ id: item.atlas.areaId, x: item.bounds.x, width: item.bounds.width }));
    const entities = scene.representations.filter(item => item.atlas?.kind === 'entity')
      .map(item => ({
        ref: item.atlas.ref,
        area: item.atlas.area,
        regionId: item.regionId,
        parent: item.atlas.parent ?? null,
        hasChildren: item.atlas.hasChildren === true,
        containmentEvidence: item.atlas.containmentEvidence ?? [],
      }));
    const relations = scene.relations.map(item => ({
      ids: item.relationIds,
      refs: item.atlas?.relationRefs ?? [],
      from: item.from,
      to: item.to,
      kind: item.kind,
    }));
    return { areas, entities, relations };
  });

  const byArea = Object.fromEntries(world.areas.map(item => [item.id, item]));
  check('three areas exist', ['purpose', 'projects', 'agents'].every(id => byArea[id]));
  check('Purpose left / Projects center / Agents right',
    byArea.purpose.x < byArea.projects.x && byArea.projects.x < byArea.agents.x, world.areas);
  check('Work X is one node', world.entities.filter(item => item.ref.space === 'projects' && item.ref.kind === 'work' && item.ref.id === 'work.x').length === 1);
  check('qualified raw-id collision stays distinct',
    world.entities.filter(item => item.ref.id === 'shared').length === 2
      && new Set(world.entities.filter(item => item.ref.id === 'shared').map(item => item.ref.space)).size === 2);

  const renderedBox = async regionId => page.evaluate(id => {
    const adapter = window.liveAtlas.adapter;
    const cell = adapter.cellsByRegionId.get(id);
    const state = cell ? adapter.graph.getView().getState(cell) : null;
    return state ? { x: state.x, y: state.y, width: state.width, height: state.height } : null;
  }, regionId);

  const strictlyInside = (child, parent) => Boolean(child && parent
    && child.x > parent.x && child.y > parent.y
    && child.x + child.width < parent.x + parent.width
    && child.y + child.height < parent.y + parent.height);

  const clickBoundaryHeader = async regionId => {
    const point = await page.evaluate(id => {
      const adapter = window.liveAtlas.adapter;
      const cell = adapter.cellsByRegionId.get(id);
      const state = cell ? adapter.graph.getView().getState(cell) : null;
      if (!state) return null;
      const box = document.getElementById('atlas-world').getBoundingClientRect();
      return { x: box.left + state.x + 14, y: box.top + state.y + 14 };
    }, regionId);
    if (!point) throw new Error('missing boundary cell ' + regionId);
    await page.mouse.click(point.x, point.y);
  };

  const clickCell = async (regionId, targetPage = page) => {
    const point = await targetPage.evaluate(id => {
      const adapter = window.liveAtlas.adapter;
      const cell = adapter.cellsByRegionId.get(id);
      const state = cell ? adapter.graph.getView().getState(cell) : null;
      if (!state) return null;
      const box = document.getElementById('atlas-world').getBoundingClientRect();
      return { x: box.left + state.x + state.width / 2, y: box.top + state.y + state.height / 2 };
    }, regionId);
    if (!point) throw new Error('missing region cell ' + regionId);
    await targetPage.mouse.click(point.x, point.y);
  };

  const renderedEntityByKey = new Map(world.entities.map(item => [entityKey(item.ref), item]));
  const shownContainmentGeometry = [];
  for (const [childKey, parentKey] of afterContainment.parentByChild) {
    const child = renderedEntityByKey.get(childKey);
    const parent = renderedEntityByKey.get(parentKey);
    if (!child || !parent) continue;
    const [childBox, parentBox] = await Promise.all([
      renderedBox(child.regionId),
      renderedBox(parent.regionId),
    ]);
    shownContainmentGeometry.push({ childKey, parentKey, childBox, parentBox, inside: strictlyInside(childBox, parentBox) });
  }
  check('every shown explicit containment is nested inside its declared parent',
    shownContainmentGeometry.length > 0 && shownContainmentGeometry.every(item => item.inside),
    shownContainmentGeometry);

  const entityOf = (space, kind, id) => world.entities.find(item => item.ref.space === space && item.ref.kind === kind && item.ref.id === id);
  const company = entityOf('purpose', 'purpose', 'shared');
  const purposeA = entityOf('purpose', 'purpose', 'purpose.a');
  const idealA = entityOf('purpose', 'ideal', 'ideal.a');
  const projectA = entityOf('projects', 'project', 'project.a');
  const projectB = entityOf('projects', 'project', 'project.b');
  const workX = entityOf('projects', 'work', 'work.x');
  const workY = entityOf('projects', 'work', 'work.y');
  const teamAtlas = entityOf('agents', 'actor', 'team.atlas');
  const agentOne = entityOf('agents', 'agent', 'agent.1');
  const agentTwo = entityOf('agents', 'agent', 'agent.2');
  const agentThree = entityOf('agents', 'agent', 'shared');

  const [companyBox, purposeABox, idealABox, projectABox, projectBBox, workXBox, workYBox, teamBox, agentOneBox, agentTwoBox, agentThreeBox] = await Promise.all([
    company, purposeA, idealA, projectA, projectB, workX, workY, teamAtlas, agentOne, agentTwo, agentThree,
  ].map(item => renderedBox(item?.regionId)));

  check('Purpose explicit containment renders recursive nested geometry',
    strictlyInside(purposeABox, companyBox) && strictlyInside(idealABox, purposeABox) && strictlyInside(idealABox, companyBox),
    { companyBox, purposeABox, idealABox });
  check('Projects explicit containment nests Work Y inside Project B',
    strictlyInside(workYBox, projectBBox), { projectBBox, workYBox });
  check('Agents explicit containment nests Agent 1/2 inside neutral-kind Team Atlas',
    teamAtlas?.ref.kind === 'actor' && strictlyInside(agentOneBox, teamBox) && strictlyInside(agentTwoBox, teamBox),
    { teamAtlas, teamBox, agentOneBox, agentTwoBox });
  check('ordinary multi-project membership keeps Work X one node and non-nested',
    world.entities.filter(item => item.ref.space === 'projects' && item.ref.id === 'work.x').length === 1
      && !strictlyInside(workXBox, projectABox) && !strictlyInside(workXBox, projectBBox),
    { workXBox, projectABox, projectBBox });
  check('kind contains without explicit containment remains graph-only',
    agentThree?.parent === null && !strictlyInside(agentThreeBox, teamBox), { agentThree, agentThreeBox, teamBox });

  const membershipIds = new Set(world.relations.flatMap(item => item.refs.map(ref => ref.id)));
  check('graph-only memberships and p-r-w/review/dependency evidence remain relations',
    ['work.x.project.a','work.x.project.b','assign.a1.wx.p','assign.a2.wx.w','assign.a2.wx.r','agent1.agent2.collab','project.a.depends','team.agent3.graph-only']
      .every(id => membershipIds.has(id)), [...membershipIds]);

  const duplicateContainment = world.relations.find(item => {
    const ids = item.refs.map(ref => ref.id);
    return ids.includes('team.agent1.containment.1') && ids.includes('team.agent1.containment.2');
  });
  check('duplicate same-parent containment relation IDs remain recoverable',
    Boolean(duplicateContainment) && duplicateContainment.ids.length >= 2, duplicateContainment);

  const omittedEntityIds = await page.evaluate(() => window.liveAtlas.projection.omittedEntityIds);
  check('omitted parent keeps visible descendant omitted instead of flattening it',
    omittedEntityIds.some(id => id.includes('team.hidden')) && omittedEntityIds.some(id => id.includes('agent.hidden'))
      && !world.entities.some(item => item.ref.id === 'team.hidden' || item.ref.id === 'agent.hidden'),
    omittedEntityIds);
  const press = (name, targetPage = page) => targetPage.getByRole('button', { name, exact: true }).click();
  const statusText = (targetPage = page) => targetPage.evaluate(() => document.getElementById('atlas-world-status')?.textContent ?? '');

  // Actual clicks select a nested parent boundary, an intermediate one and a leaf.
  for (const [label, entity, click] of [['parent boundary', company, clickBoundaryHeader], ['intermediate boundary', purposeA, clickBoundaryHeader],
    ['leaf', idealA, clickCell]]) {
    await click(entity.regionId);
    await page.waitForFunction(key => window.liveAtlas.page.selected === key, entityKey(entity.ref));
    check('nested ' + label + ' is actual-click selectable', await page.evaluate(() => window.liveAtlas.page.selected) === entityKey(entity.ref));
  }
  const aggregate = world.relations.find(item => {
    const ids = item.refs.map(ref => ref.id);
    return ids.includes('assign.a2.wx.w') && ids.includes('assign.a2.wx.r');
  });
  check('same endpoint participation relations aggregate without identity loss', Boolean(aggregate) && aggregate.ids.length === 2, aggregate);

  // The one screen: only the native status and search rows and the changes
  // of the time shown (S7c) sit outside the SVG, and the SVG holds the three areas only —
  // no HUD, panel, strip or band region.
  const htmlSurface = await page.evaluate(() => {
    const screen = document.getElementById('atlas-world-screen');
    const status = document.getElementById('atlas-world-status-bar');
    const bar = document.getElementById('atlas-world-search-bar');
    return {
      bodyChildren: [...document.body.children].filter(node => !['SCRIPT', 'STYLE'].includes(node.tagName)).map(node => node.id),
      // The legend panel (User c6351431152) is there but not shown until "？" is pressed.
      screenChildren: screen ? [...screen.children].filter(node => node.getClientRects().length > 0).map(node => node.id) : null,
      legendClosed: document.getElementById('atlas-world-legend-panel')?.hidden === true,
      statusChildren: status ? [...status.children].map(node => node.tagName.toLowerCase() + '#' + node.id) : null,
      barChildren: bar ? [...bar.children].map(node => node.tagName.toLowerCase() + '#' + node.id) : null,
      statusHeight: status?.offsetHeight ?? null,
      barHeight: bar?.offsetHeight ?? null,
      regionKinds: [...new Set(window.liveAtlas.projection.scene.representations.map(item => item.atlas?.kind ?? 'none'))].sort(),
      guides: window.liveAtlas.projection.scene.representations.filter(item => item.isGuide || item.zIndex >= 10000).length,
      projectionKeys: Object.keys(window.liveAtlas.projection).sort(),
    };
  });
  check('only the exact native status and search rows are visible HTML control surfaces',
    JSON.stringify(htmlSurface.bodyChildren) === JSON.stringify(['atlas-world-screen'])
      && JSON.stringify(htmlSurface.screenChildren) === JSON.stringify(['atlas-world-status-bar', 'atlas-world-search-bar', 'atlas-world-change', 'atlas-world']) && htmlSurface.legendClosed
      && JSON.stringify(htmlSurface.statusChildren) === JSON.stringify(['span#atlas-world-status'])
      && JSON.stringify(htmlSurface.barChildren) === JSON.stringify(['input#atlas-world-search', 'select#atlas-world-search-results', 'span#atlas-world-search-count',
        'button#atlas-world-selection', 'button#atlas-world-step-back', 'button#atlas-world-step-forward', 'button#atlas-world-present', 'button#atlas-world-legend'])
      && htmlSurface.statusHeight === 24 && htmlSurface.barHeight === 36, htmlSurface);
  check('the SVG draws the three areas only: no HUD, panel, strip or band region',
    JSON.stringify(htmlSurface.regionKinds) === JSON.stringify(['area', 'entity']) && htmlSurface.guides === 0
      && !htmlSurface.projectionKeys.includes('detail'), htmlSurface);

  // ◀ 前へ holds a past frame; an update with the same input keeps the frame,
  // the qualified selection and the camera.
  await press('◀ 前へ');
  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' }));
  await page.evaluate(() => window.liveAtlas.zoomBy(1.35));
  const held = await page.evaluate(() => ({
    frameId: window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id,
    selected: window.liveAtlas.page.selected,
    camera: window.liveAtlas.adapter.camera(),
  }));
  await page.evaluate(() => window.liveAtlas.setSession({ input: structuredClone(window.liveAtlas.input), mode: 'sample', connected: false, latest: false }));
  const preserved = await page.evaluate(() => ({
    frameId: window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id,
    selected: window.liveAtlas.page.selected,
    camera: window.liveAtlas.adapter.camera(),
  }));
  check('update preserves historical frame', preserved.frameId === held.frameId, { held, preserved });
  check('update preserves qualified selection', preserved.selected === held.selected, { held, preserved });
  check('update preserves camera', JSON.stringify(preserved.camera) === JSON.stringify(held.camera), { held, preserved });
  check('the status row names the held frame', (await statusText()).includes('HELD · 表示中：過去'), await statusText());

  const admission = await page.evaluate(() => {
    const atlas = window.liveAtlas;
    const before = { input: atlas.input, projection: atlas.projection, now: atlas.page.now,
      mode: atlas.page.mode, connected: atlas.page.connected, latest: atlas.page.latest,
      frame: atlas.page.frameIndex, selected: atlas.page.selected, camera: atlas.adapter.camera() };
    const invalid = structuredClone(atlas.input);
    invalid.kind = 'invalid-world';
    let error = null;
    try { atlas.setSession({ input: invalid, mode: 'live', connected: true, latest: true, now: before.now + 1 }); }
    catch (caught) { error = String(caught.message); }
    const rejected = error?.includes('input.kind must be ui.atlasWorldInput.v1')
      && atlas.input === before.input && atlas.projection === before.projection
      && atlas.page.now === before.now && atlas.page.mode === before.mode
      && atlas.page.connected === before.connected && atlas.page.latest === before.latest
      && atlas.page.frameIndex === before.frame && atlas.page.selected === before.selected
      && JSON.stringify(atlas.adapter.camera()) === JSON.stringify(before.camera);
    const next = structuredClone(atlas.input);
    delete next.note;
    delete next.frames[0].relations[0].label;
    atlas.setSession({ input: next, now: before.now + 1 });
    const expected = structuredClone(before.input);
    expected.note = '';
    expected.frames[0].relations[0].label = '';
    const recovered = atlas.input !== before.input && JSON.stringify(atlas.input) === JSON.stringify(expected)
      && atlas.page.now === before.now + 1 && atlas.page.frameIndex === before.frame
      && atlas.page.selected === before.selected
      && JSON.stringify(atlas.adapter.camera()) === JSON.stringify(before.camera);
    const normalized = atlas.input;
    atlas.setSession({ connected: !before.connected });
    const reused = atlas.input === normalized;
    atlas.setSession({ input: before.input, connected: before.connected, now: before.now });
    return { error, rejected, recovered, reused };
  });
  check('invalid World payload leaves input, projection, session, selection and camera unchanged', admission.rejected, admission);
  check('following valid World payload normalizes optional text and preserves held frame/selection/camera', admission.recovered, admission);
  check('connection-only World update reuses the normalized input object', admission.reused, admission);
  // A refused payload is said on the status row, first, while the last
  // accepted input stays drawn; the next valid one clears it.
  const refusal = await page.evaluate(async () => {
    const atlas = window.liveAtlas;
    const invalid = structuredClone(atlas.input);
    invalid.kind = 'invalid-world';
    const accepted = atlas.setSession({ input: invalid, reportInvalid: true });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const text = document.getElementById('atlas-world-status').textContent;
    const kept = atlas.page.admission?.status === 'rejected';
    atlas.setSession({ input: structuredClone(atlas.input) });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { accepted, text, kept, after: document.getElementById('atlas-world-status').textContent, cleared: atlas.page.admission === null };
  });
  check('a refused payload is named first on the status row and cleared by the next valid one',
    refusal.accepted === false && refusal.kept && refusal.text.startsWith('入力を拒否・前に受け付けた入力を表示中') && refusal.cleared
      && !refusal.after.includes('入力を拒否'), refusal);

  const renderedNodeLabels = async () => page.evaluate(() => {
    const atlas = window.liveAtlas, adapter = atlas.adapter;
    // The graph viewport is in the container's coordinates; the text boxes are
    // in the page's, below the status and search rows. Compare them in one space.
    const origin = document.getElementById('atlas-world').getBoundingClientRect();
    const graph = atlas.projection.viewport.graph;
    const viewport = { x: graph.x + origin.left, y: graph.y + origin.top, width: graph.width, height: graph.height };
    const svg = document.querySelector('#atlas-world svg');
    // defs rectangles have no useful screen bbox. Map the actual clip rect
    // through the clipped owner's CTM, then test the real text box in that
    // coordinate space. Do not count textContent hidden by an ancestor clip.
    const clipsFor = node => {
      const textNodes = node?.matches?.('text') ? [node] : [...(node?.querySelectorAll?.('text') ?? [])];
      return textNodes.flatMap(text => {
        const textBox = text.getBoundingClientRect(), result = [];
        for (let owner = text; owner && owner !== svg?.parentElement; owner = owner.parentElement) {
          const reference = owner.getAttribute?.('clip-path');
          if (!reference || reference === 'none') continue;
          const id = reference.match(/#([^)'"]+)/u)?.[1];
          const clip = id ? document.getElementById(id) : null;
          const units = clip?.getAttribute('clipPathUnits') ?? 'userSpaceOnUse';
          const rect = clip?.children.length === 1 && clip.children[0].localName === 'rect' ? clip.children[0] : null;
          const entry = { reference, units, text: text.textContent, supported: false, inside: false };
          try {
            if (!rect || units !== 'userSpaceOnUse') throw new Error('unsupported or missing clip geometry');
            let matrix = owner.getScreenCTM();
            for (const element of [clip, rect]) {
              const transforms = element.transform?.baseVal;
              for (let index = 0; index < (transforms?.numberOfItems ?? 0); index += 1) {
                matrix = matrix.multiply(transforms.getItem(index).matrix);
              }
            }
            const inverse = matrix.inverse();
            const corners = [[textBox.left, textBox.top], [textBox.right, textBox.top],
              [textBox.right, textBox.bottom], [textBox.left, textBox.bottom]]
              .map(([x, y]) => new DOMPoint(x, y).matrixTransform(inverse));
            const x = rect.x.baseVal.value, y = rect.y.baseVal.value;
            const width = rect.width.baseVal.value, height = rect.height.baseVal.value;
            const tolerance = 1 / Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
            entry.rect = { x, y, width, height };
            entry.localTextCorners = corners.map(point => ({ x: point.x, y: point.y }));
            entry.supported = [x, y, width, height, tolerance, ...corners.flatMap(point => [point.x, point.y])].every(Number.isFinite)
              && width > 0 && height > 0;
            entry.inside = entry.supported && corners.every(point => point.x >= x - tolerance && point.y >= y - tolerance
              && point.x <= x + width + tolerance && point.y <= y + height + tolerance);
          } catch (error) { entry.error = error.message; }
          result.push(entry);
        }
        return result;
      });
    };
    return atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
      const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(item.regionId));
      const node = state?.text?.node, box = node?.getBoundingClientRect();
      const clips = clipsFor(node);
      const hasSvgText = Boolean(node && (node.matches('text') || node.querySelector('text')));
      return { key: item.regionId, expected: item.label, text: node?.textContent ?? '',
        box: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null,
        camera: adapter.camera(), graphViewport: viewport, bounds: item.bounds, fontSize: state?.style?.fontSize,
        clips, unclipped: clips.every(clip => clip.supported && clip.inside),
        visible: Boolean(hasSvgText && svg?.contains(node) && box && box.width > 0 && box.height >= 10 && box.left >= viewport.x - 1
          && box.right <= viewport.x + viewport.width + 1 && box.top >= viewport.y - 1
          && box.bottom <= viewport.y + viewport.height + 1) };
    });
  });

  // Real viewport changes must trigger the World mount's fit without manual Fit.
  await press('現在へ');
  for (const viewport of [{ width: 1200, height: 900 }, { width: 1500, height: 1000 }]) {
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const atlas = window.liveAtlas;
      const probe = window.__atlasResizeProbe = {
        input: atlas.input, selected: atlas.page.selected,
        frameId: atlas.input.frames[atlas.page.frameIndex].id,
        camera: atlas.adapter.camera(), events: 0,
      };
      window.addEventListener('resize', () => { probe.events += 1; }, { once: true });
    });
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => window.__atlasResizeProbe.events > 0);
    const resized = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const atlas = window.liveAtlas;
      const before = window.__atlasResizeProbe;
      const container = document.getElementById('atlas-world');
      const result = {
        events: before.events, width: container.clientWidth, height: container.clientHeight,
        screenHeight: document.getElementById('atlas-world-screen').clientHeight,
        barHeight: (document.getElementById('atlas-world-status-bar')?.offsetHeight ?? 0) + (document.getElementById('atlas-world-search-bar')?.offsetHeight ?? 0)
          + (document.getElementById('atlas-world-change')?.offsetHeight ?? 0),
        beforeCamera: before.camera, camera: atlas.adapter.camera(),
        inputReused: atlas.input === before.input,
        selected: atlas.page.selected, beforeSelected: before.selected,
        frameId: atlas.input.frames[atlas.page.frameIndex].id, beforeFrameId: before.frameId,
      };
      delete window.__atlasResizeProbe;
      return result;
    });
    const label = 'World resize ' + viewport.width + 'x' + viewport.height;
    check(label + ' refits camera after a real resize event',
      resized.events > 0 && resized.width === viewport.width && resized.screenHeight === viewport.height
        && resized.barHeight === 24 + 36 + 116 && resized.height === viewport.height - resized.barHeight
        && JSON.stringify(resized.camera) !== JSON.stringify(resized.beforeCamera), resized);
    check(label + ' retains normalized input, qualified selection and viewed frame',
      resized.inputReused && resized.selected === resized.beforeSelected && resized.frameId === resized.beforeFrameId, resized);
    const labels = await renderedNodeLabels();
    // The World is larger than the view at scale 1 and is panned, never
    // shrunk: every label drawn inside the view is whole and unclipped.
    const inView = labels.filter(item => item.visible);
    check(label + ' node labels drawn in the view are whole and unclipped',
      inView.length > 0 && inView.every(item => item.unclipped && item.text.replace(/\s/gu, '').includes(item.expected.replace(/\s/gu, ''))), labels);
  }

  // Transport: a live latest page that loses its connection says so on the
  // status row, downgrades current activity to UNKNOWN and keeps explicit
  // non-activity; a reconnect restores the declared activity.
  const activityOf = (space, id) => page.evaluate(([space, id]) => {
    const row = window.liveAtlas.projection.scene.representations.find(item => item.atlas?.ref?.space === space && item.atlas?.ref?.id === id);
    return row?.atlas ? { activity: row.atlas.activity, declared: row.atlas.declaredActivity } : null;
  }, [space, id]);
  await page.evaluate(() => window.liveAtlas.setSession({ mode: 'live', connected: false, latest: true }));
  const lost = { status: await statusText(), agent: await activityOf('agents', 'agent.1'), purpose: await activityOf('purpose', 'shared') };
  check('live latest disconnect is said first on the status row and downgrades current activity to UNKNOWN',
    lost.status.startsWith('SSE 未接続') && lost.agent?.activity === 'unknown' && lost.agent?.declared === 'now', lost);
  check('live latest disconnect keeps explicit non-activity NONE instead of inventing UNKNOWN',
    lost.purpose?.activity === 'none' && lost.purpose?.declared === 'none', lost);
  await page.evaluate(() => window.liveAtlas.setSession({ mode: 'live', connected: true, latest: true }));
  check('live reconnect restores the declared activity without inventing idle/completion', (await activityOf('agents', 'agent.1'))?.activity === 'now');
  await page.evaluate(() => window.liveAtlas.setSession({ mode: 'sample', connected: false, latest: true }));

  // The actual app entry receives a real finite SSE snapshot, then stays quiet.
  phase = 'live World navigation';
  producer = await startAtlasProducer({ connections: [[{ data: { ...rawWorldInput, note: 'world-live-update' } }]] });
  const liveContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const livePage = await liveContext.newPage();
  observeTransport(livePage, 'live World');
  livePage.on('pageerror', error => pageErrors.push(String(error)));
  await livePage.addInitScript(() => {
    const original = globalThis.setInterval;
    globalThis.__atlasTestIntervals = [];
    globalThis.setInterval = (callback, delay, ...args) => {
      globalThis.__atlasTestIntervals.push(delay);
      return original(callback, delay, ...args);
    };
  });
  const liveResponse = await livePage.goto(origin + '?events=' + encodeURIComponent(producer.url), { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (liveResponse?.status() !== 200) throw new Error('live World document HTTP ' + liveResponse?.status());
  phase = 'live World accepted snapshot';
  await livePage.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true'
    && window.liveAtlas?.input.note === 'world-live-update' && window.liveAtlas.page.connected);
  const quiet = await livePage.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const atlas = window.liveAtlas;
    const before = { input: atlas.input, projection: atlas.projection, scene: atlas.adapter.lastScene, now: atlas.page.now };
    await new Promise(resolve => setTimeout(resolve, 1100));
    return { intervals: globalThis.__atlasTestIntervals, sameInput: atlas.input === before.input,
      sameProjection: atlas.projection === before.projection, sameScene: atlas.adapter.lastScene === before.scene,
      sameNow: atlas.page.now === before.now, connected: atlas.page.connected };
  });
  check('live World registers no autonomous one-second timer', !quiet.intervals.includes(1000), quiet);
  check('quiet live World does not redraw or invent a new observation time', quiet.sameInput && quiet.sameProjection && quiet.sameScene && quiet.sameNow && quiet.connected, quiet);
  await liveContext.close();

  // A gate-local finite simulator on the existing HTTP server advances only
  // after each actual UI observation. It creates no source authority or daemon.
  phase = 'prepared SSE navigation';
  const streamContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const streamPage = await streamContext.newPage();
  observeTransport(streamPage, 'prepared SSE');
  streamPage.on('pageerror', error => pageErrors.push(String(error)));
  const streamResponse = await streamPage.goto(origin + '?events=' + encodeURIComponent(origin + 'prepared-events'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (streamResponse?.status() !== 200) throw new Error('prepared SSE document HTTP ' + streamResponse?.status());
  phase = 'prepared SSE initial connection';
  await streamPage.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true' && window.liveAtlas?.page.connected);
  phase = 'prepared SSE accepted input and hold';
  emitPrepared({ ...rawWorldInput, note: 'stream-accepted-1' });
  await streamPage.waitForFunction(() => window.liveAtlas.input.note === 'stream-accepted-1');
  await press('◀ 前へ', streamPage);
  await streamPage.evaluate(() => {
    const atlas = window.liveAtlas;
    atlas.selectRef({ space: 'projects', kind: 'project', id: 'project.b' }); atlas.zoomBy(1.1);
    window.__streamHeld = { pair: atlas.page.pair, input: atlas.input, selected: atlas.page.selected, camera: atlas.adapter.camera() };
  });
  const streamNext = structuredClone(rawWorldInput);
  const extra = structuredClone(streamNext.frames.at(-1)); extra.id = 'stream-new-after'; extra.rev += 1;
  extra.entities.find(item => item.ref.id === 'project.b').order = 77;
  streamNext.frames.push(extra); streamNext.note = 'stream-accepted-2';
  emitPrepared(streamNext);
  await streamPage.waitForFunction(() => window.liveAtlas.input.note === 'stream-accepted-2');
  check('real SSE append keeps the held frame, said on the status row',
    await streamPage.evaluate(() => window.liveAtlas.page.pair === window.__streamHeld.pair && !window.liveAtlas.page.latest)
      && (await statusText(streamPage)).includes('HELD · 表示中：過去'), await statusText(streamPage));
  for (const invalid of ['{invalid JSON', { kind: 'invalid-world' }]) {
    const name = typeof invalid === 'string' ? 'malformed JSON' : 'invalid kind';
    phase = 'prepared SSE ' + name;
    await streamPage.evaluate(() => { window.__streamAccepted = window.liveAtlas.input; });
    emitPrepared(invalid);
    await streamPage.waitForFunction(() => window.liveAtlas.page.admission?.status === 'rejected');
    const kept = await streamPage.evaluate(() => {
      const atlas = window.liveAtlas, previous = window.__streamHeld;
      return atlas.input === window.__streamAccepted && atlas.page.pair === previous.pair
        && atlas.page.selected === previous.selected && JSON.stringify(atlas.adapter.camera()) === JSON.stringify(previous.camera);
    });
    const refused = await statusText(streamPage);
    check('real SSE ' + name + ' is refused on the status row while retaining last accepted/pair/selection/camera',
      kept && refused.startsWith('入力を拒否・前に受け付けた入力を表示中'), refused);
    phase = 'prepared SSE valid recovery';
    emitPrepared({ ...streamNext, note: 'stream-recovered-' + (typeof invalid === 'string' ? 'json' : 'kind') });
    await streamPage.waitForFunction(() => !window.liveAtlas.page.admission);
    check('next valid SSE clears the refusal without releasing the held frame',
      !(await statusText(streamPage)).includes('入力を拒否')
        && await streamPage.evaluate(() => !window.liveAtlas.page.latest && window.liveAtlas.page.pair === window.__streamHeld.pair));
  }
  phase = 'prepared SSE explicit Latest';
  await press('現在へ', streamPage);
  await streamPage.waitForFunction(() => window.liveAtlas.page.latest && window.liveAtlas.page.pair.after.id === 'stream-new-after');
  check('actual 現在へ resumes the received SSE data', (await statusText(streamPage)).includes('表示中：現在') , await statusText(streamPage));
  await streamPage.evaluate(() => { window.__disconnectInput = window.liveAtlas.input; });
  phase = 'prepared SSE network interruption';
  simAvailable = false;
  recordTransport('prepared unavailable', { clients: simClients.size });
  for (const client of [...simClients]) client.destroy();
  await streamPage.waitForFunction(() => !window.liveAtlas.page.connected);
  phase = 'prepared SSE disconnected inspection';
  check('real disconnected SSE is said first on the status row while retaining the last supplied input',
    (await statusText(streamPage)).startsWith('SSE 未接続') && await streamPage.evaluate(() => window.liveAtlas.input === window.__disconnectInput),
    await statusText(streamPage));
  phase = 'prepared SSE reconnection';
  simAvailable = true;
  recordTransport('prepared available', { clients: simClients.size });
  await streamPage.waitForFunction(() => window.liveAtlas.page.connected);
  check('real transport reconnect preserves accepted source and pair without restamping observations',
    await streamPage.evaluate(() => window.liveAtlas.input === window.__disconnectInput && window.liveAtlas.page.pair.after.id === 'stream-new-after'));
  await streamContext.close();

  // Exercise the existing mount return value; do not add tick to the app API.
  phase = 'explicit World tick';
  observedPage = page;
  const explicitTick = await page.evaluate(async input => {
    window.liveAtlas.destroy();
    const { mountAtlasWorldUI } = await import('ui:packages/control/atlas-ui.mjs');
    const ui = mountAtlasWorldUI({ root: document.body, input, now: 1000 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = { projection: ui.projection, scene: ui.adapter.lastScene, input: ui.input };
    ui.tick(2000);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = { now: ui.page.now, sameProjection: ui.projection === before.projection,
      sameScene: ui.adapter.lastScene === before.scene, sameInput: ui.input === before.input };
    ui.destroy();
    ui.tick(3000);
    result.destroyedTickIgnored = ui.page.now === 2000;
    return result;
  }, rawWorldInput);
  check('explicit World mount tick records time without rendering or replacing input', explicitTick.now === 2000 && explicitTick.sameProjection && explicitTick.sameScene && explicitTick.sameInput, explicitTick);
  check('destroyed World mount ignores a later tick', explicitTick.destroyedTickIgnored, explicitTick);

  check('no browser page/console errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors });
  completed = true;
} catch (error) {
  interruption = { phase, afterCheck: lastCheck, name: error.name, message: error.message, stack: error.stack,
    url: observedPage?.url() ?? null, page: null };
  // A diagnostic read cannot turn an interrupted run into a completed run.
  // Bound only this read so a stalled page cannot hide the original failure.
  let diagnosticTimer;
  try {
    interruption.page = await Promise.race([
      observedPage?.evaluate(() => {
        const atlas = window.liveAtlas;
        return { documentState: document.readyState, ready: document.documentElement.dataset.liveAtlasReady ?? null,
          kind: atlas?.page?.kind ?? null, connected: atlas?.page?.connected ?? null,
          selected: atlas?.page?.selected ?? null, latest: atlas?.page?.latest ?? null,
          note: atlas?.input?.note ?? null, admission: atlas?.page?.admission ?? null,
          before: atlas?.page?.pair?.before?.id ?? null, after: atlas?.page?.pair?.after?.id ?? null };
      }) ?? Promise.resolve(null),
      new Promise(resolve => { diagnosticTimer = setTimeout(() => resolve({ unavailable: 'diagnostic read timeout' }), 1000); }),
    ]);
  } catch (error) {
    interruption.page = { unavailable: String(error) };
  } finally {
    clearTimeout(diagnosticTimer);
  }
  console.error(error.stack ?? String(error));
} finally {
  for (const [name, close] of [
    ['browser', () => browser?.close()],
    ['producer', () => producer?.close()],
    ['server', () => new Promise(resolve => {
      for (const client of simClients) client.destroy();
      server.close(resolve);
      server.closeAllConnections?.();
    })],
    ['temporary files', () => done()],
  ]) {
    try { await close(); } catch (error) { cleanupErrors.push({ name, error: String(error) }); }
  }
}

const result = {
  schema: 'atlas-a2-ui-composition-gate/1',
  status: completed && !failed.length && !cleanupErrors.length ? 'PASS' : 'FAIL',
  completed,
  input: receipt.input,
  entry: 'packages/control/atlas.mjs',
  checks,
  failed,
  interruption,
  cleanupErrors,
  diagnostics: { pageErrors, consoleErrors, transport },
};
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
