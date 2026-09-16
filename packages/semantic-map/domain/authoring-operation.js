import {
  MAX_DECISION_OPERATIONS,
  OPERATION_TYPES as BASE_OPERATION_TYPES,
  isOperationType as isBaseOperationType,
  normalizeOperation as normalizeBaseOperation,
} from './operation.js';

export { MAX_DECISION_OPERATIONS };
export const OPERATION_TYPES = Object.freeze([
  ...BASE_OPERATION_TYPES,
  'ReconnectRelation',
  'PinRegions',
  'UnpinRegions',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-operation: ${message}`);
}

function plainObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
}

function exactKeys(value, required, name) {
  const expected = new Set(required);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(expected.has(key), `${name}.${key} is not allowed`);
}

function semanticId(value, name) {
  invariant(typeof value === 'string' && value.length > 0, `${name} must be a non-empty string`);
  invariant(value.length <= 240, `${name} is too long`);
  invariant(!value.startsWith('@mount/'), `${name} uses reserved @mount/ namespace`);
  return value;
}

function finite(value, name) {
  invariant(typeof value === 'number' && Number.isFinite(value), `${name} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}

function normalizeBounds(value, name) {
  invariant(Array.isArray(value) && value.length === 4, `${name} must be [x,y,w,h]`);
  const normalized = value.map((item, index) => finite(item, `${name}[${index}]`));
  invariant(normalized[2] >= 24 && normalized[3] >= 18, `${name} is too small`);
  return Object.freeze(normalized);
}

function normalizeIds(value, name) {
  invariant(Array.isArray(value) && value.length > 0, `${name} must be a non-empty array`);
  const result = value.map((item, index) => semanticId(item, `${name}[${index}]`));
  invariant(new Set(result).size === result.length, `${name} contains duplicates`);
  return Object.freeze(result);
}

function normalizePinRegions(input) {
  const value = plainObject(input, 'PinRegions');
  exactKeys(value, ['type', 'items'], 'PinRegions');
  invariant(Array.isArray(value.items) && value.items.length > 0, 'PinRegions.items must be a non-empty array');
  const seen = new Set();
  const items = value.items.map((item, index) => {
    plainObject(item, `PinRegions.items[${index}]`);
    exactKeys(item, ['regionId', 'bounds'], `PinRegions.items[${index}]`);
    const regionId = semanticId(item.regionId, `PinRegions.items[${index}].regionId`);
    invariant(!seen.has(regionId), `PinRegions.items contains duplicate ${regionId}`);
    seen.add(regionId);
    return Object.freeze({
      regionId,
      bounds: normalizeBounds(item.bounds, `PinRegions.items[${index}].bounds`),
    });
  });
  return Object.freeze({ type: 'PinRegions', items: Object.freeze(items) });
}

function normalizeUnpinRegions(input) {
  const value = plainObject(input, 'UnpinRegions');
  exactKeys(value, ['type', 'regionIds'], 'UnpinRegions');
  return Object.freeze({ type: 'UnpinRegions', regionIds: normalizeIds(value.regionIds, 'UnpinRegions.regionIds') });
}

export function isOperationType(value) {
  return value === 'ReconnectRelation'
    || value === 'PinRegions'
    || value === 'UnpinRegions'
    || isBaseOperationType(value);
}

export function normalizeOperation(input) {
  if (input?.type === 'PinRegions') return normalizePinRegions(input);
  if (input?.type === 'UnpinRegions') return normalizeUnpinRegions(input);
  if (input?.type !== 'ReconnectRelation') return normalizeBaseOperation(input);
  const value = plainObject(input, 'operation');
  exactKeys(value, ['type', 'relationId', 'from', 'to'], 'ReconnectRelation');
  return Object.freeze({
    type: 'ReconnectRelation',
    relationId: semanticId(value.relationId, 'ReconnectRelation.relationId'),
    from: semanticId(value.from, 'ReconnectRelation.from'),
    to: semanticId(value.to, 'ReconnectRelation.to'),
  });
}

export function normalizeOperations(input) {
  invariant(Array.isArray(input) && input.length > 0, 'operations must be a non-empty array');
  invariant(input.length <= MAX_DECISION_OPERATIONS, `operations exceed ${MAX_DECISION_OPERATIONS}`);
  return Object.freeze(input.map((operation) => normalizeOperation(operation)));
}
