// Live Agent Organization Atlas application adapter.
// Acquisition/bootstrap stays here; reusable screens live in atlas-ui.mjs.
import { applyEnvelope, connectLiveAtlas, createAtlasState, loadHistory, snapshotSize } from './src/live-atlas.mjs';
import { ATLAS_WORLD_KIND } from './src/atlas-world.mjs';
import { mountAtlasUI, mountAtlasWorldUI } from './atlas-ui.mjs';
import { RECEIVE_WINDOW_MS, formatViewHash, parseViewHash } from './src/atlas-timeline.mjs';

const readInput = () => JSON.parse(document.getElementById('live-atlas-input').textContent);

const hashSelection = () => {
  try {
    return decodeURIComponent((location.hash.match(/^#sel=(.+)$/u) ?? [])[1] ?? '');
  } catch {
    return '';
  }
};

const publishApi = (ui, cleanup) => {
  const api = Object.freeze({
    adapter: ui.adapter,
    page: ui.page,
    select: ui.select,
    selectRef: ui.selectRef,
    selectRelationRef: ui.selectRelationRef,
    setFrame: ui.setFrame,
    stepFrame: ui.stepFrame,
    setSession: ui.setSession,
    fit: ui.fit,
    focusSelected: ui.focusSelected,
    zoomBy: ui.zoomBy,
    get state() { return ui.state; },
    get input() { return ui.input; },
    get projection() { return ui.projection; },
    lodFor: ui.lodFor,
    destroy() {
      cleanup?.();
      ui.destroy();
      delete globalThis.liveAtlas;
      delete document.documentElement.dataset.liveAtlasReady;
    },
  });
  globalThis.liveAtlas = api;
  document.documentElement.dataset.liveAtlasReady = 'true';
  return api;
};

// The World keeps its viewed state in the URL fragment (`#sel=…&t=…`), so a
// reload restores the selection and a held past frame; `t` is absent while
// following the present.
const startWorldAtlas = ({ input, eventsUrl, chrome }) => {
  const view = parseViewHash(location.hash);
  const ui = mountAtlasWorldUI({
    root: document.body,
    input,
    chrome,
    mode: eventsUrl ? 'live' : 'sample',
    connected: false,
    now: Date.now(),
    selected: view.selected || null,
    frameId: view.frameId,
    onView: next => history.replaceState(null, '', location.pathname + location.search + formatViewHash(next)),
  });

  // Receiving is what arrived on the current connection: a new connection
  // starts with nothing received; each snapshot or heartbeat stamps the time.
  // No periodic tick: one timeout, rescheduled on each arrival, wakes the
  // screen just after the receive window ends so it stops claiming receipt.
  // Only an accepted snapshot or a well-formed heartbeat counts as received
  // and restarts the window; a rejected snapshot or malformed heartbeat
  // changes nothing. A snapshot records its size; a heartbeat its claimed
  // size, which must match it for the screen to call the World the latest.
  let source = null, expiry = null, freshness = null;
  const restartWindow = () => {
    if (expiry !== null) clearTimeout(expiry);
    expiry = setTimeout(() => { expiry = null; ui.tick(Date.now()); }, RECEIVE_WINDOW_MS + 1);
  };
  // A matched present frame goes stale at its matched_until: one timeout for
  // that moment (re-armed when the World changes), never a periodic tick.
  const armFreshness = () => {
    if (freshness !== null) clearTimeout(freshness);
    freshness = null;
    const present = ui.input.frames.at(-1);
    const until = present.phase === 'matched' && typeof present.matched_until === 'string' ? Date.parse(present.matched_until) : NaN;
    const wait = until - Date.now();
    if (Number.isFinite(wait) && wait >= 0) freshness = setTimeout(() => { freshness = null; ui.tick(Date.now(), true); }, Math.min(wait + 1, 2 ** 31 - 1));
  };
  armFreshness();
  // A background tab may not run the timers; judge again on coming back.
  const onVisible = () => { if (document.visibilityState === 'visible') ui.tick(Date.now(), true); };
  document.addEventListener('visibilitychange', onVisible);
  if (eventsUrl) {
    source = connectLiveAtlas({
      url: eventsUrl,
      onConnection: connected => ui.setSession({ connected, mode: 'live', now: Date.now(),
        ...(connected ? { receivedAt: null, snapshotBytes: null, heartbeatBytes: null } : {}) }),
      onSnapshot: data => {
        const at = Date.now();
        const accepted = ui.setSession({ input: data, connected: ui.page.connected, mode: 'live', now: at, receivedAt: at,
          snapshotBytes: snapshotSize(data), heartbeatBytes: null, latest: ui.page.latest, reportInvalid: true });
        if (accepted) { restartWindow(); armFreshness(); }
      },
      onHeartbeat: beat => {
        const at = Date.now();
        ui.setSession({ now: at, receivedAt: at, heartbeatBytes: beat.bytes });
        restartWindow();
      },
    });
  }

  return publishApi(ui, () => {
    if (expiry !== null) clearTimeout(expiry);
    if (freshness !== null) clearTimeout(freshness);
    document.removeEventListener('visibilitychange', onVisible);
    source?.close();
  });
};

const startLegacyAtlas = ({ input, eventsUrl, selected }) => {
  const mode = eventsUrl ? 'live' : 'sample';
  const state = eventsUrl ? createAtlasState() : loadHistory(input);
  const ui = mountAtlasUI({
    root: document.body,
    state,
    mode,
    connected: false,
    now: Date.now(),
    selected: selected || null,
    onSelect: id => history.replaceState(null, '', '#sel=' + encodeURIComponent(id)),
  });

  let source = null;
  let timer = null;
  if (eventsUrl) {
    source = connectLiveAtlas({
      url: eventsUrl,
      onConnection: connected => {
        ui.setSession({ connected, mode: 'live', now: Date.now() });
      },
      onSnapshot: data => {
        const now = Date.now();
        const firstAccepted = !ui.state.held;
        const next = applyEnvelope(ui.state, data, { now });
        ui.setSession({ state: next, mode: 'live', connected: ui.page.connected, now });
        if (firstAccepted && next.held) ui.fit();
      },
    });
    timer = setInterval(() => ui.tick(Date.now()), 1000);
  }

  return publishApi(ui, () => {
    if (timer !== null) clearInterval(timer);
    source?.close();
  });
};

// `chrome` is fixed by the build (see scripts/build-live-atlas.mjs), not by the URL.
export const startLiveAtlas = ({ chrome = 'full' } = {}) => {
  const params = new URLSearchParams(location.search);
  const eventsUrl = params.get('events');
  const input = readInput();
  const selected = hashSelection();
  return input?.kind === ATLAS_WORLD_KIND
    ? startWorldAtlas({ input, eventsUrl, chrome })
    : startLegacyAtlas({ input, eventsUrl, selected });
};
