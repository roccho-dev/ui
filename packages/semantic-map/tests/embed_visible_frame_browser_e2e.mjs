// What the pane is actually showing, proved against the screen rather than
// against the contract's own numbers.
//
// layoutBoundsFor is pre-culling: it reports bounds for a region whether or not
// a person can see it, and the enclosing boundary grows around any pin, so
// containment in that boundary proves nothing. The renderer culls against the
// viewport inflated by a margin, so a region just outside the pane is built,
// has a cell, has a shape connected to the document - and is invisible. That
// band is the whole reason this contract exists, and the proof below fails
// unless visibleFrameOf tells it apart from the pane.
//
// Every geometric claim here is measured from the DOM: the drawn cell's own
// rectangle against the graph container's content box. A cell that exists is
// not evidence; a cell that overlaps the pane is.
//
//   node tests/embed_visible_frame_browser_e2e.mjs
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

// Two panes of deliberately different widths, so the same embedded state is
// shown through two different cameras.
const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>visible frame proof</title></head>
<body>
<div id="working" style="width:520px;height:620px"></div>
<div id="confirmed" style="width:900px;height:620px"></div>
</body></html>`;

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
    schema: 'semantic-map-visible-frame-browser-e2e/1',
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
      { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'visible frame' },
      { type: 'region', id: 'root', parent: null, label: 'visible frame', kind: 'boundary', bounds: [0, 0, 720, 260], summary: '' },
      node('node-a', 40), node('node-b', 250), node('node-c', 460),
    ];
    const base = await protocol.createDecisionLog(records, 'visible-frame');

    const ready = async frame => {
      const started = performance.now();
      while (frame.contentWindow?.semanticMapSite?.ready !== true) {
        if (frame.contentWindow?.semanticMapSite?.ready === false) {
          throw new Error(frame.contentWindow.semanticMapSite.error ?? 'site not ready');
        }
        if (performance.now() - started > 60000) throw new Error('ready timeout');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };

    const draw = async (graph, mountId) => {
      const mount = document.querySelector(`#${mountId}`);
      const envelope = await protocol.createEnvelope(graph.log, null, { pattern: 'graph/1' });
      await runtime.executeArtifactPackage({ document, input: { envelope }, surfaceMount: mount });
      await ready(mount.querySelector('iframe[data-package="semantic-map"]'));
      return mount;
    };

    // The pane's own box, and every drawn cell's box, both read from the DOM.
    // getBoundingClientRect is the border box; the frame is derived from
    // clientWidth/clientHeight, which is the padding box. They are the same
    // rectangle only while this element has no padding and no border, so that
    // is asserted rather than assumed.
    const paneBox = mount => {
      const frame = mount.querySelector('iframe[data-package="semantic-map"]');
      const container = frame.contentDocument.querySelector('#graph-container');
      const style = frame.contentWindow.getComputedStyle(container);
      const rect = container.getBoundingClientRect();
      const zero = name => Number.parseFloat(style.getPropertyValue(name)) === 0;
      return {
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        client: { w: container.clientWidth, h: container.clientHeight },
        contentBoxIsBorderBox:
          ['padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'].every(zero),
        noScrollbar: container.clientWidth === Math.round(rect.width)
          && container.clientHeight === Math.round(rect.height),
      };
    };

    // Where each region is really painted on the screen, and how much of that
    // overlaps the pane. A cell can exist, be connected and still paint
    // entirely outside the pane; that is exactly the case under test.
    const painted = mount => {
      const frame = mount.querySelector('iframe[data-package="semantic-map"]');
      const win = frame.contentWindow;
      const adapter = win.semanticMapApp.adapter;
      const view = adapter.graph.getView();
      const pane = frame.contentDocument.querySelector('#graph-container').getBoundingClientRect();
      const out = {};
      for (const [regionId, cell] of adapter.cellsByRegionId) {
        const state = view.getState(cell);
        const node = state?.shape?.node ?? null;
        const rect = node?.getBoundingClientRect?.() ?? null;
        const overlapW = rect ? Math.max(0, Math.min(rect.right, pane.right) - Math.max(rect.left, pane.left)) : 0;
        const overlapH = rect ? Math.max(0, Math.min(rect.bottom, pane.bottom) - Math.max(rect.top, pane.top)) : 0;
        const area = rect ? rect.width * rect.height : 0;
        out[regionId] = {
          connected: Boolean(node?.isConnected),
          rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
          visibleArea: overlapW * overlapH,
          wholeArea: area,
          fullyPainted: area > 0 && overlapW * overlapH >= area - 0.5,
        };
      }
      return out;
    };

    const workingMount = await draw(base, 'working');
    const confirmedMount = await draw(base, 'confirmed');

    const first = runtime.visibleFrameOf(workingMount);

    // The layout contract and the visible frame must speak the same language:
    // the same canonical state, the same coordinates.
    const layout = protocol.layoutBoundsFor(
      (await protocol.verifyDecisionLog(base.log)).records, { pattern: 'graph/1' },
    );

    const adapterOf = mount => mount
      .querySelector('iframe[data-package="semantic-map"]').contentWindow.semanticMapApp.adapter;
    const workingAdapter = adapterOf(workingMount);
    const rawViewport = workingAdapter.viewport();

    // Three regions of the same graph, pinned one screen apart, so one lands in
    // the pane, one in the band the projector keeps but nobody sees, and one
    // far beyond both.
    const frameHeight = first.frame[3];
    const spots = {
      'node-a': [first.frame[0] + 20, first.frame[1] + 20, 180, 92],
      'node-b': [first.frame[0] + 20, first.frame[1] + frameHeight + 20, 180, 92],
      'node-c': [first.frame[0] + 20, first.frame[1] + frameHeight + 4000, 180, 92],
    };
    const pin = await protocol.createDecision(base.head, [{
      type: 'PinRegions',
      items: Object.entries(spots).map(([regionId, bounds]) => ({ regionId, bounds })),
    }], base.records);
    const pinnedLog = await protocol.appendDecision(base.log, pin.decision);

    // Held across the re-render below. executeArtifactPackage replaces the
    // mount's children, so this element is about to be detached and anything
    // that kept it would be reading a frame nobody is looking at.
    const frameBeforeReRender = workingMount.querySelector('iframe[data-package="semantic-map"]');
    const pinnedMount = await draw(pinnedLog, 'working');
    const pinnedFrame = runtime.visibleFrameOf(pinnedMount);
    const pinnedPaint = painted(pinnedMount);
    const pinnedLayout = protocol.layoutBoundsFor(
      (await protocol.verifyDecisionLog(pinnedLog.log)).records, { pattern: 'graph/1' },
    );

    // A reference held across the re-render is dead, so the contract must look
    // the current iframe up every time rather than keeping one.
    const reRenderReplacedFrame = frameBeforeReRender !== null
      && !frameBeforeReRender.isConnected
      && workingMount.querySelector('iframe[data-package="semantic-map"]') !== frameBeforeReRender;

    // A resize changes the pane without any camera event, so nothing that
    // listens for a camera change can notice it.
    const pinnedAdapter = adapterOf(pinnedMount);
    const resizeEvents = [];
    pinnedAdapter.onCameraChange(() => resizeEvents.push('camera'));
    const beforeResize = runtime.visibleFrameOf(pinnedMount);
    document.querySelector('#working').style.width = '760px';
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 250));
    const afterResize = runtime.visibleFrameOf(pinnedMount);

    // A camera gesture transforms the painted SVG and commits only when it
    // ends, so the committed camera still reads back the position from before.
    const duringPreview = (() => {
      pinnedAdapter.beginCameraPreview();
      pinnedAdapter.previewCamera(2, 10, 10);
      const answer = runtime.visibleFrameOf(pinnedMount);
      pinnedAdapter.cancelCameraPreview();
      return answer;
    })();
    const afterPreview = runtime.visibleFrameOf(pinnedMount);

    // Two panes showing exactly the same embedded state, at deliberately
    // different widths. Their heads are equal, so only the mount tells them
    // apart - which is why head is provenance and never pane identity.
    await draw(pinnedLog, 'confirmed');
    const confirmedFrame = runtime.visibleFrameOf(document.querySelector('#confirmed'));
    const workingAgain = runtime.visibleFrameOf(document.querySelector('#working'));

    const emptyMount = document.createElement('div');
    document.body.append(emptyMount);

    return {
      first,
      rawViewport,
      layoutBounds: layout.bounds,
      pinnedLayout: pinnedLayout.bounds,
      pinnedFrame,
      pinnedPaint,
      spots,
      pane: paneBox(pinnedMount),
      reRenderReplacedFrame,
      resize: { before: beforeResize, after: afterResize, cameraEvents: resizeEvents.length },
      preview: { during: duringPreview, after: afterPreview },
      twoPanes: { working: workingAgain, confirmed: confirmedFrame },
      emptyMount: runtime.visibleFrameOf(emptyMount),
      noMount: runtime.visibleFrameOf(undefined),
      schema: pinnedFrame?.schema ?? null,
      storage: localStorage.length,
    };
  });

  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail: detail ?? null });
  const sameTuple = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((value, index) => Math.abs(value - b[index]) < 0.001);

  check('the pane answers with a frozen frame',
    observed.first !== null && observed.schema === 'semantic-map-visible-frame/1'
      && Array.isArray(observed.pinnedFrame?.frame) && observed.pinnedFrame.frame.length === 4,
    observed.first);

  check('the frame is exactly the adapter viewport, uninflated',
    sameTuple(observed.first.frame,
      [observed.rawViewport.x, observed.rawViewport.y, observed.rawViewport.width, observed.rawViewport.height]),
    { frame: observed.first.frame, viewport: observed.rawViewport });

  // The box model the whole DOM comparison rests on.
  check('the graph container has no padding and no border, so its content box is the rect measured',
    observed.pane.contentBoxIsBorderBox === true && observed.pane.noScrollbar === true,
    observed.pane);

  // The claim under test, in both directions.
  const inside = (box, frame) => box[0] >= frame[0] && box[1] >= frame[1]
    && box[0] + box[2] <= frame[0] + frame[2] && box[1] + box[3] <= frame[1] + frame[3];
  const frame = observed.pinnedFrame.frame;
  const paint = observed.pinnedPaint;

  check('a part inside the frame is actually painted in the pane',
    inside(observed.spots['node-a'], frame)
      && paint['node-a']?.connected === true && paint['node-a']?.fullyPainted === true,
    { spot: observed.spots['node-a'], frame, painted: paint['node-a'] });

  check('a part in the margin band has a cell in the document and is not in the pane',
    !inside(observed.spots['node-b'], frame)
      && paint['node-b'] !== undefined
      && paint['node-b'].connected === true
      && paint['node-b'].visibleArea === 0,
    { spot: observed.spots['node-b'], frame, painted: paint['node-b'] });

  check('the layout contract still reports that invisible part, so bounds are not visibility',
    sameTuple(observed.pinnedLayout['node-b'], observed.spots['node-b']),
    { reported: observed.pinnedLayout['node-b'], spot: observed.spots['node-b'] });

  check('a part far beyond the band is outside the frame too',
    !inside(observed.spots['node-c'], frame)
      && (paint['node-c'] === undefined || paint['node-c'].visibleArea === 0),
    { spot: observed.spots['node-c'], frame, painted: paint['node-c'] ?? null });

  check('the frame and the layout contract share one coordinate system',
    sameTuple(observed.pinnedLayout['node-a'], observed.spots['node-a'])
      && paint['node-a'].fullyPainted === true,
    { reported: observed.pinnedLayout['node-a'], spot: observed.spots['node-a'] });

  check('a re-render replaced the iframe, and the contract still answered',
    observed.reRenderReplacedFrame === true && observed.pinnedFrame !== null,
    { replaced: observed.reRenderReplacedFrame });

  check('a resize changes the frame with no camera event at all',
    observed.resize.before !== null && observed.resize.after !== null
      && !sameTuple(observed.resize.before.frame, observed.resize.after.frame)
      && observed.resize.cameraEvents === 0,
    observed.resize);

  check('a camera gesture in flight answers null, and the next read answers again',
    observed.preview.during === null && observed.preview.after !== null,
    observed.preview);

  check('two panes showing the same head report different frames',
    observed.twoPanes.working !== null && observed.twoPanes.confirmed !== null
      && observed.twoPanes.working.head === observed.twoPanes.confirmed.head
      && !sameTuple(observed.twoPanes.working.frame, observed.twoPanes.confirmed.frame),
    observed.twoPanes);

  check('a mount with no embed, and no mount at all, answer null rather than throwing',
    observed.emptyMount === null && observed.noMount === null);

  check('nothing was written to storage', observed.storage === 0, observed.storage);
  check('the page raised no error', pageErrors.length === 0, pageErrors);

  const failed = checks.filter(item => !item.ok);
  if (failed.length > 0) {
    fail('visible frame proof failed', failed);
  } else {
    console.log(JSON.stringify({
      schema: 'semantic-map-visible-frame-browser-e2e/1',
      status: 'PASS',
      frame: observed.pinnedFrame.frame,
      inPane: observed.pinnedPaint['node-a'],
      inMarginBand: observed.pinnedPaint['node-b'],
      twoPanes: [observed.twoPanes.working.frame, observed.twoPanes.confirmed.frame],
      checks: checks.length,
    }));
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
