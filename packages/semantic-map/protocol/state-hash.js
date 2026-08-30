import { normalizeStateRecords, recordsToJSONL } from '../domain/index.js';
import { sha256 } from './sha256.js';

export async function stateHash(records) {
  return sha256(recordsToJSONL(normalizeStateRecords(records)));
}
