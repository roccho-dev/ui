import { normalizeStateRecords } from '../domain/index.js';
import { stateRecordsToJSONL } from './input-jsonl.js';
import { sha256 } from './sha256.js';

export async function stateHash(records) {
  return sha256(stateRecordsToJSONL(normalizeStateRecords(records)));
}
