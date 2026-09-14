import { EditorCore } from '../editor-core/index.js';
import { normalizeOperations } from '../editor-core/operation.js';
import { createSemanticMap } from './semantic-map.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-reducer: ${message}`);
}

export function normalizeStateRecords(records) {
  const store = EditorCore.detached(createSemanticMap(structuredClone(records)));
  return Object.freeze(store.toRecords().map(Object.freeze));
}

export function reduceOperations(records, input) {
  const operations = normalizeOperations(input);
  invariant(operations.every((operation) => operation.type !== 'CreateMap'), 'CreateMap is only valid in the first Decision');
  const store = EditorCore.detached(createSemanticMap(structuredClone(records)));
  const batch = store.performBatch(operations);
  return Object.freeze({
    records: Object.freeze(store.toRecords().map(Object.freeze)),
    entries: batch.entries,
    operations,
  });
}
