import { OPERATION_TYPES } from '../domain/index.js';
import { DECISION_SCHEMA, patternConfigKey } from '../protocol/index.js';
import { decompileSmapUrl } from '../transport/index.js';
import { copyText, utf8Bytes, waitFor, waitForApp } from './shared.js';

const SCHEMA = 'semantic-map-handoff/2';
const MAX_CHARS = 12_288;
const MAX_BYTES = 24 * 1_024;

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

function assembleText({ stateUrl, request }) {
  const text = [
    'SEMANTIC-MAP/2',
    `protocol=${protocolUrl()}`,
    `state=${stateUrl}`,
    `request=${JSON.stringify(request)}`,
    `reply=Return one absolute URL whose #smap Envelope keeps log unchanged and sets proposal to one ${DECISION_SCHEMA}.`,
  ].join('\n');
  const bytes = utf8Bytes(text);
  invariant(text.length <= MAX_CHARS, `handoff text exceeds ${MAX_CHARS} characters`);
  invariant(bytes <= MAX_BYTES, `handoff text exceeds ${MAX_BYTES} bytes`);
  return Object.freeze({ text, chars: text.length, bytes });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Image asset encoding failed'));
    reader.readAsDataURL(blob);
  });
}

function pageOrigin() {
  return location.origin === 'null' ? new URL(document.baseURI).origin : location.origin;
}

function renderedResourceUrl(raw) {
  if (raw.startsWith('about:///')) return new URL(new URL(raw).pathname, document.baseURI);
  return new URL(raw, document.baseURI);
}

async function inlineSvgImages(root) {
  for (const image of root.querySelectorAll('image')) {
    const raw = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!raw || raw.startsWith('data:')) continue;
    const url = renderedResourceUrl(raw);
    invariant(url.origin === pageOrigin(), 'rendered image must be same-origin');
    const response = await fetch(url, { credentials: 'same-origin' });
    invariant(response.ok, `rendered image fetch failed: ${response.status}`);
    const dataUrl = await blobDataUrl(await response.blob());
    image.setAttribute('href', dataUrl);
    image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
  }
}

function appendSurfaceBackgroundImages(root, container, width, height) {
  for (const source of container.querySelectorAll('.resource-surface-background img')) {
    invariant(
      source.getAttribute('data-resource-status') !== 'failed',
      `surface background resource failed: ${source.getAttribute('data-resource-id') || 'unknown'}`,
    );
    const raw = source.getAttribute('src');
    if (!raw) continue;
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', String(width));
    image.setAttribute('height', String(height));
    image.setAttribute('href', raw);
    const fit = source.style.objectFit || 'cover';
    image.setAttribute('preserveAspectRatio', fit === 'fill' ? 'none' : `xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}`);
    const opacity = source.style.opacity;
    if (opacity) image.setAttribute('opacity', opacity);
    image.setAttribute('data-resource-placement', source.getAttribute('data-resource-placement') || '');
    root.append(image);
  }
}

async function captureSvg(container) {
  const sources = [...container.querySelectorAll('svg')].filter((item) => item.childNodes.length > 0);
  invariant(sources.length > 0, 'rendered SVG not found');
  const width = Math.max(1, Math.round(container.clientWidth));
  const height = Math.max(1, Math.round(container.clientHeight));
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('style', 'display:block;background:#f8fafb');
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = 'Semantic map current viewport';
  root.append(title);
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x: 0, y: 0, width, height, fill: '#f8fafb' })
    .forEach(([key, value]) => background.setAttribute(key, String(value)));
  root.append(background);
  appendSurfaceBackgroundImages(root, container, width, height);
  for (const source of sources) {
    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('x', '0');
    clone.setAttribute('y', '0');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clone.style.position = 'static';
    clone.style.inset = 'auto';
    root.append(clone);
  }
  await inlineSvgImages(root);
  return Object.freeze({ width, height, text: new XMLSerializer().serializeToString(root) });
}

