// Browser behavior proof for a2 relation selection.
// Proves read-only relations stay immutable while becoming inspectable,
// aggregate edges preserve every relation id, and selection survives rerender.
//
// Run inside the existing semantic-map-browser-proof Nix shell:
//   node packages/semantic-map/tests/read_only_relation_selection_browser_e2e.mjs

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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

const packagesRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const pageSource = '<!doctype html><html><body style="margin:0">'
  + '<div id="surface" style="position:relative;width:1000px;height:640px"></div>'
  + '</body></html>';

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/' || pathname === '/host.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(pageSource);
    return;
  }
  const resolved = path.resolve(packagesRoot, `.${pathname}`);
  if (!resolved.startsWith(`${packagesRoot}${path.sep}`)) {
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
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${origin}/host.html`, { waitUntil: 'domcontentloaded' });

  await page.evaluate(async () => {
    const { createMaxGraphAdapter } = await import('/semantic-map/renderer-maxgraph/adapter.js');
    const surface = document.querySelector('#surface');
    const adapter = createMaxGraphAdapter(surface);
    const operations = [];
    const selections = [];
    adapter.setOperationHandler(operation => {
      operations.push(structuredClone(operation));
      return null;
    });
    adapter.onSelectionChange(selection => selections.push(structuredClone(selection)));
    adapter.setTool('select');

    const node = (id, x, y) => ({
      regionId: id,
      label: id.toUpperCase(),
      bounds: { x, y, width: 140, height: 72 },
      kind: 'node',
      depth: 1,
      shape: 'graph-node',
      readOnly: false,
      geometryEditable: true,
      labelEditable: true,
    });
    const relation = (relationIds, from, to, readOnly, label) => ({
      relationIds,
      from,
      to,
      kind: 'relation',
      label,
      directed: true,
      readOnly,
    });
    const scene = {
      pattern: 'graph/1',
      scale: 1,
      resourceComposition: null,
      selectionProxies: {},
      representations: [
        node('a', 70, 80),
        node('b', 430, 60),
        node('c', 430, 360),
        node('d', 760, 360),
      ],
      relations: [
        relation(['ro-single'], 'a', 'b', true, 'read-only singleton'),
        relation(['agg-a', 'agg-b'], 'b', 'c', true, 'read-only aggregate'),
        relation(['edit-one'], 'a', 'c', false, 'editable singleton'),
        relation(['edit-agg-a', 'edit-agg-b'], 'c', 'd', false, 'non-read-only aggregate'),
      ],
    };
    adapter.render(scene);

    const edgeFor = relationId => adapter.edgeByRelationId.get(relationId) ?? null;
    const clickPoint = relationId => {
      const edge = edgeFor(relationId);
      if (!edge) throw new Error(`missing rendered edge ${relationId}`);
      const state = adapter.graph.getView().getState(edge);
      const points = (state?.absolutePoints ?? []).filter(Boolean);
      if (points.length < 2) throw new Error(`edge ${relationId} has no hit geometry`);
      const first = points[0], last = points.at(-1);
      const box = surface.getBoundingClientRect();
      return { x: box.left + (first.x + last.x) / 2, y: box.top + (first.y + last.y) / 2 };
    };

    globalThis.relationSelectionProof = {
      adapter,
      operations,
      selections,
      scene,
      clickPoint,
      snapshot: () => structuredClone(adapter.selectionSnapshot()),
      camera: () => structuredClone(adapter.camera()),
      selectedEdgeIds: () => adapter.graph.getSelectionCells()
        .filter(cell => cell.semantic?.type === 'relation')
        .map(cell => [...cell.semantic.relationIds]),
    };
  });

  const point = async id => page.evaluate(id => globalThis.relationSelectionProof.clickPoint(id), id);

  // 1. Real click selects a read-only singleton relation.
  let at = await point('ro-single');
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(20);
  same(await page.evaluate(() => globalThis.relationSelectionProof.snapshot()), { regionIds: [], relationIds: ['ro-single'] },
    'read-only singleton click selection');

  // 2. Real click on one aggregate edge returns every represented relation id.
  at = await point('agg-a');
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(20);
  same(await page.evaluate(() => globalThis.relationSelectionProof.snapshot()), { regionIds: [], relationIds: ['agg-a', 'agg-b'] },
    'aggregate click preserves all relation ids');

  // 3. A single relation id can programmatically reach the aggregate edge and survive rerender.
  const aggregate = await page.evaluate(() => {
    const proof = globalThis.relationSelectionProof;
    proof.adapter.setSelection({ relationIds: ['agg-b'] });
    const before = proof.snapshot();
    const selectedBefore = proof.selectedEdgeIds();
    proof.adapter.render(proof.scene);
    return {
      before,
      after: proof.snapshot(),
      selectedBefore,
      selectedAfter: proof.selectedEdgeIds(),
    };
  });
  same(aggregate.before, { regionIds: [], relationIds: ['agg-b'] }, 'individual aggregate id selection');
  same(aggregate.after, aggregate.before, 'aggregate id rerender restore');
  same(aggregate.selectedBefore, [['agg-a', 'agg-b']], 'aggregate edge reached before rerender');
  same(aggregate.selectedAfter, aggregate.selectedBefore, 'aggregate edge reached after rerender');

  // 4. Read-only selection cannot produce remove operations; editable relation behavior stays intact.
  const mutation = await page.evaluate(() => {
    const proof = globalThis.relationSelectionProof;
    proof.adapter.setSelection({ relationIds: ['agg-b'] });
    const before = proof.operations.length;
    const readOnlyDelete = proof.adapter.deleteSelection();
    const afterReadOnly = proof.operations.length;
    proof.adapter.setSelection({ relationIds: ['edit-agg-a'] });
    const beforeEditableAggregate = proof.operations.length;
    const editableAggregateDelete = proof.adapter.deleteSelection();
    const afterEditableAggregate = proof.operations.length;
    proof.adapter.setSelection({ relationIds: ['edit-one'] });
    const editableDelete = proof.adapter.deleteSelection();
    return {
      before,
      afterReadOnly,
      readOnlyDelete,
      beforeEditableAggregate,
      afterEditableAggregate,
      editableAggregateDelete,
      editableDelete,
      operations: structuredClone(proof.operations),
    };
  });
  if (mutation.readOnlyDelete !== null || mutation.afterReadOnly !== mutation.before) {
    throw new Error(`read-only relation emitted a mutation: ${JSON.stringify(mutation)}`);
  }
  if (mutation.editableAggregateDelete !== null || mutation.afterEditableAggregate !== mutation.beforeEditableAggregate) {
    throw new Error(`non-read-only aggregate relation emitted a mutation: ${JSON.stringify(mutation)}`);
  }
  same(mutation.operations.at(-1), {
    type: 'RemoveSelection',
    regionIds: [],
    relationIds: ['edit-one'],
  }, 'editable singleton relation remove operation');

  // 5. Removed and unsupported relation ids are pruned without camera movement.
  const stale = await page.evaluate(() => {
    const proof = globalThis.relationSelectionProof;
    proof.adapter.setSelection({ relationIds: ['ro-single'] });
    const beforeCamera = proof.camera();
    const next = { ...proof.scene, relations: proof.scene.relations.filter(item => !item.relationIds.includes('ro-single')) };
    proof.adapter.render(next);
    const afterRemoval = proof.snapshot();
    const afterCamera = proof.camera();
    proof.adapter.setSelection({ relationIds: ['unsupported-id'] });
    return {
      afterRemoval,
      unsupported: proof.snapshot(),
      beforeCamera,
      afterCamera,
      graphSelectionCount: proof.adapter.graph.getSelectionCells().length,
    };
  });
  same(stale.afterRemoval, { regionIds: [], relationIds: [] }, 'removed relation selection pruning');
  same(stale.unsupported, { regionIds: [], relationIds: [] }, 'unsupported relation selection pruning');
  same(stale.afterCamera, stale.beforeCamera, 'relation selection must not move camera');
  if (stale.graphSelectionCount !== 0) throw new Error('removed/unsupported relation left a selected graph cell');

  // 6. Render-owned IDs distinguish equal labels, including read-only shapes,
  // and remain correct across camera/label refresh and removal/recreation.
  const identity = await page.evaluate(() => {
    const proof = globalThis.relationSelectionProof;
    const beforeOperations = proof.operations.length;
    const scene = { ...proof.scene, representations: proof.scene.representations.map(item =>
      ({ ...item, label: 'Same label', readOnly: true })) };
    const snapshot = () => ({
      regions: [...document.querySelectorAll('[data-semantic-region-id]')].map(node => ({
        id: node.getAttribute('data-semantic-region-id'), role: node.getAttribute('data-semantic-role'),
        text: node.textContent, width: node.getBoundingClientRect().width,
      })).sort((a, b) => (a.id + a.role).localeCompare(b.id + b.role)),
      edges: [...document.querySelectorAll('[data-semantic-relation-ids][data-semantic-role="shape"]')]
        .map(node => JSON.parse(node.getAttribute('data-semantic-relation-ids'))).sort((a, b) => a[0].localeCompare(b[0])),
    });
    proof.adapter.render(scene);
    const first = snapshot();
    proof.adapter.setCamera(0.75, 10, 12);
    proof.adapter.refreshRenderedLabels();
    const moved = snapshot();
    proof.adapter.render({ ...scene, representations: scene.representations.filter(item => item.regionId !== 'd'),
      relations: scene.relations.filter(item => item.from !== 'd' && item.to !== 'd') });
    const removed = snapshot();
    proof.adapter.render(scene);
    return { first, moved, removed, recreated: snapshot(), operations: proof.operations.length - beforeOperations };
  });
  const expectedIds = ['a', 'b', 'c', 'd'].flatMap(id => ['shape', 'text'].map(role => ({ id, role })))
    .sort((a, b) => (a.id + a.role).localeCompare(b.id + b.role));
  for (const snapshot of [identity.first, identity.moved, identity.recreated]) {
    same(snapshot.regions.map(({ id, role }) => ({ id, role })), expectedIds, 'per-ID shape and label cardinality');
    if (snapshot.regions.some(row => !(row.width > 0) || row.role === 'text' && row.text !== 'Same label'))
      throw new Error('rendered duplicate-label identity lost its actual shape/text');
    same(snapshot.edges, [['agg-a', 'agg-b'], ['edit-agg-a', 'edit-agg-b'], ['edit-one'], ['ro-single']],
      'every aggregate edge retains its full semantic identities');
  }
  if (identity.removed.regions.some(row => row.id === 'd') || identity.removed.edges.some(ids => ids.includes('edit-agg-a')))
    throw new Error('removed painted nodes left stale semantic identity');
  same(identity.operations, 0, 'identity inspection and read-only rerender emit no operations');

  // 7. Boundary titles retain whole glyph ascenders at fixed screen font
  // sizes. The old tight label clip cut their top even inside the boundary.
  const titles = await page.evaluate(() => {
    const proof = globalThis.relationSelectionProof, result = [];
    for (const scale of [1, 0.75]) {
      proof.adapter.setCamera(scale, 0, 0);
      proof.adapter.render({ ...proof.scene, relations: [], representations: [{ ...proof.scene.representations[0],
        regionId: 'title-boundary', shape: 'boundary', label: '配布領域Ág', readOnly: true,
        bounds: { x: 40, y: 40, width: 360, height: 220 } }] });
      const label = document.querySelector('[data-semantic-region-id="title-boundary"][data-semantic-role="text"] text');
      const shape = document.querySelector('[data-semantic-region-id="title-boundary"][data-semantic-role="shape"]').firstElementChild;
      const box = label.getBBox(), matrix = label.getScreenCTM(), boundary = shape.getBoundingClientRect();
      const glyph = { x: box.x * matrix.a + matrix.e, y: box.y * matrix.d + matrix.f,
        width: box.width * matrix.a, height: box.height * matrix.d };
      let nativeClip = false;
      for (let node = label; node?.namespaceURI === 'http://www.w3.org/2000/svg'; node = node.parentElement)
        if (getComputedStyle(node).clipPath !== 'none') nativeClip = true;
      result.push({ scale, nativeClip, whole: glyph.width > 0 && glyph.height > 0 && glyph.x >= boundary.x && glyph.y >= boundary.y
        && glyph.x + glyph.width <= boundary.right && glyph.y + glyph.height <= boundary.bottom });
    }
    return result;
  });
  if (titles.length !== 2 || titles.some(title => title.nativeClip || !title.whole))
    throw new Error('whole boundary title glyphs clipped or outside actual boundary: ' + JSON.stringify(titles));

  if (errors.length) throw new Error(`browser page errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({
    schema: 'semantic-map-read-only-relation-selection-browser-e2e/1',
    status: 'PASS',
    checks: 27,
  }));
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
