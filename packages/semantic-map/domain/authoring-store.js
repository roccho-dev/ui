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

export class SemanticDomainStore extends BaseSemanticDomainStore {
  constructor(initialDomain, initialLayoutRecords = []) {
    super(initialDomain);
    this.layoutByRegionId = layoutMap(initialLayoutRecords, initialDomain);
  }

  get layoutHints() {
    return new Map(this.layoutByRegionId);
  }

  layoutSnapshot() {
    return layoutRecordsFromMap(this.layoutByRegionId);
  }

  snapshotState() {
    return {
      ...super.snapshotState(),
      layout: this.layoutSnapshot(),
    };
  }

  restoreState(snapshot) {
    super.restoreState(snapshot);
    this.layoutByRegionId = layoutMap(snapshot.layout ?? [], this.domain);
  }

  replaceRecords(records, { notify = true } = {}) {
    const { semanticRecords, layoutRecords } = splitStateRecords(records);
    const domain = createSemanticMap(semanticRecords);
    const normalizedLayout = normalizeLayoutRecords(layoutRecords, domain);
    super.replaceDomain(domain, { notify: false });
    this.layoutByRegionId = layoutMap(normalizedLayout, domain);
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

    if (operation.type !== 'ReconnectRelation') return super.execute(operation);
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

  fork() {
    return new SemanticDomainStore(this.domain, this.layoutSnapshot());
  }

  toRecords() {
    return Object.freeze([...super.toRecords(), ...this.layoutSnapshot()]);
  }

  toJSONL() {
    const semantic = recordsToJSONL(super.toRecords());
    const layout = this.layoutSnapshot();
    return layout.length === 0
      ? semantic
      : `${semantic}${layout.map((record) => canonicalJson(record)).join('\n')}\n`;
  }
}
