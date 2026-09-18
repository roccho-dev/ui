import {
  createSemanticIntentSubmission,
  submitSemanticIntent,
} from '../../core-port/src/intent-client.mjs';
import { OPERATION_TYPES, recordsToJSONL } from '../domain/index.js';
import { DECISION_SCHEMA, canonicalJson, inspectEnvelope, patternConfigKey } from '../protocol/index.js';
import { copyText, utf8Bytes, waitFor, waitForApp } from './shared.js';

const SCHEMA = 'semantic-map-handoff/3';
const MAX_CHARS = 12_288;
const MAX_BYTES = 24 * 1_024;
const RETIRED_IMAGE_ERROR = 'image handoff is retired; use the state URL as the reproducible view source';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-transfer: ${message}`);
}

function patternConfig(view) {
  const key = patternConfigKey(view.pattern);
  return key === null ? {} : { [key]: view[key] };
}

function protocolUrl() {
  const base = new URL(location.href);
  if (base.protocol === 'about:') return 'about:blank/.well-known/semantic-map.json';
  return new URL('/.well-known/semantic-map.json', base).href;
}

function dataTransport() {
  const value = globalThis.semanticMapDataTransport;
  invariant(value?.schema === 'ui-data-transport/1' && value.fragment === 'data' && typeof value.create === 'function', '#data transport is unavailable');
  return value;
}

function assembleText({ stateUrl, request }) {
  const text = [
    'SEMANTIC-DATA/1',
    `protocol=${protocolUrl()}`,
    `state=${stateUrl}`,
    `request=${JSON.stringify(request)}`,
    `reply=Return one absolute URL whose #data value is a semantic-map-envelope/3, keeps log unchanged, and sets proposal to one ${DECISION_SCHEMA}.`,
  ].join('\n');
  const bytes = utf8Bytes(text);
  invariant(text.length <= MAX_CHARS, `handoff text exceeds ${MAX_CHARS} characters`);
  invariant(bytes <= MAX_BYTES, `handoff text exceeds ${MAX_BYTES} bytes`);
  return Object.freeze({ text, chars: text.length, bytes });
}

function setState(output, value) {
  output.dataset.state = value;
  output.textContent = value;
}

