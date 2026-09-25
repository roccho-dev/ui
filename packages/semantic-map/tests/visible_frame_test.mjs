import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VISIBLE_FRAME_SCHEMA, visibleFrameOf } from '../runtime.js';

// The culling margin is the projector's own, read from its source rather than
// copied here: a number copied into a test drifts silently, which is the exact
// failure this whole contract exists to prevent. The projector does not export
// it, and this contract is not a reason to widen the projector's surface.
const projectorSource = fs.readFileSync(fileURLToPath(new URL('../projection/projector.js', import.meta.url)), 'utf8');
const marginMatch = projectorSource.match(/^const VIEWPORT_MARGIN_PX = (\d+);$/mu);
assert.ok(marginMatch, 'the projector no longer declares VIEWPORT_MARGIN_PX the way this test reads it');
const VIEWPORT_MARGIN_PX = Number(marginMatch[1]);

// The public read-only visible-frame contract: what the pane is currently
// showing, so a consumer can tell a spot a person can see from one that is
// only inside the enclosing boundary or inside the renderer's pre-render band.
//
// Every failure is null. Reaching into a cross-origin frame throws rather than
// returning undefined, and a consumer that lost its whole placement path to an
// exception would be worse off than one told "cannot check right now".

const GRAPH = 'graph/1';
const HEAD = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';

const rect = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height,
  x: left, y: top,
});

// A stand-in for the host page and the embed inside it, answering exactly what
// the real ones answer: a mount that may clip or transform, an iframe the host
// sizes, and the graph container the embed measures. The mount sits at the
// origin of client space and the iframe at the origin of the mount, so every
// number below can be read off by hand.
//
// `throwing` reproduces a cross-origin read, which raises on property access
// rather than returning undefined.
const fakeHost = ({
  ready = true,
  head = HEAD,
  declaredPattern = GRAPH,
  scenePattern = GRAPH,
  previewActive = false,
  scale = 1,
  translateX = 0,
  translateY = 0,
  clientWidth = 640,
  clientHeight = 480,
  containerLeft = 0,
  containerTop = 0,
  frameWidth = null,
  frameHeight = null,
  innerWidth = null,
  innerHeight = null,
  hostWidth = null,
  hostHeight = null,
  hostOverflow = 'visible',
  hostTransform = 'none',
  hostClipPath = 'none',
  frameTransform = 'none',
  frameClipPath = 'none',
  outerOverflow = 'visible',
  outerHeight = null,
  omit = null,
  count = 1,
  throwing = false,
} = {}) => {
  const frameBox = rect(0, 0, frameWidth ?? clientWidth, frameHeight ?? clientHeight);
  const mountBox = rect(0, 0, hostWidth ?? frameBox.width, hostHeight ?? frameBox.height);
  const outerBox = rect(0, 0, mountBox.width, outerHeight ?? mountBox.height);

  const container = {
    clientWidth,
    clientHeight,
    getBoundingClientRect: () => rect(containerLeft, containerTop, clientWidth, clientHeight),
  };
  const adapter = {
    container,
    viewport: () => ({
      x: -translateX,
      y: -translateY,
      width: clientWidth / scale,
      height: clientHeight / scale,
    }),
    cameraPreviewSnapshot: () => ({ active: previewActive, camera: null }),
  };
  if (omit === 'viewport') delete adapter.viewport;
  if (omit === 'cameraPreviewSnapshot') delete adapter.cameraPreviewSnapshot;
  if (omit === 'container') delete adapter.container;
  const editor = {
    adapter,
    currentScene: () => (scenePattern === null ? null : { pattern: scenePattern }),
  };
  if (omit === 'currentScene') delete editor.currentScene;
  if (omit === 'adapter') delete editor.adapter;
  const site = { ready, editor, runtime: { head, view: { pattern: declaredPattern } } };

  const styles = new Map();
  const outer = {
    parentElement: null,
    getBoundingClientRect: () => outerBox,
  };
  const mount = {
    parentElement: outer,
    getBoundingClientRect: () => mountBox,
    querySelectorAll: () => frames,
  };
  const frame = {
    parentElement: mount,
    getBoundingClientRect: () => frameBox,
    get contentWindow() {
      if (throwing) throw new DOMException('Blocked a frame with origin', 'SecurityError');
      return {
        semanticMapSite: site,
        innerWidth: innerWidth ?? frameBox.width,
        innerHeight: innerHeight ?? frameBox.height,
      };
    },
    ownerDocument: {
      defaultView: { getComputedStyle: node => styles.get(node) ?? { overflowX: 'visible', overflowY: 'visible', transform: 'none', clipPath: 'none' } },
    },
  };
  styles.set(frame, { overflowX: 'visible', overflowY: 'visible', transform: frameTransform, clipPath: frameClipPath });
  styles.set(mount, { overflowX: hostOverflow, overflowY: hostOverflow, transform: hostTransform, clipPath: hostClipPath });
  styles.set(outer, { overflowX: outerOverflow, overflowY: outerOverflow, transform: 'none', clipPath: 'none' });
  const frames = Array.from({ length: count }, () => frame);
  return mount;
};

