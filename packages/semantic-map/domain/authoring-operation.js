import {
  MAX_DECISION_OPERATIONS,
  OPERATION_TYPES as BASE_OPERATION_TYPES,
  isOperationType as isBaseOperationType,
  normalizeOperation as normalizeBaseOperation,
} from './operation.js';

export { MAX_DECISION_OPERATIONS };
export const OPERATION_TYPES = Object.freeze([...BASE_OPERATION_TYPES, 'ReconnectRelation']);

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

export function isOperationType(value) {
  return value === 'ReconnectRelation' || isBaseOperationType(value);
}

export function normalizeOperation(input) {
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