async function install() {
  const app = await waitForApp();
  const runtime = await waitFor('semanticMapRuntime');
  const container = document.getElementById('graph-container');
  const idChip = document.getElementById('semantic-id-chip');
  const idKind = document.getElementById('semantic-id-kind');
  const idValue = document.getElementById('semantic-id-value');
  const layer = document.getElementById('handoff-layer');
  const openButton = document.getElementById('handoff-fab');
  const closeButton = document.getElementById('handoff-close');
  const submitButton = document.getElementById('handoff-copy-text');
  const locatorButton = document.getElementById('handoff-copy-locator');
  const textSizeOutput = document.getElementById('handoff-text-size');
  const status = document.getElementById('handoff-copy-status');
  const transportOutput = document.getElementById('handoff-transport-state');
  const localOutput = document.getElementById('handoff-local-state');
  const githubOutput = document.getElementById('handoff-github-state');
  const issueOutput = document.getElementById('handoff-issue-id');
  const sourceStatus = document.getElementById('handoff-source-status');
  const stateSourceButton = document.getElementById('handoff-copy-state');
  const logSourceButton = document.getElementById('handoff-copy-log');
  const envelopeSourceButton = document.getElementById('handoff-copy-envelope');
  const requestInput = document.getElementById('handoff-request');
  const selectedOutput = document.getElementById('handoff-selected-id');
  const eventCount = document.getElementById('handoff-draft-count');

  let lastTarget = null;
  let lastTextTransfer = null;
  let lastSourceExport = null;
  let lastSubmitResult = null;
  let preparedText = null;
  let preparedSubmission = null;
  let prepareToken = 0;
  let prepareTimer = null;
  let tapStart = null;
  let sending = false;
  let completed = false;

  const relationById = (id) => app.store.domain.relations.find((item) => item.id === id) ?? null;

  function resetResult() {
    lastSubmitResult = null;
    completed = false;
    setState(transportOutput, 'idle');
    setState(localOutput, 'unknown');
    setState(githubOutput, 'not_started');
    issueOutput.textContent = '—';
    locatorButton.disabled = true;
    locatorButton.hidden = true;
  }

  function updateButtons() {
    submitButton.disabled = sending || completed || !preparedText || !preparedSubmission;
    requestInput.disabled = sending || (lastSubmitResult?.transport_state === 'unknown');
    submitButton.textContent = lastSubmitResult?.transport_state === 'unknown'
      ? '同じ内容を再送する'
      : 'Issueへ渡す';
  }

  function setTarget(target) {
    lastTarget = target ? Object.freeze({ ...target }) : null;
    preparedText = null;
    preparedSubmission = null;
    resetResult();
    updateButtons();
    if (!lastTarget) {
      idChip.hidden = true;
      selectedOutput.textContent = '未選択（現在scene全体）';
      return;
    }
    idKind.textContent = lastTarget.kind;
    idValue.textContent = lastTarget.id;
    idChip.hidden = false;
    selectedOutput.textContent = `${lastTarget.kind}:${lastTarget.id}${lastTarget.label ? ` · ${lastTarget.label}` : ''}`;
  }

  function targetFromSelection() {
    const selection = app.adapter.selectionSnapshot();
    if (selection.regionIds.length === 1 && selection.relationIds.length === 0) {
      const id = selection.regionIds[0];
      return { kind: 'region', id, label: app.store.domain.regions.get(id)?.label ?? id };
    }
    if (selection.relationIds.length === 1 && selection.regionIds.length === 0) {
      const id = selection.relationIds[0];
      return { kind: 'relation', id, label: relationById(id)?.label ?? id };
    }
    return null;
  }

  function targetAt(clientX, clientY) {
    const scene = app.adapter.lastScene;
    if (!scene) return null;
    const rect = container.getBoundingClientRect();
    const camera = app.adapter.camera();
    const worldX = (clientX - rect.left) / camera.scale - camera.translateX;
    const worldY = (clientY - rect.top) / camera.scale - camera.translateY;
    const matches = scene.representations.filter((item) => (
      worldX >= item.bounds.x && worldX <= item.bounds.x + item.bounds.width
      && worldY >= item.bounds.y && worldY <= item.bounds.y + item.bounds.height
    )).sort((a, b) => {
      const boundary = Number(a.mode === 'boundary') - Number(b.mode === 'boundary');
      return boundary || b.depth - a.depth || a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height;
    });
    const item = matches[0];
    return item ? { kind: 'region', id: item.regionId, label: item.label } : null;
  }

  function updateEventCount() {
    eventCount.textContent = String(runtime.draftCount());
  }

  app.adapter.onSelectionChange(() => {
    const target = targetFromSelection();
    if (target) setTarget(target);
  });
  app.store.onChange(updateEventCount);
  runtime.onChange(updateEventCount);
  updateEventCount();

  container.addEventListener('pointerdown', (event) => {
    tapStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }, { capture: true, passive: true });
  container.addEventListener('pointerup', (event) => {
    if (!tapStart || tapStart.pointerId !== event.pointerId) return;
    const start = tapStart;
    tapStart = null;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    setTimeout(() => {
      const target = targetFromSelection() ?? targetAt(event.clientX, event.clientY);
      if (target) setTarget(target);
    }, 0);
  }, { capture: true, passive: true });
  container.addEventListener('pointercancel', () => { tapStart = null; }, { capture: true, passive: true });

  function selectedTargets() {
    const selection = app.adapter.selectionSnapshot();
    const targets = [
      ...selection.regionIds.map((id) => ({ kind: 'region', id })),
      ...selection.relationIds.map((id) => ({ kind: 'relation', id })),
    ];
    if (!targets.length && lastTarget) targets.push({ kind: lastTarget.kind, id: lastTarget.id });
    return targets;
  }

  function currentView() {
    const selection = app.adapter.selectionSnapshot();
    const viewport = app.adapter.viewport();
    const rounded = (value) => Number(value.toFixed(6));
    const frame = {
      bbox: [rounded(viewport.x), rounded(viewport.y), rounded(viewport.width), rounded(viewport.height)],
      viewport: [Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)],
    };
    const selected = [...selection.regionIds];
    if (selected.length) frame.select = selected;
    return {
      pattern: runtime.view.pattern,
      ...patternConfig(runtime.view),
      ...(runtime.view.resourceComposition ? { resourceComposition: runtime.view.resourceComposition } : {}),
      frame,
    };
  }

  function manifestFor({ stateUrl, selected, request }) {
    const scene = app.adapter.lastScene;
    const camera = app.adapter.camera();
    return Object.freeze({
      type: 'handoff',
      schema: SCHEMA,
      mapId: runtime.mapId,
      head: runtime.head,
      stateHash: runtime.stateHash,
      selected,
      request,
      view: {
        pattern: runtime.view.pattern,
        ...patternConfig(runtime.view),
        camera: [camera.scale, camera.translateX, camera.translateY],
        visible: scene ? scene.representations.map((item) => item.regionId) : [],
      },
      stateUrl,
      reply: {
        format: 'absolute #data URL only',
        instruction: 'Keep log unchanged and set proposal to one Decision.',
        decisionSchema: DECISION_SCHEMA,
        supported: OPERATION_TYPES.filter((type) => type !== 'CreateMap'),
      },
    });
  }

  async function buildTextTransfer() {
    invariant(runtime.draftCount() === 0, 'Accept or reject the Local Draft before handoff');
    const selected = selectedTargets();
    const request = requestInput.value.trim();
    const envelope = await runtime.envelope({ view: currentView() });
    const stateUrl = await dataTransport().create(envelope);
    const payload = assembleText({ stateUrl, request });
    const transfer = Object.freeze({
      kind: 'text',
      manifest: manifestFor({ stateUrl, selected, request }),
      clipboardText: payload.text,
      textChars: payload.chars,
      textBytes: payload.bytes,
      stateUrl,
      imagePrepared: false,
    });
    lastTextTransfer = transfer;
    return transfer;
  }

  async function buildSourceExport() {
    invariant(runtime.draftCount() === 0, 'Accept or reject the Local Draft before source export');
    const envelope = await runtime.envelope({ proposal: runtime.proposal, view: currentView() });
    const inspection = await inspectEnvelope(envelope);
    invariant(inspection.base.head === runtime.head, 'Envelope Head differs from the runtime');
    invariant(inspection.base.stateHash === runtime.stateHash, 'Envelope State differs from the runtime');
    lastSourceExport = Object.freeze({
      schema: 'semantic-map-source-export/2',
      mapId: inspection.base.mapId,
      head: inspection.base.head,
      stateHash: inspection.base.stateHash,
      stateJSONL: recordsToJSONL(inspection.base.records),
      decisionLogJSONL: inspection.base.log,
      envelopeJSON: `${canonicalJson(inspection.envelope)}\n`,
      view: inspection.envelope.view,
    });
    return lastSourceExport;
  }

  function sourceText(exported, kind) {
    if (kind === 'state') return exported.stateJSONL;
    if (kind === 'log') return exported.decisionLogJSONL;
    if (kind === 'envelope') return exported.envelopeJSON;
    throw new Error(`Unknown source kind: ${kind}`);
  }

  async function copySource(kind) {
    sourceStatus.className = 'handoff-source-status';
    sourceStatus.textContent = '現在URLを復号しています…';
    try {
      const exported = await buildSourceExport();
      const text = sourceText(exported, kind);
      const mode = await copyText(text);
      const labels = { state: 'State JSONL', log: 'DecisionLog', envelope: 'Envelope JSON' };
      const result = Object.freeze({ kind, mode, chars: text.length, bytes: utf8Bytes(text), head: exported.head, stateHash: exported.stateHash });
      globalThis.__semanticSourceLastCopy = result;
      sourceStatus.className = 'handoff-source-status ok';
      sourceStatus.textContent = `${labels[kind]}をコピーしました (${text.length.toLocaleString()}字)。`;
      navigator.vibrate?.(14);
      return result;
    } catch (error) {
      sourceStatus.className = 'handoff-source-status error';
      sourceStatus.textContent = `Sourceを出力できませんでした: ${error.message}`;
      throw error;
    }
  }

  async function prepareTextTransfer() {
    const token = ++prepareToken;
    preparedText = null;
    preparedSubmission = null;
    completed = false;
    updateButtons();
    textSizeOutput.textContent = '準備中';
    status.className = 'handoff-copy-status';
    status.textContent = '完全な #data URL と依頼を生成しています…';
    try {
      const transfer = await buildTextTransfer();
      const submission = createSemanticIntentSubmission({
        topic_id: runtime.mapId,
        body: transfer.clipboardText,
      });
      if (token !== prepareToken || layer.hidden) return null;
      preparedText = transfer;
      preparedSubmission = submission;
      textSizeOutput.textContent = `${transfer.textChars.toLocaleString()}字 / ${Math.ceil(transfer.textBytes / 1024)}KB`;
      status.className = 'handoff-copy-status';
      status.textContent = '準備完了。明示操作で同一originの /api/intents へ送信します。';
      updateButtons();
      return transfer;
    } catch (error) {
      if (token !== prepareToken) return null;
      status.className = 'handoff-copy-status error';
      status.textContent = `handoffを準備できませんでした: ${error.message}`;
      throw error;
    }
  }

  function renderSubmitResult(result) {
    setState(transportOutput, result.transport_state);
    setState(localOutput, result.local_state ?? 'unknown');
    setState(githubOutput, result.github_state ?? 'unknown');
    issueOutput.textContent = result.issue_number ? `#${result.issue_number}${result.comment_id ? ` / comment ${result.comment_id}` : ''}` : '—';
    locatorButton.hidden = !result.issue_number;
    locatorButton.disabled = !result.issue_number;

    if (result.transport_state === 'unknown') {
      status.className = 'handoff-copy-status error';
      status.textContent = '結果不明です。内容を変更せず「同じ内容を再送する」を使えます。';
    } else if (result.github_state === 'applied') {
      completed = true;
      status.className = 'handoff-copy-status ok';
      status.textContent = 'GitHubへ反映済みです。Issue locatorをコピーできます。';
    } else if (result.local_state === 'accepted' || result.local_state === 'no_change') {
      completed = true;
      status.className = 'handoff-copy-status ok';
      status.textContent = `Local ${result.local_state} / GitHub ${result.github_state}。`;
    } else {
      completed = true;
      status.className = 'handoff-copy-status error';
      status.textContent = `Local ${result.local_state ?? 'unknown'} / GitHub ${result.github_state ?? 'unknown'}。`;
    }
    updateButtons();
  }

  async function submitPrepared() {
    invariant(preparedSubmission, 'semantic intent is not prepared');
    if (sending) return lastSubmitResult;
    sending = true;
    setState(transportOutput, 'sending');
    status.className = 'handoff-copy-status';
    status.textContent = '送信中…';
    updateButtons();
    try {
      const result = await submitSemanticIntent(preparedSubmission);
      lastSubmitResult = result;
      globalThis.__semanticIntentLastResult = result;
      renderSubmitResult(result);
      return result;
    } finally {
      sending = false;
      updateButtons();
    }
  }

  async function copyLocator() {
    invariant(lastSubmitResult?.issue_number, 'Issue locator is unavailable');
    const locator = JSON.stringify({
      issue_number: lastSubmitResult.issue_number,
      ...(lastSubmitResult.comment_id ? { comment_id: lastSubmitResult.comment_id } : {}),
    });
    const mode = await copyText(locator);
    status.className = 'handoff-copy-status ok';
    status.textContent = `Issue locatorをコピーしました: ${locator}`;
    return Object.freeze({ kind: 'locator', mode, text: locator });
  }

  async function copyTextOnly() {
    invariant(preparedText, 'URL text is not prepared');
    const mode = await copyText(preparedText.clipboardText);
    const result = Object.freeze({
      kind: 'text', mode, types: Object.freeze(['text/plain']),
      chars: preparedText.textChars, bytes: preparedText.textBytes,
    });
    globalThis.__semanticTransferLastCopy = result;
    status.className = 'handoff-copy-status ok';
    status.textContent = `handoff textをコピーしました (${preparedText.textChars.toLocaleString()}字)。`;
    navigator.vibrate?.(14);
    return result;
  }

  function retiredImage() {
    throw new Error(RETIRED_IMAGE_ERROR);
  }

  async function open() {
    if (runtime.draftCount() > 0) {
      const review = await waitFor('semanticMapReview');
      await review.openDraft();
      return false;
    }
    layer.hidden = false;
    selectedOutput.textContent = lastTarget
      ? `${lastTarget.kind}:${lastTarget.id}${lastTarget.label ? ` · ${lastTarget.label}` : ''}`
      : '未選択（現在scene全体）';
    resetResult();
    status.textContent = '完全URLと依頼を準備しています…';
    prepareTextTransfer().catch(() => {});
    setTimeout(() => requestInput.focus({ preventScroll: true }), 40);
    return true;
  }

  function close() {
    layer.hidden = true;
    prepareToken += 1;
    clearTimeout(prepareTimer);
    preparedText = null;
    preparedSubmission = null;
    sending = false;
    completed = false;
    requestInput.disabled = false;
    updateButtons();
    openButton.focus({ preventScroll: true });
  }

  idChip.addEventListener('click', async () => {
    if (!lastTarget) return;
    try {
      await copyText(lastTarget.id);
      idKind.textContent = 'COPIED';
    } catch (_) {
      idKind.textContent = 'ERROR';
    }
    setTimeout(() => { if (lastTarget) idKind.textContent = lastTarget.kind; }, 900);
  });
  openButton.addEventListener('click', () => open().catch((error) => { status.textContent = error.message; }));
  closeButton.addEventListener('click', close);
  submitButton.addEventListener('click', () => submitPrepared().catch((error) => {
    status.className = 'handoff-copy-status error';
    status.textContent = error.message;
  }));
  locatorButton.addEventListener('click', () => copyLocator().catch((error) => { status.textContent = error.message; }));
  stateSourceButton.addEventListener('click', () => copySource('state').catch(() => {}));
  logSourceButton.addEventListener('click', () => copySource('log').catch(() => {}));
  envelopeSourceButton.addEventListener('click', () => copySource('envelope').catch(() => {}));
  requestInput.addEventListener('input', () => {
    preparedText = null;
    preparedSubmission = null;
    resetResult();
    updateButtons();
    clearTimeout(prepareTimer);
    prepareTimer = setTimeout(() => prepareTextTransfer().catch(() => {}), 120);
  });
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) { event.preventDefault(); close(); }
  });

  globalThis.semanticMapHandoff = Object.freeze({
    ready: true,
    schema: SCHEMA,
    limits: Object.freeze({ maxChars: MAX_CHARS, maxBytes: MAX_BYTES }),
    open,
    close,
    prepareTextTransfer,
    buildTextTransfer,
    submitPrepared,
    copyTextOnly,
    copyLocator,
    buildSourceExport,
    copySource,
    selected: () => lastTarget ? { ...lastTarget } : null,
    lastTransfer: () => lastTextTransfer,
    lastTextTransfer: () => lastTextTransfer,
    lastSubmitResult: () => lastSubmitResult,
    lastSourceExport: () => lastSourceExport,
    preparedSubmission: () => preparedSubmission,
    currentView,
    imageExportCapability: () => Object.freeze({ supported: false, issues: Object.freeze([{ code: 'retired' }]) }),
    prepareImageTransfer: retiredImage,
    buildImageTransfer: retiredImage,
    copyImageOnly: retiredImage,
    lastImageTransfer: () => null,
    imagePrepared: () => false,
    imageGenerationCount: () => 0,
  });
}

install().catch((error) => {
  console.error(error);
  globalThis.semanticMapHandoff = Object.freeze({ ready: false, error: error.message });
});
