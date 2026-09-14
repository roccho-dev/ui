import CellEditorHandler from '../vendor/maxgraph/view/plugin/CellEditorHandler.js';
import ConnectionHandler from '../vendor/maxgraph/view/plugin/ConnectionHandler.js';
import PanningHandler from '../vendor/maxgraph/view/plugin/PanningHandler.js';
import RubberBandHandler from '../vendor/maxgraph/view/plugin/RubberBandHandler.js';
import SelectionCellsHandler from '../vendor/maxgraph/view/plugin/SelectionCellsHandler.js';
import SelectionHandler from '../vendor/maxgraph/view/plugin/SelectionHandler.js';
import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';
import ImageBox from '../vendor/maxgraph/view/image/ImageBox.js';
import { EdgeHandlerConfig, HandleConfig, VertexHandlerConfig } from '../vendor/maxgraph/view/handler/config.js';
import { DEFAULT_THEME, connectIcon } from './theme.js';
import { cameraMethods } from './camera-methods.js';
import { createSemanticGraph } from './create-semantic-graph.js';
import { renderMethods } from './render-methods.js';


const DAY_MS = 86_400_000;

function temporalScalar(value, axis) {
  return axis === 'ordinal' ? value : Date.parse(`${value}T00:00:00.000Z`) / DAY_MS;
}

function temporalValue(value, axis) {
  return axis === 'ordinal'
    ? Math.max(0, Math.round(value))
    : new Date(Math.round(value) * DAY_MS).toISOString().slice(0, 10);
}

function nearestLaneActor(edit, centerY) {
  if (edit.groupBy !== 'actor') return edit.actor;
  let nearest = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const lane of edit.laneBands) {
    const candidate = Math.abs(centerY - (lane.y + lane.height / 2));
    if (candidate < distance) {
      nearest = lane.actor;
      distance = candidate;
    }
  }
  return nearest;
}

function defaultRelationKind(pattern) {
  if (pattern === 'seq/1') return 'message';
  return 'relates';
}

function uniqueCells(cells) {
  return [...new Set(cells.filter(Boolean))];
}

