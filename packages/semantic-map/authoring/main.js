import { SemanticDomainStore, normalizeOperation } from '../domain/index.js';
import { SemanticProjector, projectorThresholds } from '../projection/index.js';
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

function installTouchNavigation({ container, adapter, minimumScale }) {
  if (!globalThis.PointerEvent) {
    return Object.freeze({ snapshot: () => ({ enabled: false, mode: 'native', pointers: 0 }) });
  }

  // maxGraph handles one-finger editing. This adapter owns empty-space pan and
  // standards-based two-finger pinch, because maxGraph's pinch path uses gesture events.
  adapter.setNativePinchEnabled(false);

  const pointers = new Map();
  const intercepted = new Set();
  let mode = 'idle';
  let panStart = null;
  let pinchStart = null;

  function pointFrom(event) {
    return {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
    };
  }

  function preventGraphHandling(event) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }

  function showScale(scale) {
    zoomLabel.value = `${Math.round(scale * 100)}%`;
    zoomLabel.textContent = zoomLabel.value;
  }

  function capture(id) {
    try { container.setPointerCapture(id); } catch (_) { /* capture is best effort */ }
  }

  function release(id) {
    try { container.releasePointerCapture(id); } catch (_) { /* already released */ }
  }

  function activeCamera() {
    return adapter.cameraPreviewSnapshot().camera ?? adapter.camera();
  }

  function beginPan(point) {
    adapter.beginCameraPreview();
    const camera = activeCamera();
    mode = 'pan';
    pinchStart = null;
    panStart = {
      id: point.id,
      clientX: point.clientX,
      clientY: point.clientY,
      scale: camera.scale,
      translateX: camera.translateX,
      translateY: camera.translateY,
    };
  }

  function pinchPoints() {
    return [...pointers.values()].slice(0, 2);
  }

  function midpoint(a, b) {
    const rect = container.getBoundingClientRect();
    return {
      x: (a.clientX + b.clientX) / 2 - rect.left,
      y: (a.clientY + b.clientY) / 2 - rect.top,
    };
  }

  function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

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
    for (const id of pointers.keys()) {
      intercepted.add(id);
      capture(id);
    }
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

    const shouldPan = adapter.tool === 'hand'
      || !adapter.isEditableTouchTarget(event.clientX, event.clientY, event.target);
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
      if (mode !== 'pinch' || !pinchStart) {
        ownAllPointers();
        beginPinch();
      }
      const [a, b] = pinchPoints();
      if (!a || !b || !pinchStart) return;
      const nextDistance = distance(a, b);
      if (nextDistance < 1) return;

      const center = midpoint(a, b);
      const scale = clamp(
        pinchStart.scale * (nextDistance / pinchStart.distance),
        minimumScale(),
        MAX_SCALE,
      );
      adapter.previewCamera(
        scale,
        center.x / scale - pinchStart.worldX,
        center.y / scale - pinchStart.worldY,
      );
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
      mode = 'idle';
      panStart = null;
      pinchStart = null;
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
      mode = 'idle';
      panStart = null;
      pinchStart = null;
    }
  }

  const options = { capture: true, passive: false };
  container.addEventListener('pointerdown', onPointerDown, options);
  container.addEventListener('pointermove', onPointerMove, options);
  container.addEventListener('pointerup', onPointerEnd, options);
  container.addEventListener('pointercancel', onPointerEnd, options);

  return Object.freeze({
    snapshot: () => ({
      enabled: true,
      mode,
      pointers: pointers.size,
      intercepted: intercepted.size,
      preview: adapter.cameraPreviewSnapshot(),
    }),
  });
}

