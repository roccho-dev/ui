import {
  normalizeDataPinRecords,
  splitDataPinRecords,
  targetIdsFromRecords,
} from '../../data-pin/contract.mjs';
import { SemanticDomainStore } from './authoring-store.js';
import { normalizeOperations } from './authoring-operation.js';
import { createSemanticMap } from './semantic-map.js';
import { normalizeLayoutRecords, splitStateRecords } from '../layout/state.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-reducer: ${message}`);
}

function storeFromRecords(records) {
  const { dataRecords, dataPinRecords } = splitDataPinRecords(structuredClone(records));
  const { semanticRecords, layoutRecords } = splitStateRecords(dataRecords);
  const domain = createSemanticMap(semanticRecords);
  const layout = normalizeLayoutRecords(layoutRecords, domain);
  const pins = normalizeDataPinRecords(
    dataPinRecords,
    dataPinRecords.length > 0 ? targetIdsFromRecords(semanticRecords) : null,
  );
  return new SemanticDomainStore(domain, layout, pins);
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
