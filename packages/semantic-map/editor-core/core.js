import { SemanticDomainStore as DomainStateStore } from '../domain/domain-store.js';
import { executeReconnectRelation, normalizeOperation } from '../domain/editor-operation.js';
import { createSemanticMap } from '../domain/semantic-map.js';
import { SemanticProjector } from '../projection/index.js';
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

function clonePresentation(presentation) {
  return presentation == null ? null : structuredClone(presentation);
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

function projectPresentationValue(projectPresentation, domain, view) {
  const value = synchronous(
    projectPresentation(structuredClone(domain), structuredClone(view)),
    'presentation.configure projectPresentation',
  );
  return value == null ? null : structuredClone(value);
}

function createProjectionState(domain, input) {
  invariant(input && typeof input === 'object', 'presentation.configure projection is required');
  invariant(input.view && typeof input.view === 'object', 'presentation.configure view is required');
  invariant(
    input.projectPresentation == null || typeof input.projectPresentation === 'function',
    'presentation.configure projectPresentation must be a function',
  );
  const projectPresentation = input.projectPresentation ?? (() => null);
  const view = structuredClone(input.view);
  const modules = input.modules ?? null;
  const presentationProjection = projectPresentationValue(projectPresentation, domain, view);
  return Object.freeze({
    view,
    modules,
    projectPresentation,
    projector: new SemanticProjector(domain, modules, view, { presentationProjection }),
    presentationProjection,
  });
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
    this.projection = null;
    this.presentation = null;
    this.presentationProjection = null;
    this.scene = null;
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
      this.transactionSnapshot = this.readSnapshot();
      try { synchronous(callback(), phase); } catch (error) {
        this.displayFailures.push({ code: 'E_EDITOR_DISPLAY', phase, message: String(error?.message ?? error) });
      }
      this.transactionSnapshot = this.readSnapshot();
    };
    try {
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

  configureProjection(input) {
    const hasPresentation = Object.hasOwn(input, 'presentation');
    const nextPresentation = hasPresentation ? clonePresentation(input.presentation) : this.presentation;
    const next = createProjectionState(this.domain, input);
    this.projection = next;
    this.presentationProjection = next.presentationProjection;
    if (hasPresentation) this.presentation = nextPresentation;
    return null;
  }

  projectAcceptedScene() {
    if (!this.projection || !this.presentation?.camera || !this.presentation?.viewport) return this.scene;
    const { projector, modules, projectPresentation, view } = this.projection;
    projector.setDomain(this.domain);
    projector.setModules(modules);
    projector.setView(view);
    const presentationProjection = projectPresentationValue(projectPresentation, this.domain, view);
    projector.setPresentationProjection(presentationProjection);
    this.presentationProjection = presentationProjection;
    this.scene = projector.project({
      scale: this.presentation.camera.scale,
      viewport: this.presentation.viewport,
    });
    return this.scene;
  }

  projectCandidateScene(command) {
    invariant(this.projection, 'presentation.project requires presentation.configure');
    const domain = normalizeInputDomain(command.semantic);
    const view = command.view == null ? this.projection.view : structuredClone(command.view);
    const modules = Object.hasOwn(command, 'modules') ? command.modules : this.projection.modules;
    const presentation = clonePresentation(command.presentation ?? this.presentation);
    invariant(presentation?.camera && presentation?.viewport, 'presentation.project presentation is required');
    const presentationProjection = projectPresentationValue(this.projection.projectPresentation, domain, view);
    const { projector } = this.projection;
    try {
      projector.setDomain(domain);
      projector.setModules(modules);
      projector.setView(view);
      projector.setPresentationProjection(presentationProjection);
      return structuredClone(projector.project({
        scale: presentation.camera.scale,
        viewport: presentation.viewport,
      }));
    } finally {
      projector.setDomain(this.domain);
      projector.setModules(this.projection.modules);
      projector.setView(this.projection.view);
      projector.setPresentationProjection(this.presentationProjection);
    }
  }

  renderSurface() {
    if (this.destroyed) return null;
    const scene = this.projectAcceptedScene();
    return this.surface.render(Object.freeze({
      ...(scene ? { scene } : {}),
      selection: this.selection,
      activeFrame: cloneFrame(this.frame),
      presentation: clonePresentation(this.presentation),
    }));
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
    return Object.freeze({ operation: normalizeOperation(candidate), nextSequence });
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
      return Object.freeze({ noop: true, result: requested.result ?? null, operations: Object.freeze([]), validate: null });
    }

    const rawOperations = Array.isArray(requested) ? requested : requested?.operations ?? [operation];
    invariant(Array.isArray(rawOperations) && rawOperations.length > 0, 'DocumentPort.requestEdit returned no operations');
    invariant(requested?.validate == null || typeof requested.validate === 'function', 'DocumentPort validate must be a function');

    let nextSequence = this.idSequence;
    const operations = rawOperations.map((raw) => {
      const prepared = this.prepareOperation(raw, nextSequence);
      nextSequence = prepared.nextSequence;
      return prepared.operation;
    });
    return Object.freeze({ noop: false, operations: Object.freeze(operations), nextSequence, validate: requested?.validate ?? null });
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
    if (command.type === 'presentation.configure') {
      this.transaction('presentation', null, () => {
        this.configureProjection(command.projection);
        return { result: null, detail: { configured: true } };
      });
      return this.snapshot();
    }
    if (command.type === 'presentation.refresh') {
      this.transaction('presentation', null, () => ({ result: null, detail: { retry: true } }));
      return this.snapshot();
    }
    if (command.type === 'presentation.project') return this.projectCandidateScene(command);

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
      if (last?.createdRegionId) this.setSelection({ regionIds: [last.createdRegionId], relationIds: [] });
      else if (last?.createdRelationId) this.setSelection({ regionIds: [], relationIds: [last.createdRelationId] });
      else this.pruneSelection();
      const result = batch.results.length === 1 ? batch.results[0] : { operations: plan.operations, results: batch.results };
      return { operations: plan.operations, batch, result, detail: { operations: plan.operations, result } };
    });
  }

  applyHistory(direction) {
    const intent = Object.freeze({ type: direction === 'undo' ? 'history.undo' : 'history.redo' });
    return this.transaction('history', intent, () => {
      const changed = direction === 'undo' ? super.undo() : super.redo();
      if (!changed) return { changed: false, result: false };
      this.pruneSelection();
      return { operations: [intent], batch: { results: [{ changed: true }] }, result: true, detail: { direction } };
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
        return this.transaction('presentation', null, () => {
          this.presentation = clonePresentation(gesture.presentation ?? null);
          return { result: null, detail: { presentation: clonePresentation(this.presentation) } };
        });
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
    return operation.type === 'ReconnectRelation' ? executeReconnectRelation(this, operation) : super.execute(operation);
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
      const domain = workspace ? createSemanticMap(structuredClone(workspace.document.records)) : normalizeInputDomain(value);
      super.replaceDomain(domain);
      this.idSequence = initialSequence(this.domain);
      this.selection = normalizeSelection(workspace?.layout.selection ?? {});
      this.frame = cloneFrame(workspace?.layout.frame ?? null);
      return { operations: [], batch: { results: [] }, result: null };
    });
    return this.snapshot();
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
    return this.transactionSnapshot === null ? this.readSnapshot() : Object.freeze(structuredClone(this.transactionSnapshot));
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
      presentation: this.presentation,
      presentationProjection: this.presentationProjection,
      scene: this.scene,
      display: { status: this.displayFailures.length ? 'error' : 'ready', failures: this.displayFailures },
    }));
  }

  destroy() {
    if (this.destroyed) return false;
    invariant(this.transactionDepth === 0, 'nested mutation transaction is not allowed');
    this.destroyed = true;
    this.pendingDomainEvents = [];
    this.transactionDepth = 0;
    this.removeSurfaceGesture?.();
    this.removeSurfaceGesture = null;
    try { this.surface.destroy(); } finally { this.coreListeners.clear(); }
    return true;
  }
}

function publicCore(state) {
  return Object.freeze({
    dispatch: (command) => state.dispatch(command),
    acceptGesture: (gesture) => state.acceptGesture(gesture),
    replaceInput: (input) => state.replaceInput(input),
    snapshot: () => state.snapshot(),
    subscribe: (listener) => state.subscribe(listener),
    destroy: () => state.destroy(),
  });
}

export function createSemanticMapEditorCore({ semantic, layout = null, revision = null, ports }) {
  return publicCore(new EditorCoreState({ semantic, layout, revision, ports }));
}

export function editorDocumentBytes(core) {
  invariant(core && typeof core.snapshot === 'function', 'EditorCore is required');
  const snapshot = core.snapshot();
  return workspaceBytes(createWorkspace(snapshot.records, { selection: snapshot.selection, frame: snapshot.frame }));
}