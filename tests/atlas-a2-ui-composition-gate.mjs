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


  // Issue / Package witnesses use the public SVG, not a second renderer.
  await page.evaluate(() => window.liveAtlas.setSession({
    input: window.liveAtlas.input, mode: 'sample', connected: false, latest: true,
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

  check('new records remain synthetic proposals with unknown observation time',
    parsedWorldInput.authority === false && parsedWorldInput.frames.every(frame => {
      const records = [...frame.entities, ...frame.relations].filter(item => item.ref.space.startsWith('example-'));
      return records.length === 16 && records.every(item => item.source?.kind === 'synthetic'
        && item.flags.includes('synthetic') && item.flags.includes('proposal')
        && item.time.observedAt === null && item.time.acquiredAt === null && item.time.effectiveAt === null);
    }));
  check('two qualified Issues retain identity with two or zero supplied Work links',
    example.issueA && example.issueB && entityKey(example.issueA.ref) !== entityKey(example.issueB.ref)
      && parsedWorldInput.frames.every(frame => {
        const tracks = frame.relations.filter(item => item.ref.space === 'example-relations' && item.kind === 'tracks');
        return tracks.length === 2 && tracks.every(item => !item.path && item.containment === null
          && entityKey(item.to) === entityKey(example.issueA.ref))
          && frame.entities.filter(item => item.ref.kind === 'project').length === 2;
      }));

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
      check('B relation selection does not claim that source-origin Direction traversed B',
        /Selected relation · example-relations\/addresses\/pkg-a.issue-b/u.test(relationDetail.text)
          && /basis=scope-b/u.test(relationDetail.text)
          && /Direction: Package A → Issue A → Purpose A → Company purpose/u.test(relationDetail.text),
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
        && /Diff: changed from, context, source/u.test(detail.text) && !/missing in/u.test(detail.text),
      { selected, detail });
  }

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
