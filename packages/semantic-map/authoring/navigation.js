import { canonicalJson, inspectEnvelope } from '../protocol/index.js';
import { createGraphLayout } from '../pattern/index.js';

export const MAX_ENVELOPE_BYTES = 256 * 1024;
const KEY = 'semanticMapInput';
const bytes = value => new TextEncoder().encode(value).byteLength;
const check = (condition, message) => { if (!condition) throw new Error(message); };

export const envelopeText = envelope => {
  const text = canonicalJson(envelope);
  check(bytes(text) <= MAX_ENVELOPE_BYTES, 'Envelope exceeds 256 KiB; input was not saved');
  return text;
};

export async function historyInput(scope = globalThis) {
  const input = scope.history.state?.[KEY];
  if (!input) return null;
  check(input.schema === 'semantic-map-history-input/1', 'Unsupported history input');
  envelopeText(input.envelope);
  const inspected = await inspectEnvelope(input.envelope);
  check(!inspected.envelope.proposal, 'History must contain accepted input only');
  check(input.mapId === inspected.base.mapId && input.head === inspected.base.head, 'History input identity mismatch');
  const transported = await scope.semanticMapDataTransport.read();
  if (transported) check(canonicalJson(transported) === canonicalJson(input.envelope), 'URL and history input disagree');
  return input;
}

