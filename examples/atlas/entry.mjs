// Atlas application-usecase example adapter.
// It owns deterministic fixture playback only; all screen behavior is shared.
import { applyEnvelope, loadHistory } from '../../packages/control/src/live-atlas.mjs';
import { mountAtlasUI } from '../../packages/control/atlas-ui.mjs';

const source = document.getElementById('live-atlas-input')?.textContent?.trim();
if (!source) throw new Error('atlas example: fixture input required');
const fixture = JSON.parse(source);
const steps = Array.isArray(fixture.script) ? fixture.script : [];
const state = loadHistory(fixture);
const initialNow = Date.parse(state.held?.asOf ?? fixture.snapshots.at(-1)?.asOf ?? '1970-01-01T00:00:00Z');
const ui = mountAtlasUI({ root: document.body, state, mode: 'sample', connected: false, now: initialNow });

const controls = document.createElement('div');
controls.id = 'atlas-example-controls';
Object.assign(controls.style, {
  display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto',
  paddingLeft: '6px', whiteSpace: 'nowrap',
});
const button = document.createElement('button');
button.id = 'atlas-example-next';
button.type = 'button';
const label = document.createElement('span');
label.id = 'atlas-example-step';
const provenance = document.createElement('span');
provenance.id = 'atlas-example-provenance';
provenance.textContent = 'fixture · synthetic';
provenance.title = fixture.note ?? 'Synthetic Atlas fixture';

let cursor = 0;
const updateControl = () => {
  button.disabled = cursor >= steps.length;
  button.textContent = cursor >= steps.length ? 'Replay complete' : 'Next scripted update';
  label.textContent = `${cursor}/${steps.length}`;
};
const advance = () => {
  if (cursor >= steps.length) return null;
  const step = steps[cursor++];
  const now = Date.parse(step.now);
  if (!Number.isFinite(now)) throw new Error('atlas example: step.now must be ISO time');
  if (step.op === 'connection') {
    ui.setSession({ mode: 'live', connected: step.connected, now, latest: true });
  } else if (step.op === 'snapshot') {
    const next = applyEnvelope(ui.state, step.snapshot, { now });
    ui.setSession({
      state: next,
      mode: 'live',
      connected: step.connected ?? ui.page.connected,
      now,
      latest: true,
    });
  } else {
    throw new Error(`atlas example: unsupported op ${step.op}`);
  }
  updateControl();
  return step;
};
button.addEventListener('click', advance);
controls.append(provenance, button, label);
const bar = document.getElementById('atlas-bar');
if (!bar) throw new Error('atlas example: shared screen bar missing');
bar.append(controls);
updateControl();
ui.fit();

const api = Object.freeze({
  adapter: ui.adapter,
  page: ui.page,
  select: ui.select,
  fit: ui.fit,
  zoomBy: ui.zoomBy,
  get state() { return ui.state; },
  get projection() { return ui.projection; },
  lodFor: ui.lodFor,
  destroy() {
    button.removeEventListener('click', advance);
    controls.remove();
    ui.destroy();
    delete globalThis.liveAtlas;
    delete globalThis.atlasExample;
    delete document.documentElement.dataset.liveAtlasReady;
  },
});
globalThis.liveAtlas = api;
globalThis.atlasExample = Object.freeze({ advance, get cursor() { return cursor; }, get total() { return steps.length; } });
document.documentElement.dataset.liveAtlasReady = 'true';
