// Live Agent Organization Atlas application adapter.
// Acquisition/bootstrap stays here; the reusable screen lives in atlas-ui.mjs.
import { applyEnvelope, connectLiveAtlas, createAtlasState, loadHistory } from './src/live-atlas.mjs';
import { mountAtlasUI } from './atlas-ui.mjs';

const readInput = () => JSON.parse(document.getElementById('live-atlas-input').textContent);

const hashSelection = () => {
  try {
    return decodeURIComponent((location.hash.match(/^#sel=(.+)$/u) ?? [])[1] ?? '');
  } catch {
    return '';
  }
};

export const startLiveAtlas = () => {
  const params = new URLSearchParams(location.search);
  const eventsUrl = params.get('events');
  const mode = eventsUrl ? 'live' : 'sample';
  const state = eventsUrl ? createAtlasState() : loadHistory(readInput());
  const ui = mountAtlasUI({
    root: document.body,
    state,
    mode,
    connected: false,
    now: Date.now(),
    selected: hashSelection() || null,
    onSelect: id => history.replaceState(null, '', `#sel=${encodeURIComponent(id)}`),
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
        ui.setSession({ state: next, mode: 'live', connected: ui.page.connected, now, latest: true });
        if (firstAccepted && next.held) ui.fit();
      },
    });
    timer = setInterval(() => ui.tick(Date.now()), 1000);
  }

  const api = Object.freeze({
    adapter: ui.adapter,
    page: ui.page,
    select: ui.select,
    fit: ui.fit,
    zoomBy: ui.zoomBy,
    setSession: ui.setSession,
    tick: ui.tick,
    get state() { return ui.state; },
    get projection() { return ui.projection; },
    lodFor: ui.lodFor,
    destroy() {
      if (timer !== null) clearInterval(timer);
      source?.close();
      ui.destroy();
      delete document.documentElement.dataset.liveAtlasReady;
    },
  });
  globalThis.liveAtlas = api;
  document.documentElement.dataset.liveAtlasReady = 'true';
  return api;
};
