import { createSemanticMap, normalizeOperation, recordsToJSONL } from '../domain/index.js';
import { createSemanticMapEditorCore } from '../editor-core/index.js';
import { commandForKey } from '../editor-core/commands.js';
import { projectorThresholds } from '../projection/index.js';
import { PATTERN_SEQ, normalizeView } from '../protocol/index.js';
import { patternCapabilities, patternConfigKey, validatePatternDomain } from '../pattern/index.js';
import { MaxGraphAdapter } from '../renderer-maxgraph/index.js';
import { renderElementResourceComposition } from '../renderer-resource-dom/index.js';
import { normalizeMeaningRecoveryResult } from './meaning-recovery.js';

const MIN_SCALE = 0.42;
const MAX_SCALE = 5.2;
const WHEEL_ZOOM_FACTOR = 1.35;
const WHEEL_PIXEL_STEP = 100;
const MAX_WHEEL_DELTA = 240;
const INITIAL_SCALE = 0.66;

const container = document.getElementById('graph-container');
const zoomLabel = document.getElementById('zoom-label');
const resolutionLabel = document.getElementById('resolution-label');
const sceneLabel = document.getElementById('scene-label');
const draftLabel = document.getElementById('draft-label');
const addNodeButton = document.getElementById('add-node');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');
const deleteButton = document.getElementById('delete');
const openLinkButton = document.getElementById('open-link');
const toast = document.getElementById('toast');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

let toastRun = 0;
function showToast(message, isError = false) {
  const run = ++toastRun;
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  setTimeout(() => {
    if (toastRun === run) toast.hidden = true;
  }, isError ? 3200 : 1700);
}

