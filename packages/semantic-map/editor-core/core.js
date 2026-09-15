import { SemanticDomainStore as DomainStateStore } from '../domain/domain-store.js';
import { executeReconnectRelation, normalizeOperation } from '../domain/editor-operation.js';
import { createSemanticMap } from '../domain/semantic-map.js';
import { gestureToOperation } from './commands.js';
import {
  assertAuthorityPort,
  assertDocumentPort,
  assertSurfacePort,
  normalizeSelection,
  sameSelection,
} from './ports.js';
import { createWorkspace, normalizeWorkspace, workspaceBytes } from './workspace-codec.js';

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

function synchronous(value, name) {
  invariant(!value || typeof value.then !== 'function', `${name} must be synchronous`);
  return value;
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function publicError(code, reason) {
  const error = new Error(`editor-core: ${code}: ${reason}`);
  error.code = code;
  return error;
}

function normalizeInputDomain(input) {
  if (input?.meta && input?.regions && input?.relations) return structuredClone(input);
  if (Array.isArray(input)) return createSemanticMap(structuredClone(input));
  if (input?.records && Array.isArray(input.records)) return createSemanticMap(structuredClone(input.records));
  throw new Error('editor-core: semantic input is invalid');
}

class EditorCoreState extends DomainStateStore {
  constructor({ semantic, layout = null, revision = null, ports }) {
    super(normalizeInputDomain(semantic));
    invariant(ports && typeof ports === 'object', 'ports are required');
    this.surface = assertSurfacePort(ports.surface);
    this.documentPort = assertDocumentPort(ports.document);
    this.authority = assertAuthorityPort(ports.authority);
    this.coreListeners = new Set();
    this.selection = normalizeSelection(layout?.selection ?? {});
    this.frame = cloneFrame(layout?.frame ?? null);
    this.revision = structuredClone(revision ?? null);
    this.idSequence = initialSequence(this.domain);
    this.destroyed = false;
    this.transactionDepth = 0;
    this.pendingDomainEvents = [];
    this.removeSurfaceGesture = this.surface.onGesture((gesture) => this.acceptGesture(gesture));
    invariant(typeof this.removeSurfaceGesture === 'function', 'SurfacePort.onGesture must return an unsubscribe function');
    this.renderSurface();
  }

  notify(event) {
    if (this.transactionDepth > 0) {
      this.pendingDomainEvents.push(event);
      return;
    }
    super.notify(event);
    if (this.coreListeners) this.publish('domain', { domainEvent: event });
  }

  beginTransaction() {
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    this.transactionDepth = 1;
    this.pendingDomainEvents = [];
  }

  rollbackTransaction(session) {
    this.restoreSession(session);
    this.pendingDomainEvents = [];
    this.transactionDepth = 0;
  }

  finishTransaction(kind, detail = {}) {
    invariant(this.transactionDepth === 1, 'mutation transaction is not active');
    const domainEvents = this.pendingDomainEvents;
    this.pendingDomainEvents = [];
    this.transactionDepth = 0;
    for (const event of domainEvents) super.notify(event);
    this.renderSurface();
    this.documentPort.renderChrome(this.snapshot());
    this.publish(kind, detail);
  }

  stateHash() {
    return `fnv1a32:${fnv1a32(JSON.stringify({
      revision: this.revision,
      records: this.toRecords(),
      selection: this.selection,
      frame: this.frame,
    }))}`;
  }

  publish(kind, detail = {}) {
    if (this.destroyed || this.transactionDepth > 0) return;
    const event = { kind, core: this.snapshot(), ...detail };
    for (const listener of this.coreListeners) {
      try { listener(Object.freeze(structuredClone(event))); } catch (error) { console.error(error); }
    }
  }

  subscribe(listener) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(typeof listener === 'function', 'listener must be a function');
    this.coreListeners.add(listener);
    return () => this.coreListeners.delete(listener);
  }

  authorize(intent) {
    const stateHash = this.stateHash();
    const decision = synchronous(
      this.authority.authorize(Object.freeze({ intent: structuredClone(intent), stateHash })),
      'AuthorityPort.authorize',
    );
    invariant(decision && typeof decision === 'object', 'AuthorityPort.authorize must return a decision');
    if (decision.allowed !== true) {
      throw publicError(
        String(decision.code ?? 'E_AUTHORITY_DENIED'),
        String(decision.reason ?? 'authority denied'),
      );
    }
    return Object.freeze({
      allowed: true,
      code: String(decision.code ?? 'ALLOW'),
      reason: String(decision.reason ?? 'allowed'),
      stateHash,
    });
  }

  renderSurface(scene = undefined) {
    if (this.destroyed) return null;
    return this.surface.render(Object.freeze({
      ...(scene === undefined ? {} : { scene }),
      selection: this.selection,
      activeFrame: cloneFrame(this.frame),
      presentation: null,
    }));
  }

  selectionSnapshot() {
    return this.selection;
  }

  setSelection(input, { render = true, origin = 'core' } = {}) {
    invariant(!this.destroyed, 'core is destroyed');
    const requested = normalizeSelection(input);
    const validRegions = requested.regionIds.filter((id) => this.domain.regions.has(id));
    const validRelations = requested.relationIds.filter((id) => relationIds(this.domain).has(id));
    const next = normalizeSelection({ regionIds: validRegions, relationIds: validRelations });
    if (sameSelection(this.selection, next)) return this.selection;
    this.selection = next;
    if (render && this.transactionDepth === 0) this.renderSurface();
    this.publish('selection', { selection: next, origin });
    return next;
  }

  setFrame(frame) {
    invariant(!this.destroyed, 'core is destroyed');
    const next = cloneFrame(frame);
    if (JSON.stringify(this.frame) === JSON.stringify(next)) return cloneFrame(this.frame);
    this.frame = next;
    if (this.transactionDepth === 0) this.renderSurface();
    this.publish('frame', { frame: cloneFrame(this.frame) });
    return cloneFrame(this.frame);
  }

  pruneSelection() {
    return this.setSelection(this.selection);
  }

  prepareOperation(input, sequence = this.idSequence) {
    const candidate = structuredClone(input);
    let nextSequence = sequence;
    const used = new Set([...this.domain.regions.keys(), ...this.domain.relations.map((relation) => relation.id)]);
    const allocate = (prefix) => {
      let id;
      do {
        nextSequence += 1;
        id = `${prefix}.core-${nextSequence}`;
      } while (used.has(id));
      used.add(id);
      return id;
    };
    if (candidate.type === 'AddRegion' && !candidate.regionId) candidate.regionId = allocate('region');
    if (candidate.type === 'ConnectRegions' && !candidate.relationId) candidate.relationId = allocate('relation');
    return Object.freeze({
      operation: normalizeOperation(candidate),
      nextSequence,
    });
  }

  editPlan(operation, authority) {
    const requested = synchronous(this.documentPort.requestEdit(Object.freeze({
      intent: structuredClone(operation),
      operation: structuredClone(operation),
      semantic: structuredClone(this.domain),
      layout: Object.freeze({ selection: this.selection, frame: cloneFrame(this.frame) }),
      revision: this.revision,
      stateHash: authority.stateHash,
    })), 'DocumentPort.requestEdit');

    if (requested?.noop === true) {
      return Object.freeze({
        noop: true,
        result: requested.result ?? null,
        operations: Object.freeze([]),
        validate: null,
      });
    }

    const rawOperations = Array.isArray(requested)
      ? requested
      : requested?.operations ?? [operation];
    invariant(Array.isArray(rawOperations) && rawOperations.length > 0, 'DocumentPort.requestEdit returned no operations');
    invariant(requested?.validate == null || typeof requested.validate === 'function', 'DocumentPort validate must be a function');

    let nextSequence = this.idSequence;
    const operations = rawOperations.map((raw) => {
      const prepared = this.prepareOperation(raw, nextSequence);
      nextSequence = prepared.nextSequence;
      return prepared.operation;
    });
    return Object.freeze({
      noop: false,
      operations: Object.freeze(operations),
      nextSequence,
      validate: requested?.validate ?? null,
    });
  }

  commitDocument({ authority, operations, batch, beforeRevision }) {
    const value = synchronous(this.documentPort.commit(Object.freeze({
      expectedRevision: beforeRevision,
      revision: beforeRevision,
      semantic: structuredClone(this.domain),
      layout: Object.freeze({ selection: this.selection, frame: cloneFrame(this.frame) }),
      operations: structuredClone(operations),
      results: structuredClone(batch.results),
      stateHash: authority.stateHash,
    })), 'DocumentPort.commit');
    if (value && Object.hasOwn(value, 'revision')) this.revision = structuredClone(value.revision);
    return value ?? null;
  }

  dispatch(command) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    invariant(command && typeof command === 'object', 'command is required');

    if (command.type === 'history.undo') return this.applyHistory('undo');
    if (command.type === 'history.redo') return this.applyHistory('redo');
    if (command.type === 'selection.set') return this.setSelection(command.selection);
    if (command.type === 'frame.set') return this.setFrame(command.frame);

    const initial = this.prepareOperation(command);
    const authority = this.authorize(initial.operation);
    const plan = this.editPlan(initial.operation, authority);
    if (plan.noop) return structuredClone(plan.result);

    const session = this.snapshotSession();
    const beforeRevision = this.revision;
    let batch;
    let result;
    this.beginTransaction();
    try {
      batch = super.performBatch(
        plan.operations,
        plan.validate === null
          ? null
          : (candidate, validationBatch) => plan.validate(Object.freeze({
            semantic: structuredClone(candidate.domain),
            batch: structuredClone(validationBatch),
            revision: beforeRevision,
          })),
      );
      this.idSequence = plan.nextSequence;
      const last = batch.results.at(-1) ?? null;
      if (last?.createdRegionId) {
        this.setSelection({ regionIds: [last.createdRegionId], relationIds: [] }, { render: false });
      } else if (last?.createdRelationId) {
        this.setSelection({ regionIds: [], relationIds: [last.createdRelationId] }, { render: false });
      } else {
        this.pruneSelection();
      }
      this.commitDocument({
        authority,
        operations: plan.operations,
        batch,
        beforeRevision,
      });
      result = batch.results.length === 1
        ? batch.results[0]
        : Object.freeze({ operations: plan.operations, results: batch.results });
    } catch (error) {
      this.rollbackTransaction(session);
      throw error;
    }
    this.finishTransaction('mutation', { operations: plan.operations, result, authority });
    return structuredClone(result);
  }

  applyHistory(direction) {
    const intent = Object.freeze({ type: direction === 'undo' ? 'history.undo' : 'history.redo' });
    const authority = this.authorize(intent);
    const session = this.snapshotSession();
    const beforeRevision = this.revision;
    let changed;
    this.beginTransaction();
    try {
      changed = direction === 'undo' ? super.undo() : super.redo();
      if (!changed) {
        this.rollbackTransaction(session);
        return false;
      }
      const operation = Object.freeze({ type: intent.type });
      const batch = Object.freeze({ results: Object.freeze([Object.freeze({ changed: true })]) });
      this.commitDocument({
        authority,
        operations: Object.freeze([operation]),
        batch,
        beforeRevision,
      });
      this.pruneSelection();
    } catch (error) {
      this.rollbackTransaction(session);
      throw error;
    }
    this.finishTransaction('history', { direction, authority });
    return true;
  }

  acceptGesture(gesture) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    invariant(gesture && typeof gesture === 'object', 'gesture is required');
    switch (gesture.type) {
      case 'selection.changed':
      case 'selection-changed':
        return this.setSelection(gesture.selection, { render: false, origin: 'surface' });
      case 'camera.changed':
        this.publish('presentation', { presentation: structuredClone(gesture.presentation ?? null) });
        return null;
      case 'activation.requested':
        this.publish('activation', { activation: structuredClone(gesture.activation ?? null) });
        return null;
      default:
        return this.dispatch(gestureToOperation(gesture));
    }
  }

  execute(input) {
    const operation = normalizeOperation(input);
    return operation.type === 'ReconnectRelation'
      ? executeReconnectRelation(this, operation)
      : super.execute(operation);
  }

  replaceInput(input) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    const session = this.snapshotSession();
    const beforeRevision = this.revision;
    let authority;
    this.beginTransaction();
    try {
      // A full replacement is an edit, including when it originates in handoff.
      // Authorize the accepted state before calling either document callback.
      authority = this.authorize({ type: 'document.replace' });
      const reloaded = synchronous(this.documentPort.reload(Object.freeze({
        input: structuredClone(input),
        expectedRevision: beforeRevision,
        stateHash: authority.stateHash,
      })), 'DocumentPort.reload');
      const value = reloaded && Object.hasOwn(reloaded, 'input') ? reloaded.input : input;
      const workspace = value?.schema ? normalizeWorkspace(value) : null;
      const domain = workspace
        ? createSemanticMap(structuredClone(workspace.document.records))
        : normalizeInputDomain(value);
      super.replaceDomain(domain);
      this.idSequence = initialSequence(this.domain);
      this.selection = normalizeSelection(workspace?.layout.selection ?? {});
      this.frame = cloneFrame(workspace?.layout.frame ?? null);
      // Reload's revision never replaces the compare-and-swap precondition.
      // The commit result alone advances the accepted revision.
      this.commitDocument({
        authority,
        operations: Object.freeze([]),
        batch: Object.freeze({ results: Object.freeze([]) }),
        beforeRevision,
      });
    } catch (error) {
      this.rollbackTransaction(session);
      throw error;
    }
    this.finishTransaction('replace', { revision: this.revision, authority });
    return this.snapshot();
  }

  workspace() {
    return createWorkspace(this.toRecords(), { selection: this.selection, frame: this.frame });
  }

  snapshotSession() {
    return Object.freeze({
      domain: super.snapshotSession(),
      selection: this.selection,
      frame: cloneFrame(this.frame),
      idSequence: this.idSequence,
      revision: this.revision,
    });
  }

  restoreSession(snapshot) {
    super.restoreSession(snapshot.domain);
    this.selection = normalizeSelection(snapshot.selection);
    this.frame = cloneFrame(snapshot.frame);
    this.idSequence = snapshot.idSequence;
    this.revision = snapshot.revision;
  }

  snapshot() {
    // Renderer telemetry is delivered as a gesture, never read from a fourth
    // SurfacePort capability. Every returned value is detached from the owner.
    return Object.freeze(structuredClone({
      selection: this.selection,
      frame: this.frame,
      draft: this.draftSnapshot(),
      records: this.toRecords(),
      document: {
        schema: this.domain.meta.schema,
        root: this.domain.meta.root,
        regions: this.domain.regions.size,
        relations: this.domain.relations.length,
      },
      idSequence: this.idSequence,
      revision: this.revision,
      stateHash: this.stateHash(),
    }));
  }

  runtimePort() {
    const state = this;
    const port = {
      get domain() { return state.domain; },
      onChange(listener) { return state.onChange(listener); },
      draftSnapshot() { return state.draftSnapshot(); },
      toRecords() { return state.toRecords(); },
      toJSONL() { return state.toJSONL(); },
      snapshotSession() { return state.snapshotSession(); },
      restoreSession(snapshot) { return state.restoreSession(snapshot); },
      replaceRecords(records) { return state.replaceInput(records); },
      clearDraft() { return DomainStateStore.prototype.clearDraft.call(state); },
    };
    return Object.freeze(port);
  }

  destroy() {
    if (this.destroyed) return false;
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    this.destroyed = true;
    this.pendingDomainEvents = [];
    this.transactionDepth = 0;
    this.removeSurfaceGesture?.();
    this.removeSurfaceGesture = null;
    try { this.surface.destroy(); } finally {
      this.coreListeners.clear();
    }
    return true;
  }
}

function publicCore(state) {
  const api = {
    dispatch: (command) => state.dispatch(command),
    acceptGesture: (gesture) => state.acceptGesture(gesture),
    replaceInput: (input) => state.replaceInput(input),
    snapshot: () => state.snapshot(),
    subscribe: (listener) => state.subscribe(listener),
    destroy: () => state.destroy(),
  };
  Object.defineProperty(api, 'runtime', {
    value: state.runtimePort(),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(api, 'workspace', {
    value: () => state.workspace(),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(api);
}

export function createSemanticMapEditorCore({
  semantic,
  layout = null,
  revision = null,
  ports,
}) {
  return publicCore(new EditorCoreState({ semantic, layout, revision, ports }));
}

export function editorDocumentBytes(core) {
  invariant(core && typeof core.workspace === 'function', 'EditorCore is required');
  return workspaceBytes(core.workspace());
}
