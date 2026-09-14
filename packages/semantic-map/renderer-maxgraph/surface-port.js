import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';
import { operationToGesture } from '../editor-core/commands.js';
import { normalizeSelection } from '../editor-core/ports.js';
import { MaxGraphAdapter as RawMaxGraphAdapter } from './adapter.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`surface-port-maxgraph: ${message}`);
}

export class SurfacePortMaxGraphAdapter {
  #inner;
  #gestureHandler = null;
  #mirroringSelection = false;
  #destroyed = false;
  #removeSelectionListener = null;
  #reconnectListener = null;

  constructor(container, options = {}) {
    this.#inner = new RawMaxGraphAdapter(container, options);
    this.#inner.setOperationHandler((operation) => this.submitOperation(operation));
    this.#removeSelectionListener = this.#inner.onSelectionChange((selection) => {
      if (this.#destroyed || this.#mirroringSelection) return;
      this.#emit(Object.freeze({ type: 'selection.changed', selection }));
    });
    this.#installReconnectGesture();
  }

  onGesture(handler) {
    invariant(!this.#destroyed, 'SurfacePort is destroyed');
    invariant(typeof handler === 'function', 'gesture handler must be a function');
    invariant(this.#gestureHandler === null, 'gesture handler is already bound');
    this.#gestureHandler = handler;
    return () => {
      if (this.#gestureHandler === handler) this.#gestureHandler = null;
    };
  }

  #emit(gesture) {
    invariant(!this.#destroyed, 'SurfacePort is destroyed');
    invariant(this.#gestureHandler, 'gesture handler is not bound');
    return this.#gestureHandler(gesture);
  }

  #rollback(error = null) {
    if (this.#inner.lastScene) this.#inner.render(this.#inner.lastScene);
    if (error) this.#inner.errorHandler?.(error);
  }

  #installReconnectGesture() {
    const graph = this.#inner.graph;
    graph.setCellsDisconnectable(true);
    graph.isCellDisconnectable = (cell) => (
      cell?.semantic?.type === 'relation'
      && cell.semantic.readOnly !== true
      && cell.semantic.relationIds?.length === 1
    );
    this.#reconnectListener = (_sender, event) => {
      if (this.#destroyed || this.#inner.projecting) return;
      const edge = event.getProperty('edge') ?? event.getProperty('cell');
      const relationId = edge?.semantic?.relationIds?.length === 1
        ? edge.semantic.relationIds[0]
        : null;
      const from = edge?.getTerminal(true)?.semantic?.regionId;
      const to = edge?.getTerminal(false)?.semantic?.regionId;
      if (!relationId || !from || !to) {
        this.#rollback();
        return;
      }
      try {
        const result = this.#emit(Object.freeze({
          type: 'relation.reconnect',
          relationId,
          from,
          to,
        }));
        if (!result) this.#rollback();
      } catch (error) {
        this.#rollback(error);
      }
    };
    graph.addListener(InternalEvent.CELL_CONNECTED, this.#reconnectListener);
  }

  render(value) {
    if (this.#destroyed) return null;
    const scene = value?.scene ?? (
      value && typeof value === 'object' && Array.isArray(value.scenes)
        ? value
        : null
    );
    if (scene) this.#inner.render(scene);
    if (value?.selection) this.#mirrorSelection(value.selection);
    return this.snapshot();
  }

  snapshot() {
    if (this.#destroyed) return Object.freeze({ kind: 'maxgraph', destroyed: true });
    return Object.freeze({
      kind: 'maxgraph',
      destroyed: false,
      selection: this.#inner.selectionSnapshot(),
      camera: this.#inner.camera(),
    });
  }

  #mirrorSelection(selection) {
    this.#mirroringSelection = true;
    try {
      return this.#inner.setSelection(normalizeSelection(selection));
    } finally {
      this.#mirroringSelection = false;
    }
  }

  setSelection(selection) {
    return this.#emit(Object.freeze({
      type: 'selection.changed',
      selection: normalizeSelection(selection),
    }));
  }

  selectionSnapshot() {
    return this.#inner.selectionSnapshot();
  }

  selectRegion(regionId) {
    return this.setSelection({ regionIds: [regionId], relationIds: [] });
  }

  clearSelection() {
    return this.setSelection({ regionIds: [], relationIds: [] });
  }

  submitOperation(operation) {
    try {
      return this.#emit(operationToGesture(operation));
    } catch (error) {
      this.#rollback(error);
      return null;
    }
  }

  deleteSelection() {
    const selection = this.selectionSnapshot();
    if (!selection.regionIds.length && !selection.relationIds.length) return null;
    return this.submitOperation({
      type: 'RemoveSelection',
      regionIds: selection.regionIds,
      relationIds: selection.relationIds,
    });
  }

  get lastScene() {
    return this.#inner.lastScene;
  }

  get cellsByRegionId() {
    return new Map(this.#inner.cellsByRegionId);
  }

  get edgesByProjectionKey() {
    return new Map(this.#inner.edgesByProjectionKey);
  }

  get tool() {
    return this.#inner.tool;
  }

  camera() {
    return this.#inner.camera();
  }

  viewport() {
    return this.#inner.viewport();
  }

  setCamera(...args) {
    return this.#inner.setCamera(...args);
  }

  beginCameraPreview(...args) {
    return this.#inner.beginCameraPreview(...args);
  }

  previewCamera(...args) {
    return this.#inner.previewCamera(...args);
  }

  commitCameraPreview(...args) {
    return this.#inner.commitCameraPreview(...args);
  }

  cancelCameraPreview(...args) {
    return this.#inner.cancelCameraPreview(...args);
  }

  cameraPreviewSnapshot(...args) {
    return this.#inner.cameraPreviewSnapshot(...args);
  }

  onCameraChange(...args) {
    return this.#inner.onCameraChange(...args);
  }

  setNativePinchEnabled(...args) {
    return this.#inner.setNativePinchEnabled(...args);
  }

  isEditableTouchTarget(...args) {
    return this.#inner.isEditableTouchTarget(...args);
  }

  cancelInteraction(...args) {
    return this.#inner.cancelInteraction(...args);
  }

  setTool(...args) {
    return this.#inner.setTool(...args);
  }

  startEditingSelection(...args) {
    return this.#inner.startEditingSelection(...args);
  }

  setErrorHandler(...args) {
    return this.#inner.setErrorHandler(...args);
  }

  onSelectionChange(...args) {
    return this.#inner.onSelectionChange(...args);
  }

  setActivationHandler(...args) {
    return this.#inner.setActivationHandler(...args);
  }

  setFocusMarker(...args) {
    return this.#inner.setFocusMarker(...args);
  }

  focusMarkerSnapshot(...args) {
    return this.#inner.focusMarkerSnapshot(...args);
  }

  setReviewOverlay(...args) {
    return this.#inner.setReviewOverlay(...args);
  }

  clearReviewOverlay(...args) {
    return this.#inner.clearReviewOverlay(...args);
  }

  reviewOverlaySnapshot(...args) {
    return this.#inner.reviewOverlaySnapshot(...args);
  }

  destroy() {
    if (this.#destroyed) return false;
    this.#destroyed = true;
    this.#gestureHandler = null;
    this.#removeSelectionListener?.();
    this.#removeSelectionListener = null;
    if (this.#reconnectListener) this.#inner.graph.removeListener(this.#reconnectListener);
    this.#reconnectListener = null;
    this.#inner.setOperationHandler(null);
    this.#inner.graph.destroy?.();
    return true;
  }
}