function initializeMaxGraphAdapter(container, options = {}) {
  InternalEvent.disableContextMenu(container);
  this.container = container;
  this.theme = options.theme ?? DEFAULT_THEME;
  this.surfaceBackgroundMount = document.createElement('div');
  this.surfaceBackgroundMount.className = 'resource-surface resource-surface-background';
  this.surfaceBackgroundMount.setAttribute('data-resource-host', 'surface-background');
  Object.assign(this.surfaceBackgroundMount.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '0',
  });
  container.prepend(this.surfaceBackgroundMount);
  this.graph = createSemanticGraph({
    container,
    plugins: [
      CellEditorHandler,
      ConnectionHandler,
      PanningHandler,
      RubberBandHandler,
      SelectionCellsHandler,
      SelectionHandler,
    ],
  });
  this.overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  this.overlaySvg.classList.add('semantic-projection-overlay');
  this.overlaySvg.setAttribute('aria-hidden', 'true');
  this.overlaySvg.setAttribute('data-semantic-overlay', 'terrain-sets');
  Object.assign(this.overlaySvg.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '1',
  });
  this.overlayRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  this.overlayRoot.setAttribute('data-layer', 'projection');
  this.overlaySvg.append(this.overlayRoot);
  container.append(this.overlaySvg);
  this.surfaceContentMount = document.createElement('div');
  this.surfaceContentMount.className = 'resource-surface resource-surface-content';
  this.surfaceContentMount.setAttribute('data-resource-host', 'surface-content');
  Object.assign(this.surfaceContentMount.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    zIndex: '2',
  });
  container.append(this.surfaceContentMount);
  this.surfaceCompositionKey = null;
  this.graph.setPanning(true);
  this.graph.centerZoom = false;
  this.graph.setCellsSelectable(true);
  this.graph.setCellsMovable(true);
  this.graph.setCellsResizable(true);
  this.graph.setCellsEditable(true);
  this.graph.setEnterStopsCellEditing(true);
  this.graph.setCellsCloneable(false);
  this.graph.setAllowDanglingEdges(false);
  this.graph.setAllowLoops(false);
  this.graph.setMultigraph(false);
  this.graph.setCellsDisconnectable(false);
  this.graph.setDropEnabled(false);
  this.graph.setSplitEnabled(false);
  this.graph.setGridEnabled(false);

  const panning = this.graph.getPlugin('PanningHandler');
  panning.useLeftButtonForPanning = false;
  panning.ignoreCell = false;

  VertexHandlerConfig.selectionColor = this.theme.selection.stroke;
  VertexHandlerConfig.selectionDashed = this.theme.selection.dashed;
  VertexHandlerConfig.selectionStrokeWidth = this.theme.selection.strokeWidth;
  EdgeHandlerConfig.selectionColor = this.theme.selection.stroke;
  HandleConfig.fillColor = this.theme.handle.fill;
  HandleConfig.strokeColor = this.theme.handle.stroke;
  const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0;
  HandleConfig.size = coarsePointer ? this.theme.handle.coarseSize : this.theme.handle.fineSize;

  const connection = this.graph.getPlugin('ConnectionHandler');
  connection.setEnabled(true);
  connection.connectImage = new ImageBox(connectIcon(this.theme), this.theme.connect.size, this.theme.connect.size);
  connection.getIconPosition = (icon, state) => ({
    x: state.x + state.width - icon.bounds.width / 2,
    y: state.y + state.height / 2 - icon.bounds.height / 2,
  });
  connection.select = true;
  connection.createTarget = false;

  this.cellsByRegionId = new Map();
  this.edgesByProjectionKey = new Map();
  this.edgeByRelationId = new Map();
  this.lastScene = null;
  this.projecting = false;
  this.tool = 'select';
  this.operationHandler = null;
  this.errorHandler = null;
  this.activationHandler = null;
  this.activationPending = false;
  this.selectionListeners = new Set();
  this.selectionRegionIds = new Set();
  this.selectionRelationIds = new Set();
  this.pendingRelationSelection = null;
  this.focusMarkerRegionId = null;
  this.reviewOverlay = null;
  this.cameraPreview = null;

  this.graph.getView().addListener(InternalEvent.SCALE, () => this.renderOverlays());
  this.graph.getView().addListener(InternalEvent.TRANSLATE, () => this.renderOverlays());
  this.graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, () => this.renderOverlays());

  this.installEditEvents();
  this.setTool('select');
}