function installTouchNavigation({ container, adapter, minimumScale, signal }) {
  if (!globalThis.PointerEvent) {
    return Object.freeze({ snapshot: () => ({ enabled: false, mode: 'native', pointers: 0 }) });
  }

  adapter.setNativePinchEnabled(false);
  const pointers = new Map();
  const intercepted = new Set();
  let mode = 'idle';
  let panStart = null;
  let pinchStart = null;

  function pointFrom(event) {
    return { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, target: event.target };
  }
  function preventGraphHandling(event) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
  function showScale(scale) {
    zoomLabel.value = `${Math.round(scale * 100)}%`;
    zoomLabel.textContent = zoomLabel.value;
  }
  function capture(id) { try { container.setPointerCapture(id); } catch (_) {} }
  function release(id) { try { container.releasePointerCapture(id); } catch (_) {} }
  function activeCamera() { return adapter.cameraPreviewSnapshot().camera ?? adapter.camera(); }
  function beginPan(point) {
    adapter.beginCameraPreview();
    const camera = activeCamera();
    mode = 'pan';
    pinchStart = null;
    panStart = {
      id: point.id, clientX: point.clientX, clientY: point.clientY,
      scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY,
    };
  }
  function pinchPoints() { return [...pointers.values()].slice(0, 2); }
  function midpoint(a, b) {
    const rect = container.getBoundingClientRect();
    return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
  }
  function distance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  function beginPinch() {
    const [a, b] = pinchPoints();
    if (!a || !b) return;
    const startDistance = distance(a, b);
    if (startDistance < 1) return;
    adapter.beginCameraPreview();
    const camera = activeCamera();
    const center = midpoint(a, b);
    mode = 'pinch';
    panStart = null;
    pinchStart = {
      distance: startDistance,
      scale: camera.scale,
      worldX: center.x / camera.scale - camera.translateX,
      worldY: center.y / camera.scale - camera.translateY,
    };
  }
  function ownAllPointers() {
    adapter.cancelInteraction();
    for (const id of pointers.keys()) { intercepted.add(id); capture(id); }
  }
  function onPointerDown(event) {
    if (event.pointerType !== 'touch') return;
    const point = pointFrom(event);
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      preventGraphHandling(event);
      ownAllPointers();
      beginPinch();
      return;
    }
    const shouldPan = adapter.tool === 'hand' || !adapter.isEditableTouchTarget(event.clientX, event.clientY, event.target);
    if (shouldPan) {
      preventGraphHandling(event);
      intercepted.add(event.pointerId);
      capture(event.pointerId);
      beginPan(point);
    } else {
      mode = 'graph';
      panStart = null;
      pinchStart = null;
    }
  }
  function onPointerMove(event) {
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointFrom(event));
    if (pointers.size >= 2 || mode === 'pinch') {
      preventGraphHandling(event);
      if (mode !== 'pinch' || !pinchStart) { ownAllPointers(); beginPinch(); }
      const [a, b] = pinchPoints();
      if (!a || !b || !pinchStart) return;
      const nextDistance = distance(a, b);
      if (nextDistance < 1) return;
      const center = midpoint(a, b);
      const scale = clamp(pinchStart.scale * (nextDistance / pinchStart.distance), minimumScale(), MAX_SCALE);
      adapter.previewCamera(scale, center.x / scale - pinchStart.worldX, center.y / scale - pinchStart.worldY);
      showScale(scale);
      return;
    }
    if (!intercepted.has(event.pointerId) || mode !== 'pan') return;
    preventGraphHandling(event);
    const point = pointers.get(event.pointerId);
    if (!panStart || panStart.id !== point.id) beginPan(point);
    if (!panStart) return;
    adapter.previewCamera(
      panStart.scale,
      panStart.translateX + (point.clientX - panStart.clientX) / panStart.scale,
      panStart.translateY + (point.clientY - panStart.clientY) / panStart.scale,
    );
  }
  function onPointerEnd(event) {
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
    const owned = intercepted.has(event.pointerId) || mode === 'pinch';
    if (owned) preventGraphHandling(event);
    if (event.type === 'pointercancel') {
      for (const id of pointers.keys()) release(id);
      pointers.clear();
      intercepted.clear();
      adapter.cancelCameraPreview();
      showScale(adapter.camera().scale);
      mode = 'idle'; panStart = null; pinchStart = null;
      return;
    }
    pointers.delete(event.pointerId);
    intercepted.delete(event.pointerId);
    release(event.pointerId);
    if (pointers.size >= 2) {
      ownAllPointers();
      beginPinch();
    } else if (pointers.size === 1 && mode === 'pinch') {
      const remaining = [...pointers.values()][0];
      intercepted.add(remaining.id);
      capture(remaining.id);
      beginPan(remaining);
    } else if (pointers.size === 0) {
      adapter.commitCameraPreview();
      mode = 'idle'; panStart = null; pinchStart = null;
    }
  }
  signal.addEventListener('abort', () => {
    for (const id of pointers.keys()) release(id);
    pointers.clear();
    intercepted.clear();
    adapter.cancelCameraPreview();
  }, { once: true });
  const options = { capture: true, passive: false, signal };
  container.addEventListener('pointerdown', onPointerDown, options);
  container.addEventListener('pointermove', onPointerMove, options);
  container.addEventListener('pointerup', onPointerEnd, options);
  container.addEventListener('pointercancel', onPointerEnd, options);
  return Object.freeze({ snapshot: () => ({
    enabled: true, mode, pointers: pointers.size, intercepted: intercepted.size, preview: adapter.cameraPreviewSnapshot(),
  }) });
}

