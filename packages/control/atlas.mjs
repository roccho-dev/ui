// Live Agent Organization Atlas application adapter.
// Acquisition/bootstrap stays here; reusable screens live in atlas-ui.mjs.
import { applyEnvelope, connectLiveAtlas, createAtlasState, loadHistory } from './src/live-atlas.mjs';
import { ATLAS_WORLD_KIND } from './src/atlas-world.mjs';
import { mountAtlasUI, mountAtlasWorldUI } from './atlas-ui.mjs';

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

const startWorldAtlas = ({ input, eventsUrl, selected }) => {
  const ui = mountAtlasWorldUI({
    root: document.body,
    input,
    mode: eventsUrl ? 'live' : 'sample',
    connected: false,
    now: Date.now(),
    selected: selected || null,
    onSelect: id => history.replaceState(null, '', '#sel=' + encodeURIComponent(id)),
  });

  let source = null;
  if (eventsUrl) {
    source = connectLiveAtlas({
      url: eventsUrl,
      onConnection: connected => ui.setSession({ connected, mode: 'live', now: Date.now() }),
      onSnapshot: data => {
        ui.setSession({ input: data, connected: ui.page.connected, mode: 'live', now: Date.now(), latest: ui.page.latest, reportInvalid: true });
      },
    });
  }

  return publishApi(ui, () => {
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

export const startLiveAtlas = () => {
  const params = new URLSearchParams(location.search);
  const eventsUrl = params.get('events');
  const input = readInput();
  const selected = hashSelection();
  return input?.kind === ATLAS_WORLD_KIND
    ? startWorldAtlas({ input, eventsUrl, selected })
    : startLegacyAtlas({ input, eventsUrl, selected });
};
