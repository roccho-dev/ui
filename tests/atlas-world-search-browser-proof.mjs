// Supplied-data World search journey proof.
// One app-generated World -> existing app build -> real Chromium:
// query -> qualified result -> existing SVG Record Context, plus the
// displayed-frame, zero-result and typing/clear selection/camera guards.
// The oracle comes from the supplying fixture, never from rendered UI.
// Supplied meaning stays candidate / declared-not-verified.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { entityKey, relationKey } from '../packages/control/src/atlas-world.mjs';
import { proofScratch } from './fixtures/proof-scratch.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
for (const name of ['input', 'fixture', 'out']) if (!args[name]) throw new Error('--' + name + ' is required');

const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
const fontConfig = process.env.FONTCONFIG_FILE;
if (!driverRoot || !path.isAbsolute(driverRoot) || !browsersRoot || !path.isAbsolute(browsersRoot)
  || !fontConfig || !path.isAbsolute(fontConfig) || !fs.existsSync(fontConfig)) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

// Oracle: the last supplied frame's first declared Scope, as the supplying
// adapter declares it (relation 'scope:<id>' in the current_ref space).
const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
const oracleFor = frame => {
  const semantic = frame.semantic;
  const scope = semantic.partition[0];
  return {
    frameId: frame.id,
    key: relationKey({ space: semantic.comparison.current_ref.space, kind: 'declared-relation', id: 'scope:' + scope.id }),
    owner: [scope.owner_role, scope.owner_actor],
    criteria: Object.values(scope.criteria).flat(),
    evidence: scope.required_evidence,
    residual: semantic.observation.purpose_evaluation.residual,
  };
};
const after = oracleFor(fixture.frames.at(-1));
const before = oracleFor(fixture.frames[0]);
const term = after.evidence[0];
const typed = [...term].map((char, index) => index % 2 ? char.toUpperCase() : char).join('');
const world = JSON.parse(fs.readFileSync(args.input, 'utf8'));
const recordText = (frameId, key) => {
  const frame = world.frames.find(item => item.id === frameId);
  const row = frame?.relations.find(item => relationKey(item.ref) === key)
    ?? frame?.entities.find(item => entityKey(item.ref) === key);
  return row ? JSON.stringify(row).toLowerCase() : null;
};
// Frame discriminator from the fixture: After's residual exists only in After.
// Expected keys come from the supplied World rows, not from the UI search.
const frameTerm = after.residual[0];
const suppliedKeys = (frameId, value) => {
  const frame = world.frames.find(item => item.id === frameId);
  return [...frame.entities.map(row => [entityKey(row.ref), row]), ...frame.relations.map(row => [relationKey(row.ref), row])]
    .filter(([, row]) => JSON.stringify(row).toLowerCase().includes(value.toLowerCase())).map(([key]) => key).sort();
};
const expectedBefore = suppliedKeys(before.frameId, frameTerm);
const expectedAfter = suppliedKeys(after.frameId, frameTerm);