export async function createSemanticMapEditor(initialDomain, options = {}) {
  const readOnly = options.readOnly === true;
  const lifetime = new AbortController();
  const listenerOptions = { signal: lifetime.signal };
  const disposers = [];
  let destroyed = false;
  let labelEditor = null;
  let displayErrorShown = false;
  if (!container.hasAttribute('tabindex')) container.tabIndex = 0;
  const moduleResolver = options.moduleResolver ?? null;
  const moduleContext = options.moduleContext ?? (() => ({}));
  const projectPresentation = options.projectPresentation ?? (() => null);
  const translateOperation = options.translateOperation ?? ((operation) => Object.freeze([operation]));
  let currentView = normalizeView(options.view);
  let modules = options.initialModules ?? null;
  let moduleError = null;
  let moduleRevision = 0;
  let lastMeaningRecovery = null;
  let lastPresentationProjection = null;
  let lastScene = null;
  let renderQueued = false;
  let renderFrame = 0;
  let elementCompositionKey = null;
  let currentTool = 'select';
  let spacePreviousTool = null;
  const adapter = new MaxGraphAdapter(container);

  const documentPort = Object.freeze({
    requestEdit: ({ operation, semantic }) => {
      const recovery = normalizeMeaningRecoveryResult(translateOperation(operation, Object.freeze({
        domain: semantic,
        presentationProjection: lastPresentationProjection,
        presentationScale: adapter.camera().scale,
        view: currentView,
      })));
      lastMeaningRecovery = recovery;
      if (recovery.status === 'reject') {
        queueRender();
        throw new Error(`semantic-map: meaning recovery rejected: ${recovery.reason}`);
      }
      if (recovery.status !== 'candidate') {
        queueRender();
        return Object.freeze({ noop: true, result: recovery });
      }
      return Object.freeze({
        operations: Object.freeze(recovery.operations.map((candidate) => structuredClone(candidate))),
        validate: ({ semantic: candidate }) => {
          const configKey = patternConfigKey(currentView.pattern);
          return validatePatternDomain(candidate, currentView.pattern, configKey === null ? null : currentView[configKey]);
        },
      });
    },
    commit: ({ revision }) => Object.freeze({ revision }),
    reload: ({ input, expectedRevision }) => Object.freeze({ input, revision: expectedRevision }),
    renderChrome: viewModel => updateControls(viewModel),
  });
  const authorityPort = Object.freeze({ authorize: () => Object.freeze({
    allowed: !readOnly,
    code: readOnly ? 'E_READ_ONLY' : 'ALLOW',
    reason: readOnly ? 'embedded semantic map is read-only' : 'editor mutation allowed',
  }) });
  const core = createSemanticMapEditorCore({
    semantic: initialDomain,
    layout: Object.freeze({ selection: Object.freeze({ regionIds: [], relationIds: [] }), frame: null }),
    revision: options.revision ?? null,
    ports: Object.freeze({ surface: adapter, document: documentPort, authority: authorityPort }),
  });
  let currentDomain = createSemanticMap(core.snapshot().records);

  function projectionInput(resolvedModules = modules) {
    return Object.freeze({
      view: currentView,
      modules: resolvedModules,
      projectPresentation,
      presentation: Object.freeze({ camera: adapter.camera(), viewport: adapter.viewport() }),
    });
  }

  function configureProjection(resolvedModules = modules) {
    const snapshot = core.dispatch({ type: 'presentation.configure', projection: projectionInput(resolvedModules) });
    lastScene = snapshot.scene;
    lastPresentationProjection = snapshot.presentationProjection;
    return snapshot;
  }

  function fitScale(maxScale = INITIAL_SCALE) {
    const root = lastScene?.bounds ?? currentDomain.regions.get(currentDomain.meta.root).bounds;
    const availableWidth = Math.max(1, container.clientWidth - 48);
    const availableHeight = Math.max(1, container.clientHeight - 48);
    return Math.max(0.01, Math.min(maxScale, availableWidth / root.width, availableHeight / root.height));
  }
  function minimumScale() { return Math.min(MIN_SCALE, fitScale()); }
  function wheelDeltaPixels(event) {
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, container.clientHeight) : 1;
    return clamp(event.deltaY * multiplier, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
  }

  function updateControls(viewModel = core.snapshot()) {
    const { draft, selection } = viewModel;
    if (viewModel.scene) lastScene = viewModel.scene;
    if (Object.hasOwn(viewModel, 'presentationProjection')) lastPresentationProjection = viewModel.presentationProjection;
    undoButton.disabled = readOnly || !draft.canUndo;
    redoButton.disabled = readOnly || !draft.canRedo;
    addNodeButton.disabled = readOnly;
    deleteButton.disabled = readOnly || selection.regionIds.length + selection.relationIds.length === 0;
    const selectedRepresentation = selection.regionIds.length === 1
      ? lastScene?.representations.find((item) => item.regionId === selection.regionIds[0])
      : null;
    const linked = selectedRepresentation?.href
      ?? (selection.regionIds.length === 1 ? currentDomain.regions.get(selection.regionIds[0])?.href : null);
    if (openLinkButton) openLinkButton.disabled = !linked;
    draftLabel.textContent = `Draft ${draft.applied} · redo ${draft.redo}`;
    if (viewModel.display.status === 'error') {
      showToast(viewModel.display.failures.map(failure => failure.message).join(' / '), true);
      toastRun += 1;
      displayErrorShown = true;
    } else if (displayErrorShown) {
      toastRun += 1;
      toast.hidden = true;
      displayErrorShown = false;
    }
  }

  function render() {
    renderFrame = 0;
    renderQueued = false;
    if (destroyed) return;
    const snapshot = core.snapshot();
    currentDomain = createSemanticMap(snapshot.records);
    lastScene = snapshot.scene;
    lastPresentationProjection = snapshot.presentationProjection;
    const nextElementCompositionKey = JSON.stringify(currentView.resourceComposition ?? null);
    if (elementCompositionKey !== nextElementCompositionKey) {
      renderElementResourceComposition({ document, composition: currentView.resourceComposition, strict: true });
      elementCompositionKey = nextElementCompositionKey;
    }
    const camera = adapter.camera();
    zoomLabel.value = `${Math.round(camera.scale * 100)}%`;
    zoomLabel.textContent = zoomLabel.value;
    if (lastScene) {
      resolutionLabel.textContent = `resolution depth ${lastScene.maxDepth}`;
      sceneLabel.textContent = `${lastScene.pattern} · ${lastScene.scenes.length} scenes · ${lastScene.representations.length} regions / ${lastScene.relations.length} relations`;
    }
    updateControls(snapshot);
  }

  function queueRender() {
    if (destroyed || renderQueued) return;
    renderQueued = true;
    renderFrame = requestAnimationFrame(render);
  }

  async function refreshModules() {
    if (!moduleResolver) {
      configureProjection(modules);
      return modules;
    }
    const revision = ++moduleRevision;
    try {
      const resolved = await moduleResolver.resolve(currentDomain, { ...moduleContext(), view: currentView });
      if (destroyed || revision !== moduleRevision) return modules;
      modules = resolved;
      moduleError = null;
      configureProjection(resolved);
      return resolved;
    } catch (error) {
      if (destroyed || revision !== moduleRevision) return modules;
      moduleError = error;
      showToast(error.message, true);
      queueRender();
      return null;
    }
  }

  async function setView(view, resolvedModules = null) {
    currentView = normalizeView(view);
    lastMeaningRecovery = null;
    if (resolvedModules) {
      modules = resolvedModules;
      moduleError = null;
      configureProjection(resolvedModules);
    } else if (moduleResolver) {
      const refreshed = await refreshModules();
      if (!refreshed) throw moduleError;
    } else {
      configureProjection(modules);
    }
    resetCamera();
    render();
    return Object.freeze({ view: currentView, modules, scene: lastScene });
  }

  function projectDomain(domain, view = currentView, resolvedModules = modules) {
    return core.dispatch({
      type: 'presentation.project',
      semantic: domain,
      view: normalizeView(view),
      modules: resolvedModules,
      presentation: Object.freeze({ camera: adapter.camera(), viewport: adapter.viewport() }),
    });
  }

  adapter.setErrorHandler((error) => { showToast(error.message, true); queueRender(); });
  disposers.push(core.subscribe(event => {
    currentDomain = createSemanticMap(event.core.records);
    lastScene = event.core.scene;
    lastPresentationProjection = event.core.presentationProjection;
    if (event.kind === 'mutation' || event.kind === 'history' || event.kind === 'replace') {
      queueMicrotask(() => { void refreshModules(); });
    }
    queueRender();
    updateControls(event.core);
  }));

  function zoomAt(clientX, clientY, factor) {
    const camera = adapter.camera();
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const oldScale = camera.scale;
    const newScale = clamp(oldScale * factor, minimumScale(), MAX_SCALE);
    if (newScale === oldScale) return;
    const worldX = px / oldScale - camera.translateX;
    const worldY = py / oldScale - camera.translateY;
    adapter.setCamera(newScale, px / newScale - worldX, py / newScale - worldY);
  }
  function setScaleAtWorld(worldX, worldY, scale) {
    const camera = adapter.camera();
    const rect = container.getBoundingClientRect();
    zoomAt(
      rect.left + (worldX + camera.translateX) * camera.scale,
      rect.top + (worldY + camera.translateY) * camera.scale,
      scale / camera.scale,
    );
  }
  function focusAtWorld(worldX, worldY, scale) {
    const nextScale = clamp(scale, minimumScale(), MAX_SCALE);
    adapter.setCamera(
      nextScale,
      container.clientWidth / (2 * nextScale) - worldX,
      container.clientHeight / (2 * nextScale) - worldY,
    );
  }
  function focusBounds(bounds, viewportPixels = null) {
    const width = viewportPixels?.width ?? container.clientWidth;
    const height = viewportPixels?.height ?? container.clientHeight;
    const scale = clamp(Math.min(width / bounds.width, height / bounds.height), minimumScale(), MAX_SCALE);
    adapter.setCamera(
      scale,
      container.clientWidth / (2 * scale) - (bounds.x + bounds.width / 2),
      container.clientHeight / (2 * scale) - (bounds.y + bounds.height / 2),
    );
  }
  function focusRegion(regionId, scale) {
    const representation = lastScene?.representations.find((item) => item.regionId === regionId);
    const bounds = representation?.bounds ?? currentDomain.regions.get(regionId)?.bounds;
    if (!bounds) return false;
    focusAtWorld(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, scale);
    return true;
  }
  function resetCamera(maxScale = INITIAL_SCALE) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const root = lastScene?.bounds ?? currentDomain.regions.get(currentDomain.meta.root).bounds;
    const scale = fitScale(maxScale);
    adapter.setCamera(scale, (width / scale - root.width) / 2 - root.x, (height / scale - root.height) / 2 - root.y);
  }
  function setTool(tool) { currentTool = tool; adapter.setTool(tool); }

  function newNodeBounds(parentBounds) {
    const viewport = adapter.viewport();
    const width = 170;
    const height = 96;
    const margin = 18;
    const desiredX = viewport.x + viewport.width / 2 - width / 2;
    const desiredY = viewport.y + viewport.height / 2 - height / 2;
    const minX = parentBounds.x + margin;
    const minY = parentBounds.y + margin;
    const maxX = parentBounds.x + parentBounds.width - width - margin;
    const maxY = parentBounds.y + parentBounds.height - height - margin;
    return {
      x: maxX >= minX ? clamp(desiredX, minX, maxX) : desiredX,
      y: maxY >= minY ? clamp(desiredY, minY, maxY) : desiredY,
      width, height,
    };
  }
  function nextCalendarDate(value) {
    const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  function nextTemporal(axis) {
    const intervals = [...currentDomain.regions.values()].map((region) => region.temporal?.[axis]).filter(Boolean);
    if (axis === 'ordinal') {
      const start = intervals.length ? Math.max(...intervals.map((item) => item.end)) + 1 : 0;
      return Object.freeze({ start, end: start });
    }
    const latest = intervals.length ? intervals.map((item) => item.end).sort().at(-1) : '1969-12-31';
    const start = nextCalendarDate(latest);
    return Object.freeze({ start, end: start });
  }

  function addNode() {
    setTool('select');
    if (!patternCapabilities(currentView.pattern).editable) {
      showToast('この表示は入力データから生成されます', true);
      return null;
    }
    if (currentView.pattern === PATTERN_SEQ) {
      const selectedId = core.snapshot().selection.regionIds[0] ?? null;
      const selected = selectedId ? currentDomain.regions.get(selectedId) : null;
      const actors = [...currentDomain.regions.values()].filter((region) => region.kind === 'actor');
      if (currentView.seq.groupBy === 'actor' && actors.length === 0) {
        const result = core.dispatch({
          type: 'AddRegion', parentId: currentDomain.meta.root, label: 'Untitled actor', kind: 'actor', summary: '', bounds: [0, 0, 146, 60],
        });
        if (!result?.createdRegionId) return null;
        showToast('actorを追加しました');
        startEditingSelection();
        return result.createdRegionId;
      }
      const actor = currentView.seq.groupBy === 'actor'
        ? (selected?.kind === 'actor' ? selected.id : actors[0]?.id ?? null)
        : (selected?.kind === 'actor' ? selected.id : null);
      const interval = nextTemporal(currentView.seq.axis);
      const result = core.dispatch({
        type: 'AddRegion',
        parentId: selected && selected.kind === 'task' ? selected.id : currentDomain.meta.root,
        label: 'Untitled task', kind: 'task', summary: '', bounds: [0, 0, 170, 68],
        temporal: { actor, [currentView.seq.axis]: interval },
      });
      if (!result?.createdRegionId) return null;
      showToast('seq itemを追加しました');
      startEditingSelection();
      return result.createdRegionId;
    }
    const selectedId = core.snapshot().selection.regionIds[0] ?? null;
    const selectedRepresentation = lastScene?.representations.find((representation) => representation.regionId === selectedId);
    let parentId = currentDomain.meta.root;
    if (currentView.pattern !== 'graph/1' && selectedId && selectedRepresentation?.detailsVisible) parentId = selectedId;
    else if (currentView.pattern !== 'graph/1' && selectedId) parentId = currentDomain.regions.get(selectedId)?.parent ?? currentDomain.meta.root;
    const parent = currentDomain.regions.get(parentId);
    const result = core.dispatch({
      type: 'AddRegion', parentId, label: 'Untitled', kind: 'concept', summary: '', bounds: Object.values(newNodeBounds(parent.bounds)),
    });
    if (!result?.createdRegionId) return null;
    showToast('ノードを追加しました');
    startEditingSelection();
    return result.createdRegionId;
  }

  function undo() { if (core.dispatch({ type: 'history.undo' })) showToast('元に戻しました'); }
  function redo() { if (core.dispatch({ type: 'history.redo' })) showToast('やり直しました'); }
  function deleteSelection() {
    const selection = core.snapshot().selection;
    if (!selection.regionIds.length && !selection.relationIds.length) return null;
    const result = core.dispatch({ type: 'RemoveSelection', ...selection });
    if (result) showToast('選択を削除しました');
    return result;
  }
  function openRegionLink(regionId, navigate = (url) => location.assign(url), base = location.href) {
    const representation = lastScene?.representations.find((item) => item.regionId === regionId);
    const href = representation?.href ?? currentDomain.regions.get(regionId)?.href ?? null;
    if (!href) return null;
    const url = new URL(href, base).href;
    navigate(url);
    return url;
  }
  function openSelectedLink() {
    const selection = core.snapshot().selection;
    if (selection.regionIds.length !== 1) return null;
    return openRegionLink(selection.regionIds[0]);
  }

  const touchNavigation = installTouchNavigation({ container, adapter, minimumScale, signal: lifetime.signal });
  container.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, WHEEL_ZOOM_FACTOR ** (-wheelDeltaPixels(event) / WHEEL_PIXEL_STEP));
  }, { passive: false, signal: lifetime.signal });

  addNodeButton.addEventListener('click', () => { try { addNode(); } catch (error) { showToast(error.message, true); } }, listenerOptions);
  undoButton.addEventListener('click', () => { try { undo(); } catch (error) { showToast(error.message, true); } }, listenerOptions);
  redoButton.addEventListener('click', () => { try { redo(); } catch (error) { showToast(error.message, true); } }, listenerOptions);
  deleteButton.addEventListener('click', () => { try { deleteSelection(); } catch (error) { showToast(error.message, true); } }, listenerOptions);
  openLinkButton?.addEventListener('click', openSelectedLink, listenerOptions);

  function isTextInput(event) {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
  }
  function startEditingSelection() {
    if (destroyed || readOnly) return false;
    const selection = core.snapshot().selection;
    if (selection.regionIds.length !== 1 || selection.relationIds.length) return false;
    const regionId = selection.regionIds[0];
    const record = core.snapshot().records.find(row => row.type === 'region' && row.id === regionId);
    if (!record) return false;
    labelEditor?.remove();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = record.label;
    input.setAttribute('aria-label', '名前');
    input.setAttribute('data-editor-label', regionId);
    Object.assign(input.style, { position: 'absolute', left: '12px', top: '12px', zIndex: '10', width: 'min(320px, 80%)' });
    labelEditor = input;
    const close = (focus = true) => {
      input.remove();
      if (labelEditor === input) labelEditor = null;
      if (focus && !destroyed) container.focus();
    };
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { close(); return; }
      try { core.dispatch({ type: 'RenameRegion', regionId, label: input.value }); close(); }
      catch (error) { showToast(error.message, true); }
    }, listenerOptions);
    input.addEventListener('blur', () => close(false), { ...listenerOptions, once: true });
    container.append(input);
    input.focus();
    input.select();
    return true;
  }

  const onKeyDown = event => {
    const command = commandForKey(event, { selection: core.snapshot().selection, editing: isTextInput(event) });
    if (!command) return;
    event.preventDefault();
    try {
      switch (command.type) {
        case 'node.create': addNode(); break;
        case 'node.edit': startEditingSelection(); break;
        case 'link.open': openSelectedLink(); break;
        case 'tool.set': setTool(command.tool); break;
        case 'tool.hold': if (spacePreviousTool === null) { spacePreviousTool = currentTool; setTool(command.tool); } break;
        case 'interaction.cancel': adapter.cancelInteraction(); setTool('select'); break;
        case 'RemoveSelection': deleteSelection(); break;
        default: core.dispatch(command); break;
      }
    } catch (error) { showToast(error.message, true); }
  };
  document.addEventListener('keydown', onKeyDown, listenerOptions);
  document.addEventListener('keyup', event => {
    if (event.key === ' ' && spacePreviousTool !== null) {
      const restore = spacePreviousTool;
      spacePreviousTool = null;
      setTool(restore);
      event.preventDefault();
    }
  }, listenerOptions);

  const resizeObserver = new ResizeObserver(() => {
    if (!lastScene) resetCamera();
    else {
      core.acceptGesture({ type: 'camera.changed', presentation: { camera: adapter.camera(), viewport: adapter.viewport() } });
      queueRender();
    }
  });
  resizeObserver.observe(container);

  configureProjection(modules);
  setTool('select');
  resetCamera();
  render();

  const api = Object.freeze({
    ready: true,
    readOnly,
    get domain() { return createSemanticMap(core.snapshot().records); },
    core,
    thresholds: projectorThresholds,
    snapshot: () => {
      const coreSnapshot = core.snapshot();
      return {
        camera: adapter.camera(),
        touch: touchNavigation.snapshot(),
        viewport: adapter.viewport(),
        tool: currentTool,
        selection: coreSnapshot.selection,
        draft: coreSnapshot.draft,
        domain: {
          meta: {
            schema: currentDomain.meta.schema,
            root: currentDomain.meta.root,
            title: currentDomain.meta.title,
            geoSpec: currentDomain.meta.geoSpec ? structuredClone(currentDomain.meta.geoSpec) : null,
          },
          regions: [...currentDomain.regions.values()].map((region) => ({
            id: region.id, parent: region.parent, label: region.label, kind: region.kind, order: region.order ?? null,
            temporal: region.temporal ? structuredClone(region.temporal) : null,
            value: region.value ?? null, href: region.href ?? null, set: region.set ? { ...region.set } : null, bounds: { ...region.bounds },
          })),
          relations: currentDomain.relations.map((relation) => ({ ...relation })),
        },
        modules: lastScene ? { ...lastScene.modules, error: moduleError?.message ?? null } : null,
        resourceComposition: currentView.resourceComposition ? structuredClone(currentView.resourceComposition) : null,
        meaningRecovery: lastMeaningRecovery ? structuredClone(lastMeaningRecovery) : null,
        presentationProjection: coreSnapshot.presentationProjection,
        scene: lastScene ? {
          pattern: lastScene.pattern,
          sceneIds: lastScene.scenes.map((item) => item.id).sort(),
          scenePatterns: lastScene.scenes.map((item) => `${item.id}:${item.pattern}`).sort(),
          maxDepth: lastScene.maxDepth,
          representationIds: lastScene.representations.map((item) => item.representationId).sort(),
          regionIds: lastScene.representations.map((item) => item.regionId).sort(),
          readOnlyRegionIds: lastScene.representations.filter((item) => item.readOnly).map((item) => item.regionId).sort(),
          relationEndpoints: lastScene.relations.map((item) => `${item.from}->${item.to}`).sort(),
          setOverlay: {
            sets: lastScene.setOverlay.sets.map((item) => ({ regionId: item.regionId, complete: item.complete, bounds: { ...item.bounds } })),
            pairs: lastScene.setOverlay.pairs.map((item) => ({
              left: item.left, right: item.right, topology: item.topology, overlapKnown: item.overlapKnown,
            })),
          },
          detailIds: [...lastScene.detailIds],
        } : null,
      };
    },
    operation: (operation) => core.dispatch(normalizeOperation(operation)),
    addNode,
    undo,
    redo,
    deleteSelection,
    openRegionLink,
    openSelectedLink,
    exportJSONL: () => recordsToJSONL(core.snapshot().records),
    setTool,
    zoomAtWorld: setScaleAtWorld,
    focusRegion,
    focusBounds,
    fitOverview: () => resetCamera(1),
    reset: resetCamera,
    refreshModules,
    setView,
    projectDomain,
    currentScene: () => core.snapshot().scene,
    setReviewOverlay: overlay => adapter.setReviewOverlay(overlay),
    clearReviewOverlay: () => adapter.clearReviewOverlay(),
    reviewOverlaySnapshot: () => adapter.reviewOverlaySnapshot(),
    get view() { return currentView; },
    notify: showToast,
    showError: (message) => showToast(message, true),
    destroy: () => {
      if (destroyed) return false;
      const result = core.destroy();
      destroyed = true;
      moduleRevision += 1;
      lifetime.abort();
      labelEditor?.remove();
      labelEditor = null;
      if (renderFrame) cancelAnimationFrame(renderFrame);
      resizeObserver.disconnect();
      for (const dispose of disposers) dispose?.();
      if (globalThis.semanticMapApp === api) delete globalThis.semanticMapApp;
      return result;
    },
  });
  globalThis.semanticMapApp = api;
  return api;
}