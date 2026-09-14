import { executeReconnectRelation, normalizeOperations } from '../editor-core/operation.js';
import { SemanticDomainStore } from './domain-store.js';
import { createSemanticMap } from './semantic-map.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-reducer: ${message}`);
}

class SemanticDecisionStore extends SemanticDomainStore {
  execute(input) {
    if (input?.type === 'ReconnectRelation') return executeReconnectRelation(this, input);
    return super.execute(input);
  }
}

export function normalizeStateRecords(records) {
  const store = new SemanticDecisionStore(createSemanticMap(structuredClone(records)));
  return Object.freeze(store.toRecords().map(Object.freeze));
}

export function reduceOperations(records, input) {
  const operations = normalizeOperations(input);
  invariant(operations.every((operation) => operation.type !== 'CreateMap'), 'CreateMap is only valid in the first Decision');
  const store = new SemanticDecisionStore(createSemanticMap(structuredClone(records)));
  const batch = store.performBatch(operations);
  return Object.freeze({
    records: Object.freeze(store.toRecords().map(Object.freeze)),
    entries: batch.entries,
    operations,
  });
}
