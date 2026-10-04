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
import { createRequire } from 'node:module';

// The repository's locked Nix shell provides one explicit driver and its
// matching browsers. Never resolve an ambient npm package or download one.
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!driverRoot || !path.isAbsolute(driverRoot) || !browsersRoot || !path.isAbsolute(browsersRoot)) {
  throw new Error('the semantic-map-browser-proof Nix shell must provide explicit driver and browser roots');
}
const driverPackage = JSON.parse(fs.readFileSync(path.join(driverRoot, 'package.json'), 'utf8'));
if (driverPackage.name !== 'playwright-core') throw new Error('provided browser driver is not playwright-core');
const { chromium } = createRequire(import.meta.url)(driverRoot);
if (!fs.existsSync(chromium.executablePath())) throw new Error('the provided driver Chromium is unavailable');

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

let browser = null;
try {
  browser = await chromium.launch({ headless: true });
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

    // Independent inline inputs exercise the public graph shapes and both
    // directions. Inspect painted paths, not just logical edge membership.
    const paintRecords = [
      { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'paint proof' },
      { type: 'region', id: 'root', parent: null, label: 'paint proof', kind: 'boundary', bounds: [0, 0, 960, 260], summary: '' },
      ...['node', 'data', 'decision', 'start', 'end'].map((kind, index) => ({
        type: 'region', id: kind, parent: 'root', label: kind, kind,
        bounds: [40 + index * 180, 90, 120, 64], summary: '',
      })),
    ];
    const paintBase = await protocol.createDecisionLog(paintRecords, 'paint-proof');
    const cases = [
      ['forward', 'node', 'data', 'flow'],
      ['reverse', 'decision', 'data', 'flow'],
      ['other-endpoint', 'start', 'decision', 'flow'],
      ['terminal', 'start', 'end', 'flow'],
      ['undirected', 'node', 'end', 'association'],
    ];
    const paint = [];
    for (const [name, from, to, kind] of cases) {
      const decision = await protocol.createDecision(paintBase.head, [{
        type: 'ConnectRegions', relationId: name, from, to, kind, label: '',
      }, { type: 'PinRegions', items: paintRecords.filter(record => record.type === 'region' && record.id !== 'root')
        .map(record => ({ regionId: record.id, bounds: record.bounds })) }], paintBase.records);
      const log = await protocol.appendDecision(paintBase.log, decision.decision);
      const rendered = await draw(log, 'paint-' + name);
      if (rendered.error !== null) { paint.push({ name, error: rendered.error }); continue; }
      const adapter = rendered.frame.contentWindow.semanticMapApp.adapter;
      const view = adapter.graph.getView();
      const edges = [...adapter.edgesByProjectionKey.values()];
      const edge = edges.length === 1 ? view.getState(edges[0]) : null;
      const color = edge?.style.strokeColor;
      const visiblePaint = node => {
        const style = node.ownerDocument.defaultView.getComputedStyle(node);
        const opaque = value => value !== 'none' && value !== 'transparent'
          && !/^rgba\([^)]*,\s*0(?:\.0*)?\)$/u.test(value);
        const painted = (opaque(style.fill) && Number(style.fillOpacity) > 0)
          || (opaque(style.stroke) && Number(style.strokeOpacity) > 0 && Number.parseFloat(style.strokeWidth) > 0);
        const box = node.getBoundingClientRect(), matrix = node.getScreenCTM();
        if (!node.isConnected || !painted || !matrix || !(box.width > 0 || box.height > 0)
          || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) return false;
        for (let element = node; element; element = element.parentElement) {
          const computed = element.ownerDocument.defaultView.getComputedStyle(element);
          if (computed.display === 'none' || computed.visibility !== 'visible' || Number(computed.opacity) === 0) return false;
        }
        return true;
      };
      const paths = [...(edge?.shape?.node?.querySelectorAll('path') ?? [])]
        .filter(node => node.getAttribute('stroke') === color && node.getTotalLength() > 0 && visiblePaint(node));
      const shafts = paths.filter(node => node.getAttribute('fill') === 'none');
      const markers = paths.filter(node => node.getAttribute('fill') === color);
      const point = (node, length) => {
        const at = node.getPointAtLength(length);
        const matrix = node.getScreenCTM();
        if (!matrix || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f, at.x, at.y].every(Number.isFinite)) return null;
        const transformed = new DOMPoint(at.x, at.y).matrixTransform(matrix);
        return [transformed.x, transformed.y].every(Number.isFinite) ? { x: transformed.x, y: transformed.y } : null;
      };
      const shaft = shafts.length === 1 ? shafts[0] : null;
      const marker = markers.length === 1 ? markers[0] : null;
      const source = shaft ? point(shaft, 0) : null;
      const target = marker ? point(marker, 0) : shaft ? point(shaft, shaft.getTotalLength()) : null;
      const geometry = id => {
        const state = view.getState(adapter.cellsByRegionId.get(id));
        const box = state.shape.node.getBoundingClientRect();
        return { x: box.x, y: box.y, w: box.width, h: box.height,
          shape: state.style.shape ?? 'rectangle', ellipse: state.shape.node.querySelectorAll('ellipse').length };
      };
      const sourceBox = geometry(from), targetBox = geometry(to);
      const paintedBoundary = (at, id) => {
        const state = view.getState(adapter.cellsByRegionId.get(id));
        const primitives = [...state.shape.node.querySelectorAll('path,rect,ellipse')].filter(visiblePaint);
        let distance = Infinity, tolerance = 0, visible = 0;
        if (!at || ![at.x, at.y].every(Number.isFinite)) return { ok: false, reason: 'nonfinite endpoint' };
        if (primitives.length !== 1) return { ok: false, reason: 'expected one painted node primitive', primitives: primitives.length };
        for (const node of primitives) {
          const style = node.ownerDocument.defaultView.getComputedStyle(node);
          const box = node.getBoundingClientRect(), matrix = node.getScreenCTM();
          if (!node.isConnected || !matrix || style.display === 'none' || style.visibility !== 'visible'
            || Number(style.opacity) === 0 || !(box.width > 0 && box.height > 0)
            || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) continue;
          const scale = Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d);
          const length = node.getTotalLength();
          if (!(length > 0 && Number.isFinite(length) && scale > 0)) continue;
          visible++;
          // At most half a screen pixel between samples. Segment distance is
          // independent of the producer's perimeter implementation, including
          // rounded rectangles and the data node's actual slanted outline.
          const samples = Math.ceil(length * scale * 2);
          let previous = point(node, 0), nearest = Infinity;
          for (let index = 1; index <= samples; index++) {
            const next = point(node, length * index / samples);
            if (!previous || !next) { nearest = Infinity; break; }
            const dx = next.x - previous.x, dy = next.y - previous.y;
            const t = Math.max(0, Math.min(1, ((at.x - previous.x) * dx + (at.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
            nearest = Math.min(nearest, Math.hypot(at.x - previous.x - t * dx, at.y - previous.y - t * dy));
            previous = next;
          }
          if (nearest < distance) {
            distance = nearest;
            // Painted stroke radii plus the explicit half-pixel sampling
            // bound; no shape-relative percentage or conceptual bounding box.
            const nodeScale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
            const edgeMatrix = shaft?.getScreenCTM();
            const edgeScale = edgeMatrix ? Math.max(Math.hypot(edgeMatrix.a, edgeMatrix.b), Math.hypot(edgeMatrix.c, edgeMatrix.d)) : 0;
            tolerance = Number.parseFloat(style.strokeWidth) * nodeScale / 2
              + Number.parseFloat(shaft?.getAttribute('stroke-width') ?? '1') * edgeScale / 2 + 0.5;
          }
        }
        return { ok: visible > 0 && Number.isFinite(distance) && Number.isFinite(tolerance) && distance <= tolerance,
          distance: Number.isFinite(distance) ? distance : null, tolerance, visible };
      };
      const sourceBoundary = paintedBoundary(source, from), targetBoundary = paintedBoundary(target, to);
      const shaftEnd = shaft ? point(shaft, shaft.getTotalLength()) : null;
      const direction = marker && target && shaftEnd
        ? (target.x - shaftEnd.x) * (targetBox.x + targetBox.w / 2 - sourceBox.x - sourceBox.w / 2)
          + (target.y - shaftEnd.y) * (targetBox.y + targetBox.h / 2 - sourceBox.y - sourceBox.h / 2) > 0
        : kind === 'association';
      paint.push({ name, error: null, edges: edges.length, shafts: shafts.length,
        markers: markers.length, directed: kind !== 'association', direction,
        sourceBoundary: sourceBoundary.ok, targetBoundary: targetBoundary.ok,
        boundaryEvidence: { source: sourceBoundary, target: targetBoundary },
        sourceBox, targetBox, source, target,
        ellipse: [from, to].filter(id => ['start', 'end'].includes(id)).every(id => geometry(id).ellipse === 1),
        paths: paths.map(node => node.getAttribute('d')),
      });
    }

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
      paint,
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
  for (const item of observed.paint) {
    check('actual painted shaft, marker and endpoints: ' + item.name,
      item.error === null && item.edges === 1 && item.shafts === 1
        && item.markers === (item.directed ? 1 : 0) && item.direction
        && item.sourceBoundary && item.targetBoundary && item.ellipse,
      item);
  }
  check('all paint controls ran', observed.paint.length === 5, observed.paint.length);
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
  // Launch failure must also release the ephemeral server. A browser close
  // failure cannot bypass server cleanup or become a successful receipt.
  try {
    if (browser) {
      let timer;
      try {
        await Promise.race([
          browser.close(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('browser cleanup timeout')), 30000); }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