// Two readings of the same builder, so a case says which half it is about: what
// the embed reports, and what the host does to it.
const fakeSite = embedState => embedState ?? {};
const fakeMount = (embedState, host = {}) => fakeHost({ ...(embedState ?? {}), ...host });

// 1. Shape, and the promise that reading changes nothing.
const answer = visibleFrameOf(fakeMount(fakeSite()));
assert.deepEqual(Object.keys(answer).sort(), ['frame', 'head', 'pattern', 'schema']);
assert.equal(answer.schema, VISIBLE_FRAME_SCHEMA);
assert.equal(answer.pattern, GRAPH);
assert.equal(answer.head, HEAD);
assert.ok(Object.isFrozen(answer) && Object.isFrozen(answer.frame));
assert.deepEqual(answer.frame, [0, 0, 640, 480]);
assert.ok(answer.frame.every(Number.isFinite));
// A camera at the origin negates zero, and -0 fails a consumer's comparison
// while saying nothing about where the pane is.
assert.ok(answer.frame.every(value => !Object.is(value, -0)), 'no negative zero reaches the consumer');

// 2. The frame is exactly the adapter's own viewport, at a scale that is not
// one and a camera that is not at the origin. A scale applied twice, or a
// translate read with the wrong sign, shows up here and nowhere else.
const moved = visibleFrameOf(fakeMount(fakeSite({
  scale: 0.5, translateX: 36.6, translateY: -312.4, clientWidth: 523.5, clientHeight: 584,
})));
assert.deepEqual(moved.frame, [-36.6, 312.4, 1047, 1168]);

// 3. Uninflated. The renderer culls against this frame grown by a margin, so a
// band just outside it is built, connected to the document and invisible. The
// contract must report the inner rectangle; if it ever reported the band, a
// consumer would place parts into exactly the gap this exists to close.
const SCALE = 0.5;
const banded = visibleFrameOf(fakeMount(fakeSite({ scale: SCALE, clientWidth: 400, clientHeight: 300 })));
const [bx, by, bw, bh] = banded.frame;
const margin = VIEWPORT_MARGIN_PX / SCALE;
assert.equal(margin, 160, 'precondition: the margin is read from the projector, not copied here');
const inflated = [bx - margin, by - margin, bw + margin * 2, bh + margin * 2];
assert.deepEqual(inflated, [-160, -160, 1120, 920], 'the projector culls against this, not the frame');
assert.ok(bw < inflated[2] && bh < inflated[3], 'the reported frame is the smaller, visible one');

// 4. Every way of having no answer is the same answer: null, never a throw.
const nulls = [
  ['no mount', undefined],
  ['a mount that cannot be queried', {}],
  ['no embed in the mount', fakeMount(fakeSite(), { count: 0 })],
  ['two embeds, so which one is ambiguous', fakeMount(fakeSite(), { count: 2 })],
  ['a cross-origin frame', fakeMount(fakeSite(), { throwing: true })],
  ['no contentWindow at all', { querySelectorAll: () => [{ contentWindow: null }] }],
  ['no site yet, as just after a re-render', { querySelectorAll: () => [{ contentWindow: {} }] }],
  ['a site that failed to open', fakeMount({ ready: false, error: 'boom' })],
  ['a site whose ready is anything but true', fakeMount(fakeSite({ ready: 'opening' }))],
  ['a camera gesture in flight', fakeMount(fakeSite({ previewActive: true }))],
  ['a pattern this contract cannot speak for', fakeMount(fakeSite({ declaredPattern: 'map/1', scenePattern: 'map/1' }))],
  ['a view that moved on before the scene did', fakeMount(fakeSite({ declaredPattern: GRAPH, scenePattern: 'map/1' }))],
  ['a scene that moved on before the view did', fakeMount(fakeSite({ declaredPattern: 'map/1', scenePattern: GRAPH }))],
  ['nothing drawn yet', fakeMount(fakeSite({ scenePattern: null }))],
  ['a pane with no width', fakeMount(fakeSite({ clientWidth: 0 }))],
  ['a pane with no height', fakeMount(fakeSite({ clientHeight: 0 }))],
  ['a camera at a scale of zero', fakeMount(fakeSite({ scale: 0 }))],
  ['a camera that is not a number', fakeMount(fakeSite({ translateX: Number.NaN }))],
  ['no head to say which state this is', fakeMount(fakeSite({ head: null }))],
  ['an empty head', fakeMount(fakeSite({ head: '' }))],
  ['a site shape with no editor adapter', fakeMount(fakeSite({ omit: 'adapter' }))],
  ['a site shape with no viewport', fakeMount(fakeSite({ omit: 'viewport' }))],
  ['a site shape that cannot report a preview', fakeMount(fakeSite({ omit: 'cameraPreviewSnapshot' }))],
  // feature-runtime builds a different site whose editor has no currentScene.
  ['a site shape that cannot report its drawn scene', fakeMount(fakeSite({ omit: 'currentScene' }))],
  ['an adapter that cannot say which container it measured', fakeMount(fakeSite({ omit: 'container' }))],
  // A host that leaves none of the pane showing, and hosts whose transform an
  // axis-aligned rectangle cannot describe.
  ['a host that hides the pane entirely', fakeMount(fakeSite(), { hostHeight: 0, hostOverflow: 'hidden' })],
  ['a host that clips the pane away below its own box', fakeMount(fakeSite(), { containerTop: 700, hostHeight: 120, hostOverflow: 'hidden', frameHeight: 900 })],
  ['a host that rotates the embed', fakeMount(fakeSite(), { hostTransform: 'matrix(0.99, 0.12, -0.12, 0.99, 0, 0)' })],
  ['a host that scales the embed', fakeMount(fakeSite(), { hostTransform: 'matrix(2, 0, 0, 2, 0, 0)' })],
  ['a host that clips the embed to a shape', fakeMount(fakeSite(), { hostClipPath: 'circle(40%)' })],
  ['an embed under its own clip-path', fakeMount(fakeSite(), { frameClipPath: 'inset(10px)' })],
  ['a host whose pixels are not the embed\'s pixels', fakeMount(fakeSite(), { innerWidth: 320 })],
  ['a host whose rows are not the embed\'s rows', fakeMount(fakeSite(), { innerHeight: 240 })],
];
for (const [label, mount] of nulls) {
  let observed;
  assert.doesNotThrow(() => { observed = visibleFrameOf(mount); }, `${label} must not throw`);
  assert.equal(observed, null, label);
}

