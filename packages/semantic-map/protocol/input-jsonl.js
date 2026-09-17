import {
  normalizeDataPinRecords,
  splitDataPinRecords,
  targetIdsFromRecords,
} from '../../data-pin/contract.mjs';
import { canonicalJson } from '../domain/canonical-json.js';
import { createSemanticMap, recordsToJSONL } from '../domain/semantic-map.js';
import { normalizeLayoutRecords, splitStateRecords } from '../layout/state.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-state-jsonl: ${message}`);
}

function parseLines(input) {
  return String(input ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`semantic-state-jsonl: invalid JSONL line ${index + 1}: ${error.message}`);
      }
    });
}

function semanticRecordsFromJSONL(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function normalizeStateInputRecords(records) {
  invariant(Array.isArray(records) && records.length > 0, 'records must be a non-empty array');
  const { dataRecords, dataPinRecords } = splitDataPinRecords(records);
  const { semanticRecords, layoutRecords } = splitStateRecords(dataRecords);
  const normalizedSemantic = Object.freeze(semanticRecordsFromJSONL(recordsToJSONL(semanticRecords)));
  const domain = createSemanticMap(normalizedSemantic);
  const normalizedDataPins = normalizeDataPinRecords(dataPinRecords, targetIdsFromRecords(normalizedSemantic));
  const normalizedLayout = normalizeLayoutRecords(layoutRecords, domain);
  return Object.freeze([...normalizedSemantic, ...normalizedDataPins, ...normalizedLayout]);
}

export function parseStateJSONL(input) {
  const records = parseLines(input);
  invariant(records.length > 0, 'JSONL must not be empty');
  return normalizeStateInputRecords(records);
}

export function stateRecordsToJSONL(records) {
  const normalized = normalizeStateInputRecords(records);
  return `${normalized.map((record) => canonicalJson(record)).join('\n')}\n`;
}