export async function installNavigation({ runtime, editor, applyView, inputChanged }) {
  const scope = globalThis;
  const transport = scope.semanticMapDataTransport;
  const status = document.getElementById('navigation-status');
  const sheet = document.getElementById('navigation-sheet');
  const content = document.getElementById('navigation-content');
  const fail = error => {
    document.documentElement.dataset.semanticNavigation = 'failed';
    status.textContent = `${error.message} · retained ${runtime.mapId} / ${runtime.head}`;
    status.dataset.kind = 'error';
    editor.showError(error.message);
  };
  const clean = () => check(!runtime.proposal && runtime.draftCount() === 0 && !scope.semanticMapReview?.pending?.(), 'Review: Accept or Reject before changing document or View');
  let generation = 0;
  let committing = false;
  const assertIdle = () => check(!committing, 'Navigation is restoring; retry after it completes');
  let restoring = false;
  let page = 0;
  let includeInternal = false;
  let mode = 'details';
  let contextTimer;
  const context = () => ({ camera: { ...editor.adapter.camera() }, selection: editor.adapter.selectionSnapshot() });
  const validateContext = (value, inspected) => {
    check(value && value.camera && value.selection, 'History context is missing');
    const { scale, translateX, translateY } = value.camera;
    check([scale, translateX, translateY].every(Number.isFinite) && scale > 0 && scale <= 5.2, 'Invalid history camera');
    const regions = new Set(inspected.base.records.filter(r => r.type === 'region').map(r => r.id));
    const relations = new Set(inspected.base.records.filter(r => r.type === 'relation').map(r => r.id));
    check(Array.isArray(value.selection.regionIds) && value.selection.regionIds.every(id => regions.has(id)), 'History selection region mismatch');
    check(Array.isArray(value.selection.relationIds) && value.selection.relationIds.every(id => relations.has(id)), 'History selection relation mismatch');
  };
  const writeContext = () => {
    if (restoring) return;
    const entry = history.state?.[KEY];
    if (!entry || entry.mapId !== runtime.mapId || entry.head !== runtime.head) return;
    try { history.replaceState({ ...history.state, [KEY]: { ...entry, context: context() } }, '', location.href); }
    catch (error) { fail(error); }
  };
  const urlFor = async envelope => {
    envelopeText(envelope);
    try { return await transport.create(envelope); }
    catch (error) {
      if (!/URL exceeds 8192|compressed payload exceeds 65536/.test(String(error.message))) throw error;
      const url = new URL(location.href); url.hash = ''; return url.href;
    }
  };
  async function preparePublication(envelope, { push = false, targetContext = context(), fileInput = false, request = generation } = {}) {
    envelopeText(envelope);
    const inspected = await inspectEnvelope(envelope);
    check(!inspected.envelope.proposal, 'Only accepted input can enter history');
    validateContext(targetContext, inspected);
    const targetUrl = new URL(await urlFor(envelope));
    if (fileInput) targetUrl.hash = '';
    const url = targetUrl.href;
    const entry = { schema: 'semantic-map-history-input/1', envelope: inspected.envelope,
      mapId: inspected.base.mapId, head: inspected.base.head, context: targetContext };
    check(request === generation, 'Superseded history request');
    return () => {
      check(request === generation, 'Superseded history request');
      history[push ? 'pushState' : 'replaceState']({ ...history.state, [KEY]: entry }, '', url);
      status.textContent = `${entry.mapId} / ${entry.head} · ${new URL(url).hash ? 'URL input' : 'file/history input; export a file to reopen elsewhere'}`;
      status.dataset.kind = 'ok';
      return targetUrl.hash ? url : '';
    };
  }
  async function publish(envelope, options = {}) {
    const request = options.request ?? ++generation;
    const head = runtime.head, log = runtime.log, view = runtime.view;
    const commit = await preparePublication(envelope, { ...options, request });
    check(head === runtime.head && log === runtime.log && view === runtime.view, 'Accepted input changed during history preparation');
    return commit();
  }
  async function openEnvelope(envelope, { push = true, restoredContext = null, request = null, fileInput = false } = {}) {
    assertIdle(); clean();
    request ??= ++generation;
    document.documentElement.dataset.semanticNavigation = 'loading';
    envelopeText(envelope);
    const prepared = await runtime.preflightInput(envelope);
    if (restoredContext) validateContext(restoredContext, prepared.inspection);
    check(request === generation, 'Superseded input request');
    clean();
    // Preflight all native serialization before replacing the active owner.
    structuredClone({ envelope: prepared.inspection.envelope, context: restoredContext });
    if (push) writeContext();
    const target = restoredContext ?? { camera: context().camera, selection: { regionIds: [], relationIds: [] } };
    const publication = push ? await preparePublication(prepared.inspection.envelope,
      { push: true, targetContext: target, fileInput, request }) : null;
    check(request === generation, 'Superseded input request');
    assertIdle(); clean();
    const previous = Object.fromEntries(['log', 'head', 'mapId', 'stateHash', 'records', 'proposal', 'view'].map(key => [key, runtime[key]]));
    const previousContext = context();
    const previousSession = editor.store.snapshotSession();
    committing = true;
    const wasInert = document.body.inert; document.body.inert = true;
    restoring = true;
    try {
      runtime.commitInput(prepared);
      await editor.setView(runtime.view, prepared.validation?.modules);
      await applyView(editor, runtime.view);
      check(request === generation, 'Superseded input request');
      if (restoredContext) {
        const c = restoredContext.camera;
        editor.adapter.setCamera(c.scale, c.translateX, c.translateY);
        editor.adapter.setSelection(restoredContext.selection);
      }
      inputChanged();
      publication?.();
    } catch (error) {
      Object.assign(runtime, previous);
      editor.store.restoreSession(previousSession);
      try {
        await editor.setView(previous.view);
        editor.adapter.setCamera(previousContext.camera.scale, previousContext.camera.translateX, previousContext.camera.translateY);
        editor.adapter.setSelection(previousContext.selection);
        inputChanged();
      } catch (restoreError) {
        throw new Error(`${error.message}; retained input could not be painted: ${restoreError.message}`);
      }
      throw error;
    } finally { restoring = false; committing = false; document.body.inert = wasInert; }
    if (push) writeContext();
    status.textContent = `${runtime.mapId} / ${runtime.head}`;
    document.documentElement.dataset.semanticNavigation = 'ready';
    sheet.hidden = true;
  }
  async function openHref(href) {
    assertIdle(); clean();
    const request = ++generation;
    const url = new URL(href, location.href);
    check(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Unsupported link');
    // Navigation accepts the existing explicit Envelope URL contract.
    let envelope = await transport.read(url.href);
    if (!envelope) {
      check(url.origin === location.origin && !url.hash, 'Link has no supported supplied Envelope target');
      const response = await fetch(url.href, { credentials: 'omit', redirect: 'error' });
      check(response.ok, `Input unavailable: HTTP ${response.status}`);
      const reader = response.body.getReader(); const chunks = []; let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          length += value.byteLength; check(length <= MAX_ENVELOPE_BYTES, 'Linked Envelope exceeds 256 KiB'); chunks.push(value);
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      envelope = JSON.parse(await new Blob(chunks).text());
    }
    await openEnvelope(envelope, { request });
  }
  async function focus(regionId, inside = false) {
    assertIdle(); clean();
    const request = ++generation;
    const previous = context();
    writeContext();
    const scene = editor.currentScene();
    const item = scene.representations.find(r => r.sourceRegionId === regionId || r.regionId === regionId);
    const b = item?.bounds ?? (runtime.view.pattern === 'graph/1'
      ? createGraphLayout(editor.store.domain, { pins: editor.store.layoutHints }).bounds.get(regionId) : null);
    check(b, `Target is not represented: ${regionId}`);
    restoring = true; committing = true;
    try {
      if (inside || !item) editor.focusBounds(b); else editor.focusRegion(regionId, Math.max(1, previous.camera.scale));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      editor.adapter.setSelection({ regionIds: [regionId], relationIds: [] });
      const viewport = editor.adapter.viewport();
      const view = { ...runtime.view, frame: { bbox: [viewport.x, viewport.y, viewport.width, viewport.height],
        viewport: [editor.adapter.container.clientWidth, editor.adapter.container.clientHeight], select: [regionId] } };
      const envelope = await runtime.envelope({ view });
      await publish(envelope, { push: true, request });
      runtime.view = envelope.view;
    } catch (error) {
      editor.adapter.setCamera(previous.camera.scale, previous.camera.translateX, previous.camera.translateY);
      editor.adapter.setSelection(previous.selection); throw error;
    } finally { restoring = false; committing = false; }
    sheet.hidden = true;
  }
  const button = (label, action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.addEventListener('click', () => Promise.resolve().then(action).catch(fail)); return node;
  };
  const text = value => { const p = document.createElement('p'); p.textContent = value; content.append(p); };
  function render() {
    content.replaceChildren();
    const selection = editor.adapter.selectionSnapshot();
    const domain = editor.store.domain;
    const id = selection.regionIds[0] ?? (selection.relationIds.length === 0 ? domain.meta.root : null);
    const region = domain.regions.get(id);
    const selectedEdge = domain.relations.find(r => selection.relationIds.includes(r.id));
    text(`${runtime.mapId} / ${runtime.head}`);
    if (!region && !selectedEdge) { text('Select a node or relation in the current diagram.'); return; }
    if (selectedEdge) text(`${selectedEdge.id}: ${selectedEdge.from} → ${selectedEdge.to} · ${selectedEdge.kind}`);
    if (region) {
      text(`${region.label} · ${region.id}`); text(region.summary);
      content.append(button('Focus selected', () => focus(region.id)));
      const ancestors = []; let parent = region.parent;
      while (parent !== null) { const ancestor = domain.regions.get(parent); ancestors.unshift(ancestor); parent = ancestor.parent; }
      for (const ancestor of ancestors) content.append(button(`↑ ${ancestor.label}`, () => focus(ancestor.id, true)));
      const children = [...domain.regions.values()].filter(r => r.parent === id);
      if (children.length) {
        content.append(button('Inside', () => focus(id, true)));
        for (const child of children) content.append(button(child.label, () => focus(child.id, true)));
      }
      if (region.href) content.append(button(`Open supplied link · ${region.id}`, () => openHref(region.href)));
    }
    text('Evidence: supplied record in this map/head. Relation state, observed time and independent provenance: not supplied / UNKNOWN.');
    if (mode !== 'relations') return;
    const inside = new Set(region ? [id] : []);
    if (region) for (const node of domain.regions.values()) {
      let p = node.parent;
      while (p !== null) { if (p === id) { inside.add(node.id); break; } p = domain.regions.get(p).parent; }
    }
    const edges = selectedEdge ? [selectedEdge] : domain.relations.filter(r => {
      const from = inside.has(r.from), to = inside.has(r.to);
      return from !== to || (includeInternal && from && to);
    });
    text(`${edges.length} relations · ${Math.max(0, edges.length - (page + 1) * 50)} remaining`);
    content.append(button(includeInternal ? 'Boundary only' : 'Include internal', () => { includeInternal = !includeInternal; page = 0; render(); }));
    for (const edge of edges.slice(page * 50, (page + 1) * 50)) {
      const row = document.createElement('div'); row.className = 'navigation-relation';
      const label = document.createElement('p'); label.textContent = `${edge.id} · ${edge.from} → ${edge.to} · ${edge.kind} · ${edge.label}`; row.append(label);
      for (const endpoint of [edge.from, edge.to]) {
        row.append(button(`Focus ${endpoint}`, () => focus(endpoint)));
        const href = domain.regions.get(endpoint)?.href;
        if (href) row.append(button(`Open supplied link ${endpoint}`, () => openHref(href)));
      }
      content.append(row);
    }
    if (page > 0) content.append(button('Previous 50', () => { page--; render(); }));
    if ((page + 1) * 50 < edges.length) content.append(button('Next 50', () => { page++; render(); }));
  }
  for (const kind of ['details', 'relations']) document.getElementById(`navigation-${kind}`).addEventListener('click', () => {
    mode = kind; page = 0; includeInternal = false; render(); sheet.hidden = false;
    document.getElementById('navigation-close').focus();
  });
  const close = () => { sheet.hidden = true; document.getElementById(`navigation-${mode}`).focus(); };
  document.getElementById('navigation-close').addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !sheet.hidden) close(); });
  editor.adapter.onSelectionChange(() => { writeContext(); if (!sheet.hidden) { page = 0; render(); } });
  editor.adapter.onCameraChange(() => { clearTimeout(contextTimer); contextTimer = setTimeout(writeContext, 160); });
  scope.addEventListener('popstate', async () => {
    if (committing) { ++generation; fail(new Error('Requested history entry while restoration is in progress')); return; }
    const request = ++generation;
    restoring = true;
    try {
      clean(); const input = await historyInput();
      check(input, 'Requested history entry has no input snapshot');
      await openEnvelope(input.envelope, { push: false, restoredContext: input.context, request });
    } catch (error) { fail(new Error(`Requested ${history.state?.[KEY]?.mapId ?? location.href}: ${error.message}`)); }
    finally { restoring = false; }
  });
  const initial = await historyInput();
  if (initial) {
    validateContext(initial.context, await inspectEnvelope(initial.envelope));
    restoring = true;
    const c = initial.context.camera; editor.adapter.setCamera(c.scale, c.translateX, c.translateY);
    editor.adapter.setSelection(initial.context.selection); restoring = false;
  } else if (!runtime.proposal) await publish(await runtime.envelope());
  const api = Object.freeze({ ready: true, openEnvelope, openHref, assertIdle, publishAccepted: async () => {
    assertIdle();
    const request = ++generation;
    const envelope = await runtime.envelope();
    return publish(envelope, { request });
  }, fail });
  scope.semanticMapNavigation = api;
  document.documentElement.dataset.semanticNavigation = 'ready';
  return api;
}
