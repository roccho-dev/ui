import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';
import { assertSurfaceGesture } from '../editor-core/commands.js';
import { normalizeSelection } from '../editor-core/ports.js';
import { MaxGraphAdapter as RawMaxGraphAdapter } from './adapter.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`surface-port-maxgraph: ${message}`);
}

// Reuse the existing renderer/camera implementation, but do not install its
// retired document-edit listeners. This private subclass owns no domain state.
class SurfaceMechanics extends RawMaxGraphAdapter {
  installEditEvents() {}

  setTool(tool) {
    super.setTool(tool);
    this.graph.setCellsMovable(false);
    this.graph.setCellsResizable(false);
    this.graph.setCellsEditable(false);
  }
}

export class SurfacePortMaxGraphAdapter {
  #inner;
  #gestureHandler = null;
  #mirroringSelection = false;
  #destroyed = false;
  #selection = normalizeSelection({});
  #removeListeners = [];

  constructor(container, options = {}) {
    this.#inner = new SurfaceMechanics(container, options);
    this.#installGestures();
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

  #listen(source, type, handler) {
    source.addListener(type, handler);
    const remove = () => source.removeListener(handler);
    this.#removeListeners.push(remove);
    return remove;
  }

  #emit(gesture) {
    invariant(!this.#destroyed, 'SurfacePort is destroyed');
    assertSurfaceGesture(gesture);
    invariant(this.#gestureHandler, 'gesture handler is not bound');
    return this.#gestureHandler(Object.freeze(structuredClone(gesture)));
  }

  #rollback(error = null) {
    if (this.#destroyed) return;
    if (this.#inner.lastScene) this.#inner.render(this.#inner.lastScene);
    this.#mirrorSelection(this.#selection);
    if (error) this.#inner.errorHandler?.(error);
  }

  #installGestures() {
    const graph = this.#inner.graph;
    graph.setCellsDisconnectable(true);
    graph.isCellDisconnectable = cell => (
      cell?.semantic?.type === 'relation'
      && cell.semantic.readOnly !== true
      && cell.semantic.relationIds?.length === 1
    );
    const ignored = () => this.#destroyed || this.#inner.projecting || this.#mirroringSelection;

    this.#listen(graph.getSelectionModel(), InternalEvent.CHANGE, () => {
      if (ignored()) return;
      const selection = { regionIds: [], relationIds: [] };
      for (const cell of graph.getSelectionCells()) {
        if (cell.semantic?.readOnly) continue;
        if (cell.semantic?.type === 'region') selection.regionIds.push(cell.semantic.regionId);
        if (cell.semantic?.type === 'relation' && cell.semantic.relationIds?.length === 1) {
          selection.relationIds.push(cell.semantic.relationIds[0]);
        }
      }
      selection.regionIds = [...new Set(selection.regionIds)];
      selection.relationIds = [...new Set(selection.relationIds)];
      try {
        const accepted = this.#emit({ type: 'selection.changed', selection });
        invariant(accepted && typeof accepted === 'object', 'selection was not accepted');
        this.#mirrorSelection(accepted);
      } catch (error) { this.#rollback(error); }
    });

    const connection = graph.getPlugin('ConnectionHandler');
    // A provisional edge must not overwrite the core's accepted selection.
    connection.select = false;
    this.#listen(connection, InternalEvent.CONNECT, (_sender, event) => {
      if (ignored()) return;
      const edge = event.getProperty('cell');
      const source = edge?.getTerminal(true);
      const target = edge?.getTerminal(false);
      const from = source?.semantic?.regionId;
      const to = target?.semantic?.regionId;
      try {
        invariant(from && to && !source.semantic.readOnly && !target.semantic.readOnly, 'invalid connection endpoints');
        const result = this.#emit({ type: 'relation.connect', from, to, pattern: this.#inner.lastScene?.pattern });
        if (!result) this.#rollback();
      } catch (error) { this.#rollback(error); }
      finally {
        // maxGraph creates a temporary edge before CONNECT. It is never an
        // accepted semantic cell; only the next core scene may create that.
        if (edge && !edge.semantic && graph.getDataModel().contains(edge)) {
          this.#mirroringSelection = true;
          try { graph.batchUpdate(() => graph.cellsRemoved([edge])); }
          finally { this.#mirroringSelection = false; }
        }
        this.#mirrorSelection(this.#selection);
      }
    });

    this.#listen(graph, InternalEvent.CELL_CONNECTED, (_sender, event) => {
      if (ignored()) return;
      const edge = event.getProperty('edge') ?? event.getProperty('cell');
      const relationId = edge?.semantic?.relationIds?.length === 1 ? edge.semantic.relationIds[0] : null;
      const from = edge?.getTerminal(true)?.semantic?.regionId;
      const to = edge?.getTerminal(false)?.semantic?.regionId;
      // ConnectionHandler also emits this event for its not-yet-semantic edge.
      if (!edge?.semantic) return;
      if (!relationId || !from || !to) { this.#rollback(); return; }
      try {
        const result = this.#emit({ type: 'relation.reconnect', relationId, from, to });
        if (!result) this.#rollback();
      } catch (error) { this.#rollback(error); }
    });

    const cameraChanged = () => {
      if (ignored() || !this.#gestureHandler) return;
      try {
        this.#emit({ type: 'camera.changed', presentation: {
          camera: this.#inner.camera(), viewport: this.#inner.viewport(),
        } });
      } catch (error) { this.#inner.errorHandler?.(error); }
    };
    for (const type of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) {
      this.#listen(graph.getView(), type, cameraChanged);
    }