function installEditEvents() {
  this.graph.addListener(InternalEvent.CLICK, (_sender, event) => {
    if (this.projecting || this.activationPending) return;
    const cell = event.getProperty('cell');
    const activation = cell?.semantic?.activation ?? null;
    if (!activation || !this.activationHandler) return;
    event.consume();
    this.activationPending = true;
    Promise.resolve(this.activationHandler(activation, cell.semantic))
      .catch((error) => this.errorHandler?.(error))
      .finally(() => { this.activationPending = false; });
  });

  this.graph.addListener(InternalEvent.CELLS_MOVED, (_sender, event) => {
    if (this.projecting) return;
    const cells = (event.getProperty('cells') ?? []).filter(
      (cell) => cell.isVertex()
        && cell.semantic?.type === 'region'
        && cell.semantic.mode !== 'boundary'
        && !cell.semantic.readOnly
        && (cell.semantic.geometryEditable || cell.semantic.temporalEdit),
    );
    if (!cells.length) return;
    const temporal = cells.filter((cell) => cell.semantic.temporalEdit);
    if (temporal.length) {
      if (temporal.length !== cells.length) {
        this.errorHandler?.(new Error('seq/1 temporal items cannot move with geometric regions'));
        this.render(this.lastScene);
        return;
      }
      const axis = temporal[0].semantic.temporalEdit.axis;
      if (temporal.some((cell) => cell.semantic.temporalEdit.axis !== axis)) {
        this.errorHandler?.(new Error('seq/1 temporal items must share one active axis'));
        this.render(this.lastScene);
        return;
      }
      const dx = event.getProperty('dx');
      const dy = event.getProperty('dy');
      const items = temporal.map((cell) => {
        const edit = cell.semantic.temporalEdit;
        const delta = Math.round(dx / edit.unitWidth);
        const start = temporalScalar(edit.start, axis) + delta;
        const end = temporalScalar(edit.end, axis) + delta;
        const centerY = cell.semantic.bounds.y + cell.semantic.bounds.height / 2 + dy;
        return {
          regionId: cell.semantic.regionId,
          actor: nearestLaneActor(edit, centerY),
          start: temporalValue(start, axis),
          end: temporalValue(end, axis),
        };
      });
      this.submitOperation({ type: 'PlaceTemporalRegions', axis, items });
      return;
    }
    this.submitOperation({
      type: 'MoveRegions',
      regionIds: cells.map((cell) => cell.semantic.regionId),
      dx: event.getProperty('dx'),
      dy: event.getProperty('dy'),
    });
  });

  this.graph.addListener(InternalEvent.CELLS_RESIZED, (_sender, event) => {
    if (this.projecting) return;
    const cells = event.getProperty('cells') ?? [];
    const resizedBounds = event.getProperty('bounds') ?? [];
    const temporalItems = [];
    const geometricItems = [];
    let temporalAxis = null;
    cells.forEach((cell, index) => {
      if (!cell.isVertex() || cell.semantic?.type !== 'region' || cell.semantic.mode === 'boundary' || cell.semantic.readOnly) return;
      const next = resizedBounds[index];
      const edit = cell.semantic.temporalEdit;
      if (edit) {
        temporalAxis ??= edit.axis;
        if (temporalAxis !== edit.axis) throw new Error('seq/1 temporal resize axes differ');
        const startScalar = edit.origin + Math.round((next.x - edit.axisStartX - 6) / edit.unitWidth);
        const endScalar = edit.origin + Math.round((next.x + next.width - edit.axisStartX + 6) / edit.unitWidth) - 1;
        const start = Math.max(edit.axis === 'ordinal' ? 0 : Number.NEGATIVE_INFINITY, startScalar);
        const endValue = Math.max(start, endScalar);
        temporalItems.push({
          regionId: cell.semantic.regionId,
          actor: edit.actor,
          start: temporalValue(start, edit.axis),
          end: temporalValue(endValue, edit.axis),
        });
      } else if (cell.semantic.geometryEditable) {
        geometricItems.push({
          regionId: cell.semantic.regionId,
          bounds: [next.x, next.y, next.width, next.height],
        });
      }
    });
    if (temporalItems.length && geometricItems.length) {
      this.errorHandler?.(new Error('seq/1 temporal items cannot resize with geometric regions'));
      this.render(this.lastScene);
      return;
    }
    if (temporalItems.length) this.submitOperation({ type: 'PlaceTemporalRegions', axis: temporalAxis, items: temporalItems });
    else if (geometricItems.length) this.submitOperation({ type: 'ResizeRegions', items: geometricItems });
  });

  this.graph.addListener(InternalEvent.LABEL_CHANGED, (_sender, event) => {
    if (this.projecting) return;
    const cell = event.getProperty('cell');
    if (cell?.semantic?.type !== 'region' || !cell.semantic.labelEditable || cell.semantic.readOnly) return;
    this.submitOperation({
      type: 'RenameRegion',
      regionId: cell.semantic.regionId,
      label: event.getProperty('value'),
    });
  });

  const connection = this.graph.getPlugin('ConnectionHandler');
  connection.addListener(InternalEvent.CONNECT, (_sender, event) => {
    if (this.projecting) return;
    const edge = event.getProperty('cell');
    const source = edge?.getTerminal(true);
    const target = edge?.getTerminal(false);
    const from = source?.semantic?.regionId;
    const to = target?.semantic?.regionId;
    if (!from || !to || source?.semantic?.readOnly || target?.semantic?.readOnly) return;
    const result = this.submitOperation({
      type: 'ConnectRegions',
      from,
      to,
      kind: defaultRelationKind(this.lastScene?.pattern),
      label: '',
    });
    if (result?.createdRelationId) {
      this.pendingRelationSelection = result.createdRelationId;
      this.selectionRegionIds.clear();
      this.selectionRelationIds = new Set([result.createdRelationId]);
    }
  });

  this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
    if (this.projecting) return;
    const selected = this.graph.getSelectionCells();
    const regions = new Set();
    const relations = new Set();
    for (const cell of selected) {
      if (cell.semantic?.type === 'region' && !cell.semantic.readOnly) regions.add(cell.semantic.regionId);
      if (cell.semantic?.type === 'relation' && !cell.semantic.readOnly && cell.semantic.relationIds.length === 1) {
        relations.add(cell.semantic.relationIds[0]);
      }
    }
    if (selected.some((cell) => cell.isEdge() && !cell.semantic) && this.pendingRelationSelection) {
      relations.add(this.pendingRelationSelection);
    }
    this.selectionRegionIds = regions;
    this.selectionRelationIds = relations;
    this.emitSelection();
  });
}

