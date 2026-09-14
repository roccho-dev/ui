import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';
import { operationToGesture } from '../editor-core/commands.js';
import { claimPendingEditorCore, normalizeSelection } from '../editor-core/ports.js';
import { MaxGraphAdapter as RawMaxGraphAdapter } from './adapter.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`surface-port-maxgraph: ${message}`);
}

function forwarded(target, property) {
  const value = target.inner[property];
  return typeof value === 'function' ? value.bind(target.inner) : value;
}

export class SurfacePortMaxGraphAdapter {
  constructor(container, options = {}) {
    this.inner = new RawMaxGraphAdapter(container, options);
    this.core = options.core ?? claimPendingEditorCore();
    this.mirroringSelection = false;
    this.inner.setOperationHandler((operation) => this.core.acceptGesture(operationToGesture(operation)));
    this.inner.onSelectionChange((selection) => {
      if (this.mirroringSelection) return;
      this.core.acceptGesture({ type: 'selection-changed', selection });
    });
    this.core.bindSurface({
      mirrorSelection: (selection) => this.mirrorSelection(selection),
      snapshot: () => Object.freeze({
        kind: 'maxgraph',
        selection: this.inner.selectionSnapshot(),
        camera: this.inner.camera(),
      }),
    });
    this.installReconnectGesture();
    return new Proxy(this, {
      get: (target, property, receiver) => (
        Reflect.has(target, property)
          ? Reflect.get(target, property, receiver)
          : forwarded(target, property)
      ),
      set: (target, property, value, receiver) => {
        if (Reflect.has(target, property)) return Reflect.set(target, property, value, receiver);
        target.inner[property] = value;
        return true;
      },
    });
  }

  installReconnectGesture() {
    const graph = this.inner.graph;
    graph.setCellsDisconnectable(true);
    graph.isCellDisconnectable = (cell) => (
      cell?.semantic?.type === 'relation'
      && cell.semantic.readOnly !== true
      && cell.semantic.relationIds?.length === 1
    );
    graph.addListener(InternalEvent.CELL_CONNECTED, (_sender, event) => {
      if (this.inner.projecting) return;
      const edge = event.getProperty('edge') ?? event.getProperty('cell');
      const relationId = edge?.semantic?.relationIds?.length === 1
        ? edge.semantic.relationIds[0]
        : null;
      const from = edge?.getTerminal(true)?.semantic?.regionId;
      const to = edge?.getTerminal(false)?.semantic?.regionId;
      if (!relationId || !from || !to) return;
      const result = this.core.acceptGesture({
        type: 'reconnect-relation',
        relationId,
        from,
        to,
      });
      if (!result) this.inner.render(this.inner.lastScene);
    });
  }

  setOperationHandler(handler) {
    this.core.setMutationPort(handler);
    return this;
  }

  setErrorHandler(handler) {
    this.inner.setErrorHandler(handler);
    return this;
  }

  onSelectionChange(listener) {
    invariant(typeof listener === 'function', 'selection listener must be a function');
    return this.core.subscribe((event) => {
      if (event.kind === 'selection') listener(event.selection);
    });
  }

  selectionSnapshot() {
    return this.core.selectionSnapshot();
  }

  mirrorSelection(selection) {
    this.mirroringSelection = true;
    try {
      return this.inner.setSelection(normalizeSelection(selection));
    } finally {
      this.mirroringSelection = false;
    }
  }

  setSelection(selection) {
    return this.core.setSelection(selection);
  }

  selectRegion(regionId) {
    return this.core.setSelection({ regionIds: [regionId], relationIds: [] });
  }

  clearSelection() {
    return this.core.setSelection({ regionIds: [], relationIds: [] });
  }

  submitOperation(operation) {
    try {
      return this.core.acceptGesture(operationToGesture(operation));
    } catch (error) {
      this.inner.errorHandler?.(error);
      return null;
    }
  }

  deleteSelection() {
    const selection = this.core.selectionSnapshot();
    if (!selection.regionIds.length && !selection.relationIds.length) return null;
    return this.submitOperation({
      type: 'RemoveSelection',
      regionIds: selection.regionIds,
      relationIds: selection.relationIds,
    });
  }

  render(scene) {
    this.inner.render(scene);
    this.core.setFrame({
      pattern: scene.pattern,
      sceneIds: scene.scenes.map((item) => item.id),
    });
    this.mirrorSelection(this.core.selectionSnapshot());
  }
}