    this.#listen(graph, InternalEvent.CLICK, (_sender, event) => {
      if (ignored() || this.#inner.activationPending) return;
      const cell = event.getProperty('cell');
      const activation = cell?.semantic?.activation;
      if (!activation) return;
      event.consume();
      try { this.#emit({ type: 'activation.requested', activation }); }
      catch (error) { this.#inner.errorHandler?.(error); return; }
      if (!this.#inner.activationHandler) return;
      this.#inner.activationPending = true;
      Promise.resolve().then(() => {
        if (!this.#destroyed) return this.#inner.activationHandler(structuredClone(activation), structuredClone(cell.semantic));
      }).catch(error => { if (!this.#destroyed) this.#inner.errorHandler?.(error); })
        .finally(() => { this.#inner.activationPending = false; });
    });
  }

  render(value) {
    if (this.#destroyed) return null;
    const scene = value?.scene ?? (
      value && typeof value === 'object' && Array.isArray(value.scenes) ? value : null
    );
    if (scene) this.#inner.render(scene);
    this.#mirrorSelection(value?.selection ?? this.#selection);
    return this.snapshot();
  }

  snapshot() {
    if (this.#destroyed) return Object.freeze({ kind: 'maxgraph', destroyed: true });
    return Object.freeze({ kind: 'maxgraph', destroyed: false,
      selection: structuredClone(this.#selection), camera: this.#inner.camera() });
  }

  #mirrorSelection(selection) {
    this.#selection = normalizeSelection(selection);
    this.#mirroringSelection = true;
    try { return this.#inner.setSelection(this.#selection); }
    finally { this.#mirroringSelection = false; }
  }

  setSelection(selection) {
    const accepted = this.#emit({ type: 'selection.changed', selection: normalizeSelection(selection) });
    invariant(accepted && typeof accepted === 'object', 'selection was not accepted');
    this.#mirrorSelection(accepted);
    return structuredClone(this.#selection);
  }

  selectionSnapshot() { return structuredClone(this.#selection); }
  selectRegion(regionId) { return this.setSelection({ regionIds: [regionId], relationIds: [] }); }
  clearSelection() { return this.setSelection({ regionIds: [], relationIds: [] }); }

  // These legacy presentation consumers are migrated separately in this same
  // P2; this is not yet the final three-method public SurfacePort closure.
  get lastScene() { return this.#inner.lastScene; }
  get cellsByRegionId() { return new Map(this.#inner.cellsByRegionId); }
  get edgesByProjectionKey() { return new Map(this.#inner.edgesByProjectionKey); }
  get tool() { return this.#inner.tool; }
  camera() { return this.#inner.camera(); }
  viewport() { return this.#inner.viewport(); }
  setCamera(...args) { return this.#inner.setCamera(...args); }
  beginCameraPreview(...args) { return this.#inner.beginCameraPreview(...args); }
  previewCamera(...args) { return this.#inner.previewCamera(...args); }
  commitCameraPreview(...args) { return this.#inner.commitCameraPreview(...args); }
  cancelCameraPreview(...args) { return this.#inner.cancelCameraPreview(...args); }
  cameraPreviewSnapshot(...args) { return this.#inner.cameraPreviewSnapshot(...args); }
  onCameraChange(listener) {
    const removers = [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]
      .map(type => this.#listen(this.#inner.graph.getView(), type, listener));
    return () => { for (const remove of removers) remove(); };
  }
  setNativePinchEnabled(...args) { return this.#inner.setNativePinchEnabled(...args); }
  isEditableTouchTarget(...args) { return this.#inner.isEditableTouchTarget(...args); }
  cancelInteraction(...args) { return this.#inner.cancelInteraction(...args); }
  setTool(...args) { return this.#inner.setTool(...args); }
  setErrorHandler(...args) { return this.#inner.setErrorHandler(...args); }
  onSelectionChange(...args) { return this.#inner.onSelectionChange(...args); }
  setActivationHandler(...args) { return this.#inner.setActivationHandler(...args); }
  setFocusMarker(...args) { return this.#inner.setFocusMarker(...args); }
  focusMarkerSnapshot(...args) { return this.#inner.focusMarkerSnapshot(...args); }
  setReviewOverlay(...args) { return this.#inner.setReviewOverlay(...args); }
  clearReviewOverlay(...args) { return this.#inner.clearReviewOverlay(...args); }
  reviewOverlaySnapshot(...args) { return this.#inner.reviewOverlaySnapshot(...args); }

  destroy() {
    if (this.#destroyed) return false;
    this.#destroyed = true;
    this.#gestureHandler = null;
    for (const remove of this.#removeListeners.splice(0)) remove();
    this.#inner.cancelCameraPreview();
    this.#inner.selectionListeners.clear();
    this.#inner.graph.destroy?.();
    return true;
  }
}
