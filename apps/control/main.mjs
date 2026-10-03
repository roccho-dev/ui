import { getFeature } from '/packages/a2ui-browser/feature.mjs';
import { mountFeature } from '/packages/a2ui-browser/src/feature-app.mjs';
import * as planModule from '/packages/control/model.mjs';
import { loadControlInput } from '/packages/control/live-input.mjs';
import { createChild, deleteLeaf, updateRecord } from '/packages/control/editor.mjs';
import { connectControl, parseControl } from '/packages/control/src/control-graph.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`control-app: ${message}`); };
const strongEtag = value => /^"sha256-[a-f0-9]{64}"$/u.test(value ?? '');

const boot = async () => {
  const root = document.querySelector('#feature');
  const dialog = document.querySelector('#editor');
  const title = document.querySelector('#editor-title');
  const input = document.querySelector('#record-editor');
  const editorError = document.querySelector('#editor-error');
  const saveButton = document.querySelector('#save');
  const reloadButton = document.querySelector('#reload');
  const status = document.querySelector('#status');
  const fatal = document.querySelector('#fatal');
  invariant(root && dialog && title && input && editorError && saveButton && reloadButton && status, 'editor shell incomplete');

  const designResponse = await fetch('/design.json', { cache: 'no-store' });
  invariant(designResponse.ok, `/design.json returned HTTP ${designResponse.status}`);
  const design = await designResponse.json();
  const feature = Object.freeze({ ...getFeature('control'), planModule });
  let live = await loadControlInput();
  invariant(strongEtag(live.controlEtag), 'strong Control ETag required');
  let source = live.control;
  let etag = live.controlEtag;
  let editing = null;
  let saving = false;

  const note = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };
  const render = async () => {
    connectControl(parseControl(source));
    const mounted = await mountFeature({
      feature,
      input: Object.freeze({ design, control: source, ...(live.claims === undefined ? {} : { claims: live.claims }) }),
      root,
      scope: globalThis,
    });
    globalThis.controlUiProof = Object.freeze({ status: 'PASS', mounted });
  };
  const setSaving = value => {
    saving = value;
    saveButton.disabled = value;
    reloadButton.disabled = value;
    root.querySelectorAll('[data-edit-id],[data-control-action]').forEach(button => { button.disabled = value || button.dataset.locked === 'true'; });
  };
  const findRecord = id => parseControl(source).find(record => record.id === id);
  const selectProperty = (text, record, key) => {
    const marker = `  ${JSON.stringify(key)}:`;
    const start = text.indexOf(marker);
    if (start < 0) return;
    const from = start + marker.length + 1;
    const token = JSON.stringify(record[key]);
    if (record[key] === null || typeof record[key] !== 'object') input.setSelectionRange(from, from + token.length);
    else {
      const end = text.indexOf('\n', start);
      input.setSelectionRange(start, end < 0 ? text.length : end);
    }
  };
  const openEditor = (mode, record, key, trigger) => {
    if (saving) return;
    editing = { mode, id: record.id, key, trigger };
    editorError.textContent = '';
    title.textContent = `${mode} · ${record.id} · ${key}`;
    const value = mode === 'update' ? { ...record } : { id: '', rel: { parent: record.id, kind: '' } };
    input.value = JSON.stringify(value, null, 2);
    dialog.showModal();
    input.focus();
    selectProperty(input.value, value, key);
  };
  const saveCandidate = async candidate => {
    if (saving) throw new Error('save in progress');
    setSaving(true);
    note('Saving local draft…');
    try {
      const response = await fetch('/data/control.jsonl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'If-Match': etag },
        body: candidate,
      });
      if (!response.ok) {
        const message = response.status === 412 ? 'Stale version. Unsaved text remains; reload explicitly.' : `HTTP ${response.status}: ${(await response.text()).trim()}`;
        throw new Error(message);
      }
      const result = await response.json();
      const readback = await fetch('/data/control.jsonl', { cache: 'no-store' });
      const body = await readback.text();
      const nextEtag = readback.headers.get('etag');
      invariant(readback.ok && strongEtag(nextEtag) && result.etag === nextEtag && body === candidate, 'save readback mismatch');
      source = body;
      etag = nextEtag;
      await render();
      note('Local draft saved and read back. Policy is not adopted.');
    } catch (error) {
      note(`Save failed: ${error.message}`, true);
      throw error;
    } finally { setSaving(false); }
  };

  root.addEventListener('click', async event => {
    const property = event.target.closest?.('[data-edit-id][data-edit-key]');
    if (property && root.contains(property)) {
      const record = findRecord(property.dataset.editId);
      if (record) openEditor('update', record, property.dataset.editKey, property);
      return;
    }
    const action = event.target.closest?.('[data-control-action][data-control-id]');
    if (!action || !root.contains(action) || action.disabled) return;
    const record = findRecord(action.dataset.controlId);
    if (!record) return;
    if (action.dataset.controlAction === 'create') openEditor('create', record, 'id', action);
    if (action.dataset.controlAction === 'delete' && globalThis.confirm(`delete ${record.id}?`)) {
      try { await saveCandidate(deleteLeaf({ source, id: record.id })); }
      catch { /* status already describes the failure; never retry automatically */ }
    }
  });

  saveButton.addEventListener('click', async () => {
    if (saving || !editing) return;
    editorError.textContent = '';
    try {
      const value = JSON.parse(input.value);
      const candidate = editing.mode === 'update'
        ? updateRecord({ source, id: editing.id, value })
        : createChild({ source, parentId: editing.id, value });
      await saveCandidate(candidate);
      dialog.close();
    } catch (error) { editorError.textContent = error.message; }
  });
  document.querySelector('#cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    editorError.textContent = '';
    if (editing?.trigger?.isConnected) editing.trigger.focus();
    else if (editing?.mode === 'update') root.querySelector(`[data-edit-id="${CSS.escape(editing.id)}"][data-edit-key="${CSS.escape(editing.key)}"]`)?.focus();
    else root.querySelector(`[data-control-action="create"][data-control-id="${CSS.escape(editing?.id ?? '')}"]`)?.focus();
  });
  reloadButton.addEventListener('click', async () => {
    if (saving || (dialog.open && !globalThis.confirm('Discard unsaved text and reload?'))) return;
    try {
      const next = await loadControlInput();
      invariant(strongEtag(next.controlEtag), 'strong Control ETag required');
      source = next.control; etag = next.controlEtag; live = next;
      if (dialog.open) dialog.close();
      await render();
      note('Reloaded local data.');
    } catch (error) { note(`Reload failed: ${error.message}`, true); }
  });

  await render();
  document.documentElement.dataset.status = 'pass';
  if (fatal) fatal.hidden = true;
};

boot().catch(error => {
  document.documentElement.dataset.status = 'fail';
  const fatal = document.querySelector('#fatal');
  if (fatal) { fatal.hidden = false; fatal.textContent = `BLOCKED · ${error.message}`; }
  globalThis.controlUiProof = Object.freeze({ status: 'FAIL', error: String(error.message) });
});
