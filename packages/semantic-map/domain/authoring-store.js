import {
  dataPinMap,
  dataPinRecordsFromMap,
  normalizeDataPinRecords,
  splitDataPinRecords,
} from '../../data-pin/contract.mjs';
import { assertDataMutationAllowed } from '../../data-pin/policy.mjs';
import { SemanticDomainStore as BaseSemanticDomainStore } from './domain-store.js';
import { normalizeOperation } from './authoring-operation.js';
import { canonicalJson } from './canonical-json.js';
import { createSemanticMap, recordsToJSONL } from './semantic-map.js';
import {
  layoutMap,
  layoutRecordsFromMap,
  normalizeLayoutRecords,
  splitStateRecords,
} from '../layout/state.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-domain: ${message}`);
}

function layoutRecord(regionId, bounds) {
  return Object.freeze({
    type: 'layout',
    regionId,
    pin: 'hard',
    bounds: Object.freeze([...bounds]),
  });
}

function dataPinRecord({ targetId, basis, reason }) {
  return Object.freeze({ type: 'data-pin', targetId, basis, reason });
}

function semanticTargetIds(domain) {
  return new Set([
    ...domain.regions.keys(),
    ...domain.relations.map(relation => relation.id),
  ]);
}

function affectedDataIds(result) {
  return [
    ...(result?.regionIds ?? []),
    ...(result?.relationIds ?? []),
  ];
}

export class SemanticDomainStore extends BaseSemanticDomainStore {
  constructor(initialDomain, initialLayoutRecords = [], initialDataPinRecords = []) {
    super(initialDomain);
    this.layoutByRegionId = layoutMap(initialLayoutRecords, initialDomain);
    this.dataPinByTargetId = dataPinMap(initialDataPinRecords, semanticTargetIds(initialDomain));
  }

  get layoutHints() {
    return new Map(this.layoutByRegionId);
  }

  get dataPins() {
    return new Map(this.dataPinByTargetId);
  }

  layoutSnapshot() {
    return layoutRecordsFromMap(this.layoutByRegionId);
  }

  dataPinSnapshot() {
    return dataPinRecordsFromMap(this.dataPinByTargetId);
  }

  snapshotState() {
    return {
      ...super.snapshotState(),
      layout: this.layoutSnapshot(),
      dataPins: this.dataPinSnapshot(),
    };
  }

  restoreState(snapshot) {
    super.restoreState(snapshot);
    this.layoutByRegionId = layoutMap(snapshot.layout ?? [], this.domain);
    this.dataPinByTargetId = dataPinMap(snapshot.dataPins ?? [], semanticTargetIds(this.domain));
  }

  replaceRecords(records, { notify = true } = {}) {
    const { dataRecords, dataPinRecords } = splitDataPinRecords(records);
    const { semanticRecords, layoutRecords } = splitStateRecords(dataRecords);
    const domain = createSemanticMap(semanticRecords);
    const normalizedLayout = normalizeLayoutRecords(layoutRecords, domain);
    const normalizedDataPins = normalizeDataPinRecords(dataPinRecords, semanticTargetIds(domain));
    super.replaceDomain(domain, { notify: false });
    this.layoutByRegionId = layoutMap(normalizedLayout, domain);
    this.dataPinByTargetId = dataPinMap(normalizedDataPins, semanticTargetIds(domain));
    if (notify) this.notify(Object.freeze({ kind: 'replace', domain: this.domain }));
  }

  execute(input) {
    const operation = normalizeOperation(input);

    if (operation.type === 'PinRegions') {
      const affected = [];
      for (const item of operation.items) {
        invariant(this.regions.has(item.regionId), `PinRegions region not found: ${item.regionId}`);
        invariant(item.regionId !== this.meta.root, 'root region cannot be pinned');
        this.layoutByRegionId.set(item.regionId, layoutRecord(item.regionId, item.bounds));
        affected.push(item.regionId);
      }
      return { operation, result: { regionIds: affected, pinned: true } };
    }

    if (operation.type === 'UnpinRegions') {
      const affected = [];
      for (const regionId of operation.regionIds) {
        invariant(this.regions.has(regionId), `UnpinRegions region not found: ${regionId}`);
        if (this.layoutByRegionId.delete(regionId)) affected.push(regionId);
      }
      invariant(affected.length > 0, 'UnpinRegions has no pinned regions');
      return { operation, result: { regionIds: affected, pinned: false } };
    }

    if (operation.type === 'PinData') {
      const targets = semanticTargetIds(this.domain);
      const affected = [];
      for (const item of operation.items) {
        invariant(targets.has(item.targetId), `PinData target not found: ${item.targetId}`);
        this.dataPinByTargetId.set(item.targetId, dataPinRecord(item));
        affected.push(item.targetId);
      }
      return { operation, result: { targetIds: affected, pinned: true } };
    }

    if (operation.type === 'UnpinData') {
      const targets = semanticTargetIds(this.domain);
      const affected = [];
      for (const targetId of operation.targetIds) {
        invariant(targets.has(targetId), `UnpinData target not found: ${targetId}`);
        if (this.dataPinByTargetId.delete(targetId)) affected.push(targetId);
      }
      invariant(affected.length > 0, 'UnpinData has no pinned targets');
      return { operation, result: { targetIds: affected, pinned: false } };
    }

    if (operation.type === 'ReconnectRelation') {
      assertDataMutationAllowed(this.dataPinByTargetId, [operation.relationId]);
      const relation = this.relations.get(operation.relationId);
      invariant(relation, `ReconnectRelation relation not found: ${operation.relationId}`);
      invariant(this.regions.has(operation.from), `ReconnectRelation source not found: ${operation.from}`);
      invariant(this.regions.has(operation.to), `ReconnectRelation target not found: ${operation.to}`);
      invariant(operation.from !== operation.to, 'self relation is not allowed');
      const duplicate = [...this.relations.values()].some(
        (candidate) => candidate.id !== operation.relationId
          && candidate.from === operation.from
          && candidate.to === operation.to
          && candidate.kind === relation.kind,
      );
      invariant(!duplicate, 'same directed relation already exists');
      relation.from = operation.from;
      relation.to = operation.to;
      return {
        operation,
        result: {
          relationIds: [operation.relationId],
          reconnectedRelationId: operation.relationId,
        },
      };
    }

    const before = this.snapshotState();
    try {
      const executed = super.execute(operation);
      assertDataMutationAllowed(this.dataPinByTargetId, affectedDataIds(executed.result));
      return executed;
    } catch (error) {
      this.restoreState(before);
      throw error;
    }
  }

  fork() {
    return new SemanticDomainStore(this.domain, this.layoutSnapshot(), this.dataPinSnapshot());
  }

  toRecords() {
    return Object.freeze([
      ...super.toRecords(),
      ...this.dataPinSnapshot(),
      ...this.layoutSnapshot(),
    ]);
  }

  toJSONL() {
    const semantic = recordsToJSONL(super.toRecords());
    const constraints = [...this.dataPinSnapshot(), ...this.layoutSnapshot()];
    return constraints.length === 0
      ? semantic
      : `${semantic}${constraints.map(record => canonicalJson(record)).join('\n')}\n`;
  }
}
