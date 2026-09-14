import { SemanticDomainStore as DomainStateStore } from '../domain/domain-store.js';
import { normalizeOperation } from './operation.js';
import { createSemanticMap } from '../domain/semantic-map.js';
import { gestureToOperation } from './commands.js';
import {
  assertSurfacePort,
  normalizeSelection,
  registerPendingEditorCore,
  sameSelection,
} from './ports.js';
import { createWorkspace, normalizeWorkspace } from './workspace-codec.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`editor-core: ${message}`);
}

function relationIds(domain) {
  return new Set(domain.relations.map((relation) => relation.id));
}

function initialSequence(domain) {
  let maximum = 0;
  for (const id of [...domain.regions.keys(), ...domain.relations.map((relation) => relation.id)]) {
    const match = /^(?:region|relation)\.core-(\d+)$/u.exec(id);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum;
}

function cloneFrame(frame) {
  return frame == null ? null : structuredClone(frame);
}

export class EditorCore extends DomainStateStore {
  constructor(initialDomain, options = {}) {
    super(initialDomain);
    this.coreListeners = new Set();
    this.surface = null;
    this.mutationPort = null;
    this.selection = normalizeSelection();
    this.frame = null;
    this.idSequence = initialSequence(this.domain);
    this.destroyed = false;
    this.unregisterPending = options.registerSurface === false
      ? null
      : registerPendingEditorCore(this);
  }

  static detached(initialDomain) {
    return new EditorCore(initialDomain, { registerSurface: false });
  }

  notify(event) {
    super.notify(event);
    if (this.coreListeners) this.publish('domain', { domainEvent: event });
  }

  publish(kind, detail = {}) {
    const event = Object.freeze({ kind, core: this.snapshot(), ...detail });
    for (const listener of this.coreListeners) {
      try { listener(event); } catch (error) { console.error(error); }
    }
  }

  subscribe(listener) {
    invariant(typeof listener === 'function', 'listener must be a function');
    this.coreListeners.add(listener);
    return () => this.coreListeners.delete(listener);
  }

  bindSurface(surface) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(!this.surface, 'SurfacePort is already bound');
    this.surface = assertSurfacePort(surface);
    this.unregisterPending?.();
    this.unregisterPending = null;
    this.surface.mirrorSelection(this.selection);
    this.publish('surface', { status: 'bound' });
    return this;
  }

  setMutationPort(port) {
    invariant(typeof port === 'function', 'Authority/Mutation port must be a function');
    this.mutationPort = port;
    return this;
  }

  selectionSnapshot() {
    return this.selection;
  }

  setSelection(input, { mirror = true, origin = 'core' } = {}) {
    invariant(!this.destroyed, 'core is destroyed');
    const requested = normalizeSelection(input);
    const validRegions = requested.regionIds.filter((id) => this.domain.regions.has(id));
    const validRelations = requested.relationIds.filter((id) => relationIds(this.domain).has(id));
    const next = normalizeSelection({ regionIds: validRegions, relationIds: validRelations });
    if (sameSelection(this.selection, next)) return this.selection;
    this.selection = next;
    if (mirror && this.surface) this.surface.mirrorSelection(next);
    this.publish('selection', { selection: next, origin });
    return next;
  }

  setFrame(frame) {
    const next = cloneFrame(frame);
    if (JSON.stringify(this.frame) === JSON.stringify(next)) return this.frame;
    this.frame = next;
    this.publish('frame', { frame: cloneFrame(this.frame) });
    return this.frame;
  }

  pruneSelection() {
    return this.setSelection(this.selection);
  }

  prepareOperation(input) {
    const candidate = structuredClone(input);
    let nextSequence = this.idSequence;
    let allocated = false;
    const used = new Set([...this.domain.regions.keys(), ...this.domain.relations.map((relation) => relation.id)]);
    const allocate = (prefix) => {
      let id;
      do {
        nextSequence += 1;
        id = `${prefix}.core-${nextSequence}`;
      } while (used.has(id));
      allocated = true;
      return id;
    };
    if (candidate.type === 'AddRegion' && !candidate.regionId) candidate.regionId = allocate('region');
    if (candidate.type === 'ConnectRegions' && !candidate.relationId) candidate.relationId = allocate('relation');
    return Object.freeze({
      operation: normalizeOperation(candidate),
      nextSequence: allocated ? nextSequence : this.idSequence,
      allocated,
    });
  }

  dispatch(command) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(this.mutationPort, 'Authority/Mutation port is not bound');
    const prepared = this.prepareOperation(command);
    const beforeDraft = this.draftSnapshot().applied;
    const result = this.mutationPort(prepared.operation);
    const afterDraft = this.draftSnapshot().applied;
    if (prepared.allocated && afterDraft > beforeDraft) this.idSequence = prepared.nextSequence;
    if (result?.createdRegionId) {
      this.setSelection({ regionIds: [result.createdRegionId], relationIds: [] });
    } else if (result?.createdRelationId) {
      this.setSelection({ regionIds: [], relationIds: [result.createdRelationId] });
    } else {
      this.pruneSelection();
    }
    this.publish('mutation', { operation: prepared.operation, result });
    return result;
  }

  acceptGesture(gesture) {
    invariant(gesture && typeof gesture === 'object', 'gesture is required');
    if (gesture.type === 'selection-changed') {
      return this.setSelection(gesture.selection, { mirror: false, origin: 'surface' });
    }
    return this.dispatch(gestureToOperation(gesture));
  }

  execute(input) {
    const operation = normalizeOperation(input);
    if (operation.type !== 'ReconnectRelation') return super.execute(operation);
    const relation = this.relations.get(operation.relationId);
    invariant(relation, `ReconnectRelation relation not found: ${operation.relationId}`);
    invariant(this.regions.has(operation.from), `ReconnectRelation source not found: ${operation.from}`);
    invariant(this.regions.has(operation.to), `ReconnectRelation target not found: ${operation.to}`);
    invariant(operation.from !== operation.to, 'ReconnectRelation self relation is not allowed');
    const duplicate = [...this.relations.values()].some((candidate) => (
      candidate.id !== operation.relationId
      && candidate.from === operation.from
      && candidate.to === operation.to
      && candidate.kind === relation.kind
    ));
    invariant(!duplicate, 'ReconnectRelation would duplicate another directed relation');
    relation.from = operation.from;
    relation.to = operation.to;
    return {
      operation,
      result: {
        relationIds: [relation.id],
        reconnectedRelationId: relation.id,
        from: relation.from,
        to: relation.to,
      },
    };
  }

  undo() {
    const changed = super.undo();
    if (changed) this.pruneSelection();
    return changed;
  }

  redo() {
    const changed = super.redo();
    if (changed) this.pruneSelection();
    return changed;
  }

  replaceDomain(domain, options) {
    super.replaceDomain(domain, options);
    this.idSequence = initialSequence(this.domain);
    this.setSelection(normalizeSelection(), { origin: 'replace' });
  }

  replaceInput(input) {
    const workspace = input?.schema ? normalizeWorkspace(input) : null;
    const domain = workspace
      ? createSemanticMap(structuredClone(workspace.document.records))
      : Array.isArray(input)
        ? createSemanticMap(structuredClone(input))
        : input;
    this.replaceDomain(domain);
    if (workspace) {
      this.frame = cloneFrame(workspace.layout.frame);
      this.setSelection(workspace.layout.selection, { origin: 'replace' });
    }
    return this.snapshot();
  }

  workspace() {
    return createWorkspace(this.toRecords(), { selection: this.selection, frame: this.frame });
  }

  snapshot() {
    return Object.freeze({
      selection: this.selection,
      frame: cloneFrame(this.frame),
      draft: this.draftSnapshot(),
      document: Object.freeze({
        schema: this.domain.meta.schema,
        root: this.domain.meta.root,
        regions: this.domain.regions.size,
        relations: this.domain.relations.length,
      }),
      idSequence: this.idSequence,
      surface: this.surface?.snapshot() ?? null,
    });
  }

  destroy() {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.unregisterPending?.();
    this.unregisterPending = null;
    this.coreListeners.clear();
    this.surface = null;
    this.mutationPort = null;
    return true;
  }
}
