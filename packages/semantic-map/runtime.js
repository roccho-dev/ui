import { canonicalJson, inspectEnvelope } from './protocol/index.js';

const EMBED_INPUT_SCHEMA = 'semantic-map-embed-input/1';
const EMBED_READY_SCHEMA = 'semantic-map-embed-ready/1';
export const VISIBLE_FRAME_SCHEMA = 'semantic-map-visible-frame/1';
const GRAPH_PATTERN = 'graph/1';

// Rectangles as edges, which is the only shape an intersection is simple in.
const edgesOfRect = rect => ({
  left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height,
});
const intersectEdges = (a, b) => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
};

// A transform this contract can see through. Intersecting axis-aligned
// rectangles only answers correctly while the mapping from the host's
// coordinates to the embed's is a translation: a rotation or a skew turns the
// visible region into a shape no rectangle describes, and a scale breaks the
// one-pixel-to-one-pixel assumption the conversion below rests on.
const translationOnly = value =>
  value === 'none' || value === '' || /^matrix\(\s*1\s*,\s*-?0\s*,\s*-?0\s*,\s*1\s*,/u.test(value);

// The part of `element` the host actually shows, in the host document's own
// client coordinates, after every ancestor that does not let its overflow
// escape. `getBoundingClientRect` of such an ancestor is already the box it is
// showing, so the same intersection is exact whether the overflow is hidden,
// clipped, scrolled or automatic.
//
// The browser viewport is deliberately not part of this. Page scroll is
// something a person can undo, and this contract speaks for the drawn pane, not
// for what happens to be on screen. A `clip-path` is a shape rather than a
// rectangle, so it is refused instead of approximated.
const hostVisibleEdges = element => {
  const view = element.ownerDocument?.defaultView;
  if (typeof view?.getComputedStyle !== 'function') return null;
  let edges = edgesOfRect(element.getBoundingClientRect());
  for (let node = element; node !== null; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.clipPath !== 'none') return null;
    if (!translationOnly(style.transform)) return null;
    if (node === element) continue;
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      edges = intersectEdges(edges, edgesOfRect(node.getBoundingClientRect()));
      if (edges === null) return null;
    }
  }
  return edges;
};
const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-package: ${message}`); };
const waitForEmbedReady = (document, frame, targetOrigin, timeoutMs = 15000) => {
  const parentWindow = document.defaultView;
  invariant(parentWindow?.addEventListener, 'document.defaultView is required');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      parentWindow.removeEventListener('message', onMessage);
      reject(new Error('embedded semantic map ready timed out'));
    }, timeoutMs);
    function onMessage(event) {
      if (event.source !== frame.contentWindow) return;
      if (event.origin !== targetOrigin) return;
      if (event.data?.schema !== EMBED_READY_SCHEMA) return;
      clearTimeout(timer);
      parentWindow.removeEventListener('message', onMessage);
      resolve(true);
    }
    parentWindow.addEventListener('message', onMessage);
  });
};

const waitForReady = (frame, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const started = performance.now();
  const poll = () => {
    try {
      const site = frame.contentWindow?.semanticMapSite;
      if (site?.ready === true) return resolve(site);
      if (site?.ready === false) return reject(new Error(site.error || 'embedded semantic map failed'));
    } catch (_) {}
    if (performance.now() - started > timeoutMs) return reject(new Error('embedded semantic map timed out'));
    setTimeout(poll, 25);
  };
  poll();
});

export const lockDetachedAuthoring = (frame, site) => {
  const reject = () => { throw new Error('semantic-map-package: this input is read-only because the host cannot replace it'); };
  site.editor.adapter.setOperationHandler(reject);
  site.editor.adapter.setActivationHandler(reject);
  for (const method of ['accept', 'changeView', 'commitView', 'reject']) {
    Object.defineProperty(site.runtime, method, { configurable: true, value: reject });
  }
  for (const control of frame.contentDocument?.querySelectorAll?.('[data-state-control], #review-accept, #review-reject') ?? []) {
    control.disabled = true;
  }
  return Object.freeze({ enabled: true, reason: 'host-input-immutable', schema: 'semantic-map-read-only-lock/1' });
};

export const createEnvelopeInputBridge = ({ initialEnvelope, inputAction, site }) => {
  invariant(inputAction?.enabled === true && typeof inputAction.replace === 'function', 'enabled inputAction.replace is required');
  invariant(site?.runtime?.onChange && site.runtime.envelope, 'semantic map runtime change API is required');
  let expectedValue = initialEnvelope;
  let pending = Promise.resolve();
  let revisions = 0;
  let lastError = null;

  const flush = async () => {
    const value = structuredClone(await site.runtime.envelope({ proposal: site.runtime.proposal, view: site.runtime.view }));
    if (canonicalJson(value) === canonicalJson(expectedValue)) return null;
    const commit = await inputAction.replace({ expectedValue, history: 'replace', value });
    expectedValue = value;
    revisions += 1;
    lastError = null;
    return commit;
  };
  const enqueue = () => {
    const task = pending.then(flush);
    pending = task.catch((error) => {
      lastError = String(error?.message ?? error);
      site.editor?.showError?.(`共有入力を更新できません: ${lastError}`);
      return null;
    });
    return task;
  };
  const unsubscribe = site.runtime.onChange(enqueue);
  return Object.freeze({
    enabled: true,
    inputId: inputAction.inputId,
    schema: 'semantic-map-input-bridge/1',
    snapshot: () => Object.freeze({ enabled: true, inputId: inputAction.inputId, lastError, revisions }),
    unsubscribe,
  });
};

export async function executeArtifactPackage({ document, input, inputAction = null, surfaceMount }) {
  invariant(document?.createElement, 'document is required');
  invariant(surfaceMount?.replaceChildren, 'surfaceMount is required');
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'input is required');
  const inspection = await inspectEnvelope(input.envelope);
  const frame = document.createElement('iframe');
  const bridgeEnabled = inputAction?.enabled === true && typeof inputAction.replace === 'function';
  frame.title = 'Semantic Map';
  frame.dataset.inputAction = bridgeEnabled ? 'enabled' : 'read-only';
  frame.dataset.package = 'semantic-map';
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  frame.style.cssText = 'display:block;width:100%;height:min(78vh,900px);min-height:560px;border:0;border-radius:12px;background:#f8fafb;pointer-events:none;';
  const frameUrl = new URL('./authoring/pages/embed.html', import.meta.url);
  const targetOrigin = frameUrl.origin;
  const embedReady = waitForEmbedReady(document, frame, targetOrigin);
  frame.src = frameUrl.href;
  surfaceMount.replaceChildren(frame);
  await embedReady;
  frame.contentWindow?.postMessage(
    Object.freeze({ schema: EMBED_INPUT_SCHEMA, envelope: structuredClone(inspection.envelope) }),
    targetOrigin,
  );
  const site = await waitForReady(frame);
  let bridge = null;
  if (bridgeEnabled) {
    bridge = createEnvelopeInputBridge({ initialEnvelope: inspection.envelope, inputAction, site });
    frame.contentWindow.semanticMapInputBridge = bridge;
  } else {
    lockDetachedAuthoring(frame, site);
  }
  frame.style.pointerEvents = 'auto';
  return Object.freeze({
    schema: 'semantic-map-render-receipt/1',
    mapId: site.runtime.mapId,
    head: site.runtime.head,
    stateHash: site.runtime.stateHash,
    pattern: site.runtime.view.pattern,
    proposal: Boolean(site.runtime.proposal),
    editorReady: Boolean(site.editor?.ready),
    inputBridge: Object.freeze({
      enabled: Boolean(bridge),
      history: bridge ? 'replace' : null,
      inputId: bridge?.inputId ?? inputAction?.inputId ?? null,
      mode: bridge ? 'parent-invocation' : 'read-only',
      schema: 'semantic-map-input-bridge-receipt/1',
    }),
    source: Object.freeze({ contract: 'semantic-map-envelope/3', mode: 'embedded-message' }),
  });
}

/**
 * The part of the graph a person can currently see in `surfaceMount`.
 *
 * A consumer that places something relative to what is on screen - "put that
 * part below this one" - can ask `layoutBoundsFor` where the view puts things,
 * but those bounds are pre-culling: a region has bounds there whether or not it
 * is on screen, and the enclosing boundary grows around any pin, so neither
 * containment in the boundary nor the presence of a rendered cell tells the
 * consumer that a spot is visible. The renderer culls against this frame,
 * inflated by a margin so that a band just outside it is built but not seen.
 * This returns that frame *uninflated*, in the same coordinates
 * `layoutBoundsFor` reports, and narrowed to the part of the pane the host
 * actually shows - a host that hides its overflow cuts the embed short, and
 * everything past the cut is still inside the embed's own viewport and on
 * nobody's screen. So a spot fully inside this frame is a spot the pane shows.
 *
 * "Shows" means inside the drawn pane. It does not mean inside the browser
 * window: page scroll is something a person can undo, so it is left out, and a
 * pane scrolled out of the window still reports its frame.
 *
 * Synchronous and immediate: it reads what is true now and never waits. It
 * looks the embed up in `surfaceMount` on every call, because a re-render
 * replaces the iframe and a held reference would be stale. It writes nothing,
 * and it never throws - reaching into a cross-origin frame raises rather than
 * returning undefined, so every failure is reported the same way, as `null`.
 *
 * `null` means "no answer right now", not "nothing is visible": no embed, not
 * ready, a different origin, a pattern this contract cannot speak for, a
 * camera gesture in flight, a pane with no size, nothing of the pane left after
 * the host's clipping, or a host transform this cannot see through - a rotation
 * or a scale, where an axis-aligned rectangle would be a guess. A consumer must
 * treat it as "cannot check", never as "refuse silently".
 *
 * Returns a frozen
 *   { schema, pattern, head, frame: [x, y, w, h] }
 * where `head` is the embedded log's head, so the consumer can tell which
 * state it measured. `head` is provenance, not identity: two panes showing the
 * same head are still two panes with two cameras, and only the mount tells
 * them apart.
 */
export function visibleFrameOf(surfaceMount) {
  try {
    // The current iframe, not one from a previous render, and unambiguous.
    const frames = surfaceMount?.querySelectorAll?.('iframe[data-package="semantic-map"]');
    if (frames?.length !== 1) return null;

    // Cross-origin: reading this property throws, so the catch is the contract.
    const site = frames[0].contentWindow?.semanticMapSite;
    if (site?.ready !== true) return null;

    const adapter = site.editor?.adapter;
    if (typeof adapter?.viewport !== 'function') return null;
    if (typeof adapter?.cameraPreviewSnapshot !== 'function') return null;
    if (typeof site.editor?.currentScene !== 'function') return null;

    // The scene that is drawn, not only the view that was asked for: during a
    // pattern change the declared view moves first, and the frame would then be
    // in the coordinates of a layout nobody is looking at.
    if (site.runtime?.view?.pattern !== GRAPH_PATTERN) return null;
    if (site.editor.currentScene()?.pattern !== GRAPH_PATTERN) return null;

    // A gesture transforms the rendered SVG and commits the camera only when it
    // ends, so the camera reads back the position from before the gesture -
    // confidently wrong rather than merely unsettled.
    if (adapter.cameraPreviewSnapshot()?.active === true) return null;

    const head = site.runtime?.head;
    if (typeof head !== 'string' || head.length === 0) return null;

    // A pane with no size answers that nothing fits, which is never useful.
    const viewport = adapter.viewport();
    const measured = [viewport?.x, viewport?.y, viewport?.width, viewport?.height];
    if (!measured.every(Number.isFinite)) return null;
    if (!(measured[2] > 0) || !(measured[3] > 0)) return null;

    // What the embed would show if the host gave it the room it asked for is
    // not what a person sees. A host that hides its overflow cuts the iframe
    // short, and everything past the cut is still inside the embed's own
    // viewport, still has a cell in the document, and is on nobody's screen. So
    // the frame is narrowed to the part of the graph container the host shows.
    const container = adapter.container;
    if (typeof container?.getBoundingClientRect !== 'function') return null;
    const clientWidth = container.clientWidth;
    if (!(clientWidth > 0) || !(container.clientHeight > 0)) return null;

    // One host pixel must be one embed pixel for the conversion below. A scale
    // anywhere above the iframe shows up here and nowhere else.
    const frameRect = frames[0].getBoundingClientRect();
    const embedView = frames[0].contentWindow;
    if (Math.abs(frameRect.width - embedView.innerWidth) > 1) return null;
    if (Math.abs(frameRect.height - embedView.innerHeight) > 1) return null;

    const shown = hostVisibleEdges(frames[0]);
    if (shown === null) return null;

    // The container's own box, moved from the embed's coordinates into the
    // host's, and cut down to what the host shows.
    const containerRect = container.getBoundingClientRect();
    const box = {
      left: frameRect.left + containerRect.left,
      top: frameRect.top + containerRect.top,
      width: containerRect.width,
      height: containerRect.height,
    };
    const visible = intersectEdges(shown, edgesOfRect(box));
    if (visible === null) return null;

    // How much of the pane each edge loses, in host pixels. Expressed as insets
    // rather than rebuilt from the rectangle, so a pane the host does not clip
    // answers with the view's own viewport exactly rather than with the same
    // number re-derived through a rounded client size.
    const inset = {
      left: visible.left - box.left,
      top: visible.top - box.top,
      right: box.left + box.width - visible.right,
      bottom: box.top + box.height - visible.bottom,
    };
    const SUBPIXEL = 0.5;
    const clipped = Object.values(inset).some(value => value > SUBPIXEL);
    let measuredVisible = measured;
    if (clipped) {
      // Host pixels back to the view's own coordinates. The camera scales both
      // axes alike, so one ratio converts both.
      const scale = clientWidth / measured[2];
      if (!Number.isFinite(scale) || !(scale > 0)) return null;
      measuredVisible = [
        measured[0] + inset.left / scale,
        measured[1] + inset.top / scale,
        measured[2] - (inset.left + inset.right) / scale,
        measured[3] - (inset.top + inset.bottom) / scale,
      ];
    }
    if (!measuredVisible.every(Number.isFinite)) return null;
    if (!(measuredVisible[2] > 0) || !(measuredVisible[3] > 0)) return null;

    // A camera at the origin negates zero. Negative zero says nothing about
    // where the pane is and only makes a consumer's comparison fail.
    const frame = measuredVisible.map(value => (value === 0 ? 0 : value));

    return Object.freeze({
      schema: VISIBLE_FRAME_SCHEMA,
      pattern: GRAPH_PATTERN,
      head,
      frame: Object.freeze(frame),
    });
  } catch {
    return null;
  }
}