function setOperationHandler(handler) {
  this.operationHandler = handler;
}

function setErrorHandler(handler) {
  this.errorHandler = handler;
}

function setActivationHandler(handler) {
  this.activationHandler = handler;
}

function submitOperation(operation) {
  if (!this.operationHandler) return null;
  try {
    return this.operationHandler(Object.freeze({ ...operation }));
  } catch (error) {
    this.errorHandler?.(error);
    return null;
  }
}

function onSelectionChange(listener) {
  this.selectionListeners.add(listener);
  return () => this.selectionListeners.delete(listener);
}

function emitSelection() {
  this.refreshRenderedLabels();
  const snapshot = this.selectionSnapshot();
  for (const listener of this.selectionListeners) listener(snapshot);
}

function selectionSnapshot() {
  return Object.freeze({
    regionIds: Object.freeze([...this.selectionRegionIds]),
    relationIds: Object.freeze([...this.selectionRelationIds]),
  });
}

function setSelection({ regionIds = [], relationIds = [] }) {
  const readOnlyRegions = new Set(
    this.lastScene?.representations.filter((item) => item.readOnly).map((item) => item.regionId) ?? [],
  );
  const readOnlyRelations = new Set(
    this.lastScene?.relations.filter((item) => item.readOnly).flatMap((item) => item.relationIds) ?? [],
  );
  this.selectionRegionIds = new Set(regionIds.filter((id) => !readOnlyRegions.has(id)));
  this.selectionRelationIds = new Set(relationIds.filter((id) => !readOnlyRelations.has(id)));
  this.restoreSelection(this.lastScene);
  this.emitSelection();
}

function selectRegion(regionId) {
  this.setSelection({ regionIds: [regionId] });
}

function setFocusMarker(regionId = null) {
  if (regionId !== null && typeof regionId !== 'string') throw new Error('focus marker regionId must be a string or null');
  this.focusMarkerRegionId = regionId;
  this.renderOverlays();
}

function focusMarkerSnapshot() {
  return this.focusMarkerRegionId;
}

function clearSelection() {
  this.selectionRegionIds.clear();
  this.selectionRelationIds.clear();
  this.projecting = true;
  try {
    this.graph.clearSelection();
  } finally {
    this.projecting = false;
  }
  this.emitSelection();
}

function restoreSelection(scene) {
  if (!scene) return;
  const cells = [];
  for (const regionId of this.selectionRegionIds) {
    const visibleId = scene.selectionProxies[regionId];
    if (visibleId) cells.push(this.cellsByRegionId.get(visibleId));
  }
  for (const relationId of this.selectionRelationIds) {
    cells.push(this.edgeByRelationId.get(relationId));
  }
  this.projecting = true;
  try {
    this.graph.setSelectionCells(uniqueCells(cells));
  } finally {
    this.projecting = false;
  }
  this.pendingRelationSelection = null;
}