async function svgToPng(svg) {
  const maxDimension = 1_400;
  const scale = Math.min(1, maxDimension / Math.max(svg.width, svg.height));
  const width = Math.max(1, Math.round(svg.width * scale));
  const height = Math.max(1, Math.round(svg.height * scale));
  const url = URL.createObjectURL(new Blob([svg.text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('SVG rasterization failed'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    context.fillStyle = '#f8fafb';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const textButton = document.getElementById('handoff-copy-text');
  const imageButton = document.getElementById('handoff-copy-image');
  const textSizeOutput = document.getElementById('handoff-text-size');
  const imageSizeOutput = document.getElementById('handoff-image-size');
  const status = document.getElementById('handoff-copy-status');
  const sourceStatus = document.getElementById('handoff-source-status');
  const stateSourceButton = document.getElementById('handoff-copy-state');
  const logSourceButton = document.getElementById('handoff-copy-log');
  const envelopeSourceButton = document.getElementById('handoff-copy-envelope');
  const requestInput = document.getElementById('handoff-request');
  const selectedOutput = document.getElementById('handoff-selected-id');
  const eventCount = document.getElementById('handoff-draft-count');
  let lastTarget = null;
  let lastTextTransfer = null;
  let lastImageTransfer = null;
  let lastSourceExport = null;
  let preparedText = null;
  let preparedImage = null;
  let prepareToken = 0;
  let prepareTimer = null;
  let tapStart = null;
  let imageGenerationCount = 0;

  const relationById = (id) => app.store.domain.relations.find((item) => item.id === id) ?? null;

  function setTarget(target) {
    lastTarget = target ? Object.freeze({ ...target }) : null;
    preparedText = null;
    preparedImage = null;
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

  function imageExportCapability() {
    const composition = runtime.view.resourceComposition;
    if (!composition) return Object.freeze({ supported: true, issues: Object.freeze([]) });
    const resources = new Map(composition.resources.map((resource) => [resource.id, resource]));
    const issues = [];
    for (const placement of composition.placements) {
      const resource = resources.get(placement.resourceRef);
      if (!resource) continue;
      const targetCatalog = placement.targetRef.split(':', 1)[0];
      const inCapturedScene = (
        (targetCatalog === 'surface' && placement.slot === 'background')
        || (targetCatalog === 'node' && placement.slot === 'content')
        || (targetCatalog === 'surface' && placement.slot === 'content')
      );
      if (!inCapturedScene) continue;
      if (resource.contract === 'image/1') {
        const source = new URL(resource.source.href, document.baseURI);
        if (source.origin !== pageOrigin()) {
          issues.push(Object.freeze({ code: 'cross-origin-image', placementId: placement.id, resourceId: resource.id }));
        }
      } else if (resource.contract === 'video/1') {
        issues.push(Object.freeze({ code: 'video-frame-not-captured', placementId: placement.id, resourceId: resource.id }));
      } else if (placement.slot === 'content') {
        issues.push(Object.freeze({ code: 'surface-document-not-captured', placementId: placement.id, resourceId: resource.id }));
      }
    }
    const ordered = issues.sort((a, b) => (
      a.code.localeCompare(b.code)
      || a.resourceId.localeCompare(b.resourceId)
      || a.placementId.localeCompare(b.placementId)
    ));
    return Object.freeze({ supported: ordered.length === 0, issues: Object.freeze(ordered) });
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
        format: 'absolute #smap URL only',
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
    const stateUrl = await runtime.url({ view: currentView() });
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
    lastImageTransfer = null;
    return transfer;
  }

  async function buildSourceExport() {
    invariant(runtime.draftCount() === 0, 'Accept or reject the Local Draft before source export');
    const stateUrl = await runtime.url({ proposal: runtime.proposal, view: currentView() });
    const exported = await decompileSmapUrl(stateUrl);
    invariant(exported.head === runtime.head, 'decompiled Head differs from the runtime');
    invariant(exported.stateHash === runtime.stateHash, 'decompiled State differs from the runtime');
    lastSourceExport = Object.freeze({ ...exported, stateUrl });
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

  async function buildImageTransfer(textTransfer = null) {
    const resolvedTextTransfer = textTransfer ?? preparedText ?? await buildTextTransfer();
    const capability = imageExportCapability();
    invariant(
      capability.supported,
      `image export unsupported: ${capability.issues.map((issue) => `${issue.code}:${issue.resourceId}`).join(', ')}`,
    );
    imageGenerationCount += 1;
    const svg = await captureSvg(container);
    const svgBlob = new Blob([svg.text], { type: 'image/svg+xml' });
    const pngBlob = await svgToPng(svg);
    const transfer = Object.freeze({
      kind: 'image',
      textTransfer: resolvedTextTransfer,
      manifest: resolvedTextTransfer.manifest,
      svgText: svg.text,
      svgBlob,
      pngBlob,
      imagePrepared: true,
    });
    lastImageTransfer = transfer;
    return transfer;
  }

  function updateButtons() {
    textButton.disabled = !preparedText;
    imageButton.disabled = !preparedText || !imageExportCapability().supported;
  }

  async function prepareTextTransfer() {
    const token = ++prepareToken;
    preparedText = null;
    preparedImage = null;
    updateButtons();
    textSizeOutput.textContent = '準備中';
    imageSizeOutput.textContent = '必要時に生成';
    status.className = 'handoff-copy-status';
    status.textContent = '完全な #smap URL と依頼を生成しています…';
    try {
      const transfer = await buildTextTransfer();
      if (token !== prepareToken || layer.hidden) return null;
      preparedText = transfer;
      textSizeOutput.textContent = `${transfer.textChars.toLocaleString()}字 / ${Math.ceil(transfer.textBytes / 1024)}KB`;
      status.className = 'handoff-copy-status';
      const capability = imageExportCapability();
      status.textContent = capability.supported
        ? 'URL＋依頼の準備完了。画像は②を押した時だけ生成します。'
        : `URL＋依頼の準備完了。画像出力は利用できません: ${capability.issues.map((issue) => issue.code).join(', ')}`;
      updateButtons();
      return transfer;
    } catch (error) {
      if (token !== prepareToken) return null;
      status.className = 'handoff-copy-status error';
      status.textContent = `URLを準備できませんでした: ${error.message}`;
      throw error;
    }
  }

  async function prepareImageTransfer() {
    invariant(preparedText, 'URL text is not prepared');
    if (preparedImage?.textTransfer === preparedText) return preparedImage;
    imageButton.disabled = true;
    imageSizeOutput.textContent = '生成中';
    status.className = 'handoff-copy-status';
    status.textContent = '現在Sceneの画像を生成しています…';
    try {
      preparedImage = await buildImageTransfer(preparedText);
      imageSizeOutput.textContent = `PNG ${Math.ceil(preparedImage.pngBlob.size / 1024)}KB${globalThis.ClipboardItem?.supports?.('image/svg+xml') ? ' + SVG' : ''}`;
      status.textContent = '画像の準備完了。';
      return preparedImage;
    } catch (error) {
      preparedImage = null;
      imageSizeOutput.textContent = '生成失敗';
      status.className = 'handoff-copy-status error';
      status.textContent = `画像だけ生成できませんでした。URL textは利用できます: ${error.message}`;
      throw error;
    } finally {
      updateButtons();
    }
  }

  async function writeImage(transfer) {
    if (!transfer.pngBlob) throw new Error(transfer.imageError || '画像を生成できません');
    if (!isSecureContext) throw new Error('画像コピーにはHTTPSまたはlocalhostが必要です');
    if (!globalThis.ClipboardItem || !navigator.clipboard?.write) throw new Error('画像Clipboard APIを利用できません');
    const entries = { 'image/png': transfer.pngBlob };
    if (transfer.svgBlob && ClipboardItem.supports?.('image/svg+xml')) entries['image/svg+xml'] = transfer.svgBlob;
    await navigator.clipboard.write([new ClipboardItem(entries, { presentationStyle: 'inline' })]);
    return Object.freeze({ kind: 'image', types: Object.freeze(Object.keys(entries)), bytes: transfer.pngBlob.size });
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
    status.textContent = `① テキストをコピーしました (${preparedText.textChars.toLocaleString()}字)。`;
    navigator.vibrate?.(14);
    return result;
  }

  async function copyImageOnly() {
    const image = await prepareImageTransfer();
    const result = await writeImage(image);
    globalThis.__semanticTransferLastCopy = result;
    status.className = 'handoff-copy-status ok';
    status.textContent = `② 画像をコピーしました (${result.types.join(' + ')}・${Math.ceil(result.bytes / 1024)}KB)。`;
    navigator.vibrate?.(18);
    return result;
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
    updateButtons();
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
    preparedImage = null;
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
  textButton.addEventListener('click', () => copyTextOnly().catch((error) => { status.textContent = error.message; }));
  imageButton.addEventListener('click', () => copyImageOnly().catch((error) => { status.textContent = error.message; }));
  stateSourceButton.addEventListener('click', () => copySource('state').catch(() => {}));
  logSourceButton.addEventListener('click', () => copySource('log').catch(() => {}));
  envelopeSourceButton.addEventListener('click', () => copySource('envelope').catch(() => {}));
  requestInput.addEventListener('input', () => {
    preparedText = null;
    preparedImage = null;
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
    clipboardPlan: Object.freeze({ order: Object.freeze(['text/plain', 'image/png']), svgAlternative: true, secureContextRequired: true, imageLazy: true }),
    open,
    close,
    prepareTextTransfer,
    prepareImageTransfer,
    buildTextTransfer,
    buildImageTransfer,
    imageExportCapability,
    copyTextOnly,
    copyImageOnly,
    buildSourceExport,
    copySource,
    selected: () => lastTarget ? { ...lastTarget } : null,
    lastTransfer: () => lastImageTransfer ?? lastTextTransfer,
    lastTextTransfer: () => lastTextTransfer,
    lastImageTransfer: () => lastImageTransfer,
    lastSourceExport: () => lastSourceExport,
    imagePrepared: () => Boolean(preparedImage),
    imageGenerationCount: () => imageGenerationCount,
    currentView,
  });
}

install().catch((error) => {
  console.error(error);
  globalThis.semanticMapHandoff = Object.freeze({ ready: false, error: error.message });
});