export async function createSemanticMapEditor(initialDomain, options = {}) {
  const store = new SemanticDomainStore(initialDomain);
  const prepareOperation = options.prepareOperation ?? normalizeOperation;
  const readOnly = options.readOnly === true;
  const moduleResolver = options.moduleResolver ?? null;
  const moduleContext = options.moduleContext ?? (() => ({}));
  const projectPresentation = options.projectPresentation ?? (() => null);
  const translateOperation = options.translateOperation ?? ((operation) => Object.freeze([operation]));
  let currentView = normalizeView(options.view);
  let modules = options.initialModules ?? null;
  let moduleError = null;
  let moduleRevision = 0;
  let lastMeaningRecovery = null;
  let lastPresentationProjection = projectPresentation(store.domain, currentView);
  const projector = new SemanticProjector(store.domain, modules, currentView, {
    presentationProjection: lastPresentationProjection,
  });
  const adapter = new MaxGraphAdapter(container);

  function fitScale(maxScale = INITIAL_SCALE) {
    const root = lastScene?.bounds ?? store.domain.regions.get(store.domain.meta.root).bounds;
    const availableWidth = Math.max(1, container.clientWidth - 48);
    const availableHeight = Math.max(1, container.clientHeight - 48);
    return Math.max(0.01, Math.min(
      maxScale,
      availableWidth / root.width,
      availableHeight / root.height,
    ));
  }

  function minimumScale() {
    return Math.min(MIN_SCALE, fitScale());
  }

  function wheelDeltaPixels(event) {
    const multiplier = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? Math.max(1, container.clientHeight)
        : 1;
    return clamp(event.deltaY * multiplier, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
  }

  let renderQueued = false;
  let lastScene = null;
  let elementCompositionKey = null;
  let currentTool = 'select';
  let spacePreviousTool = null;

  function refreshPresentationProjection() {
    lastPresentationProjection = projectPresentation(store.domain, currentView);
    projector.setPresentationProjection(lastPresentationProjection);
  }

  function updateControls() {
    const draft = store.draftSnapshot();
    const selection = adapter.selectionSnapshot();
    undoButton.disabled = !draft.canUndo;
    redoButton.disabled = !draft.canRedo;
    deleteButton.disabled = selection.regionIds.length + selection.relationIds.length === 0;
    const selectedRepresentation = selection.regionIds.length === 1
      ? lastScene?.representations.find((item) => item.regionId === selection.regionIds[0])
      : null;
    const linked = selectedRepresentation?.href
      ?? (selection.regionIds.length === 1 ? store.domain.regions.get(selection.regionIds[0])?.href : null);
    if (openLinkButton) openLinkButton.disabled = !linked;
    draftLabel.textContent = `Draft ${draft.applied} · redo ${draft.redo}`;
  }

  function pruneSelection() {
    const selection = adapter.selectionSnapshot();
    const relationIds = new Set(store.domain.relations.map((relation) => relation.id));
    const nextRegions = selection.regionIds.filter((id) => store.domain.regions.has(id));
    const nextRelations = selection.relationIds.filter((id) => relationIds.has(id));
    if (
      nextRegions.length !== selection.regionIds.length
      || nextRelations.length !== selection.relationIds.length
    ) {
      adapter.setSelection({ regionIds: nextRegions, relationIds: nextRelations });
    }
  }

  function render() {
    renderQueued = false;
    projector.setDomain(store.domain);
    const camera = adapter.camera();
    const scene = projector.project({ scale: camera.scale, viewport: adapter.viewport() });
    adapter.render(scene);
    const nextElementCompositionKey = JSON.stringify(currentView.resourceComposition ?? null);
    if (elementCompositionKey !== nextElementCompositionKey) {
      renderElementResourceComposition({ document, composition: currentView.resourceComposition, strict: true });
      elementCompositionKey = nextElementCompositionKey;
    }
    lastScene = scene;
    pruneSelection();

    zoomLabel.value = `${Math.round(camera.scale * 100)}%`;
    zoomLabel.textContent = zoomLabel.value;
    resolutionLabel.textContent = `resolution depth ${scene.maxDepth}`;
    sceneLabel.textContent = `${scene.pattern} · ${scene.scenes.length} scenes · ${scene.representations.length} regions / ${scene.relations.length} relations`;
    updateControls();
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  async function refreshModules() {
    if (!moduleResolver) return modules;
    const revision = ++moduleRevision;
    try {
      const resolved = await moduleResolver.resolve(store.domain, { ...moduleContext(), view: currentView });
      if (revision !== moduleRevision) return modules;
      modules = resolved;
      moduleError = null;
      projector.setModules(resolved);
      queueRender();
      return resolved;
    } catch (error) {
      if (revision !== moduleRevision) return modules;
      moduleError = error;
      projector.setModules(modules);
      showToast(error.message, true);
      queueRender();
      return null;
    }
  }

  async function setView(view, resolvedModules = null) {
    const normalized = normalizeView(view);
    currentView = normalized;
    lastMeaningRecovery = null;
    projector.setView(normalized);
    refreshPresentationProjection();
    if (resolvedModules) {
      modules = resolvedModules;
      moduleError = null;
      projector.setModules(resolvedModules);
    } else {
      const refreshed = await refreshModules();
      if (!refreshed && moduleResolver) throw moduleError;
    }
    render();
    resetCamera();
    return Object.freeze({ view: currentView, modules, scene: lastScene });
  }

  adapter.setOperationHandler((operation) => {
    if (readOnly) throw new Error('semantic-map: embedded module is read-only');
    const recovery = normalizeMeaningRecoveryResult(translateOperation(operation, Object.freeze({
      domain: store.domain,
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
      return recovery;
    }
    const prepared = recovery.operations.map((candidate) => prepareOperation(candidate));
    const batch = store.performBatch(
      prepared,
      (candidate) => {
        const configKey = patternConfigKey(currentView.pattern);
        return validatePatternDomain(
          candidate.domain,
          currentView.pattern,
          configKey === null ? null : currentView[configKey],
        );
      },
    );
    return batch.results.length === 1
      ? batch.results[0]
      : Object.freeze({ operations: Object.freeze(prepared), results: batch.results });
  });
  adapter.setErrorHandler((error) => {
    showToast(error.message, true);
    queueRender();
  });
  adapter.onSelectionChange(updateControls);
  store.onChange(() => {
    projector.setDomain(store.domain);
    refreshPresentationProjection();
    queueMicrotask(() => { void refreshModules(); });
    queueRender();
    updateControls();
  });

  function zoomAt(clientX, clientY, factor) {
    const view = adapter.graph.getView();
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const oldScale = view.scale;
    const newScale = clamp(oldScale * factor, minimumScale(), MAX_SCALE);
    if (newScale === oldScale) return;

    const worldX = px / oldScale - view.translate.x;
    const worldY = py / oldScale - view.translate.y;
    const translateX = px / newScale - worldX;
    const translateY = py / newScale - worldY;
    view.scaleAndTranslate(newScale, translateX, translateY);
  }

  function setScaleAtWorld(worldX, worldY, scale) {
    const view = adapter.graph.getView();
    const rect = container.getBoundingClientRect();
    const clientX = rect.left + (worldX + view.translate.x) * view.scale;
    const clientY = rect.top + (worldY + view.translate.y) * view.scale;
    zoomAt(clientX, clientY, scale / view.scale);
  }


  function focusAtWorld(worldX, worldY, scale) {
    const nextScale = clamp(scale, minimumScale(), MAX_SCALE);
    const translateX = container.clientWidth / (2 * nextScale) - worldX;
    const translateY = container.clientHeight / (2 * nextScale) - worldY;
    adapter.setCamera(nextScale, translateX, translateY);
  }

  function focusBounds(bounds, viewportPixels = null) {
    const width = viewportPixels?.width ?? container.clientWidth;
    const height = viewportPixels?.height ?? container.clientHeight;
    const horizontal = width / bounds.width;
    const vertical = height / bounds.height;
    const scale = clamp(Math.min(horizontal, vertical), minimumScale(), MAX_SCALE);
    const translateX = container.clientWidth / (2 * scale) - (bounds.x + bounds.width / 2);
    const translateY = container.clientHeight / (2 * scale) - (bounds.y + bounds.height / 2);
    adapter.setCamera(scale, translateX, translateY);
  }

  function focusRegion(regionId, scale) {
    const representation = lastScene?.representations.find((item) => item.regionId === regionId);
    const bounds = representation?.bounds ?? store.domain.regions.get(regionId)?.bounds;
    if (!bounds) return false;
    focusAtWorld(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, scale);
    return true;
  }

  function resetCamera(maxScale = INITIAL_SCALE) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const root = lastScene?.bounds ?? store.domain.regions.get(store.domain.meta.root).bounds;
    const scale = fitScale(maxScale);
    const translateX = (width / scale - root.width) / 2 - root.x;
    const translateY = (height / scale - root.height) / 2 - root.y;
    adapter.setCamera(scale, translateX, translateY);
  }


  function setTool(tool) {
    currentTool = tool;
    adapter.setTool(tool);
  }

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
      width,
      height,
    };
  }

  function nextCalendarDate(value) {
    const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  function nextTemporal(axis) {
    const intervals = [...store.domain.regions.values()]
      .map((region) => region.temporal?.[axis])
      .filter(Boolean);
    if (axis === 'ordinal') {
      const start = intervals.length ? Math.max(...intervals.map((item) => item.end)) + 1 : 0;
      return Object.freeze({ start, end: start });
    }
    const latest = intervals.length
      ? intervals.map((item) => item.end).sort().at(-1)
      : '1969-12-31';
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
      const selectedId = adapter.selectionSnapshot().regionIds[0] ?? null;
      const selected = selectedId ? store.domain.regions.get(selectedId) : null;
      const actors = [...store.domain.regions.values()].filter((region) => region.kind === 'actor');
      if (currentView.seq.groupBy === 'actor' && actors.length === 0) {
        const result = adapter.submitOperation({
          type: 'AddRegion',
          parentId: store.domain.meta.root,
          label: 'Untitled actor',
          kind: 'actor',
          summary: '',
          bounds: [0, 0, 146, 60],
        });
        if (!result?.createdRegionId) return null;
        adapter.selectRegion(result.createdRegionId);
        showToast('actorを追加しました');
        requestAnimationFrame(() => requestAnimationFrame(() => adapter.startEditingSelection()));
        return result.createdRegionId;
      }
      const actor = currentView.seq.groupBy === 'actor'
        ? (selected?.kind === 'actor' ? selected.id : actors[0]?.id ?? null)
        : (selected?.kind === 'actor' ? selected.id : null);
      const interval = nextTemporal(currentView.seq.axis);
      const result = adapter.submitOperation({
        type: 'AddRegion',
        parentId: selected && selected.kind === 'task' ? selected.id : store.domain.meta.root,
        label: 'Untitled task',
        kind: 'task',
        summary: '',
        bounds: [0, 0, 170, 68],
        temporal: { actor, [currentView.seq.axis]: interval },
      });
      if (!result?.createdRegionId) return null;
      adapter.selectRegion(result.createdRegionId);
      showToast('seq itemを追加しました');
      requestAnimationFrame(() => requestAnimationFrame(() => adapter.startEditingSelection()));
      return result.createdRegionId;
    }

    const selectedId = adapter.selectionSnapshot().regionIds[0] ?? null;
    const selectedRepresentation = lastScene?.representations.find(
      (representation) => representation.regionId === selectedId,
    );
    let parentId = store.domain.meta.root;
    if (currentView.pattern !== 'graph/1' && selectedId && selectedRepresentation?.detailsVisible) {
      parentId = selectedId;
    } else if (currentView.pattern !== 'graph/1' && selectedId) {
      parentId = store.domain.regions.get(selectedId)?.parent ?? store.domain.meta.root;
    }
    const parent = store.domain.regions.get(parentId);
    const result = adapter.submitOperation({
      type: 'AddRegion',
      parentId,
      label: 'Untitled',
      kind: 'concept',
      summary: '',
      bounds: Object.values(newNodeBounds(parent.bounds)),
    });
    if (!result?.createdRegionId) return null;
    adapter.selectRegion(result.createdRegionId);
    showToast('ノードを追加しました');
    requestAnimationFrame(() => requestAnimationFrame(() => adapter.startEditingSelection()));
    return result.createdRegionId;
  }

  function undo() {
    if (store.undo()) showToast('元に戻しました');
  }

  function redo() {
    if (store.redo()) showToast('やり直しました');
  }

  function deleteSelection() {
    const result = adapter.deleteSelection();
    if (result) showToast('選択を削除しました');
  }

  function openRegionLink(regionId, navigate = (url) => location.assign(url), base = location.href) {
    const representation = lastScene?.representations.find((item) => item.regionId === regionId);
    const href = representation?.href ?? store.domain.regions.get(regionId)?.href ?? null;
    if (!href) return null;
    const url = new URL(href, base).href;
    navigate(url);
    return url;
  }

  function openSelectedLink() {
    const selection = adapter.selectionSnapshot();
    if (selection.regionIds.length !== 1) return null;
    return openRegionLink(selection.regionIds[0]);
  }

  const touchNavigation = installTouchNavigation({
    container,
    adapter,
    minimumScale,
  });

  container.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = WHEEL_ZOOM_FACTOR ** (-wheelDeltaPixels(event) / WHEEL_PIXEL_STEP);
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });

  addNodeButton.addEventListener('click', addNode);
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  deleteButton.addEventListener('click', deleteSelection);
  openLinkButton?.addEventListener('click', openSelectedLink);

  function isTextInput(event) {
    const target = event.target;
    return target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target?.isContentEditable;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === ' ' && !isTextInput(event)) {
      if (!event.repeat && spacePreviousTool === null) {
        spacePreviousTool = currentTool;
        setTool('hand');
      }
      event.preventDefault();
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.altKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && !event.altKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (isTextInput(event)) return;

    switch (event.key.toLowerCase()) {
      case 'v':
        setTool('select');
        break;
      case 'h':
        setTool('hand');
        break;
      case 'n':
        event.preventDefault();
        addNode();
        break;
      case 'o':
        event.preventDefault();
        openSelectedLink();
        break;
      case 'delete':
      case 'backspace':
        event.preventDefault();
        deleteSelection();
        break;
      case 'enter':
      case 'f2':
        event.preventDefault();
        adapter.startEditingSelection();
        break;
      case 'escape':
        adapter.cancelInteraction();
        setTool('select');
        break;
      default:
        break;
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === ' ' && spacePreviousTool !== null) {
      const restore = spacePreviousTool;
      spacePreviousTool = null;
      setTool(restore);
      event.preventDefault();
    }
  });

  adapter.onCameraChange(queueRender);
  new ResizeObserver(() => {
    if (!lastScene) resetCamera();
    else queueRender();
  }).observe(container);

  setTool('select');
  resetCamera();
  render();

  const api = Object.freeze({
    ready: true,
    readOnly,
    get domain() { return store.domain; },
    store,
    projector,
    adapter,
    thresholds: projectorThresholds,
    snapshot: () => ({
      camera: adapter.camera(),
      touch: touchNavigation.snapshot(),
      viewport: adapter.viewport(),
      tool: currentTool,
      selection: adapter.selectionSnapshot(),
      draft: store.draftSnapshot(),
      domain: {
        meta: {
          schema: store.domain.meta.schema,
          root: store.domain.meta.root,
          title: store.domain.meta.title,
          geoSpec: store.domain.meta.geoSpec ? structuredClone(store.domain.meta.geoSpec) : null,
        },
        regions: [...store.domain.regions.values()].map((region) => ({
          id: region.id,
          parent: region.parent,
          label: region.label,
          kind: region.kind,
          order: region.order ?? null,
          temporal: region.temporal ? structuredClone(region.temporal) : null,
          value: region.value ?? null,
          href: region.href ?? null,
          set: region.set ? { ...region.set } : null,
          bounds: { ...region.bounds },
        })),
        relations: store.domain.relations.map((relation) => ({ ...relation })),
      },
      modules: lastScene ? { ...lastScene.modules, error: moduleError?.message ?? null } : null,
      resourceComposition: currentView.resourceComposition ? structuredClone(currentView.resourceComposition) : null,
      meaningRecovery: lastMeaningRecovery ? structuredClone(lastMeaningRecovery) : null,
      presentationProjection: lastPresentationProjection ? {
        schema: lastPresentationProjection.schema,
        id: lastPresentationProjection.id,
        pattern: lastPresentationProjection.pattern,
        layout: lastPresentationProjection.layout.map((item) => ({ regionId: item.regionId, bounds: { ...item.bounds } })),
        interactions: lastPresentationProjection.interactions.map((item) => ({
          regionId: item.regionId, role: item.role, bounds: { ...item.bounds }, editKinds: [...item.editKinds],
        })),
      } : null,
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
          sets: lastScene.setOverlay.sets.map((item) => ({
            regionId: item.regionId,
            complete: item.complete,
            bounds: { ...item.bounds },
          })),
          pairs: lastScene.setOverlay.pairs.map((item) => ({
            left: item.left,
            right: item.right,
            topology: item.topology,
            overlapKnown: item.overlapKnown,
          })),
        },
        detailIds: [...lastScene.detailIds],
      } : null,
    }),
    operation: (operation) => adapter.submitOperation(operation),
    addNode,
    undo,
    redo,
    deleteSelection,
    openRegionLink,
    openSelectedLink,
    exportJSONL: () => store.toJSONL(),
    setTool,
    zoomAtWorld: setScaleAtWorld,
    focusRegion,
    focusBounds,
    fitOverview: () => resetCamera(1),
    reset: resetCamera,
    refreshModules,
    setView,
    get view() { return currentView; },
    notify: showToast,
    showError: (message) => showToast(message, true),
  });
  globalThis.semanticMapApp = api;
  return api;
}
