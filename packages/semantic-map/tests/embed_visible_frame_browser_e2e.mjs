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
// shown through two different cameras. `clipped` is a host that gives the embed
// far less room than the embed asks for and hides the overflow: the iframe is
// its full height, the graph container inside it is too, and most of it is not
// on the screen at all. `scrolled` is the same shape with the overflow
// scrollable instead of hidden. `skewed` puts the embed under a transform this
// contract cannot invert.
const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>visible frame proof</title></head>
<body>
<div id="working" style="width:520px;height:620px"></div>
<div id="confirmed" style="width:900px;height:620px"></div>
<div id="clipped" style="width:520px;height:120px;overflow:hidden"></div>
<div id="scrolled" style="width:520px;height:120px;overflow:auto"></div>
<div id="bordered" style="width:520px;height:200px;overflow:hidden;border:40px solid #333;padding:0"></div>
<div id="shadow-outer" style="width:520px;height:120px;overflow:hidden"></div>
<div id="contained" style="width:520px;height:120px;contain:paint"></div>
<div id="content-visibility" style="width:520px;height:120px;content-visibility:auto"></div>
<div id="rounded" style="width:520px;height:120px;overflow:hidden;border-radius:24px"></div>
<div id="transparent" style="width:520px;height:620px;opacity:0"></div>
<div id="invisible" style="width:520px;height:620px;visibility:hidden"></div>
<div id="rotated" style="width:520px;height:620px;transform:rotate(7deg)"></div>
<div id="translated" style="width:520px;height:620px;transform:translate(13px,29px)"></div>
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

    // A host that hides the overflow shows only part of the pane. The frame has
    // to say what is on the screen, not what the iframe would show if the host
    // had given it the room: a part below the cut is inside the iframe's own
    // viewport, has a cell connected to the document, and is not visible.
    const firstClipped = await draw(base, 'clipped');
    const strip = runtime.visibleFrameOf(firstClipped);
    // One part inside the strip the host shows, one just below it. Both are
    // inside the embed's own viewport; only the first is on the screen.
    const clippedSpots = {
      'node-a': [strip.frame[0] + 20, strip.frame[1] + 10, 180, 60],
      'node-b': [strip.frame[0] + 20, strip.frame[1] + strip.frame[3] + 40, 180, 60],
    };
    const clipPin = await protocol.createDecision(base.head, [{
      type: 'PinRegions',
      items: Object.entries(clippedSpots).map(([regionId, bounds]) => ({ regionId, bounds })),
    }], base.records);
    const clippedLog = await protocol.appendDecision(base.log, clipPin.decision);
    const clippedMount = await draw(clippedLog, 'clipped');
    const clippedFrame = runtime.visibleFrameOf(clippedMount);
    const clippedMeasure = (() => {
      const frameElement = clippedMount.querySelector('iframe[data-package="semantic-map"]');
      const container = frameElement.contentDocument.querySelector('#graph-container');
      const host = clippedMount.getBoundingClientRect();
      const iframeRect = frameElement.getBoundingClientRect();
      // The container does not start at the iframe's top edge, so the rows the
      // host shows are the overlap of its own box with the container's, not
      // simply the host's height.
      const containerRect = container.getBoundingClientRect();
      const shownTop = Math.max(host.y, iframeRect.y + containerRect.y);
      const shownBottom = Math.min(host.y + host.height, iframeRect.y + containerRect.y + containerRect.height);
      return {
        host: { x: host.x, y: host.y, w: host.width, h: host.height },
        iframe: { x: iframeRect.x, y: iframeRect.y, w: iframeRect.width, h: iframeRect.height },
        container: { w: container.clientWidth, h: container.clientHeight, top: containerRect.y, h_rect: containerRect.height },
        shownHostRows: Math.max(0, shownBottom - shownTop),
        insideViewport: frameElement.contentWindow.semanticMapApp.adapter.viewport(),
      };
    })();

    // The same shape with the overflow scrollable: getBoundingClientRect on a
    // scroll container already reports the box it is showing, so the same
    // intersection is exact there too.
    const scrolledMount = await draw(base, 'scrolled');
    const scrolledFrame = runtime.visibleFrameOf(scrolledMount);

    // Overflow clips at the padding box, so a border shows nothing. A frame
    // that reached into it would promise a band of solid #333 as pane.
    const borderedMount = await draw(base, 'bordered');
    const borderedFrame = runtime.visibleFrameOf(borderedMount);
    const borderedMeasure = (() => {
      const frameElement = borderedMount.querySelector('iframe[data-package="semantic-map"]');
      const container = frameElement.contentDocument.querySelector('#graph-container');
      const style = getComputedStyle(borderedMount);
      const rect = borderedMount.getBoundingClientRect();
      const border = {
        left: Number.parseFloat(style.borderLeftWidth),
        top: Number.parseFloat(style.borderTopWidth),
      };
      return {
        borderBox: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        border,
        paddingBox: {
          x: rect.x + border.left, y: rect.y + border.top,
          w: borderedMount.clientWidth, h: borderedMount.clientHeight,
        },
        iframe: (r => ({ x: r.x, y: r.y, w: r.width, h: r.height }))(frameElement.getBoundingClientRect()),
        container: (r => ({ x: r.x, y: r.y, w: r.width, h: r.height }))(container.getBoundingClientRect()),
        containerClient: { w: container.clientWidth, h: container.clientHeight },
        insideViewport: frameElement.contentWindow.semanticMapApp.adapter.viewport(),
      };
    })();

    // A mount inside a shadow tree whose host clips it. The mount has no
    // parentElement at all, so a walk that only follows parentElement sees no
    // clipping box and reports the whole pane.
    const shadowOuter = document.querySelector('#shadow-outer');
    const shadowRoot = shadowOuter.attachShadow({ mode: 'open' });
    const shadowMount = document.createElement('div');
    shadowMount.style.cssText = 'width:520px;height:620px';
    shadowRoot.append(shadowMount);
    const shadowEnvelope = await protocol.createEnvelope(base.log, null, { pattern: 'graph/1' });
    await runtime.executeArtifactPackage({ document, input: { envelope: shadowEnvelope }, surfaceMount: shadowMount });
    await ready(shadowMount.querySelector('iframe[data-package="semantic-map"]'));
    const shadowFrame = runtime.visibleFrameOf(shadowMount);
    const shadowMeasure = (() => {
      const frameElement = shadowMount.querySelector('iframe[data-package="semantic-map"]');
      const container = frameElement.contentDocument.querySelector('#graph-container');
      return {
        mountHasParentElement: shadowMount.parentElement !== null,
        rootHost: shadowMount.getRootNode()?.host === shadowOuter,
        outer: (r => ({ x: r.x, y: r.y, w: r.width, h: r.height }))(shadowOuter.getBoundingClientRect()),
        iframe: (r => ({ x: r.x, y: r.y, w: r.width, h: r.height }))(frameElement.getBoundingClientRect()),
        container: (r => ({ x: r.x, y: r.y, w: r.width, h: r.height }))(container.getBoundingClientRect()),
        containerClient: { w: container.clientWidth, h: container.clientHeight },
        insideViewport: frameElement.contentWindow.semanticMapApp.adapter.viewport(),
      };
    })();

    // Paint containment clips exactly like a hidden overflow, and leaves the
    // computed overflow at `visible` while doing it. A predicate that only reads
    // overflow sees nothing to intersect and reports the whole pane.
    const containedMount = await draw(base, 'contained');
    const containedFrame = runtime.visibleFrameOf(containedMount);
    const containedMeasure = (() => {
      const frameElement = containedMount.querySelector('iframe[data-package="semantic-map"]');
      const container = frameElement.contentDocument.querySelector('#graph-container');
      const style = getComputedStyle(containedMount);
      const host = containedMount.getBoundingClientRect();
      const iframeRect = frameElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const shownTop = Math.max(host.y, iframeRect.y + containerRect.y);
      const shownBottom = Math.min(host.y + host.height, iframeRect.y + containerRect.y + containerRect.height);
      return {
        computedOverflow: `${style.overflowX}/${style.overflowY}`,
        computedContain: style.contain,
        host: { x: host.x, y: host.y, w: host.width, h: host.height },
        iframe: { x: iframeRect.x, y: iframeRect.y, w: iframeRect.width, h: iframeRect.height },
        containerClient: { w: container.clientWidth, h: container.clientHeight },
        shownHostRows: Math.max(0, shownBottom - shownTop),
        insideViewport: frameElement.contentWindow.semanticMapApp.adapter.viewport(),
      };
    })();
    // A candidate spot at the bottom of the embed's own viewport - which is
    // exactly what a predicate blind to paint containment reported as the frame.
    // It is connected, and painted nowhere a person can see.
    const containedBottom = [
      containedMeasure.insideViewport.x + 20,
      containedMeasure.insideViewport.y + containedMeasure.insideViewport.height - 80,
      180, 60,
    ];
    const containedPin = await protocol.createDecision(base.head, [{
      type: 'PinRegions', items: [{ regionId: 'node-a', bounds: containedBottom }],
    }], base.records);
    const containedLog = await protocol.appendDecision(base.log, containedPin.decision);
    const containedPinned = await draw(containedLog, 'contained');
    const containedPaint = painted(containedPinned);
    const containedPinnedFrame = runtime.visibleFrameOf(containedPinned);

    const contentVisibilityMount = await draw(base, 'content-visibility');
    const contentVisibilityFrame = runtime.visibleFrameOf(contentVisibilityMount);
    const contentVisibilityOverflow = (() => {
      const style = getComputedStyle(contentVisibilityMount);
      return `${style.overflowX}/${style.overflowY} contentVisibility=${style.contentVisibility}`;
    })();

    // A rounded clip cuts the corners off, and no axis-aligned rectangle says
    // which pixels those are. A fully transparent or hidden ancestor shows
    // nothing at all. None of the three may come back as a visible frame.
    const roundedMount = await draw(base, 'rounded');
    const roundedFrame = runtime.visibleFrameOf(roundedMount);
    const transparentMount = await draw(base, 'transparent');
    const transparentFrame = runtime.visibleFrameOf(transparentMount);
    const invisibleMount = await draw(base, 'invisible');
    const invisibleFrame = runtime.visibleFrameOf(invisibleMount);

    // A rotation cannot be inverted by intersecting axis-aligned rectangles, so
    // the honest answer is none. A pure translation can, so it must still work.
    const rotatedMount = await draw(base, 'rotated');
    const rotatedFrame = runtime.visibleFrameOf(rotatedMount);
    const translatedMount = await draw(base, 'translated');
    const translatedFrame = runtime.visibleFrameOf(translatedMount);

    return {
      clipped: {
        frame: clippedFrame,
        strip: strip.frame,
        measure: clippedMeasure,
        painted: painted(clippedMount),
        layout: protocol.layoutBoundsFor(
          (await protocol.verifyDecisionLog(clippedLog.log)).records, { pattern: 'graph/1' },
        ).bounds,
        spots: clippedSpots,
      },
      scrolled: { frame: scrolledFrame },
      bordered: { frame: borderedFrame, measure: borderedMeasure },
      shadow: { frame: shadowFrame, measure: shadowMeasure },
      contained: {
        frame: containedFrame,
        pinnedFrame: containedPinnedFrame,
        measure: containedMeasure,
        candidate: containedBottom,
        painted: containedPaint['node-a'] ?? null,
      },
      contentVisibility: { frame: contentVisibilityFrame, computed: contentVisibilityOverflow },
      rounded: { frame: roundedFrame },
      transparent: { frame: transparentFrame },
      invisible: { frame: invisibleFrame },
      rotated: { frame: rotatedFrame },
      translated: { frame: translatedFrame },
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

  // R's counterexample on 03f5c09: a host mount of 520x120 with the overflow
  // hidden, holding an iframe the embed sizes at 520x702. Everything below the
  // cut is inside the iframe's own viewport and on nobody's screen.
  const clip = observed.clipped;
  check('the clipped host really does cut the embed short',
    clip.measure.iframe.h - clip.measure.host.h > 400
      && clip.measure.container.h > clip.measure.host.h,
    clip.measure);

  check('a clipped host still gets an answer',
    clip.frame !== null, clip.frame);

  if (clip.frame !== null) {
    // The scale the embed is drawing at, taken from its own numbers.
    const scale = clip.measure.container.w / clip.measure.insideViewport.width;
    const expectedHeight = clip.measure.shownHostRows / scale;
    check('the frame is cut to what the host shows, not what the iframe holds',
      clip.frame.frame[3] < clip.measure.insideViewport.height - 100
        && Math.abs(clip.frame.frame[3] - expectedHeight) < 2,
      { frame: clip.frame.frame, insideViewport: clip.measure.insideViewport, expectedHeight, measure: clip.measure });

    // The claim the contract makes, checked against paint: every part the frame
    // fully contains is painted inside the host's own box, and the parts it
    // excludes are not - even though their cells are in the document.
    // painted() measures shapes inside the iframe, so the host's box has to be
    // brought into the iframe's coordinates before the two can be compared.
    const hostRect = {
      x: clip.measure.host.x - clip.measure.iframe.x,
      y: clip.measure.host.y - clip.measure.iframe.y,
      w: clip.measure.host.w,
      h: clip.measure.host.h,
    };
    const visibleInHost = item => {
      if (item.rect === null) return 0;
      const w = Math.max(0, Math.min(item.rect.x + item.rect.w, hostRect.x + hostRect.w) - Math.max(item.rect.x, hostRect.x));
      const h = Math.max(0, Math.min(item.rect.y + item.rect.h, hostRect.y + hostRect.h) - Math.max(item.rect.y, hostRect.y));
      return w * h;
    };
    const clipFrame = clip.frame.frame;
    const insideClipFrame = bounds => bounds[0] >= clipFrame[0] && bounds[1] >= clipFrame[1]
      && bounds[0] + bounds[2] <= clipFrame[0] + clipFrame[2]
      && bounds[1] + bounds[3] <= clipFrame[1] + clipFrame[3];
    const verdicts = Object.entries(clip.painted)
      .filter(([regionId]) => regionId !== 'root')
      .map(([regionId, item]) => ({
        regionId,
        promised: insideClipFrame(clip.layout[regionId] ?? [0, 0, 0, 0]),
        visibleInHost: visibleInHost(item),
        connected: item.connected,
      }));
    check('every part the clipped frame contains is painted inside the host box',
      verdicts.filter(v => v.promised).length > 0
        && verdicts.filter(v => v.promised).every(v => v.visibleInHost > 0),
      verdicts);
    check('a part the clipped frame excludes has a cell and is not shown',
      verdicts.filter(v => !v.promised).length > 0
        && verdicts.filter(v => !v.promised).every(v => v.visibleInHost === 0),
      verdicts);
  }

  check('a scrollable host is measured the same exact way',
    observed.scrolled.frame !== null
      && observed.scrolled.frame.frame[3] < observed.clipped.measure.insideViewport.height - 100,
    observed.scrolled.frame);

  // R's first counterexample on 26dad4a: overflow clips at the padding box, so a
  // 40 px border is a band that shows nothing. Measuring the border box put that
  // band inside the frame.
  const bordered = observed.bordered;
  check('the bordered host really has a border outside its clip',
    bordered.measure.border.left === 40 && bordered.measure.border.top === 40
      && bordered.measure.paddingBox.w === bordered.measure.borderBox.w - 80
      && bordered.measure.paddingBox.h === bordered.measure.borderBox.h - 80,
    bordered.measure);

  if (bordered.frame !== null) {
    // The frame, converted back to host pixels, must lie inside the padding box.
    const scale = bordered.measure.containerClient.w / bordered.measure.insideViewport.width;
    const [fx, fy, fw, fh] = bordered.frame.frame;
    const originX = bordered.measure.iframe.x + bordered.measure.container.x;
    const originY = bordered.measure.iframe.y + bordered.measure.container.y;
    const claimed = {
      left: originX + (fx - bordered.measure.insideViewport.x) * scale,
      top: originY + (fy - bordered.measure.insideViewport.y) * scale,
      right: originX + (fx - bordered.measure.insideViewport.x + fw) * scale,
      bottom: originY + (fy - bordered.measure.insideViewport.y + fh) * scale,
    };
    const pad = bordered.measure.paddingBox;
    check('the frame the bordered host reports stays inside its padding box',
      claimed.left >= pad.x - 0.6 && claimed.top >= pad.y - 0.6
        && claimed.right <= pad.x + pad.w + 0.6 && claimed.bottom <= pad.y + pad.h + 0.6,
      { claimed, paddingBox: pad, borderBox: bordered.measure.borderBox });
    // The border only takes room where the host is the smaller box - here that
    // is the height, since a content-box width of 520 puts the border outside
    // the iframe's own 520. Measuring the border box instead would have added
    // exactly the border's 40 rows of solid colour to the frame.
    const containerTop = bordered.measure.iframe.y + bordered.measure.container.y;
    const containerBottom = containerTop + bordered.measure.container.h;
    const rowsFromPaddingBox = Math.min(pad.y + pad.h, containerBottom) - Math.max(pad.y, containerTop);
    const rowsFromBorderBox = Math.min(
      bordered.measure.borderBox.y + bordered.measure.borderBox.h, containerBottom,
    ) - Math.max(bordered.measure.borderBox.y, containerTop);
    check('the frame is the padding box\'s rows, not the border box\'s',
      Math.abs(fh - rowsFromPaddingBox / scale) < 2
        && rowsFromBorderBox - rowsFromPaddingBox >= 39,
      { frame: bordered.frame.frame, rowsFromPaddingBox, rowsFromBorderBox, scale });
  } else {
    check('the bordered host reports a frame at all', false, null);
  }

  // R's second counterexample: a mount inside a shadow tree has no
  // parentElement, so a clipping shadow host was never looked at.
  const shadow = observed.shadow;
  check('the shadow mount really has no parentElement, and its root has a host',
    shadow.measure.mountHasParentElement === false && shadow.measure.rootHost === true,
    shadow.measure);
  check('a clipping shadow host cuts the frame down',
    shadow.frame !== null
      && shadow.frame.frame[3] < shadow.measure.insideViewport.height - 100,
    { frame: shadow.frame, insideViewport: shadow.measure.insideViewport, outer: shadow.measure.outer });
  if (shadow.frame !== null) {
    const scale = shadow.measure.containerClient.w / shadow.measure.insideViewport.width;
    const shownRows = Math.max(0, Math.min(
      shadow.measure.outer.y + shadow.measure.outer.h,
      shadow.measure.iframe.y + shadow.measure.container.y + shadow.measure.container.h,
    ) - Math.max(shadow.measure.outer.y, shadow.measure.iframe.y + shadow.measure.container.y));
    check('and it is cut to exactly the rows the shadow host shows',
      Math.abs(shadow.frame.frame[3] - shownRows / scale) < 2,
      { frame: shadow.frame.frame, shownRows, expected: shownRows / scale });
  }

  // R's counterexample on 82f2e4c: paint containment clips while the computed
  // overflow stays `visible`, so a predicate that reads only overflow sees
  // nothing to intersect.
  const contained = observed.contained;
  check('the contained host really clips with its overflow still visible',
    contained.measure.computedOverflow === 'visible/visible'
      && contained.measure.computedContain.includes('paint')
      && contained.measure.insideViewport.height - contained.measure.shownHostRows > 400,
    contained.measure);

  if (contained.frame !== null) {
    const scale = contained.measure.containerClient.w / contained.measure.insideViewport.width;
    const expected = contained.measure.shownHostRows / scale;
    check('paint containment cuts the frame down to what it shows',
      Math.abs(contained.frame.frame[3] - expected) < 2
        && contained.frame.frame[3] < contained.measure.insideViewport.height - 100,
      { frame: contained.frame.frame, expected, measure: contained.measure });
  } else {
    check('the contained host reports a frame at all', false, null);
  }

  // Measured against the host's own box, not the graph container's: the
  // container is what paint containment is cutting short.
  const containedHostInFrame = {
    x: contained.measure.host.x - contained.measure.iframe.x,
    y: contained.measure.host.y - contained.measure.iframe.y,
    w: contained.measure.host.w,
    h: contained.measure.host.h,
  };
  const containedVisibleInHost = (() => {
    const item = contained.painted;
    if (item?.rect == null) return null;
    const w = Math.max(0, Math.min(item.rect.x + item.rect.w, containedHostInFrame.x + containedHostInFrame.w) - Math.max(item.rect.x, containedHostInFrame.x));
    const h = Math.max(0, Math.min(item.rect.y + item.rect.h, containedHostInFrame.y + containedHostInFrame.h) - Math.max(item.rect.y, containedHostInFrame.y));
    return w * h;
  })();
  check('the bottom candidate the uncorrected frame allowed is connected and shown nowhere in the host',
    contained.painted !== null && contained.painted.connected === true
      && containedVisibleInHost === 0,
    { candidate: contained.candidate, painted: contained.painted, visibleInHost: containedVisibleInHost, hostInFrame: containedHostInFrame });
  check('and the corrected frame no longer contains that candidate',
    contained.pinnedFrame !== null
      && !(contained.candidate[1] >= contained.pinnedFrame.frame[1]
        && contained.candidate[1] + contained.candidate[3]
          <= contained.pinnedFrame.frame[1] + contained.pinnedFrame.frame[3]),
    { candidate: contained.candidate, frame: contained.pinnedFrame?.frame ?? null });

  // content-visibility: auto brings paint containment, and may skip painting the
  // subtree altogether. Either way it must never come back as the whole pane.
  check('content-visibility never reports the whole pane',
    observed.contentVisibility.frame === null
      || observed.contentVisibility.frame.frame[3] < observed.contained.measure.insideViewport.height - 100,
    observed.contentVisibility);

  check('a rounded clip, a transparent ancestor and a hidden ancestor all answer null',
    observed.rounded.frame === null && observed.transparent.frame === null
      && observed.invisible.frame === null,
    { rounded: observed.rounded.frame, transparent: observed.transparent.frame, invisible: observed.invisible.frame });

  check('a rotation this cannot invert answers null, a pure translation still answers',
    observed.rotated.frame === null && observed.translated.frame !== null,
    { rotated: observed.rotated.frame, translated: observed.translated.frame });

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
      hostClip: {
        hostBox: observed.clipped.measure.host,
        iframeBox: observed.clipped.measure.iframe,
        insideEmbedViewport: observed.clipped.measure.insideViewport,
        frame: observed.clipped.frame.frame,
        shownHostRows: observed.clipped.measure.shownHostRows,
      },
      rotatedHost: observed.rotated.frame,
      checks: checks.length,
    }));
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
