import { appendDecision, createDecision, createEnvelope, inspectEnvelope, normalizeView, verifyDecisionLog } from '../protocol/index.js';
import { normalizeOperation } from '../domain/index.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-runtime: ${message}`);
}

function sameOperations(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class DecisionRuntime {
  static async create(envelope, options = {}) {
    const inspection = await inspectEnvelope(envelope);
    if (options.validateRecords) {
      await options.validateRecords(inspection.base.records, {
        mapId: inspection.base.mapId,
        head: inspection.base.head,
        view: inspection.envelope.view,
      });
      if (inspection.preview) {
        await options.validateRecords(inspection.preview.records, {
          mapId: inspection.base.mapId,
          head: inspection.preview.head,
          view: inspection.envelope.view,
        });
      }
    }
    return new DecisionRuntime(inspection, options);
  }

  constructor(inspection, options = {}) {
    this.ready = true;
    this.log = inspection.base.log;
    this.head = inspection.base.head;
    this.mapId = inspection.base.mapId;
    this.stateHash = inspection.base.stateHash;
    this.records = inspection.base.records;
    this.proposal = inspection.envelope.proposal;
    this.view = inspection.envelope.view;
    this.store = null;
    this.listeners = new Set();
    this.validateRecords = options.validateRecords ?? null;
  }

  attachStore(store) {
    invariant(!this.store, 'store is already attached');
    invariant(store && typeof store.toRecords === 'function', 'store is required');
    this.store = store;
    return this;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(kind, detail = {}) {
    const event = Object.freeze({ kind, runtime: this.snapshot(), ...detail });
    for (const listener of this.listeners) listener(event);
  }

  snapshot() {
    return Object.freeze({
      mapId: this.mapId,
      head: this.head,
      stateHash: this.stateHash,
      log: this.log,
      proposal: this.proposal,
      view: this.view,
      draftOperations: this.draftOperations(),
    });
  }

  draftOperations() {
    if (!this.store) return Object.freeze([]);
    return this.store.draftSnapshot().operations;
  }

  draftCount() {
    return this.draftOperations().length;
  }

  prepareLocalOperation(input) {
    const operation = structuredClone(input);
    if (operation.type === 'AddRegion' && !operation.regionId) {
      invariant(typeof crypto.randomUUID === 'function', 'crypto.randomUUID is required');
      operation.regionId = `region.${crypto.randomUUID()}`;
    }
    if (operation.type === 'ConnectRegions' && !operation.relationId) {
      invariant(typeof crypto.randomUUID === 'function', 'crypto.randomUUID is required');
      operation.relationId = `relation.${crypto.randomUUID()}`;
    }
    return normalizeOperation(operation);
  }

  async createDraftProposal() {
    invariant(this.store, 'store is not attached');
    const operations = this.draftOperations();
    invariant(operations.length > 0, 'there is no draft');
    const created = await createDecision(this.head, operations, this.records);
    const current = this.store.toRecords();
    invariant(JSON.stringify(current) === JSON.stringify(created.records), 'draft State does not match its Operations');
    await this.validateRecords?.(created.records, { mapId: this.mapId, head: this.head, view: this.view });
    return created.decision;
  }

  async preview(proposal = this.proposal) {
    invariant(proposal, 'Proposal is required');
    const appended = await appendDecision(this.log, proposal);
    await this.validateRecords?.(appended.records, { mapId: this.mapId, head: appended.head, view: this.view });
    return appended;
  }

  async envelope({ proposal = null, view = this.view } = {}) {
    return createEnvelope(this.log, proposal, normalizeView(view));
  }

  async preflightView(view) {
    invariant(!this.proposal, 'cannot change Pattern while a Proposal is pending');
    invariant(this.draftCount() === 0, 'cannot change Pattern while a Local Draft is active');
    const normalizedView = normalizeView(view);
    const validation = await this.validateRecords?.(this.records, {
      mapId: this.mapId,
      head: this.head,
      view: normalizedView,
    });
    const envelope = await createEnvelope(this.log, null, normalizedView);
    return Object.freeze({ head: this.head, log: this.log, view: envelope.view, envelope, validation: validation ?? null });
  }

  commitView(preflight) {
    invariant(preflight?.head === this.head && preflight?.log === this.log, 'Pattern preflight is stale');
    invariant(!this.proposal && this.draftCount() === 0, 'Pattern change base is no longer clean');
    this.view = preflight.view;
    this.notify('view', { view: preflight.view });
    return Object.freeze({ ...preflight });
  }

  async changeView(view) {
    return this.commitView(await this.preflightView(view));
  }

  async preflightAccept(proposal, { view = this.view } = {}) {
    const normalizedView = normalizeView(view);
    const appended = await appendDecision(this.log, proposal);
    await this.validateRecords?.(appended.records, {
      mapId: this.mapId,
      head: appended.head,
      view: normalizedView,
    });
    const envelope = await createEnvelope(appended.log, null, normalizedView);
    return Object.freeze({
      head: this.head,
      log: this.log,
      proposal: this.proposal,
      draftOperations: this.draftOperations(),
      appended,
      envelope,
      view: envelope.view,
    });
  }

  async accept(proposal, options = {}) {
    invariant(this.store, 'store is not attached');
    const draft = this.draftOperations();
    if (draft.length) invariant(sameOperations(draft, proposal.operations), 'another draft is active');
    const preflight = await this.preflightAccept(proposal, options);
    invariant(preflight.head === this.head && preflight.log === this.log, 'Accept preflight is stale');
    invariant(preflight.proposal === this.proposal, 'Accept Proposal changed during preflight');
    invariant(sameOperations(preflight.draftOperations, this.draftOperations()), 'Accept draft changed during preflight');
    const previous = Object.freeze({
      log: this.log,
      head: this.head,
      records: this.records,
      stateHash: this.stateHash,
      proposal: this.proposal,
      view: this.view,
      storeSession: this.store.snapshotSession(),
    });
    try {
      this.store.replaceRecords(preflight.appended.records);
      this.log = preflight.appended.log;
      this.head = preflight.appended.head;
      this.records = preflight.appended.records;
      this.stateHash = preflight.appended.stateHash;
      this.proposal = null;
      this.view = preflight.view;
    } catch (error) {
      try { this.store.restoreSession(previous.storeSession); } catch (_) { /* best effort rollback */ }
      this.log = previous.log;
      this.head = previous.head;
      this.records = previous.records;
      this.stateHash = previous.stateHash;
      this.proposal = previous.proposal;
      this.view = previous.view;
      throw error;
    }
    const envelope = await createEnvelope(this.log, null, this.view);
    this.notify('append', { decisionId: this.head });
    return Object.freeze({
      decisionId: this.head,
      stateHash: this.stateHash,
      log: this.log,
      records: this.records,
      envelope,
    });
  }

  async preflightReject({ local = false, view = this.view } = {}) {
    invariant(this.store, 'store is not attached');
    if (local) {
      invariant(this.draftCount() > 0, 'there is no Local Draft to reject');
      return Object.freeze({ head: this.head, log: this.log, local: true, view: this.view, envelope: await this.envelope() });
    }
    invariant(this.proposal, 'there is no Data Proposal to reject');
    const normalizedView = normalizeView(view);
    await this.validateRecords?.(this.records, { mapId: this.mapId, head: this.head, view: normalizedView });
    return Object.freeze({
      head: this.head,
      log: this.log,
      local: false,
      view: normalizedView,
      envelope: await createEnvelope(this.log, null, normalizedView),
    });
  }

  async reject(options = {}) {
    invariant(this.store, 'store is not attached');
    const preflight = await this.preflightReject(options);
    invariant(preflight.head === this.head && preflight.log === this.log, 'Proposal rejection preflight is stale');
    invariant(preflight.local ? this.draftCount() > 0 : Boolean(this.proposal), 'Proposal rejection base is no longer pending');
    const previous = Object.freeze({ proposal: this.proposal, view: this.view, storeSession: this.store.snapshotSession() });
    try {
      if (preflight.local) this.store.replaceRecords(this.records);
      this.proposal = null;
      this.view = preflight.view;
    } catch (error) {
      try { this.store.restoreSession(previous.storeSession); } catch (_) { /* best effort rollback */ }
      this.proposal = previous.proposal;
      this.view = previous.view;
      throw error;
    }
    const envelope = await createEnvelope(this.log, null, this.view);
    this.notify('reject', { local: preflight.local });
    return Object.freeze({ envelope, local: preflight.local });
  }

  async verify() {
    return verifyDecisionLog(this.log);
  }
}