// 5. The same mount answers again after each of those, so a null is a moment,
// not a latch.
assert.deepEqual(visibleFrameOf(fakeMount(fakeSite())).frame, [0, 0, 640, 480]);

// 6. head is provenance, not pane identity. Two panes showing exactly the same
// state are still two panes, and only the mount tells them apart.
const left = visibleFrameOf(fakeMount(fakeSite({ clientWidth: 400 })));
const right = visibleFrameOf(fakeMount(fakeSite({ clientWidth: 900 })));
assert.equal(left.head, right.head, 'precondition: the same embedded state');
assert.notDeepEqual(left.frame, right.frame, 'yet different panes, so different frames');

// 7. What the host shows, not what the embed would show if it had the room.
// R measured this on 03f5c09: a mount 120 tall hiding its overflow, holding an
// iframe the embed sizes at 702. Everything below the cut is inside the embed's
// own viewport, has a cell in the document, and is on nobody's screen.
const roomy = visibleFrameOf(fakeMount(fakeSite({ scale: 0.5 }), { frameHeight: 480 }));
assert.deepEqual(roomy.frame, [0, 0, 1280, 960], 'precondition: the whole pane, at half scale');

const cut = visibleFrameOf(fakeMount(fakeSite({ scale: 0.5 }), { hostHeight: 120, hostOverflow: 'hidden' }));
assert.deepEqual(cut.frame, [0, 0, 1280, 240], 'only the 120 rows the host shows, in the view\'s own units');
assert.ok(cut.frame[3] < roomy.frame[3], 'and that is less than the embed would show on its own');

// A scroll container reports the box it is showing, so the same intersection is
// exact there too - hidden, clipped, scrolled or automatic alike.
for (const overflow of ['hidden', 'clip', 'auto', 'scroll']) {
  const observed = visibleFrameOf(fakeMount(fakeSite({ scale: 0.5 }), { hostHeight: 120, hostOverflow: overflow }));
  assert.deepEqual(observed.frame, [0, 0, 1280, 240], overflow);
}
// ...while a host that lets its overflow escape hides nothing.
assert.deepEqual(
  visibleFrameOf(fakeMount(fakeSite({ scale: 0.5 }), { hostHeight: 120, hostOverflow: 'visible' })).frame,
  [0, 0, 1280, 960],
  'a visible overflow is not a clip',
);

// Clipping is cumulative: an ancestor of the mount narrows it further.
assert.deepEqual(
  visibleFrameOf(fakeMount(fakeSite({ scale: 0.5 }), {
    hostHeight: 200, hostOverflow: 'hidden', outerHeight: 90, outerOverflow: 'hidden',
  })).frame,
  [0, 0, 1280, 180],
  'the smallest clipping ancestor wins',
);

// The cut is taken where it falls, not always from the top: a container that
// starts below the host's top edge loses its first rows, and the frame's origin
// moves with them.
const offset = visibleFrameOf(fakeMount(fakeSite({ scale: 0.5, translateX: 100, translateY: 40 }), {
  containerTop: 60, frameHeight: 600, hostHeight: 300, hostOverflow: 'hidden',
}));
assert.deepEqual(offset.frame, [-100, -40, 1280, 480],
  'the visible rows begin at the container top and end at the host cut');

// A pure translation is exact, so it must not cost an answer.
assert.deepEqual(
  visibleFrameOf(fakeMount(fakeSite(), { hostTransform: 'matrix(1, 0, 0, 1, 13, 29)' })).frame,
  [0, 0, 640, 480],
  'a host that only moves the embed is still measurable',
);

console.log(JSON.stringify({
  schema: 'semantic-map-visible-frame-test/1',
  status: 'PASS',
  frame: answer.frame,
  nullCases: nulls.length,
}));
