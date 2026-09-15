import { SemanticDomainStore } from './authoring-store.js';
import { normalizeOperations } from './authoring-operation.js';
import { createSemanticMap } from './semantic-map.js';
import { normalizeLayoutRecords, splitStateRecords } from '../layout/state.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-reducer: ${message}`);
}

function storeFromRecords(records) {
  const { semanticRecords, layoutRecords } = splitStateRecords(structuredClone(records));
  const domain = createSemanticMap(semanticRecords);
  const layout = normalizeLayoutRecords(layoutRecords, domain);
  return new SemanticDomainStore(domain, layout);
}

export function normalizeStateRecords(records) {
  const store = storeFromRecords(records);
  return Object.freeze(store.toRecords().map(Object.freeze));
}

export function reduceOperations(records, input) {
  const operations = normalizeOperations(input);
  invariant(operations.every((operation) => operation.type !== 'CreateMap'), 'CreateMap is only valid in the first Decision');
  const store = storeFromRecords(records);
  const batch = store.performBatch(operations);
  return Object.freeze({
    records: Object.freeze(store.toRecords().map(Object.freeze)),
    entries: batch.entries,
    operations,
  });
}
