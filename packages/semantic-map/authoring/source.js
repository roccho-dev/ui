import { canonicalJson } from '../protocol/index.js';
import { copyText, utf8Bytes, waitFor, waitForApp } from './shared.js';
import { envelopeText, MAX_ENVELOPE_BYTES } from './navigation.js';

const FORMATS = Object.freeze({
  state: Object.freeze({ label: 'State JSONL', role: 'current-state' }),
  log: Object.freeze({ label: 'DecisionLog JSONL', role: 'accepted-history' }),
  envelope: Object.freeze({ label: 'Envelope JSON', role: 'complete-invocation' }),
});

async function install() {
  const app = await waitForApp();
  const runtime = await waitFor('semanticMapRuntime');
  const layer = document.getElementById('source-layer');
  const openButton = document.getElementById('source-open');
  const closeButton = document.getElementById('source-close');
  const formatSelect = document.getElementById('source-format');
  const output = document.getElementById('source-output');
  const copyButton = document.getElementById('source-copy');
  const status = document.getElementById('source-status');
  let current = null;
  let rendering = false;

  function showStatus(message, kind = 'info') {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  async function currentEnvelope() {
    let proposal = runtime.proposal;
    if (!proposal && runtime.draftCount() > 0) proposal = await runtime.createDraftProposal();
    return runtime.envelope({ proposal, view: runtime.view });
  }

  async function valueFor(format) {
    switch (format) {
      case 'state':
        return app.exportJSONL();
      case 'log':
        return runtime.log;
      case 'envelope':
        return `${canonicalJson(await currentEnvelope())}\n`;
      default:
        throw new Error(`semantic-source-ui: unsupported format ${format}`);
    }
  }

  function description(format) {
    if (format === 'state') {
      return runtime.draftCount() > 0
        ? '現在表示中のStateです。未承認Local Draftを含みます。'
        : '現在表示中の承認済みStateです。';
    }
    if (format === 'log') return '承認済み変更だけを含む追記専用DecisionLogです。';
    if (runtime.draftCount() > 0) return 'DecisionLog、Local Draft Proposal、Viewをまとめた完全な入力です。';
    if (runtime.proposal) return 'DecisionLog、未承認URL Proposal、Viewをまとめた完全な入力です。';
    return 'DecisionLogとViewをまとめた完全な入力です。';
  }

  async function render(format = formatSelect.value) {
    if (rendering) return current;
    rendering = true;
    copyButton.disabled = true;
    try {
      const text = await valueFor(format);
      current = Object.freeze({
        format,
        label: FORMATS[format].label,
        role: FORMATS[format].role,
        text,
        bytes: utf8Bytes(text),
      });
      output.value = text;
      output.scrollTop = 0;
      showStatus(`${description(format)} ${current.bytes.toLocaleString()} bytes`, 'ok');
      copyButton.disabled = false;
      return current;
    } catch (error) {
      current = null;
      output.value = '';
      showStatus(error.message, 'error');
      throw error;
    } finally {
      rendering = false;
    }
  }

  async function open() {
    layer.hidden = false;
    await render();
    formatSelect.focus({ preventScroll: true });
    return current;
  }

  function close() {
    layer.hidden = true;
    openButton.focus({ preventScroll: true });
  }

  async function copy() {
    if (!current) await render();
    await copyText(current.text);
    showStatus(`${current.label}をコピーしました。`, 'ok');
    return current;
  }

  openButton.addEventListener('click', () => open().catch(() => {}));
  closeButton.addEventListener('click', close);
  formatSelect.addEventListener('change', () => render().catch(() => {}));
  copyButton.addEventListener('click', () => copy().catch((error) => showStatus(error.message, 'error')));
  document.getElementById('source-export')?.addEventListener('click', async () => {
    try {
      if (runtime.proposal || runtime.draftCount() > 0) {
        const review = await waitFor('semanticMapReview');
        if (runtime.draftCount() > 0) await review.openDraft(); else review.open();
        showStatus('Review Accept/Reject before exporting accepted input.', 'error'); return;
      }
      const head = runtime.head;
      const text = envelopeText(await runtime.envelope());
      if (head !== runtime.head || runtime.draftCount() > 0) throw new Error('Export preparation is stale');
      const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = href;
      anchor.download = `semantic-map-${head.slice(7, 19)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      showStatus(`Export initiated for ${head}. Browser completion and file reopen are not yet confirmed.`, 'ok');
    } catch (error) { showStatus(error.message, 'error'); }
  });
  document.getElementById('source-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const head = runtime.head, log = runtime.log;
    try {
      if (runtime.proposal || runtime.draftCount() > 0) throw new Error('Review Accept/Reject before opening another input');
      if (file.size > MAX_ENVELOPE_BYTES) throw new Error('File exceeds 256 KiB');
      const envelope = JSON.parse(await file.text());
      if (head !== runtime.head || log !== runtime.log) throw new Error('File Open preparation is stale');
      await globalThis.semanticMapNavigation.openEnvelope(envelope, { fileInput: true });
      close();
    } catch (error) { showStatus(error.message, 'error'); }
    finally { event.target.value = ''; }
  });
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !layer.hidden) close(); });
  app.store.onChange(() => { if (!layer.hidden) void render(); });
  runtime.onChange(() => { if (!layer.hidden) void render(); });

  const api = Object.freeze({
    ready: true,
    open,
    close,
    render,
    copy,
    current: () => current,
  });
  globalThis.semanticMapSource = api;
}

install().catch((error) => {
  console.error(error);
  const status = document.getElementById('source-status');
  if (status) { status.textContent = error.message; status.dataset.kind = 'error'; }
  globalThis.semanticMapSource = Object.freeze({ ready: false, error: error.message });
});
