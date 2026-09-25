// The public embed must draw a canonical DecisionLog that carries layout
// records from PinRegions: pinned regions at their stored bounds, everything
// else still laid out automatically, edges still directed, and the embed still
// read-only. Before this proof the same log could not render at all - the
// authoring entry handed layout records to createSemanticMap, which accepts
// only meta, region and relation, so the embed reported "unknown record type".
//
// A no-throw is not a pass. The pinned bounds here are deliberately far from
// where automatic layout puts that region, and the proof fails if the drawn
// geometry matches the automatic position instead of the stored one.
//
//   node tests/embed_layout_pin_browser_e2e.mjs
//
// Needs a Chromium for Playwright; PLAYWRIGHT_BROWSERS_PATH may point at it.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const packagesRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
}));

const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>embed layout pin proof</title></head>
<body><div id="surface" style="width:1000px;height:700px"></div></body></html>`;

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/' || pathname === '/host.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(HOST_PAGE);
    return;
  }
  const resolved = path.resolve(packagesRoot, `.${pathname}`);
  if (!resolved.startsWith(`${packagesRoot}${path.sep}`)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let body;
  try {
    body = fs.readFileSync(resolved);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES.get(path.extname(resolved)) ?? 'application/octet-stream',
    'content-length': body.byteLength,
    'cache-control': 'no-store',
  });
  response.end(body);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const fail = (message, detail) => {
  console.log(JSON.stringify({
    schema: 'semantic-map-embed-layout-pin-browser-e2e/1',
    status: 'FAIL',
    failure: message,
    detail: detail ?? null,
  }));
  process.exitCode = 1;
};

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${origin}/host.html`, { waitUntil: 'domcontentloaded' });

  const observed = await page.evaluate(async () => {
    const protocol = await import('/semantic-map/protocol/index.js');
    const runtime = await import('/semantic-map/runtime.js');

    const node = (id, x) => ({
      type: 'region', id, parent: 'root', label: id, kind: 'node',
      bounds: [x, 90, 140, 64], summary: '',
    });
    const records = [
      { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'pin proof' },
      { type: 'region', id: 'root', parent: null, label: 'pin proof', kind: 'boundary', bounds: [0, 0, 720, 260], summary: '' },
      node('node-a', 40), node('node-b', 250), node('node-c', 460),
    ];
    // Deliberately far from where automatic layout puts node-c, and a
    // different size, so a drawn cell cannot be mistaken for the automatic
    // one. A second pin is put far outside the canvas: the projector leaves a
    // region it cannot place out of the scene, and that must not throw.
    const PINNED = [600, 400, 140, 64];
    const OFF_CANVAS = [40000, 40000, 140, 64];

    const base = await protocol.createDecisionLog(records, 'pin-proof');
    const edge = await protocol.createDecision(base.head, [{
      type: 'ConnectRegions', relationId: 'r-a-b', from: 'node-a', to: 'node-b', kind: 'flow', label: '',
    }], base.records);
    const withEdge = await protocol.appendDecision(base.log, edge.decision);
    const pin = await protocol.createDecision(withEdge.head, [{
      type: 'PinRegions', items: [{ regionId: 'node-c', bounds: PINNED }],
    }], withEdge.records);
    const pinned = await protocol.appendDecision(withEdge.log, pin.decision);
    const offPin = await protocol.createDecision(withEdge.head, [{
      type: 'PinRegions', items: [{ regionId: 'node-c', bounds: OFF_CANVAS }],
    }], withEdge.records);
    const offCanvas = await protocol.appendDecision(withEdge.log, offPin.decision);

    const draw = async (graph, id) => {
      const mount = document.createElement('div');
      mount.id = id;
      mount.style.cssText = 'width:1000px;height:700px';
      document.body.append(mount);
      const envelope = await protocol.createEnvelope(graph.log, null, { pattern: 'graph/1' });
      let error = null;
      try {
        await runtime.executeArtifactPackage({ document, input: { envelope }, surfaceMount: mount });
      } catch (thrown) {
        error = String(thrown?.message ?? thrown);
      }
      const frame = mount.querySelector('iframe[data-package="semantic-map"]');
      const site = frame?.contentWindow?.semanticMapSite ?? null;
      if (error !== null) return { error, siteError: site?.error ?? null };
      const started = performance.now();
      while (frame.contentWindow?.semanticMapSite?.ready !== true) {
        if (frame.contentWindow?.semanticMapSite?.ready === false) {
          return { error: frame.contentWindow.semanticMapSite.error ?? 'site not ready' };
        }
        if (performance.now() - started > 60000) return { error: 'ready timeout' };
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const win = frame.contentWindow;
      const adapter = win.semanticMapApp.adapter;
      const geometry = regionId => {
        const value = adapter.cellsByRegionId.get(regionId)?.getGeometry?.();
        return value ? { x: value.x, y: value.y, w: value.width, h: value.height } : null;
      };
      const svg = frame.contentDocument.querySelector('#graph-container svg');
      const box = svg?.getBoundingClientRect();
      return {
        error: null,
        frame,
        cells: Object.fromEntries(['node-a', 'node-b', 'node-c'].map(id => [id, geometry(id)])),
        edges: [...adapter.edgesByProjectionKey.values()].map(item => `${item.semantic.from}->${item.semantic.to}`),
        drawn: Boolean(box && box.width > 0 && box.height > 0),
        pattern: win.semanticMapRuntime.view.pattern,
        reviewAccept: (() => {
          const button = frame.contentDocument.querySelector('#review-accept');
          return button ? { present: true, disabled: button.disabled } : { present: false };
        })(),
      };
    };

    const auto = await draw(withEdge, 'auto');
    const withPins = await draw(pinned, 'pinned');
    const offScreen = await draw(offCanvas, 'off-canvas');

    // The public layout contract must answer with the same positions this
    // embed actually drew. It is what a consumer places things against, so a
    // number that drifts from the screen would send it somewhere wrong.
    const bounds = await import('/semantic-map/protocol/index.js');
    const contract = {
      auto: bounds.layoutBoundsFor((await protocol.verifyDecisionLog(withEdge.log)).records, { pattern: 'graph/1' }),
      pinned: bounds.layoutBoundsFor((await protocol.verifyDecisionLog(pinned.log)).records, { pattern: 'graph/1' }),
    };

    // The embed must stay read-only: the host cannot replace this input, so the
    // provider's own lock must refuse an operation and an accept.
    const refusal = kind => {
      const site = withPins.frame?.contentWindow?.semanticMapSite;
      if (!site) return 'no site';
      try {
        if (kind === 'operation') site.editor.adapter.operationHandler?.({ type: 'MoveRegions', regionIds: ['node-c'], dx: 10, dy: 10 });
        else site.runtime.accept();
        return 'accepted';
      } catch (error) {
        return `refused: ${String(error?.message ?? error)}`;
      }
    };
    const inert = { operation: refusal('operation'), accept: refusal('accept') };
    const geometryAfterRefusal = withPins.error === null
      ? (() => {
        const adapter = withPins.frame.contentWindow.semanticMapApp.adapter;
        const value = adapter.cellsByRegionId.get('node-c')?.getGeometry?.();
        return value ? { x: value.x, y: value.y, w: value.width, h: value.height } : null;
      })()
      : null;

    const stripFrame = ({ frame, ...rest }) => rest;
    return {
      contract,
      pinnedBounds: PINNED,
      offCanvasBounds: OFF_CANVAS,
      offCanvas: stripFrame(offScreen),
      logLines: pinned.log.split('\n').length - 1,
      layoutRecords: (await protocol.verifyDecisionLog(pinned.log)).records.filter(record => record.type === 'layout'),
      auto: stripFrame(auto),
      pinned: stripFrame(withPins),
      inert,
      geometryAfterRefusal,
      storage: localStorage.length,
      logUnchanged: pinned.log === (await protocol.verifyDecisionLog(pinned.log)).log,
    };
  });

  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail: detail ?? null });

  check('the log carries one layout record from PinRegions',
    observed.layoutRecords.length === 1 && observed.layoutRecords[0].regionId === 'node-c',
    observed.layoutRecords);
  check('a log without pins still renders', observed.auto.error === null, observed.auto.error);
  check('a log with pins renders at all', observed.pinned.error === null, observed.pinned.error);

  if (observed.pinned.error === null && observed.auto.error === null) {
    const [x, y, w, h] = observed.pinnedBounds;
    const pinnedCell = observed.pinned.cells['node-c'];
    const autoCell = observed.auto.cells['node-c'];
    check('the pinned region is drawn at its stored bounds',
      pinnedCell !== null && pinnedCell.x === x && pinnedCell.y === y && pinnedCell.w === w && pinnedCell.h === h,
      { stored: observed.pinnedBounds, drawn: pinnedCell });
    check('that is not where automatic layout put it',
      autoCell !== null && (autoCell.x !== x || autoCell.y !== y),
      { auto: autoCell, pinned: pinnedCell });
    check('regions without a pin keep their automatic layout',
      ['node-a', 'node-b'].every(id => JSON.stringify(observed.pinned.cells[id]) === JSON.stringify(observed.auto.cells[id])),
      { auto: observed.auto.cells, pinned: observed.pinned.cells });
    check('the edge is still drawn, and still from a to b',
      JSON.stringify(observed.pinned.edges) === JSON.stringify(['node-a->node-b']),
      observed.pinned.edges);
    check('the graph is actually drawn', observed.pinned.drawn === true && observed.pinned.pattern === 'graph/1',
      { drawn: observed.pinned.drawn, pattern: observed.pinned.pattern });
    check('the embed stays read-only',
      observed.inert.operation.startsWith('refused:') && observed.inert.accept.startsWith('refused:')
        && observed.pinned.reviewAccept.present === true && observed.pinned.reviewAccept.disabled === true,
      { ...observed.inert, reviewAccept: observed.pinned.reviewAccept });
    check('a refused edit moves nothing',
      JSON.stringify(observed.geometryAfterRefusal) === JSON.stringify(pinnedCell),
      { before: pinnedCell, after: observed.geometryAfterRefusal });
  }

  // Contract parity: same canonical log, same numbers as the screen.
  const sameCell = (drawn, tuple) => drawn !== null && tuple !== undefined
    && drawn.x === tuple[0] && drawn.y === tuple[1] && drawn.w === tuple[2] && drawn.h === tuple[3];
  for (const [label, rendered] of [['without pins', 'auto'], ['with a pin', 'pinned']]) {
    const drawnCells = observed[rendered].cells;
    const reported = observed.contract[rendered];
    check(`the layout contract reports what the embed drew ${label}`,
      observed[rendered].error === null
        && reported.pattern === 'graph/1'
        && ['node-a', 'node-b', 'node-c'].every(id => sameCell(drawnCells[id], reported.bounds[id])),
      { drawn: drawnCells, reported: reported.bounds });
  }
  check('the contract names the pinned region, and only when it is pinned',
    JSON.stringify(observed.contract.auto.pinned) === '[]'
      && JSON.stringify(observed.contract.pinned.pinned) === '["node-c"]',
    { auto: observed.contract.auto.pinned, pinned: observed.contract.pinned.pinned });

  check('a pin the view cannot place does not throw',
    observed.offCanvas.error === null, observed.offCanvas.error);
  check('and the rest of that graph is still drawn',
    observed.offCanvas.error === null
      && JSON.stringify(observed.offCanvas.edges) === JSON.stringify(['node-a->node-b'])
      && observed.offCanvas.cells['node-a'] !== null && observed.offCanvas.cells['node-b'] !== null,
    { cells: observed.offCanvas.cells, edges: observed.offCanvas.edges });

  check('nothing was written to storage', observed.storage === 0, observed.storage);
  check('the log itself is unchanged', observed.logUnchanged === true);
  check('the page raised no error', pageErrors.length === 0, pageErrors);

  const failed = checks.filter(item => !item.ok);
  if (failed.length > 0) {
    fail('embed layout pin proof failed', failed);
  } else {
    console.log(JSON.stringify({
      schema: 'semantic-map-embed-layout-pin-browser-e2e/1',
      status: 'PASS',
      pinnedBounds: observed.pinnedBounds,
      drawn: observed.pinned.cells,
      automatic: observed.auto.cells,
      edges: observed.pinned.edges,
      inert: observed.inert,
      checks: checks.length,
    }));
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
