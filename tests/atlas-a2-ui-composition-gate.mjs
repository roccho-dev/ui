// a2 combined UI acceptance gate.
// Builds the same public Atlas app artifact, opens it in Chromium, and proves
// three-area composition + SVG judgement without a test-only renderer.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';

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

const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'atlas-a2-ui-'));
const output = path.join(tempRoot, 'dist');
const receipt = await buildLiveAtlas({
  input: 'examples/atlas/input/a2-world.json',
  out: path.relative(process.cwd(), output),
  consumer: 'app',
});

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);
const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
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
const check = (name, condition, detail = null) => {
  checks += 1;
  if (!condition) failed.push({ name, detail });
};

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
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
      .map(item => ({ ref: item.atlas.ref, area: item.atlas.area, regionId: item.regionId }));
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

  const aggregate = world.relations.find(item => {
    const ids = item.refs.map(ref => ref.id);
    return ids.includes('assign.a2.wx.w') && ids.includes('assign.a2.wx.r');
  });
  check('same endpoint participation relations aggregate without identity loss',
    Boolean(aggregate) && aggregate.ids.length === 2, aggregate);

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

  const clickRelation = async relationId => {
    const point = await page.evaluate(id => {
      const adapter = window.liveAtlas.adapter;
      const edge = adapter.edgeByRelationId.get(id);
      const state = edge ? adapter.graph.getView().getState(edge) : null;
      const points = (state?.absolutePoints ?? []).filter(Boolean);
      if (points.length < 2) return null;
      const first = points[0], last = points.at(-1);
      const box = document.getElementById('atlas-world').getBoundingClientRect();
      return { x: box.left + (first.x + last.x) / 2, y: box.top + (first.y + last.y) / 2 };
    }, relationId);
    if (!point) throw new Error('missing relation edge ' + relationId);
    await page.mouse.click(point.x, point.y);
  };

  const agentOneRegion = world.entities.find(item => item.ref.space === 'agents' && item.ref.id === 'agent.1')?.regionId;
  await clickCell(agentOneRegion);
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'agent.1');
  const agentJudgement = await page.evaluate(() => window.liveAtlas.projection.scene.representations
    .find(item => item.atlas?.kind === 'judgement')?.label ?? '');
  check('SVG judgement shows explicit Purpose direction',
    /Direction: Agent 1 → Work X → Fill X → Gap A → Ideal A → Purpose A/u.test(agentJudgement), agentJudgement);
  check('SVG judgement separates activity/source/time/transport',
    /Activity: NOW/u.test(agentJudgement)
      && /transport=SAMPLE/u.test(agentJudgement)
      && /fixture:runtime@1/u.test(agentJudgement)
      && /effective=unknown/u.test(agentJudgement), agentJudgement);

  await clickRelation(aggregate.ids[0]);
  await page.waitForFunction(() => window.liveAtlas.projection.aggregateRelationIds.length === 2);
  check('aggregate click exposes all member relation ids',
    (await page.evaluate(() => window.liveAtlas.projection.aggregateRelationIds.length)) === 2);

  const selectedBeforeCycle = await page.evaluate(() => window.liveAtlas.projection.selected.record?.ref?.id ?? null);
  await clickCell('world:aggregate-cycle');
  await page.waitForFunction(previous => window.liveAtlas.projection.selected.record?.ref?.id !== previous, selectedBeforeCycle);
  const aggregateDetail = await page.evaluate(() => ({
    selected: window.liveAtlas.projection.selected.record?.ref?.id ?? null,
    label: window.liveAtlas.projection.scene.representations.find(item => item.atlas?.kind === 'judgement')?.label ?? '',
  }));
  check('aggregate member can be selected inside SVG', ['assign.a2.wx.w', 'assign.a2.wx.r'].includes(aggregateDetail.selected), aggregateDetail);
  check('aggregate member detail recovers p/r/w context and provenance',
    /context mode=[wr]/u.test(aggregateDetail.label) && /fixture:assignment@1/u.test(aggregateDetail.label), aggregateDetail.label);

  await clickCell('world:omitted-cycle');
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'agent2.projecta.hidden');
  const omittedDetail = await page.evaluate(() => window.liveAtlas.projection.scene.representations
    .find(item => item.atlas?.kind === 'judgement')?.label ?? '');
  check('omitted relation remains recoverable from SVG coverage control',
    /agent2.projecta.hidden/u.test(omittedDetail) && /omitted relations 1/u.test(omittedDetail), omittedDetail);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'project-participation', id: 'work.x.project.a' }));
  const contextDiff = await page.evaluate(() => window.liveAtlas.projection.scene.representations
    .find(item => item.atlas?.kind === 'judgement')?.label ?? '');
  check('before/after diff includes context-only source meaning change', /Diff: changed .*context/u.test(contextDiff), contextDiff);

  await page.click('#atlas-world-before');
  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'reviews', id: 'agent3.agent2.review' }));
  await page.click('#atlas-world-after');
  const missing = await page.evaluate(() => ({
    selected: window.liveAtlas.page.selected,
    frame: window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id,
    label: window.liveAtlas.projection.scene.representations.find(item => item.atlas?.kind === 'judgement')?.label ?? '',
  }));
  check('removed relation selection survives and shows counterpart instead of completion',
    missing.frame === 'after' && /missing in after · counterpart exists in before/u.test(missing.label), missing);

  check('routine judgement has no legacy visible Inspector/audit/catalog dependency',
    await page.locator('#atlas-detail,#atlas-inspector,#atlas-audit,#atlas-search').count() === 0);

  await page.click('#atlas-world-before');
  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' }));
  await page.evaluate(() => window.liveAtlas.zoomBy(1.35));
  const held = await page.evaluate(() => ({
    frameId: window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id,
    selected: window.liveAtlas.page.selected,
    camera: window.liveAtlas.adapter.camera(),
    input: window.liveAtlas.input,
  }));
  await page.evaluate(() => window.liveAtlas.setSession({
    input: window.liveAtlas.input,
    mode: 'sample',
    connected: false,
    latest: false,
  }));
  const preserved = await page.evaluate(() => ({
    frameId: window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id,
    selected: window.liveAtlas.page.selected,
    camera: window.liveAtlas.adapter.camera(),
  }));
  check('update preserves historical frame', preserved.frameId === held.frameId, { held, preserved });
  check('update preserves qualified selection', preserved.selected === held.selected, { held, preserved });
  check('update preserves camera', JSON.stringify(preserved.camera) === JSON.stringify(held.camera), { held, preserved });

  const cameraBeforeFocus = await page.evaluate(() => window.liveAtlas.adapter.camera());
  await page.click('#atlas-world-focus');
  const cameraAfterFocus = await page.evaluate(() => window.liveAtlas.adapter.camera());
  check('focus control is functional', JSON.stringify(cameraBeforeFocus) !== JSON.stringify(cameraAfterFocus));

  check('no browser page/console errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors });
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

const result = {
  schema: 'atlas-a2-ui-composition-gate/1',
  status: failed.length ? 'FAIL' : 'PASS',
  input: receipt.input,
  entry: 'packages/control/atlas.mjs',
  checks,
  failed,
};
console.log(JSON.stringify(result));
if (failed.length) process.exitCode = 1;