// The browser's temporary files sit under --out, never the system temp
// directory, and are removed at the end; the page is built in <out>/page.
const { done } = proofScratch(args.out);
const receipt = await buildLiveAtlas({ input: args.input, out: path.join(args.out, 'page'), consumer: 'app' });
const output = path.resolve(args.out, 'page');
const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname !== '/' && pathname !== '/index.html') { response.writeHead(404).end('not found'); return; }
  const body = fs.readFileSync(path.join(output, 'index.html'));
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
  check('same app artifact loads the World screen', response?.status() === 200
    && await page.evaluate(() => window.liveAtlas?.page?.kind) === 'world', receipt);

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
  const state = () => page.evaluate(() => ({
    selected: window.liveAtlas.page.selected,
    camera: JSON.stringify(window.liveAtlas.adapter.camera()),
    side: window.liveAtlas.page.side,
    options: [...document.querySelectorAll('#atlas-world-search-results option')].map(option => option.value).filter(Boolean),
    status: document.getElementById('atlas-world-search-count').textContent,
  }));
  // Read the Record tab from the drawn SVG rows across its actual pages.
  const renderedRecord = async () => {
    await clickCell('world:detail:record');
    let current = await page.evaluate(() => window.liveAtlas.projection.detail.page);
    while (current-- > 0) await clickCell('world:detail:previous');
    const total = await page.evaluate(() => window.liveAtlas.projection.detail.pageCount);
    const lines = new Map();
    for (let number = 0; number < total; number += 1) {
      const rows = await page.evaluate(() => {
        const atlas = window.liveAtlas, adapter = atlas.adapter;
        const svg = document.querySelector('#atlas-world svg');
        return atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'judgement-line').map(item => {
          const cell = adapter.cellsByRegionId.get(item.regionId);
          const node = cell ? adapter.graph.getView().getState(cell)?.text?.node ?? null : null;
          return { lineIndex: item.atlas.lineIndex, text: node && svg?.contains(node) ? node.textContent : '' };
        });
      });
      for (const row of rows) lines.set(row.lineIndex, (lines.get(row.lineIndex) ?? '') + JSON.parse(row.text));
      if (number + 1 < total) await clickCell('world:detail:next');
    }
    const text = [...lines.keys()].sort((a, b) => a - b).map(key => lines.get(key)).join('\n');
    const expected = await page.evaluate(() => window.liveAtlas.projection.detail.logicalLines.join('\n'));
    return { text, complete: text === expected, pages: total };
  };
  const contextOf = text => text.split('\n').find(line => line.startsWith('Context: ')) ?? '';
  const residualShown = (context, residual) => context.includes('"residual":' + JSON.stringify(residual));
  const readsSupplied = (text, oracle) => {
    const context = contextOf(text);
    return { context: context.length, owner: oracle.owner.every(value => context.includes(value)),
      criteria: oracle.criteria.every(value => context.includes(value)),
      evidence: oracle.evidence.every(value => context.includes(value)),
      residual: residualShown(context, oracle.residual) };
  };

  // Journey: type the fixture term (mixed case) into the existing bar.
  const start = await state();
  await page.locator('#atlas-world-search').pressSequentially(typed);
  const typedState = await state();
  check('typing keeps qualified selection and camera', typedState.selected === start.selected && typedState.camera === start.camera,
    { start, typedState });
  check('displayed After results include the expected qualified key', typedState.options.includes(after.key), typedState);
  check('every After result record contains the term (case-folded)',
    typedState.options.length > 0 && typedState.options.every(key => recordText(after.frameId, key)?.includes(term.toLowerCase())),
    typedState.options);
  check('status names the displayed After frame', typedState.status.includes('After · ' + after.frameId), typedState.status);

  // Choose the qualified result; read the existing Record Context.
  await page.locator('#atlas-world-search-results').selectOption(after.key);
  const chosen = await state();
  check('choosing the result selects that qualified key', chosen.selected === after.key, chosen);
  const afterRecord = await renderedRecord();
  const afterRead = readsSupplied(afterRecord.text, after);
  check('existing Record Context shows supplied owner, criteria, evidence and residual (After)',
    afterRecord.complete && afterRead.context > 0 && afterRead.owner && afterRead.criteria && afterRead.evidence && afterRead.residual,
    { afterRead, pages: afterRecord.pages, complete: afterRecord.complete });

  // Displayed-frame guard: Before shows Before's supplied record.
  await clickCell('world:control:before');
  const beforeState = await state();
  check('Before results come from the displayed Before frame', beforeState.side === 'before'
    && beforeState.status.includes('Before · ' + before.frameId) && beforeState.options.includes(before.key)
    && beforeState.options.every(key => recordText(before.frameId, key)?.includes(term.toLowerCase())), beforeState);
  const beforeRecord = await renderedRecord();
  const beforeRead = readsSupplied(beforeRecord.text, before);
  check('Before Record shows the Before residual, not the After residual',
    beforeRecord.complete && beforeRead.residual && !residualShown(contextOf(beforeRecord.text), after.residual),
    { beforeRead, beforeResidual: before.residual, afterResidual: after.residual });

  // Frame discriminator: an After-only supplied term finds nothing while
  // Before is displayed, then exactly the supplied After keys after switching.
  check('input precondition: frame term absent from Before rows, present in After rows',
    expectedBefore.length === 0 && expectedAfter.length > 0 && expectedAfter.includes(after.key),
    { frameTerm, expectedBefore, expectedAfter });
  await page.locator('#atlas-world-search').fill('');
  const beforeSettled = await state();
  await page.locator('#atlas-world-search').pressSequentially(frameTerm);
  const beforeOnly = await state();
  check('Before-displayed search for the After-only term gives 0 results', beforeOnly.side === 'before'
    && beforeOnly.options.length === 0 && beforeOnly.status.startsWith('0 results in supplied Before · ' + before.frameId)
    && beforeOnly.selected === beforeSettled.selected && beforeOnly.camera === beforeSettled.camera, { beforeSettled, beforeOnly });
  await clickCell('world:control:after');
  const afterOnly = await state();
  check('After-displayed search for the same term gives exactly the supplied After keys', afterOnly.side === 'after'
    && afterOnly.status.startsWith(expectedAfter.length + ' results in supplied After · ' + after.frameId)
    && JSON.stringify([...afterOnly.options].sort()) === JSON.stringify(expectedAfter), { expectedAfter, afterOnly });
  await clickCell('world:control:after');

  // Zero and clear guards: no unintended selection or camera change.
  const settled = await state();
  await page.locator('#atlas-world-search').fill('');
  await page.locator('#atlas-world-search').pressSequentially('__not-a-supplied-term__');
  const zero = await state();
  check('zero results keep selection and camera', zero.options.length === 0 && zero.status.startsWith('0 results')
    && zero.selected === settled.selected && zero.camera === settled.camera, { settled, zero });
  await page.locator('#atlas-world-search').fill('');
  const cleared = await state();
  check('clearing keeps selection and camera', cleared.options.length > 0
    && cleared.selected === settled.selected && cleared.camera === settled.camera, { settled, cleared });
  check('no browser page/console errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors });
} catch (error) {
  interruption = { name: error.name, message: error.message, stack: error.stack };
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  done();
}

const failed = checks.filter(item => !item.pass);
const result = {
  schema: 'atlas-world-search-browser-proof/1',
  status: !interruption && checks.length && !failed.length ? 'PASS' : 'FAIL',
  semantic_truth: 'supplied / declared-not-verified',
  input: receipt.input, output: receipt.output, frames: receipt.frames,
  oracle: { fixture: args.fixture, term, typed, after, before, frameTerm, expectedBefore, expectedAfter },
  checks, failed, interruption,
};
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
