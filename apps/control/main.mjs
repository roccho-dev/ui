import { getFeature } from '/packages/a2ui-browser/feature.mjs';
import { mountFeature } from '/packages/a2ui-browser/src/feature-app.mjs';
import * as planModule from '/packages/control/model.mjs';
import { loadControlInput } from '/packages/control/live-input.mjs';
import { editExistingField } from '/packages/control/editor.mjs';
import { parseControl } from '/packages/control/src/control-graph.mjs';

const invariant = (condition, message) => {
  if (!condition) throw new Error(`control-app: ${message}`);
};

const readDesign = async () => {
  const response = await fetch('/design.json', { cache: 'no-store' });
  invariant(response.ok, `/design.json returned HTTP ${response.status}`);
  return response.json();
};

const boot = async () => {
  const root = document.querySelector('#feature');
  invariant(root, '#feature required');
  const selection = document.querySelector('#selection');
  const value = document.querySelector('#value');
  const applyButton = document.querySelector('#apply');
  const saveButton = document.querySelector('#save');
  const reloadButton = document.querySelector('#reload');
  const status = document.querySelector('#status');

  const [design, live] = await Promise.all([readDesign(), loadControlInput()]);
  invariant(/^"sha256-[a-f0-9]{64}"$/u.test(live.controlEtag ?? ''), 'strong Control ETag required');
  const feature = Object.freeze({ ...getFeature('control'), planModule });
  let source = live.control;
  let candidate = source;
  let etag = live.controlEtag;
  let selected = null;
  let busy = false;
  const note = message => { status.textContent = message; };
  const refreshButtons = () => {
    value.disabled = !selected || busy;
    applyButton.disabled = !selected || busy || candidate !== source;
    saveButton.disabled = busy || candidate === source;
  };
  const render = async () => {
    const mounted = await mountFeature({
      feature,
      input: Object.freeze({ design, control: candidate, ...(live.claims === undefined ? {} : { claims: live.claims }) }),
      root,
      scope: globalThis,
    });
    globalThis.controlUiProof = Object.freeze({ status: 'PASS', mounted, dirty: candidate !== source });
  };

  root.addEventListener('click', event => {
    const property = event.target.closest?.('.property[data-key]');
    if (property?.closest('[data-control-column]')?.dataset.controlColumn !== 'control') return;
    const row = property?.closest('[data-control-row]');
    if (!row) return;
    const key = property.dataset.key;
    if (key === 'id' || key === 'rel') { note('Identity and relation are locked.'); return; }
    const record = parseControl(candidate).find(item => item.id === row.dataset.controlRow);
    if (!record || !Object.hasOwn(record, key)) return;
    selected = { id: record.id, key };
    selection.textContent = `${record.id} · ${key}`;
    value.value = JSON.stringify(record[key], null, 2);
    refreshButtons();
  });

  applyButton.addEventListener('click', async () => {
    try {
      invariant(candidate === source, 'save or reload before another edit');
      candidate = editExistingField({ source, id: selected.id, key: selected.key, value: JSON.parse(value.value) });
      await render();
      note('Unsaved local change. Save writes a draft, not adopted policy.');
      refreshButtons();
    } catch (error) { note(`Edit rejected: ${error.message}`); }
  });

  saveButton.addEventListener('click', async () => {
    if (busy || candidate === source) return;
    busy = true; refreshButtons(); note('Saving local draft…');
    try {
      const response = await fetch('/data/control.jsonl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'If-Match': etag },
        body: candidate,
      });
      if (!response.ok) {
        note(response.status === 412 ? 'Stale version. Unsaved text remains; reload explicitly.' : `Save rejected: HTTP ${response.status}`);
        return;
      }
      const result = await response.json();
      const readback = await fetch('/data/control.jsonl', { cache: 'no-store' });
      const readbackText = await readback.text();
      const readbackEtag = readback.headers.get('etag');
      invariant(readback.ok && result.etag === readbackEtag && readbackText === candidate, 'save readback mismatch');
      source = readbackText;
      etag = readbackEtag;
      note('Local draft saved and read back. Policy is not adopted.');
      await render();
    } catch (error) { note(`Save uncertain: ${error.message}. Preserve this text and inspect the file before retrying.`); }
    finally { busy = false; refreshButtons(); }
  });

  reloadButton.addEventListener('click', async () => {
    if (busy || (candidate !== source && !globalThis.confirm('Discard unsaved local change?'))) return;
    busy = true; refreshButtons();
    try {
      const next = await loadControlInput();
      invariant(/^"sha256-[a-f0-9]{64}"$/u.test(next.controlEtag ?? ''), 'strong Control ETag required');
      source = next.control; candidate = source; etag = next.controlEtag;
      selected = null; selection.textContent = 'Select a property in the Control tree.'; value.value = '';
      await render(); note('Reloaded.');
    } catch (error) { note(`Reload failed: ${error.message}`); }
    finally { busy = false; refreshButtons(); }
  });

  await render();
  refreshButtons();

  document.documentElement.dataset.status = 'pass';
};

boot().catch(error => {
  document.documentElement.dataset.status = 'fail';
  const fatal = document.querySelector('#fatal');
  if (fatal) {
    fatal.hidden = false;
    fatal.textContent = `BLOCKED · ${error.message}`;
  }
  globalThis.controlUiProof = Object.freeze({ status: 'FAIL', error: String(error.message) });
});
