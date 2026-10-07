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
import { containmentIndex, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';

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

const rawWorldInput = JSON.parse(fs.readFileSync('examples/atlas/input/a2-world.json', 'utf8'));
let reversedRejected = false;
try {
  parseAtlasWorldInput({ ...rawWorldInput, frames: [...rawWorldInput.frames].reverse() });
} catch {
  reversedRejected = true;
}
check('reversed frame history is rejected', reversedRejected);

let invalidAsOfRejected = false;
try {
  const frames = structuredClone(rawWorldInput.frames);
  frames[0].asOf = 'not-an-instant';
  parseAtlasWorldInput({ ...rawWorldInput, frames });
} catch {
  invalidAsOfRejected = true;
}
check('invalid frame asOf is rejected', invalidAsOfRejected);


const parsedWorldInput = parseAtlasWorldInput(rawWorldInput);
const afterFrame = parsedWorldInput.frames.at(-1);
const afterContainment = containmentIndex(afterFrame);

const teamAgent1Evidence = afterContainment.evidenceByChild.get('entity:agents:agent:agent.1') ?? [];
check('duplicate same-parent containment evidence is accepted and preserved',
  teamAgent1Evidence.length === 2
    && teamAgent1Evidence.some(id => id.includes('team.agent1.containment.1'))
    && teamAgent1Evidence.some(id => id.includes('team.agent1.containment.2')),
  teamAgent1Evidence);

const expectReject = (name, mutate) => {
  const value = structuredClone(rawWorldInput);
  mutate(value);
  let rejected = false;
  try { parseAtlasWorldInput(value); } catch { rejected = true; }
  check(name, rejected);
};

expectReject('distinct multi-parent containment is rejected', value => {
  const frame = value.frames.at(-1);
  frame.relations.push({
    ...structuredClone(frame.relations.find(item => item.ref.id === 'team.agent1.containment.1')),
    ref: { space: 'world-relation', kind: 'contains', id: 'invalid.multi-parent' },
    from: { space: 'agents', kind: 'agent', id: 'shared' },
    to: { space: 'agents', kind: 'agent', id: 'agent.1' },
    containment: 'from-contains-to',
  });
});
expectReject('self containment is rejected', value => {
  const relation = value.frames.at(-1).relations.find(item => item.ref.id === 'team.agent1.containment.1');
  relation.from = structuredClone(relation.to);
});
expectReject('containment cycle is rejected', value => {
  const frame = value.frames.at(-1);
  frame.relations.push({
    ...structuredClone(frame.relations.find(item => item.ref.id === 'team.agent1.containment.1')),
    ref: { space: 'world-relation', kind: 'contains', id: 'invalid.cycle' },
    from: { space: 'agents', kind: 'agent', id: 'agent.1' },
    to: { space: 'agents', kind: 'actor', id: 'team.atlas' },
    containment: 'from-contains-to',
  });
});
expectReject('cross-area containment is rejected', value => {
  const frame = value.frames.at(-1);
  frame.relations.push({
    ...structuredClone(frame.relations.find(item => item.ref.id === 'team.agent1.containment.1')),
    ref: { space: 'world-relation', kind: 'contains', id: 'invalid.cross-area' },
    from: { space: 'projects', kind: 'project', id: 'project.a' },
    to: { space: 'agents', kind: 'agent', id: 'agent.1' },
    containment: 'from-contains-to',
  });
});
expectReject('unknown containment orientation is rejected', value => {
  value.frames.at(-1).relations.find(item => item.ref.id === 'team.agent1.containment.1').containment = 'primary';
});

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

  const renderedJudgement = async () => page.evaluate(() => {
    const atlas = window.liveAtlas;
    const adapter = atlas.adapter;
    const svg = document.querySelector('#atlas-world svg');
    const rows = atlas.projection.scene.representations
      .filter(item => item.atlas?.kind === 'judgement-line')
      .sort((a, b) => a.atlas.lineIndex - b.atlas.lineIndex)
      .map(item => {
        const cell = adapter.cellsByRegionId.get(item.regionId);
        const state = cell ? adapter.graph.getView().getState(cell) : null;
        const node = state?.text?.node ?? null;
        const box = node?.getBoundingClientRect?.() ?? null;
        const style = node ? getComputedStyle(node) : null;
        const viewport = document.getElementById('atlas-world').getBoundingClientRect();
        const insideViewport = Boolean(box
          && box.left >= viewport.left - 1
          && box.top >= viewport.top - 1
          && box.right <= viewport.right + 1
          && box.bottom <= viewport.bottom + 1);
        return {
          id: item.regionId,
          text: node?.textContent ?? '',
          box: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null,
          visible: Boolean(node && svg?.contains(node) && box && box.width > 0 && box.height > 0
            && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) !== 0
            && insideViewport),
        };
      });
    return {
      rows,
      text: rows.map(row => row.text).join('\n'),
      visible: rows.length >= 10 && rows.every(row => row.visible && row.text.length > 0),
    };
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

  await clickCell('world:omitted-cycle');
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'agent2.projecta.hidden');
  const omittedDetail = await renderedJudgement();
  check('omitted relation remains recoverable from SVG coverage control',
    omittedDetail.visible && /agent2\.projecta\.hidden/u.test(omittedDetail.text) && /omitted relations 2/u.test(omittedDetail.text), omittedDetail);

  await clickCell('world:omitted-entity-cycle');
  await page.waitForFunction(() => window.liveAtlas.projection.selected.record?.ref?.id === 'agent.hidden');
  const omittedEntityDetail = await renderedJudgement();
  check('omitted entity remains recoverable from SVG coverage control',
    omittedEntityDetail.visible && /agent\.hidden/u.test(omittedEntityDetail.text) && /source-time-unknown/u.test(omittedEntityDetail.text), omittedEntityDetail);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'project-participation', id: 'work.x.project.a' }));
  const contextDiff = await renderedJudgement();
  check('before/after diff includes context-only source meaning change',
    contextDiff.visible && /Diff: changed .*context/u.test(contextDiff.text), contextDiff);

  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'projects', kind: 'project', id: 'project.b' }));
  const presentationOnlyDiff = await renderedJudgement();
  check('presentation-only order change is not reported as meaning change',
    presentationOnlyDiff.visible && /Diff: no selected meaning change/u.test(presentationOnlyDiff.text), presentationOnlyDiff);

  await clickCell('world:control:before');
  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'project-participation', id: 'agent2.projecta.hidden' }));
  await clickCell('world:control:after');
  const visibilityOnlyDiff = await renderedJudgement();
  check('presentation-only relation visibility change is not reported as meaning change',
    visibilityOnlyDiff.visible && /Diff: no selected meaning change/u.test(visibilityOnlyDiff.text), visibilityOnlyDiff);

  await page.evaluate(() => window.liveAtlas.selectRelationRef({ space: 'world-relation', kind: 'serves', id: 'agent1.purposea' }));
  const timeOnlyDiff = await renderedJudgement();
  check('time-only evidence change remains a selected meaning/evidence diff',
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
    missing.frame === 'after' && missingRendered.visible && /missing in after · counterpart exists in before/u.test(missingRendered.text), missing);

  check('routine judgement has no second visible HTML information/control surface',
    await page.locator('#atlas-detail,#atlas-inspector,#atlas-audit,#atlas-search,#atlas-world-toolbar').count() === 0);
  const svgControls = await page.evaluate(() => window.liveAtlas.projection.scene.representations
    .filter(item => item.atlas?.kind === 'control').map(item => item.atlas.control).sort());
  check('Before/After/Fit/Focus/Select/Hand are projected into the SVG surface',
    JSON.stringify(svgControls) === JSON.stringify(['after','before','fit','focus','hand','select']), svgControls);

  await clickCell('world:control:before');
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

  await page.evaluate(() => window.liveAtlas.fit());
  const cameraBeforeFocus = await page.evaluate(() => window.liveAtlas.adapter.camera());
  await clickCell('world:control:focus');
  const cameraAfterFocus = await page.evaluate(() => window.liveAtlas.adapter.camera());
  check('focus control is functional', JSON.stringify(cameraBeforeFocus) !== JSON.stringify(cameraAfterFocus));

  await page.locator('#atlas-world').press('0');
  const cameraAfterReturn = await page.evaluate(() => window.liveAtlas.adapter.camera());
  const returnedJudgement = await renderedJudgement();
  const returnedControls = await page.evaluate(() => {
    const adapter = window.liveAtlas.adapter;
    const viewport = document.getElementById('atlas-world').getBoundingClientRect();
    return ['before','after','fit','focus','select','hand'].map(id => {
      const cell = adapter.cellsByRegionId.get('world:control:' + id);
      const state = cell ? adapter.graph.getView().getState(cell) : null;
      const node = state?.text?.node ?? null;
      const box = node?.getBoundingClientRect?.() ?? null;
      return { id, visible: Boolean(box && box.left >= viewport.left - 1 && box.right <= viewport.right + 1
        && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1) };
    });
  });
  check('keyboard Fit returns from Focus to the same SVG judgement surface',
    JSON.stringify(cameraAfterReturn) !== JSON.stringify(cameraAfterFocus)
      && returnedJudgement.visible
      && returnedControls.every(item => item.visible),
    { cameraBeforeFocus, cameraAfterFocus, cameraAfterReturn, returnedJudgement, returnedControls });

  await clickCell('world:control:after');
  await page.evaluate(() => window.liveAtlas.selectRef({ space: 'agents', kind: 'agent', id: 'agent.1' }));
  await page.evaluate(() => window.liveAtlas.setSession({
    input: window.liveAtlas.input,
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
    input: window.liveAtlas.input,
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
    input: window.liveAtlas.input,
    mode: 'live',
    connected: false,
    latest: false,
  }));
  const disconnectedHistory = await renderedJudgement();
  check('historical frame keeps its time-bounded declared activity while live transport is disconnected',
    disconnectedHistory.visible
      && /Activity: NOW · declared=NOW · transport=HISTORY snapshot/u.test(disconnectedHistory.text),
    disconnectedHistory);

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