function setTool(tool) {
  if (!['select', 'hand'].includes(tool)) throw new Error(`unknown tool: ${tool}`);
  this.tool = tool;
  const selecting = tool === 'select';
  this.graph.setCellsMovable(selecting);
  this.graph.setCellsResizable(selecting);
  this.graph.setCellsEditable(selecting);
  this.graph.setCellsSelectable(selecting);

  this.graph.getPlugin('SelectionHandler')?.setEnabled(selecting);
  this.graph.getPlugin('SelectionCellsHandler')?.setEnabled(selecting);
  this.graph.getPlugin('RubberBandHandler')?.setEnabled(selecting);
  this.graph.getPlugin('ConnectionHandler')?.setEnabled(selecting);

  const panning = this.graph.getPlugin('PanningHandler');
  panning.useLeftButtonForPanning = !selecting;
  panning.ignoreCell = !selecting;
  this.container.dataset.tool = tool;
}

function cancelInteraction() {
  this.graph.stopEditing(true);
  this.graph.getPlugin('ConnectionHandler')?.reset();
  this.graph.getPlugin('SelectionHandler')?.reset();
  this.graph.getPlugin('SelectionCellsHandler')?.reset();
  this.graph.getPlugin('RubberBandHandler')?.reset();
  this.graph.getPlugin('PanningHandler')?.reset();
}

function isEditableTouchTarget(clientX, clientY, target = null) {
  if (this.tool !== 'select') return false;
  if (target?.tagName?.toLowerCase() === 'image') return true;
  const rect = this.container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const cell = this.graph.getCellAt(x, y, null, true, false);
  if (cell?.semantic?.activation) return true;
  if (cell?.semantic?.type === 'region' && !cell.semantic.readOnly && (cell.semantic.mode !== 'boundary' || cell.semantic.labelEditable)) return true;
  for (const selected of this.graph.getSelectionCells()) {
    const state = this.graph.getView().getState(selected);
    if (!state || !selected.isVertex()) continue;
    const margin = 28;
    if (
      x >= state.x - margin && x <= state.x + state.width + margin
      && y >= state.y - margin && y <= state.y + state.height + margin
    ) return true;
  }
  return false;
}

function deleteSelection() {
  const selection = this.selectionSnapshot();
  if (!selection.regionIds.length && !selection.relationIds.length) return null;
  return this.submitOperation({
    type: 'RemoveSelection',
    regionIds: selection.regionIds,
    relationIds: selection.relationIds,
  });
}

function startEditingSelection() {
  const selectedIds = [...this.selectionRegionIds];
  if (selectedIds.length !== 1) return false;
  const cell = this.cellsByRegionId.get(selectedIds[0]);
  if (cell?.semantic?.type !== 'region' || !cell.semantic.labelEditable || cell.semantic.readOnly) return false;
  this.graph.startEditingAtCell(cell);
  return true;
}

const maxGraphAdapterMethods = Object.freeze({
  installEditEvents,
  setOperationHandler,
  setErrorHandler,
  setActivationHandler,
  submitOperation,
  onSelectionChange,
  emitSelection,
  selectionSnapshot,
  setSelection,
  selectRegion,
  setFocusMarker,
  focusMarkerSnapshot,
  clearSelection,
  restoreSelection,
  ...renderMethods,
  setTool,
  cancelInteraction,
  isEditableTouchTarget,
  deleteSelection,
  startEditingSelection,
  ...cameraMethods,
});

export const createMaxGraphAdapter = (container, options = {}) => {
  const adapter = Object.assign(Object.create(null), maxGraphAdapterMethods);
  initializeMaxGraphAdapter.call(adapter, container, options);
  return adapter;
};

