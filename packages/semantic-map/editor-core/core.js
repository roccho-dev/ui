import { SemanticDomainStore as DomainStateStore } from '../domain/domain-store.js';
import { executeReconnectRelation, normalizeOperation } from '../domain/editor-operation.js';
import { createSemanticMap } from '../domain/semantic-map.js';
import { assertSurfaceGesture, gestureToOperation } from './commands.js';
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
    this.transactionSnapshot = null;
    this.displayFailures = [];
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
    // This temporary value is a read projection, not a second editable store.
    this.transactionSnapshot = this.readSnapshot();
    this.transactionDepth = 1;
    this.pendingDomainEvents = [];
  }

  rollbackTransaction(session) {
    this.restoreSession(session);
    this.pendingDomainEvents = [];
    this.transactionSnapshot = null;
    this.transactionDepth = 0;
  }

  transaction(kind, intent, prepare, { render = true } = {}) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    const session = this.snapshotSession();
    const beforeRevision = structuredClone(this.revision);
    let authority;
    let outcome;
    this.beginTransaction();
    try {
      // Hold the boundary before the first Authority/Document callback,
      // including for ordinary edits and undo/redo, not only replacement.
      authority = intent === null ? null : this.authorize(intent);
      outcome = prepare(authority, beforeRevision);
      if (outcome.changed === false) {
        this.rollbackTransaction(session);
        return structuredClone(outcome.result);
      }
      if (authority !== null) {
        this.commitDocument({ authority, operations: outcome.operations, batch: outcome.batch, beforeRevision });
      }
    } catch (error) {
      this.rollbackTransaction(session);
      throw error;
    }
    // Commit is complete. Display failures must never become a rollback signal.
    this.finishTransaction(kind, { ...outcome.detail, ...(authority === null ? {} : { authority }) }, { render });
    return structuredClone(outcome.result);
  }

  finishTransaction(kind, detail = {}, { render = true } = {}) {
    invariant(this.transactionDepth === 1, 'mutation transaction is not active');
    const domainEvents = this.pendingDomainEvents;
    this.pendingDomainEvents = [];
    this.transactionSnapshot = this.readSnapshot();
    const display = (phase, callback) => {
      this.displayFailures = this.displayFailures.filter(failure => failure.phase !== phase);
      // The retry receives the current attempt, not a stale failure projection.
      this.transactionSnapshot = this.readSnapshot();
      try { synchronous(callback(), phase); } catch (error) {
        this.displayFailures.push({ code: 'E_EDITOR_DISPLAY', phase, message: String(error?.message ?? error) });
      }
      this.transactionSnapshot = this.readSnapshot();
    };
    try {
      // Keep the accepted snapshot and operation lock until every observer has
      // received this cut. No subscriber can insert another edit into the event.
      for (const event of domainEvents) super.notify(Object.freeze(structuredClone(event)));
      if (render) display('SurfacePort.render', () => this.renderSurface());
      display('DocumentPort.renderChrome', () => this.documentPort.renderChrome(this.snapshot()));
      this.publish(kind, detail, true);
    } finally {
      this.transactionSnapshot = null;
      this.transactionDepth = 0;
    }
  }

  stateHash() {
    return `fnv1a32:${fnv1a32(JSON.stringify({
      revision: this.revision,
      records: this.toRecords(),
      selection: this.selection,
      frame: this.frame,
    }))}`;
  }

  publish(kind, detail = {}, committed = false) {
    if (this.destroyed || (this.transactionDepth > 0 && !committed)) return;
    const event = { kind, core: this.snapshot(), ...detail };
    for (const listener of [...this.coreListeners]) {
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

  setSelection(input) {
    const requested = normalizeSelection(input);
    const validRegions = requested.regionIds.filter((id) => this.domain.regions.has(id));
    const validRelations = requested.relationIds.filter((id) => relationIds(this.domain).has(id));
    this.selection = normalizeSelection({ regionIds: validRegions, relationIds: validRelations });
    return this.selection;
  }

  changeSelection(input, origin = 'core') {
    return this.transaction('selection', null, () => {
      const previous = this.selection;
      const next = this.setSelection(input);
      return { changed: !sameSelection(previous, next), result: next, detail: { selection: next, origin } };
    }, { render: origin !== 'surface' });
  }

  setFrame(frame) {
    return this.transaction('frame', null, () => {
      const next = cloneFrame(frame);
      const changed = JSON.stringify(this.frame) !== JSON.stringify(next);
      this.frame = next;
      return { changed, result: next, detail: { frame: next } };
    });
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
    if (command.type === 'selection.set') return this.changeSelection(command.selection);
    if (command.type === 'frame.set') return this.setFrame(command.frame);
    if (command.type === 'presentation.refresh') {
      this.transaction('presentation', null, () => ({ result: null, detail: { retry: true } }));
      return this.snapshot();
    }

    const initial = this.prepareOperation(command);
    return this.transaction('mutation', initial.operation, (authority, beforeRevision) => {
      const plan = this.editPlan(initial.operation, authority);
      if (plan.noop) return { changed: false, result: plan.result };
      const batch = super.performBatch(
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
        this.setSelection({ regionIds: [last.createdRegionId], relationIds: [] });
      } else if (last?.createdRelationId) {
        this.setSelection({ regionIds: [], relationIds: [last.createdRelationId] });
      } else {
        this.pruneSelection();
      }
      const result = batch.results.length === 1
        ? batch.results[0]
        : { operations: plan.operations, results: batch.results };
      return { operations: plan.operations, batch, result, detail: { operations: plan.operations, result } };
    });
  }

  applyHistory(direction) {
    const intent = Object.freeze({ type: direction === 'undo' ? 'history.undo' : 'history.redo' });
    return this.transaction('history', intent, () => {
      const changed = direction === 'undo' ? super.undo() : super.redo();
      if (!changed) return { changed: false, result: false };
      this.pruneSelection();
      return {
        operations: [intent],
        batch: { results: [{ changed: true }] },
        result: true,
        detail: { direction },
      };
    });
  }

  acceptGesture(gesture) {
    invariant(!this.destroyed, 'core is destroyed');
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    assertSurfaceGesture(gesture);
    switch (gesture.type) {
      case 'selection.changed':
        return this.changeSelection(gesture.selection, 'surface');
      case 'camera.changed':
        return this.transaction('presentation', null, () => ({
          result: null, detail: { presentation: structuredClone(gesture.presentation ?? null) },
        }), { render: false });
      case 'activation.requested':
        return this.transaction('activation', null, () => ({
          result: null, detail: { activation: structuredClone(gesture.activation ?? null) },
        }), { render: false });
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
    this.transaction('replace', { type: 'document.replace' }, (authority, beforeRevision) => {
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
      // Only commit advances revision. Reload cannot rewrite the CAS base.
      return { operations: [], batch: { results: [] }, result: null };
    });
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
    return this.transactionSnapshot === null
      ? this.readSnapshot()
      : Object.freeze(structuredClone(this.transactionSnapshot));
  }

  readSnapshot() {
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
      display: { status: this.displayFailures.length ? 'error' : 'ready', failures: this.displayFailures },
    }));
  }

  runtimePort() {
    const state = this;
    // Temporary read-only compatibility view for legacy P2 composition code.
    // It intentionally exposes no mutation, restore, replacement, or history capability.
    const port = {
      get domain() { return createSemanticMap(structuredClone(state.toRecords())); },
      onChange(listener) {
        invariant(typeof listener === 'function', 'runtime listener must be a function');
        return state.subscribe((event) => listener(Object.freeze(structuredClone(event))));
      },
      draftSnapshot() { return structuredClone(state.snapshot().draft); },
      toRecords() { return structuredClone(state.snapshot().records); },
      toJSONL() { return state.toJSONL(); },
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
