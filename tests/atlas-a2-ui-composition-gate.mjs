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
import { startAtlasProducer } from './fixtures/live-atlas/sse-producer.mjs';
import { containmentIndex, entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';

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

  await clickBoundaryHeader(company.regionId);
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'shared');
  check('nested parent boundary is actual-click selectable',
    await page.evaluate(() => window.liveAtlas.projection.selected.record?.ref?.id) === 'shared');
  await clickBoundaryHeader(purposeA.regionId);
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'purpose.a');
  check('nested intermediate boundary is actual-click selectable',
    await page.evaluate(() => window.liveAtlas.projection.selected.record?.ref?.id) === 'purpose.a');
  await clickCell(idealA.regionId);
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'ideal.a');
  check('nested leaf is actual-click selectable',
    await page.evaluate(() => window.liveAtlas.projection.selected.record?.ref?.id) === 'ideal.a');

  const aggregate = world.relations.find(item => {
    const ids = item.refs.map(ref => ref.id);
    return ids.includes('assign.a2.wx.w') && ids.includes('assign.a2.wx.r');
  });
  check('same endpoint participation relations aggregate without identity loss',
    Boolean(aggregate) && aggregate.ids.length === 2, aggregate);



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

  // Walk the actual SVG page controls. Every physical row must retain the old
  // positive bbox/viewport oracle. Decode only the JSON string actually drawn
  // in each row; expected labels/input/offsets never fill a missing character.
  // No Fit, API page mutation or source-only text proof.
  const renderedJudgement = async ({ tab = 'record', targetPage = page } = {}) => {
    const saved = await targetPage.evaluate(() => ({ tab: window.liveAtlas.projection.detail.tab, page: window.liveAtlas.projection.detail.page }));
    await clickCell('world:detail:' + tab, targetPage);
    let current = await targetPage.evaluate(() => window.liveAtlas.projection.detail.page);
    while (current-- > 0) await clickCell('world:detail:previous', targetPage);
    const total = await targetPage.evaluate(() => window.liveAtlas.projection.detail.pageCount);
    const logicalCount = await targetPage.evaluate(() => window.liveAtlas.projection.detail.logicalLines.length);
    const rows = [];
    let complete = true;
    for (let number = 0; number < total; number += 1) {
      const result = await targetPage.evaluate(() => {
        const atlas = window.liveAtlas, adapter = atlas.adapter;
        const svg = document.querySelector('#atlas-world svg');
        const viewport = document.getElementById('atlas-world').getBoundingClientRect();
        const rows = atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'judgement-line').map(item => {
          const cell = adapter.cellsByRegionId.get(item.regionId);
          const state = cell ? adapter.graph.getView().getState(cell) : null;
          const node = state?.text?.node ?? null;
          const box = node?.getBoundingClientRect?.() ?? null;
          const style = node ? getComputedStyle(node) : null;
          const insideViewport = Boolean(box && box.left >= viewport.left - 1 && box.top >= viewport.top - 1
            && box.right <= viewport.right + 1 && box.bottom <= viewport.bottom + 1);
          return { id: item.regionId, lineIndex: item.atlas.lineIndex, offset: item.atlas.offset,
            expected: item.label, text: node?.textContent ?? '',
            box: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null,
            visible: Boolean(node && svg?.contains(node) && box && box.width > 0 && box.height >= 10
              && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) !== 0 && insideViewport) };
        });
        return { rows, page: atlas.projection.detail.page, total: atlas.projection.detail.pageCount,
          logicalCount: atlas.projection.detail.logicalLines.length };
      });
      complete &&= result.page === number && result.total === total && result.logicalCount === logicalCount;
      rows.push(...result.rows);
      if (number + 1 < total) await clickCell('world:detail:next', targetPage);
    }
    const lines = new Map();
    for (const row of rows) {
      try {
        const decoded = JSON.parse(row.text);
        if (typeof decoded !== 'string') throw new Error('displayed row must be a JSON string');
        row.decoded = decoded;
        const preceding = lines.get(row.lineIndex) ?? '';
        complete &&= row.offset === Array.from(preceding).length;
        lines.set(row.lineIndex, preceding + decoded);
      } catch (error) { row.decodeError = error.message; complete = false; }
    }
    const text = [...lines.values()].join('\n');
    complete &&= lines.size === logicalCount && [...lines.keys()].every((key, index) => key === index);
    const expected = await targetPage.evaluate(() => window.liveAtlas.projection.detail.logicalLines.join('\n'));
    await clickCell('world:detail:' + saved.tab, targetPage);
    let restored = await targetPage.evaluate(() => window.liveAtlas.projection.detail.page);
    while (restored > saved.page) { await clickCell('world:detail:previous', targetPage); restored -= 1; }
    while (restored < saved.page) { await clickCell('world:detail:next', targetPage); restored += 1; }
    return { rows, text, totalPages: total, complete: complete && text === expected,
      visible: complete && rows.length >= 10 && rows.every(row => row.visible && row.text.length > 0 && row.text === row.expected) && text === expected };
  };

  const renderedControls = async () => page.evaluate(() => {
    const adapter = window.liveAtlas.adapter;
    const viewport = document.getElementById('atlas-world').getBoundingClientRect();
    return ['before','after','latest','fit','focus','select','hand'].map(id => {
      const cell = adapter.cellsByRegionId.get('world:control:' + id);
      const state = cell ? adapter.graph.getView().getState(cell) : null;
      const node = state?.text?.node ?? null;
      const box = node?.getBoundingClientRect?.() ?? null;
      return { id, visible: Boolean(box && box.left >= viewport.left - 1 && box.right <= viewport.right + 1
        && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1) };
    });
  });

  const agentOneRegion = world.entities.find(item => item.ref.space === 'agents' && item.ref.id === 'agent.1')?.regionId;
  await clickCell(agentOneRegion);
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'agent.1');
  const agentJudgement = await renderedJudgement();
  check('SVG judgement is actually rendered and visible', agentJudgement.visible, agentJudgement);
  check('SVG judgement shows explicit topmost Purpose direction',
    /Direction: Agent 1 → Work X → Fill X → Gap A/u.test(agentJudgement.text)
      && /Direction cont\.: Ideal A → Purpose A → Company purpose/u.test(agentJudgement.text), agentJudgement);
  check('SVG judgement separates activity/source/time/transport',
    /Activity: NOW/u.test(agentJudgement.text)
      && /transport=SAMPLE/u.test(agentJudgement.text)
      && /fixture:runtime@1/u.test(agentJudgement.text)
      && /effective=unknown/u.test(agentJudgement.text), agentJudgement);

  await clickRelation(aggregate.ids[0]);
  await page.waitForFunction(() => window.liveAtlas.projection.aggregateRelationIds.length === 2);
  check('aggregate click exposes all member relation ids',
    (await page.evaluate(() => window.liveAtlas.projection.aggregateRelationIds.length)) === 2);

  const selectedBeforeCycle = await page.evaluate(() => window.liveAtlas.projection.selected.record?.ref?.id ?? null);
  await clickCell('world:aggregate-cycle');
  await page.waitForFunction(previous => window.liveAtlas.projection.selected.record?.ref?.id !== previous, selectedBeforeCycle);
  const aggregateRendered = await renderedJudgement();
  const aggregateDetail = {
    selected: await page.evaluate(() => window.liveAtlas.projection.selected.record?.ref?.id ?? null),
    rendered: aggregateRendered,
  };
  check('aggregate member can be selected inside SVG', ['assign.a2.wx.w', 'assign.a2.wx.r'].includes(aggregateDetail.selected), aggregateDetail);
  check('aggregate member detail recovers p/r/w context and provenance',
    aggregateRendered.visible
      && /Context: mode=[wr] · workRef=work\.x/u.test(aggregateRendered.text)
      && /Source: fixture:assignment@1 \[synthetic\]/u.test(aggregateRendered.text),
    aggregateDetail);

  const cycleOmittedMembers = async ({ controlRegionId, idsProperty }) => {
    const expected = await page.evaluate(property => [...window.liveAtlas.projection[property]], idsProperty);
    const reached = new Set();
    const details = new Map();
    for (let step = 0; step < expected.length; step += 1) {
      const previous = await page.evaluate(() => window.liveAtlas.page.selected);
      await clickCell(controlRegionId);
      await page.waitForFunction(before => window.liveAtlas.page.selected !== before, previous);
      const selectedKey = await page.evaluate(() => window.liveAtlas.page.selected);
      reached.add(selectedKey);
      details.set(selectedKey, await renderedJudgement());
    }
    return { expected, reached: [...reached], details };
  };

  const omittedRelationCycle = await cycleOmittedMembers({
    controlRegionId: 'world:omitted-cycle',
    idsProperty: 'omittedRelationIds',
  });
  check('omitted relation SVG cycle reaches every omitted relation identity',
    omittedRelationCycle.expected.length > 0
      && omittedRelationCycle.reached.length === omittedRelationCycle.expected.length
      && omittedRelationCycle.expected.every(id => omittedRelationCycle.reached.includes(id)),
    { expected: omittedRelationCycle.expected, reached: omittedRelationCycle.reached });

  const oldOmittedRelationKey = omittedRelationCycle.expected.find(id => id.includes('agent2.projecta.hidden'));
  const omittedDetail = oldOmittedRelationKey ? omittedRelationCycle.details.get(oldOmittedRelationKey) : null;
  check('old omitted relation identity and provenance remain recoverable',
    Boolean(oldOmittedRelationKey)
      && omittedDetail?.visible
      && /agent2\.projecta\.hidden/u.test(omittedDetail.text)
      && /Context: mode=observer/u.test(omittedDetail.text)
      && /Source: fixture:assignment@1 \[synthetic\]/u.test(omittedDetail.text)
      && /omitted relations 2/u.test(omittedDetail.text),
    { key: oldOmittedRelationKey, detail: omittedDetail });

  const omittedEntityCycle = await cycleOmittedMembers({
    controlRegionId: 'world:omitted-entity-cycle',
    idsProperty: 'omittedEntityIds',
  });
  check('omitted entity SVG cycle reaches every omitted entity identity',
    omittedEntityCycle.expected.length > 0
      && omittedEntityCycle.reached.length === omittedEntityCycle.expected.length
      && omittedEntityCycle.expected.every(id => omittedEntityCycle.reached.includes(id)),
    { expected: omittedEntityCycle.expected, reached: omittedEntityCycle.reached });

  const oldOmittedEntityKey = omittedEntityCycle.expected.find(id => id.includes('agent.hidden'));
  const omittedEntityDetail = oldOmittedEntityKey ? omittedEntityCycle.details.get(oldOmittedEntityKey) : null;
  check('old omitted entity identity and provenance remain recoverable',
    Boolean(oldOmittedEntityKey)
      && omittedEntityDetail?.visible
      && /agent\.hidden/u.test(omittedEntityDetail.text)
      && /Source: fixture:runtime@1 \[synthetic\]/u.test(omittedEntityDetail.text)
      && /source-time-unknown/u.test(omittedEntityDetail.text),
    { key: oldOmittedEntityKey, detail: omittedEntityDetail });

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'project-participation', id: 'work.x.project.a' }));
  const contextDiff = await renderedJudgement();
  check('before/after diff includes context-only supplied fact change',
    contextDiff.visible && /Diff: changed .*context/u.test(contextDiff.text), contextDiff);

  await clickBoundaryHeader(projectB.regionId);
  const presentationOnlyDiff = await renderedJudgement();
  check('prepared-order-only: supplied order change is visible without claiming owner meaning',
    presentationOnlyDiff.visible && /Diff: changed order/u.test(presentationOnlyDiff.text)
      && /Field order .*Before=1 → After=4/u.test(presentationOnlyDiff.text)
      && /owner comparison NOT SUPPLIED/u.test(presentationOnlyDiff.text), presentationOnlyDiff);

  await clickCell('world:control:before');
  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'project-participation', id: 'agent2.projecta.hidden' }));
  await clickCell('world:control:after');
  const visibilityOnlyDiff = await renderedJudgement();
  check('prepared-visible-only: supplied visibility change is visible without claiming owner meaning',
    visibilityOnlyDiff.visible && /Diff: changed visible/u.test(visibilityOnlyDiff.text)
      && /Field visible .*Before=true → After=false/u.test(visibilityOnlyDiff.text)
      && /owner comparison NOT SUPPLIED/u.test(visibilityOnlyDiff.text), visibilityOnlyDiff);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'serves', id: 'agent1.purposea' }));
  const timeOnlyDiff = await renderedJudgement();
  check('time-only supplied evidence change remains distinguishable',
    timeOnlyDiff.visible && /Diff: changed time/u.test(timeOnlyDiff.text), timeOnlyDiff);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'project-participation', id: 'work.y.project.b' }));
  const containmentRelationDiff = await renderedJudgement();
  check('selected relation containment declaration change is inspectable in existing Diff',
    containmentRelationDiff.visible && /Diff: changed .*containment/u.test(containmentRelationDiff.text), containmentRelationDiff);

  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'projects', kind: 'work', id: 'work.y' }));
  const containmentEntityDiff = await renderedJudgement();
  check('selected entity derived-parent change is inspectable in existing Diff',
    containmentEntityDiff.visible && /Diff: changed containment/u.test(containmentEntityDiff.text), containmentEntityDiff);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'contains', id: 'team.agent1.containment.1' }));
  const containmentEvidence = await renderedJudgement();
  check('containment relation provenance and time remain inspectable',
    containmentEvidence.visible
      && /Source: fixture:containment@1 \[synthetic\]/u.test(containmentEvidence.text)
      && /observed=2026-10-07T06:00:00Z/u.test(containmentEvidence.text),
    containmentEvidence);

  await clickCell('world:control:before');
  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'reviews', id: 'agent3.agent2.review' }));
  await clickCell('world:control:after');
  const missingRendered = await renderedJudgement();
  const missing = {
    selected: await page.evaluate(() => window.liveAtlas.page.selected),
    frame: await page.evaluate(() => window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id),
    rendered: missingRendered,
  };
  check('removed relation selection survives and shows counterpart instead of completion',
    missing.frame === 'after' && missingRendered.visible && /missing in after · counterpart exists in before/u.test(missingRendered.text)
      && /After: after .*record missing · reason\/time UNKNOWN/u.test(missingRendered.text)
      && /Context: workRef=work.x/u.test(missingRendered.text)
      && /Evidence side: Before .*counterpart only; current record missing/u.test(missingRendered.text)
      && /Endpoints: from=entity:agents:agent:shared · to=entity:agents:agent:agent.2/u.test(missingRendered.text), missing);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'absent', kind: 'reviews', id: 'agent3.agent2.review' }));
  const absentBoth = await renderedJudgement();
  check('both missing qualified relation never borrows the removed relation context',
    absentBoth.visible && /not present in either compared frame/u.test(absentBoth.text)
      && /Context: none/u.test(absentBoth.text) && /Full record: null/u.test(absentBoth.text), absentBoth);

  // prepared-three-frame-endpoints: both buttons retain the same compared pair.
  await page.evaluate(() => {
    const atlas = window.liveAtlas;
    const input = structuredClone(atlas.input);
    const before = structuredClone(input.frames[0]);
    before.id = 'prepared-before';
    const middle = structuredClone(before);
    middle.id = 'prepared-middle';
    middle.rev += 1;
    middle.entities.find(item => item.ref.id === 'project.b').order = 20;
    const after = structuredClone(before);
    after.id = 'prepared-after';
    after.rev += 2;
    after.entities.find(item => item.ref.id === 'project.b').order = 7;
    after.relations.find(item => item.ref.id === 'agent1.purposea').path = true;
    input.frames = [before, middle, after];
    atlas.setSession({ input, mode: 'sample', connected: false, latest: true });
    atlas.fit();
  });
  await clickBoundaryHeader(projectB.regionId);
  for (const side of ['before', 'after']) {
    await clickCell('world:control:' + side);
    const rendered = await renderedJudgement();
    const pair = await page.evaluate(() => {
      const atlas = window.liveAtlas, comparison = atlas.projection.selected.comparison;
      return {
        viewing: atlas.input.frames[atlas.page.frameIndex].id,
        selected: atlas.page.selected,
        before: comparison.before.frameId, after: comparison.after.frameId,
      };
    });
    check('prepared-three-frame-endpoints: actual ' + side + ' click keeps the named pair and supplied values',
      pair.viewing === 'prepared-' + side && pair.selected === entityKey(projectB.ref)
        && pair.before === 'prepared-before' && pair.after === 'prepared-after'
        && rendered.visible && /Field order .*Before=1 → After=7/u.test(rendered.text)
        && /Before: prepared-before/u.test(rendered.text) && /After: prepared-after/u.test(rendered.text)
        && /owner comparison NOT SUPPLIED/u.test(rendered.text),
      { pair, rendered });
  }
  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'serves', id: 'agent1.purposea' }));
  const pathOnlyDiff = await renderedJudgement();
  check('prepared-path-only: supplied path flag change is visible without a business meaning claim',
    pathOnlyDiff.visible && /Diff: changed path/u.test(pathOnlyDiff.text)
      && /Field path .*Before=false → After=true/u.test(pathOnlyDiff.text)
      && /owner comparison NOT SUPPLIED/u.test(pathOnlyDiff.text), pathOnlyDiff);
  // Freeze both contents by an actual Before click, then mutate incoming data
  // in three independent ways. Displayed receipts must remain the old pair.
  await clickBoundaryHeader(projectB.regionId);
  await clickCell('world:control:before');
  await page.evaluate(() => {
    const atlas = window.liveAtlas;
    atlas.zoomBy(1.2);
    window.__worldHeld = { pair: atlas.page.pair, contents: JSON.stringify(atlas.page.pair),
      selected: atlas.page.selected, camera: atlas.adapter.camera() };
  });
  for (const mutation of ['append', 'same-id-content', 'held-endpoint-absent']) {
    const result = await page.evaluate(kind => {
      const atlas = window.liveAtlas, previous = window.__worldHeld;
      const input = structuredClone(atlas.input);
      if (kind === 'append') {
        const next = structuredClone(input.frames.at(-1)); next.id = 'prepared-rev4'; next.rev += 1;
        next.entities.find(item => item.ref.id === 'project.b').order = 99;
        input.frames.push(next);
      } else if (kind === 'same-id-content') {
        for (const frame of input.frames) frame.entities.find(item => item.ref.id === 'project.b').order = 123;
      } else input.frames = [input.frames.at(-1)];
      atlas.setSession({ input, latest: false });
      return { samePair: atlas.page.pair === previous.pair && JSON.stringify(atlas.page.pair) === previous.contents,
        selected: atlas.page.selected === previous.selected,
        camera: JSON.stringify(atlas.adapter.camera()) === JSON.stringify(previous.camera),
        before: atlas.page.pair.before.id, after: atlas.page.pair.after.id,
        received: atlas.input.frames.map(frame => frame.id), held: !atlas.page.latest };
    }, mutation);
    const rendered = await renderedJudgement();
    check('held pair survives ' + mutation + ' without silently changing either endpoint content',
      result.samePair && result.selected && result.camera && result.held
        && result.before === 'prepared-before' && result.after === 'prepared-after'
        && rendered.visible && /Field order .*Before=1 → After=7/u.test(rendered.text), { result, rendered });
  }
  await clickCell('world:control:after');
  const heldAfter = await renderedJudgement();
  check('After is the held After even when no held endpoint is in the latest payload',
    heldAfter.visible && /Frame prepared-after/u.test(heldAfter.text) && /Field order .*Before=1 → After=7/u.test(heldAfter.text), heldAfter);
  await clickCell('world:control:latest');
  const followed = await page.evaluate(() => ({ following: window.liveAtlas.page.latest,
    after: window.liveAtlas.page.pair.after.id, before: window.liveAtlas.page.pair.before,
    order: window.liveAtlas.projection.selected.record.order, selected: window.liveAtlas.page.selected,
    camera: window.liveAtlas.adapter.camera(), previous: window.__worldHeld }));
  check('explicit Latest adopts received contents and retains selection/camera',
    followed.following && followed.after === 'prepared-rev4' && followed.before === null && followed.order === 123
      && followed.selected === followed.previous.selected
      && JSON.stringify(followed.camera) === JSON.stringify(followed.previous.camera),
    { following: followed.following, after: followed.after, order: followed.order });
  await page.evaluate(() => { delete window.__worldHeld; });
  await page.evaluate(input => {
    window.liveAtlas.setSession({ input, mode: 'sample', connected: false, latest: true });
    window.liveAtlas.fit();
  }, rawWorldInput);


  check('routine judgement has no second visible HTML information/control surface',
    await page.locator('#atlas-detail,#atlas-inspector,#atlas-audit,#atlas-search,#atlas-world-toolbar').count() === 0);
  const svgControls = await page.evaluate(() => window.liveAtlas.projection.scene.representations
    .filter(item => item.atlas?.kind === 'control').map(item => item.atlas.control).sort());
  check('Before/After/Fit/Focus/Select/Hand are projected into the SVG surface',
    JSON.stringify(svgControls) === JSON.stringify(['after','before','fit','focus','hand','latest','select']), svgControls);

  await clickCell('world:control:before');
  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' }));
  await page.evaluate(() => window.liveAtlas.zoomBy(1.35));
  const held = await page.evaluate(() => ({
    frameId: window.liveAtlas.page.input.frames[window.liveAtlas.page.frameIndex].id,
    selected: window.liveAtlas.page.selected,
    camera: window.liveAtlas.adapter.camera(),
  }));
  await page.evaluate(() => window.liveAtlas.setSession({
    input: structuredClone(window.liveAtlas.input),
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

  // Actual pan/zoom/Focus retain the same pinned, paged judgement and controls.
  await clickCell('world:control:fit');
  await clickCell('world:control:hand');
  const panBefore = await page.evaluate(() => window.liveAtlas.adapter.camera());
  await page.mouse.move(24, 110); await page.mouse.down(); await page.mouse.move(95, 145, { steps: 8 }); await page.mouse.up();
  const panAfter = await page.evaluate(() => window.liveAtlas.adapter.camera());
  const panJudgement = await renderedJudgement();
  check('actual Hand pan changes camera while all judgement values remain reachable',
    JSON.stringify(panBefore) !== JSON.stringify(panAfter) && panJudgement.visible, { panBefore, panAfter, panJudgement });
  await clickCell('world:control:select');
  await clickCell('world:control:fit');

  const renderedNodeLabels = async () => page.evaluate(() => {
    const atlas = window.liveAtlas, adapter = atlas.adapter, viewport = atlas.projection.viewport.graph;
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
      const camera = atlas.adapter.camera();
      const container = document.getElementById('atlas-world');
      const result = {
        events: before.events, width: container.clientWidth, height: container.clientHeight,
        beforeCamera: before.camera, camera,
        inputReused: atlas.input === before.input,
        selected: atlas.page.selected, beforeSelected: before.selected,
        frameId: atlas.input.frames[atlas.page.frameIndex].id, beforeFrameId: before.frameId,
      };
      delete window.__atlasResizeProbe;
      return result;
    });
    const judgement = await renderedJudgement();
    const controls = await renderedControls();
    const label = 'World resize ' + viewport.width + 'x' + viewport.height;
    check(label + ' refits camera after a real resize event',
      resized.events > 0 && resized.width === viewport.width && resized.height === viewport.height
        && JSON.stringify(resized.camera) !== JSON.stringify(resized.beforeCamera), resized);
    check(label + ' retains normalized input, qualified selection and viewed frame',
      resized.inputReused && resized.selected === resized.beforeSelected
        && resized.frameId === resized.beforeFrameId, resized);
    check(label + ' keeps SVG judgement and controls visible without manual Fit',
      judgement.visible && controls.every(item => item.visible), { judgement, controls });
    const labels = await renderedNodeLabels();
    check(label + ' representative node labels remain present and inside the graph viewport',
      labels.every(item => item.visible && item.unclipped && item.text.replace(/\s/gu, '').includes(item.expected.replace(/\s/gu, ''))), labels);
    await clickCell('world:control:after');
    const afterLabels = await renderedNodeLabels();
    check(label + ' After representative node labels remain present without replacing the held pair',
      afterLabels.every(item => item.visible && item.unclipped && item.text.replace(/\s/gu, '').includes(item.expected.replace(/\s/gu, ''))),
      afterLabels);
    await clickCell('world:control:before');
  }

  await page.evaluate(() => window.liveAtlas.fit());
  const cameraBeforeFocus = await page.evaluate(() => window.liveAtlas.adapter.camera());
  await clickCell('world:control:focus');
  const cameraAfterFocus = await page.evaluate(() => window.liveAtlas.adapter.camera());
  check('focus control is functional', JSON.stringify(cameraBeforeFocus) !== JSON.stringify(cameraAfterFocus));

  await page.locator('#atlas-world').press('0');
  const cameraAfterReturn = await page.evaluate(() => window.liveAtlas.adapter.camera());
  const returnedJudgement = await renderedJudgement();
  const returnedControls = await renderedControls();
  check('keyboard Fit returns from Focus to the same SVG judgement surface',
    JSON.stringify(cameraAfterReturn) !== JSON.stringify(cameraAfterFocus)
      && returnedJudgement.visible
      && returnedControls.every(item => item.visible),
    { cameraBeforeFocus, cameraAfterFocus, cameraAfterReturn, returnedJudgement, returnedControls });

  await clickCell('world:control:after');
  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' }));
  await page.evaluate(() => window.liveAtlas.setSession({
    mode: 'live',
    connected: false,
    latest: true,
  }));
  const disconnectedCurrent = await renderedJudgement();
  const disconnectedEntity = await page.evaluate(() => {
    const row = window.liveAtlas.projection.scene.representations.find(item => item.atlas?.ref?.space === 'agents' && item.atlas?.ref?.id === 'agent.1');
    return row?.atlas ?? null;
  });
  check('live latest disconnect downgrades current activity to UNKNOWN while retaining the last declaration',
    disconnectedCurrent.visible
      && /Activity: UNKNOWN · lastDeclared=NOW · transport=SSE disconnected/u.test(disconnectedCurrent.text)
      && disconnectedEntity?.activity === 'unknown'
      && disconnectedEntity?.declaredActivity === 'now',
    { disconnectedCurrent, disconnectedEntity });

  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'purpose', kind: 'purpose', id: 'shared' }));
  const disconnectedNone = await renderedJudgement();
  const disconnectedNoneEntity = await page.evaluate(() => {
    const row = window.liveAtlas.projection.scene.representations.find(item => item.atlas?.ref?.space === 'purpose' && item.atlas?.ref?.id === 'shared');
    return row?.atlas ?? null;
  });
  check('live latest disconnect keeps explicit non-activity NONE instead of inventing UNKNOWN',
    disconnectedNone.visible
      && /Activity: NONE · declared=NONE · transport=SSE disconnected/u.test(disconnectedNone.text)
      && !/lastDeclared=NONE/u.test(disconnectedNone.text)
      && disconnectedNoneEntity?.activity === 'none'
      && disconnectedNoneEntity?.declaredActivity === 'none',
    { disconnectedNone, disconnectedNoneEntity });

  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' }));
  await page.evaluate(() => window.liveAtlas.setSession({
    mode: 'live',
    connected: true,
    latest: true,
  }));
  const reconnectedCurrent = await renderedJudgement();
  check('live reconnect restores the declared activity without inventing idle/completion',
    reconnectedCurrent.visible
      && /Activity: NOW · declared=NOW · transport=SSE connected/u.test(reconnectedCurrent.text),
    reconnectedCurrent);

  await clickCell('world:control:before');
  await page.evaluate(() => window.liveAtlas.setSession({
    mode: 'live',
    connected: false,
    latest: false,
  }));
  const disconnectedHistory = await renderedJudgement();
  check('historical frame keeps its time-bounded declared activity while live transport is disconnected',
    disconnectedHistory.visible
      && /Activity: NOW · declared=NOW · transport=HISTORY snapshot/u.test(disconnectedHistory.text),
    disconnectedHistory);


  // Issue / Package witnesses use the public SVG, not a second renderer.
  await page.evaluate(() => window.liveAtlas.setSession({
    mode: 'sample', connected: false, latest: true,
  }));
  await page.locator('#atlas-world').press('0');

  const example = {
    issueA: entityOf('example-issues-a', 'issue', '7'),
    issueB: entityOf('example-issues-b', 'issue', '7'),
    packageA: entityOf('example-packages', 'package', 'pkg-a'),
    packageB: entityOf('example-packages', 'package', 'pkg-b'),
    repoA: entityOf('example-repos', 'repo', 'a'),
    repoB: entityOf('example-repos', 'repo', 'b'),
  };
  const exampleKey = (kind, id) => relationKey({ space: 'example-relations', kind, id });
  const clickExample = async item => {
    if (item.hasChildren) await clickBoundaryHeader(item.regionId);
    else await clickCell(item.regionId);
    await page.waitForFunction(key => window.liveAtlas.page.selected === key, entityKey(item.ref));
  };

  const focusedLabel = async item => {
    await page.locator('#atlas-world').press('f');
    const label = await page.evaluate(id => {
      const adapter = window.liveAtlas.adapter;
      const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(id));
      const node = state?.text?.node;
      const bounds = node?.getBoundingClientRect();
      const viewport = document.getElementById('atlas-world').getBoundingClientRect();
      const style = node ? getComputedStyle(node) : null;
      return {
        text: node?.textContent ?? '',
        visible: Boolean(node && document.querySelector('#atlas-world svg')?.contains(node)
          && bounds && bounds.width > 0 && bounds.height > 0
          && bounds.left >= viewport.left - 1 && bounds.right <= viewport.right + 1
          && bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1
          && style?.display !== 'none' && style?.visibility !== 'hidden'),
      };
    }, item.regionId);
    await page.locator('#atlas-world').press('0');
    return label;
  };

  // A label or midpoint can be covered by a node. Sample the rendered line and
  // require a hit on this edge's actual SVG before sending a real mouse click.
  const clickExposedRelation = async id => {
    const point = await page.evaluate(key => {
      const adapter = window.liveAtlas.adapter;
      const edge = adapter.edgeByRelationId.get(key);
      const state = edge ? adapter.graph.getView().getState(edge) : null;
      const points = state?.absolutePoints ?? [];
      const viewport = document.getElementById('atlas-world').getBoundingClientRect();
      for (let segment = 1; segment < points.length; segment += 1) {
        const a = points[segment - 1], b = points[segment];
        if (!a || !b) continue;
        const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
        for (let step = 1; step < steps; step += 1) {
          const part = step / steps;
          const x = viewport.left + a.x + (b.x - a.x) * part;
          const y = viewport.top + a.y + (b.y - a.y) * part;
          if (x <= viewport.left || x >= viewport.right || y <= viewport.top || y >= viewport.bottom) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && (state.shape?.node?.contains(hit) || state.text?.node?.contains(hit))) return { x, y };
        }
      }
      return null;
    }, id);
    if (!point) throw new Error('no exposed SVG click point for ' + id);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(key => {
      const atlas = window.liveAtlas;
      const group = atlas.projection.scene.relations.find(item => item.relationIds.includes(key));
      return group?.relationIds.includes(atlas.page.selected);
    }, id, { timeout: 3000 });
    await page.locator('#atlas-world').press('0');
    return point;
  };

  check('two qualified Issues retain distinct SVG identities',
    example.issueA && example.issueB && entityKey(example.issueA.ref) !== entityKey(example.issueB.ref));

  for (const [name, item] of Object.entries(example)) {
    await clickExample(item);
    const detail = await renderedJudgement();
    const identity = item.ref.space + '/' + item.ref.kind + '/' + item.ref.id;
    check(name + ' is actual-click selectable with visible qualified identity and proposal status',
      detail.visible && detail.text.includes('Selected entity · ' + identity)
        && /Flags: .*synthetic.*proposal/u.test(detail.text), detail);
    if (item.ref.kind === 'package') {
      check(name + ' keeps implementation evidence unknown independently of Activity',
        /Flags: .*implementation-unknown/u.test(detail.text), detail);
    }
    const label = await focusedLabel(item);
    check(name + ' label is readable in Focus and Fit restores SVG judgement',
      label.visible && label.text.includes({ issueA: 'Issue A', issueB: 'Issue B', packageA: 'Package A', packageB: 'Package B', repoA: 'Repo A', repoB: 'Repo B' }[name])
        && (await renderedJudgement()).visible, label);
  }

  const routes = [
    { id: 'pkg-a.issue-a.req', from: 'Package A', to: 'Issue A', target: example.issueA },
    { id: 'pkg-a.issue-b', from: 'Package A', to: 'Issue B', target: example.issueB },
    { id: 'pkg-b.issue-a.req', from: 'Package B', to: 'Issue A', target: example.issueA },
  ];
  for (const route of routes) {
    const key = exampleKey('addresses', route.id);
    const point = await clickExposedRelation(key);
    const relationDetail = await renderedJudgement();
    check(route.id + ' M:N edge is actual-click selectable with visible endpoints',
      relationDetail.visible && relationDetail.text.includes('from=' + route.from)
        && relationDetail.text.includes('to=' + route.to), { point, relationDetail });

    if (route.id === 'pkg-a.issue-a.req') {
      const reached = new Map();
      for (let step = 0; step < 2; step += 1) {
        const selected = await page.evaluate(() => window.liveAtlas.page.selected);
        reached.set(selected, await renderedJudgement());
        if (step === 0) {
          await clickCell('world:aggregate-cycle');
          await page.waitForFunction(previous => window.liveAtlas.page.selected !== previous, selected);
        }
      }
      const required = reached.get(exampleKey('addresses', 'pkg-a.issue-a.req'));
      const alternate = reached.get(exampleKey('addresses', 'pkg-a.issue-a.alt'));
      check('A-to-A aggregate recovers both independent refs and distinct visible evidence 2/2',
        reached.size === 2 && required?.visible && alternate?.visible
          && /basis=req-a/u.test(required.text) && /fixture:req-a@1/u.test(required.text)
          && /basis=alt-a/u.test(alternate.text) && /fixture:alt-a@1/u.test(alternate.text),
        { reached: [...reached] });
      check('Package A required responsibility and I/O are visible on the required relation',
        required?.visible && /role=plan · input=Request · output=Plan/u.test(required.text), required);
    }
    if (route.id === 'pkg-b.issue-a.req') {
      check('Package B required responsibility and I/O are visible on its required relation',
        relationDetail.visible && /role=render · input=Plan · output=SVG/u.test(relationDetail.text), relationDetail);
    }
    if (route.id === 'pkg-a.issue-b') {
      check('B relation Direction traverses the selected B reference and remains a proposal',
        /Selected relation · example-relations\/addresses\/pkg-a.issue-b/u.test(relationDetail.text)
          && /basis=scope-b/u.test(relationDetail.text)
          && /Direction: Package A → Issue B → Purpose A → Company purpose/u.test(relationDetail.text)
          && /Direction status: PROPOSAL \/ not accepted/u.test(relationDetail.text),
        relationDetail);
    }
    await clickExample(route.target);
    const targetDetail = await renderedJudgement();
    check(route.id + ' target Issue is actual-click selected before reading its own Purpose path',
      targetDetail.visible && targetDetail.text.includes('Direction: ' + route.to + ' → Purpose A → Company purpose'),
      targetDetail);
  }

  await clickExample(example.packageA);
  const packageDirection = await renderedJudgement();
  check('Package A exposes one supplied path without adopting its relation evidence',
    packageDirection.visible
      && /Direction: Package A → Issue A → Purpose A → Company purpose/u.test(packageDirection.text)
      && /Flags: .*proposal.*implementation-unknown/u.test(packageDirection.text), packageDirection);

  for (const [frameId, parent] of [['before', example.repoA], ['after', example.repoB]]) {
    await clickCell('world:control:' + frameId);
    const selected = await page.evaluate(() => window.liveAtlas.page.selected);
    const detail = await renderedJudgement();
    const [childBox, parentBox, stableChildBox, stableParentBox] = await Promise.all([
      renderedBox(example.packageA.regionId), renderedBox(parent.regionId),
      renderedBox(example.packageB.regionId), renderedBox(example.repoA.regionId),
    ]);
    check(frameId + ' placement preserves Package A selection, declared nesting and unknown implementation',
      selected === entityKey(example.packageA.ref) && detail.visible
        && /Diff: changed containment/u.test(detail.text) && /implementation-unknown/u.test(detail.text)
        && strictlyInside(childBox, parentBox) && strictlyInside(stableChildBox, stableParentBox),
      { selected, detail, childBox, parentBox, stableChildBox, stableParentBox });
    await clickExample(parent);
    const parentLabel = await focusedLabel(parent);
    check(frameId + ' proposed containment parent is readable after actual click and Focus',
      parentLabel.visible && parentLabel.text.includes(frameId === 'before' ? 'Repo A' : 'Repo B'), parentLabel);
    await clickExample(example.packageA);
  }

  // This is a selection/diff probe, not an assertion of a placement-edge click.
  // The package/parent/frame operations above and the three M:N routes are real clicks.
  await page.evaluate(() => window.liveAtlas.selectRelationRef({
    space: 'example-relations', kind: 'placement', id: 'pkg-a.repo-proposal',
  }));
  for (const [frameId, repo, version] of [['before', 'Repo A', '1'], ['after', 'Repo B', '2']]) {
    await clickCell('world:control:' + frameId);
    const selected = await page.evaluate(() => window.liveAtlas.page.selected);
    const detail = await renderedJudgement();
    check(frameId + ' placement proposal retains its ref and displays the supplied repo/version difference',
      selected === exampleKey('placement', 'pkg-a.repo-proposal') && detail.visible
        && detail.text.includes('repo=' + repo + ' · package=Package A · basis=move-a-v' + version)
        && detail.text.includes('Source: fixture:place-a@' + version + ' [synthetic]')
        && /Flags: .*proposal.*display-containment-only/u.test(detail.text)
        && /Diff: changed context, from, source/u.test(detail.text) && !/missing in/u.test(detail.text),
      { selected, detail });
  }

  const ownerRaw = JSON.parse(fs.readFileSync('examples/atlas/input/prepared-comparison.json', 'utf8'));
  await page.evaluate(input => window.liveAtlas.setSession({ input, mode: 'sample', latest: true }), ownerRaw);
  const ownerRendered = await renderedJudgement({ tab: 'world' });
  check('World comparison exposes all six owner axes, three gaps, refs and provenance through actual SVG pages',
    ownerRendered.visible && ['N', 'M', 'R', 'E', 'S', 'T'].every(axis => ownerRendered.text.includes('Owner axis ' + axis + ':'))
      && ['business', 'frame', 'observation'].every(gap => ownerRendered.text.includes('Owner gap ' + gap + ':'))
      && /Owner axis M: UNCHANGED/u.test(ownerRendered.text) && /fixture:comparison-owner@1/u.test(ownerRendered.text)
      && /Work\/Receipt completion does not establish Purpose achievement/u.test(ownerRendered.text), ownerRendered);
  for (const kind of ['same-fields-owner-M', 'order-only-owner-M-unchanged', 'relation-ST', 'partial-owner', 'no-owner']) {
    await page.evaluate(({ raw, kind }) => {
      const input = structuredClone(raw);
      const before = structuredClone(input.frames[0]);
      input.frames[1] = { ...structuredClone(before), id: 'after', rev: input.frames[1].rev, asOf: input.frames[1].asOf };
      const owner = input.comparisons[0];
      owner.axes.M.status = kind === 'same-fields-owner-M' ? 'changed' : 'unchanged';
      owner.axes.M.summary = 'Independent prepared owner meaning receipt';
      if (kind === 'order-only-owner-M-unchanged') input.frames[1].entities.find(item => item.ref.id === 'project.b').order = 33;
      if (kind === 'relation-ST') {
        const relation = input.frames[1].relations.find(item => item.ref.id === 'agent1.purposea');
        relation.source.sourceDigest = 'fixture:new-relation-evidence'; relation.time.effectiveAt = '2026-10-09T02:00:00Z';
      }
      if (kind === 'partial-owner') owner.axes = { M: owner.axes.M };
      if (kind === 'no-owner') input.comparisons = [];
      window.liveAtlas.setSession({ input, mode: 'sample', latest: true });
    }, { raw: ownerRaw, kind });
    const rendered = await renderedJudgement({ tab: 'world' });
    const expected = kind === 'same-fields-owner-M' ? /Owner axis M: CHANGED/u.test(rendered.text) && /Factual records with supplied field\/presence difference: 0/u.test(rendered.text)
      : kind === 'order-only-owner-M-unchanged' ? /Owner axis M: UNCHANGED/u.test(rendered.text) && /fields=order/u.test(rendered.text)
        : kind === 'relation-ST' ? /fields=source, time/u.test(rendered.text) && /Owner axis S: CHANGED/u.test(rendered.text) && /Owner axis T: CHANGED/u.test(rendered.text)
          : kind === 'partial-owner' ? /Owner axis N: NOT SUPPLIED \/ UNKNOWN/u.test(rendered.text) && /Owner axis M: UNCHANGED/u.test(rendered.text)
            : /Owner comparison: NOT SUPPLIED for this pair/u.test(rendered.text) && /Owner axis M: NOT SUPPLIED \/ UNKNOWN/u.test(rendered.text);
    check(kind + ' remains a visible independent owner/world claim', rendered.visible && expected, rendered);
  }
  await page.evaluate(input => { window.liveAtlas.setSession({ input, mode: 'sample', latest: true }); window.liveAtlas.fit(); }, rawWorldInput);
  await clickExample(example.packageA);
  const alternatives = await renderedJudgement({ tab: 'direction' });
  check('Direction pages recover req/alt/B RelationRefs without promoting proposal evidence',
    alternatives.visible && ['pkg-a.issue-a.req', 'pkg-a.issue-a.alt', 'pkg-a.issue-b'].every(id => alternatives.text.includes(id))
      && /PROPOSAL \/ not accepted/u.test(alternatives.text) && /fixture:req-a@1/u.test(alternatives.text)
      && /fixture:alt-a@1/u.test(alternatives.text), alternatives);
  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'serves', id: 'agent1.purposea' }));
  const falsePath = await renderedJudgement({ tab: 'direction' });
  check('selected path=false relation cannot borrow its from endpoint route',
    falsePath.visible && /Route alternatives: 0/u.test(falsePath.text) && /selected relation path=false/u.test(falsePath.text), falsePath);
  await clickCell('world:endpoint-from');
  check('explicit from endpoint navigation changes qualified selection',
    await page.evaluate(() => window.liveAtlas.page.selected) === 'entity:agents:agent:agent.1');

  await page.evaluate(raw => {
    const input = structuredClone(raw), frame = input.frames.at(-1);
    const target = frame.entities.find(item => item.ref.id === 'purpose.b').ref;
    input.presentation.directionTargets.push(target);
    const template = frame.relations.find(item => item.ref.id === 'pkg-a.issue-b');
    frame.relations.push({ ...structuredClone(template), ref: { space: 'prepared-direction', kind: 'supports', id: 'pkg-a.purpose-b' },
      to: target, label: 'Second Purpose proposal', path: true });
    window.liveAtlas.setSession({ input, latest: true, mode: 'sample' });
  }, rawWorldInput);
  await clickExample(example.packageA);
  const multiplePurposes = await renderedJudgement({ tab: 'direction' });
  check('multiple supplied Purpose targets remain visible alternatives with individual edge references',
    multiplePurposes.visible && /entity:purpose:purpose:purpose.b/u.test(multiplePurposes.text)
      && /entity:purpose:purpose:shared/u.test(multiplePurposes.text)
      && /relation:prepared-direction:supports:pkg-a.purpose-b/u.test(multiplePurposes.text), multiplePurposes);
  await page.evaluate(() => {
    const atlas = window.liveAtlas, input = structuredClone(atlas.input);
    const relation = input.frames.at(-1).relations.find(item => item.ref.space === 'prepared-direction');
    relation.to = { space: 'not-supplied', kind: 'purpose', id: 'purpose.b' };
    atlas.setSession({ input, latest: true }); atlas.selectRelationRef(relation.ref);
  });
  const missingEndpointDirection = await renderedJudgement({ tab: 'direction' });
  check('missing qualified endpoint cannot borrow the same raw id Purpose',
    missingEndpointDirection.visible && /endpoint missing \/ unknown/u.test(missingEndpointDirection.text)
      && /entity:not-supplied:purpose:purpose.b · MISSING \/ UNKNOWN/u.test(missingEndpointDirection.text), missingEndpointDirection);
  await clickCell('world:endpoint-to');
  check('explicit unknown endpoint selection remains absent on both sides',
    /not present in either compared frame/u.test((await renderedJudgement()).text));
  await clickCell('world:detail:records');
  await page.evaluate(() => {
    const atlas = window.liveAtlas;
    window.__catalogBefore = { pair: atlas.page.pair, camera: atlas.adapter.camera() };
  });
  let recoveredFromCatalog = false, catalogReturnPage = -1;
  const catalogPages = await page.evaluate(() => window.liveAtlas.projection.detail.pageCount);
  while ((await page.evaluate(() => window.liveAtlas.projection.detail.page)) > 0) await clickCell('world:detail:previous');
  for (let number = 0; number < catalogPages; number += 1) {
    const row = await page.evaluate(key => window.liveAtlas.projection.scene.representations.find(item =>
      item.atlas?.kind === 'judgement-line' && item.activation?.id === key)?.regionId, entityKey(example.packageA.ref));
    if (row) { catalogReturnPage = number; await clickCell(row); recoveredFromCatalog = true; break; }
    if (number + 1 < catalogPages) await clickCell('world:detail:next');
  }
  const catalogReturn = await page.evaluate(() => {
    const atlas = window.liveAtlas, previous = window.__catalogBefore;
    return { selected: atlas.page.selected, tab: atlas.page.detailTab, page: atlas.page.detailPage,
      samePair: atlas.page.pair === previous.pair,
      sameCamera: JSON.stringify(atlas.adapter.camera()) === JSON.stringify(previous.camera),
      camera: atlas.adapter.camera(), before: atlas.page.pair.before?.id, after: atlas.page.pair.after.id };
  });
  const catalogJudgement = await renderedJudgement();
  check('actual All records row click returns from an unknown endpoint to the original qualified context',
    recoveredFromCatalog && catalogReturn.selected === entityKey(example.packageA.ref)
      && catalogReturn.tab === 'record' && catalogReturn.samePair && catalogReturn.sameCamera && catalogJudgement.visible,
    { rowFound: recoveredFromCatalog, catalogReturnPage, state: catalogReturn, judgement: catalogJudgement });
  await clickCell('world:detail:records');
  check('returning to All records restores the page used for selection',
    await page.evaluate(() => window.liveAtlas.projection.detail.page) === catalogReturnPage);

  // The row may be the current selection. This is still an explicit inspect
  // action, not a no-op. Read the actual tab before the text helper visits it.
  const sameKeyRow = await page.evaluate(key => {
    const atlas = window.liveAtlas;
    window.__catalogBefore = { pair: atlas.page.pair, camera: atlas.adapter.camera(), selected: atlas.page.selected };
    return atlas.projection.scene.representations.find(item =>
      item.atlas?.kind === 'judgement-line' && item.activation?.id === key)?.regionId ?? null;
  }, entityKey(example.packageA.ref));
  if (sameKeyRow) await clickCell(sameKeyRow);
  const sameKeyInspect = await page.evaluate(() => {
    const atlas = window.liveAtlas, previous = window.__catalogBefore;
    return { selected: atlas.page.selected, sameSelection: atlas.page.selected === previous.selected,
      tab: atlas.page.detailTab, page: atlas.page.detailPage, samePair: atlas.page.pair === previous.pair,
      sameCamera: JSON.stringify(atlas.adapter.camera()) === JSON.stringify(previous.camera),
      camera: atlas.adapter.camera(), before: atlas.page.pair.before?.id, after: atlas.page.pair.after.id };
  });
  const sameKeyJudgement = await renderedJudgement();
  check('actual All records click on the already selected key opens Record and retains pair/selection/camera',
    Boolean(sameKeyRow) && sameKeyInspect.sameSelection && sameKeyInspect.selected === entityKey(example.packageA.ref)
      && sameKeyInspect.tab === 'record' && sameKeyInspect.page === 0 && sameKeyInspect.samePair && sameKeyInspect.sameCamera
      && sameKeyJudgement.visible && /Selected entity · example-packages\/package\/pkg-a/u.test(sameKeyJudgement.text),
    { row: sameKeyRow, state: sameKeyInspect, judgement: sameKeyJudgement });
  await clickCell('world:detail:records');
  const sameKeyReturnPage = await page.evaluate(() => window.liveAtlas.projection.detail.page);
  check('All records returns to the same page after inspecting the already selected key',
    sameKeyReturnPage === catalogReturnPage, { expected: catalogReturnPage, actual: sameKeyReturnPage });
  await page.evaluate(() => { delete window.__catalogBefore; });

  // Long values are paged, never truncated; this verifies exact rendered text
  // including multi-byte characters through the public artifact at both sizes.
  await page.evaluate(input => {
    const next = structuredClone(input);
    const relation = next.frames[1].relations.find(item => item.ref.id === 'agent1.purposea');
    relation.context = { value: '長い供給済みの根拠λ🙂'.repeat(30), literal: '<>&" \\n is literal; \n is a newline',
      edges: '  leading and trailing  ', consecutive: 'one    two', spacesOnly: ' '.repeat(180),
      lines: '\n\nfirst\tsecond\r\nlast\n', separators: 'a\u0085b\u2028c\u2029d', escape: '\\ " \t' };
    relation.source.sourceDigest = 'long-source-'.repeat(50);
    window.liveAtlas.setSession({ input: next, mode: 'sample', latest: true });
    window.liveAtlas.selectRelationRef(relation.ref);
  }, rawWorldInput);
  for (const viewport of [{ width: 1200, height: 900 }, { width: 1500, height: 1000 }]) {
    await page.setViewportSize(viewport);
    const long = await renderedJudgement();
    check('long multi-field evidence is fully visible through SVG page clicks at ' + viewport.width + 'x' + viewport.height,
      long.visible && long.complete && long.totalPages > 1
        && long.text.includes('長い供給済みの根拠λ🙂'.repeat(30)) && long.text.includes('long-source-'.repeat(50)), long);
    check('actual SVG JSON fragments preserve spaces-only rows, line breaks, tabs and literal escapes at ' + viewport.width + 'x' + viewport.height,
      long.visible && long.rows.some(row => /^ +$/u.test(row.decoded ?? ''))
        && long.text.includes('edges=  leading and trailing  ')
        && long.text.includes('consecutive=one    two') && long.text.includes('spacesOnly=' + ' '.repeat(180))
        && long.text.includes('lines=\n\nfirst\tsecond\r\nlast\n')
        && long.text.includes('literal=<>&" \\n is literal; \n is a newline')
        && long.text.includes('separators=a\u0085b\u2028c\u2029d'), long);
  }

  for (const count of [40, 41]) {
    await page.evaluate(({ raw, count }) => {
      const input = structuredClone(raw), frame = input.frames[0];
      const root = frame.entities.find(item => item.ref.space === 'purpose' && item.ref.id === 'shared');
      const template = frame.entities.find(item => item.ref.id === 'agent.1');
      frame.entities = [root, ...Array.from({ length: count }, (_, index) => ({ ...structuredClone(template),
        ref: { space: 'budget', kind: 'agent', id: String(index) }, label: 'Budget Agent ' + index, order: index }))];
      frame.relations = []; input.frames = [frame]; input.presentation.defaultSelection = root.ref;
      window.liveAtlas.setSession({ input, mode: 'sample', latest: true }); window.liveAtlas.selectRef(root.ref); window.liveAtlas.fit();
    }, { raw: rawWorldInput, count });
    const coverage = await page.evaluate(() => ({ ...window.liveAtlas.projection.coverage,
      shown: window.liveAtlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity' && item.atlas.area === 'agents').length }));
    const catalog = await renderedJudgement({ tab: 'records' });
    check('entity budget ' + count + ' displays 40 and recovers every qualified input identity through actual SVG catalog pages',
      coverage.shown === 40 && coverage.omittedEntities === count - 40 && catalog.visible
        && Array.from({ length: count }, (_, index) => 'entity:budget:agent:' + index + ' · Budget Agent ' + index).every(text => catalog.text.includes(text)), { coverage, catalog });
    if (count === 41) {
      await clickCell('world:omitted-entity-cycle');
      const detail = await renderedJudgement();
      check('41st entity recovers full provenance from the visible omission control',
        detail.visible && /Selected entity · budget\/agent\/40/u.test(detail.text) && /fixture:runtime@1/u.test(detail.text), detail);
    }
  }
  for (const count of [64, 65]) {
    await page.evaluate(({ raw, count }) => {
      const input = structuredClone(raw), frame = input.frames[0];
      const template = frame.relations.find(item => item.ref.id === 'agent1.purposea');
      frame.relations = Array.from({ length: count }, (_, index) => ({ ...structuredClone(template),
        ref: { space: 'budget', kind: 'relation', id: String(index) }, kind: 'budget-' + index, context: { evidence: index } }));
      input.frames = [frame]; window.liveAtlas.setSession({ input, mode: 'sample', latest: true }); window.liveAtlas.fit();
    }, { raw: rawWorldInput, count });
    const coverage = await page.evaluate(() => ({ ...window.liveAtlas.projection.coverage, groups: window.liveAtlas.projection.scene.relations.length }));
    const catalog = await renderedJudgement({ tab: 'records' });
    check('relation budget ' + count + ' shows 64 groups and recovers every qualified identity through the SVG catalog',
      coverage.groups === 64 && coverage.omittedRelations === count - 64 && catalog.visible
        && Array.from({ length: count }, (_, index) => 'relation:budget:relation:' + index + ' · ').every(text => catalog.text.includes(text)), { coverage, catalog });
    if (count === 65) {
      await clickCell('world:omitted-cycle');
      const detail = await renderedJudgement();
      check('65th relation group recovers its own context and provenance',
        detail.visible && /Selected relation · budget\/relation/u.test(detail.text) && /Context: evidence=/u.test(detail.text), detail);
    }
  }
  await page.evaluate(input => { window.liveAtlas.setSession({ input, mode: 'sample', latest: true }); window.liveAtlas.fit(); }, rawWorldInput);
  await clickExample(example.packageA);
  const denseReturn = await page.evaluate(() => {
    const atlas = window.liveAtlas;
    return { selected: atlas.page.selected, tab: atlas.page.detailTab, page: atlas.page.detailPage,
      before: atlas.page.pair.before?.id, after: atlas.page.pair.after.id, camera: atlas.adapter.camera() };
  });
  const denseReturnJudgement = await renderedJudgement();
  check('return from dense input restores original qualified context and full judgement',
    denseReturnJudgement.visible && denseReturn.selected === entityKey(example.packageA.ref) && denseReturn.tab === 'record',
    { state: denseReturn, judgement: denseReturnJudgement });

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
  emitPrepared({ ...ownerRaw, note: 'stream-accepted-1' });
  await streamPage.waitForFunction(() => window.liveAtlas.input.note === 'stream-accepted-1');
  await clickCell('world:control:before', streamPage);
  await streamPage.evaluate(() => {
    const atlas = window.liveAtlas;
    atlas.selectRef({ space: 'projects', kind: 'project', id: 'project.b' }); atlas.zoomBy(1.1);
    window.__streamHeld = { pair: atlas.page.pair, input: atlas.input, selected: atlas.page.selected, camera: atlas.adapter.camera() };
  });
  const streamNext = structuredClone(ownerRaw);
  const extra = structuredClone(streamNext.frames.at(-1)); extra.id = 'stream-new-after'; extra.rev += 1;
  extra.entities.find(item => item.ref.id === 'project.b').order = 77;
  streamNext.frames.push(extra); streamNext.note = 'stream-accepted-2';
  emitPrepared(streamNext);
  await streamPage.waitForFunction(() => window.liveAtlas.input.note === 'stream-accepted-2');
  const streamHeld = await renderedJudgement({ targetPage: streamPage });
  check('real SSE append preserves both held contents and owner receipts',
    streamHeld.visible && /Field order .*Before=1 → After=4/u.test(streamHeld.text)
      && await streamPage.evaluate(() => window.liveAtlas.page.pair === window.__streamHeld.pair), streamHeld);
  const streamOwner = await renderedJudgement({ targetPage: streamPage, tab: 'world' });
  check('held SSE comparison keeps the owner receipt associated with the original pair',
    streamOwner.visible && /prepared-owner-six-axes/u.test(streamOwner.text), streamOwner);
  for (const invalid of ['{invalid JSON', { kind: 'invalid-world' }]) {
    phase = 'prepared SSE ' + (typeof invalid === 'string' ? 'malformed JSON' : 'invalid kind');
    await streamPage.evaluate(() => { window.__streamAccepted = window.liveAtlas.input; });
    emitPrepared(invalid);
    await streamPage.waitForFunction(() => window.liveAtlas.page.admission?.status === 'rejected');
    const rejected = await renderedJudgement({ targetPage: streamPage });
    const kept = await streamPage.evaluate(() => {
      const atlas = window.liveAtlas, previous = window.__streamHeld;
      return atlas.input === window.__streamAccepted && atlas.page.pair === previous.pair
        && atlas.page.selected === previous.selected && JSON.stringify(atlas.adapter.camera()) === JSON.stringify(previous.camera);
    });
    check('real SSE ' + (typeof invalid === 'string' ? 'malformed JSON' : 'invalid kind') + ' is visibly rejected while retaining last accepted/pair/selection/camera',
      kept && rejected.visible && /Admission: REJECTED · last accepted input retained/u.test(rejected.text), rejected);
    phase = 'prepared SSE valid recovery';
    emitPrepared({ ...streamNext, note: 'stream-recovered-' + (typeof invalid === 'string' ? 'json' : 'kind') });
    await streamPage.waitForFunction(() => !window.liveAtlas.page.admission);
    const recovered = await renderedJudgement({ targetPage: streamPage });
    check('next valid SSE clears rejection without releasing comparison hold',
      recovered.visible && /Admission: accepted prepared input/u.test(recovered.text)
        && await streamPage.evaluate(() => !window.liveAtlas.page.latest && window.liveAtlas.page.pair === window.__streamHeld.pair), recovered);
  }
  phase = 'prepared SSE explicit Latest';
  await clickCell('world:control:latest', streamPage);
  await streamPage.waitForFunction(() => window.liveAtlas.page.latest && window.liveAtlas.page.pair.after.id === 'stream-new-after');
  const latestStream = await renderedJudgement({ targetPage: streamPage });
  check('actual Latest resumes received SSE data without inventing a matching owner receipt',
    latestStream.visible && /Field order .*Before=1 → After=77/u.test(latestStream.text)
      && /owner comparison NOT SUPPLIED/u.test(latestStream.text), latestStream);
  await streamPage.evaluate(() => {
    window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' });
    window.__disconnectInput = window.liveAtlas.input;
  });
  phase = 'prepared SSE network interruption';
  simAvailable = false;
  recordTransport('prepared unavailable', { clients: simClients.size });
  for (const client of [...simClients]) client.destroy();
  await streamPage.waitForFunction(() => !window.liveAtlas.page.connected);
  phase = 'prepared SSE disconnected inspection';
  const streamDisconnected = await renderedJudgement({ targetPage: streamPage });
  check('real disconnected SSE exposes UNKNOWN while retaining the last supplied observation',
    streamDisconnected.visible && /Activity: UNKNOWN · lastDeclared=NOW · transport=SSE disconnected/u.test(streamDisconnected.text)
      && /Time: observed=2026-10-07T06:00:00Z · acquired=2026-10-07T06:10:00Z · effective=unknown/u.test(streamDisconnected.text)
      && await streamPage.evaluate(() => window.liveAtlas.input === window.__disconnectInput), streamDisconnected);
  phase = 'prepared SSE reconnection';
  simAvailable = true;
  recordTransport('prepared available', { clients: simClients.size });
  await streamPage.waitForFunction(() => window.liveAtlas.page.connected);
  check('real transport reconnect preserves accepted source and pair without restamping observations',
    await streamPage.evaluate(() => window.liveAtlas.input === window.__disconnectInput
      && window.liveAtlas.page.pair.after.id === 'stream-new-after'));
  const streamRecovered = await renderedJudgement({ targetPage: streamPage });
  check('reconnected actual app retains declared observation and visible SSE state',
    streamRecovered.visible && /transport=SSE connected/u.test(streamRecovered.text)
      && /Time: observed=2026-10-07T06:00:00Z · acquired=2026-10-07T06:10:00Z · effective=unknown/u.test(streamRecovered.text), streamRecovered);
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
    ['temporary files', () => fsp.rm(tempRoot, { recursive: true, force: true })],
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
