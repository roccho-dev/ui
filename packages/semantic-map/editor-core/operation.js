import {
  MAX_DECISION_OPERATIONS,
  OPERATION_TYPES as BASE_OPERATION_TYPES,
  isOperationType as isBaseOperationType,
  normalizeOperation as normalizeBaseOperation,
} from '../domain/operation.js';

export { MAX_DECISION_OPERATIONS };

export const OPERATION_TYPES = Object.freeze([
  ...BASE_OPERATION_TYPES,
  'ReconnectRelation',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-operation: ${message}`);
}

function semanticId(value, name) {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= 240, `${name} must be a non-empty string`);
  invariant(!value.startsWith('@mount/'), `${name} uses reserved @mount/ namespace`);
  return value;
}

export function isOperationType(value) {
  return value === 'ReconnectRelation' || isBaseOperationType(value);
}

export function normalizeOperation(input) {
  if (input?.type !== 'ReconnectRelation') return normalizeBaseOperation(input);
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'operation must be an object');
  const keys = Object.keys(input);
  for (const key of ['type', 'relationId', 'from', 'to']) invariant(Object.hasOwn(input, key), `ReconnectRelation.${key} is required`);
  for (const key of keys) invariant(['type', 'relationId', 'from', 'to'].includes(key), `ReconnectRelation.${key} is not allowed`);
  return Object.freeze({
    type: 'ReconnectRelation',
    relationId: semanticId(input.relationId, 'ReconnectRelation.relationId'),
    from: semanticId(input.from, 'ReconnectRelation.from'),
    to: semanticId(input.to, 'ReconnectRelation.to'),
  });
}

export function executeReconnectRelation(store, input) {
  const operation = normalizeOperation(input);
  invariant(operation.type === 'ReconnectRelation', 'ReconnectRelation operation is required');
  invariant(store && store.relations instanceof Map && store.regions instanceof Map, 'semantic store is required');
  const relation = store.relations.get(operation.relationId);
  invariant(relation, `ReconnectRelation relation not found: ${operation.relationId}`);
  invariant(store.regions.has(operation.from), `ReconnectRelation source not found: ${operation.from}`);
  invariant(store.regions.has(operation.to), `ReconnectRelation target not found: ${operation.to}`);
  invariant(operation.from !== operation.to, 'ReconnectRelation self relation is not allowed');
  const duplicate = [...store.relations.values()].some((candidate) => (
    candidate.id !== operation.relationId
    && candidate.from === operation.from
    && candidate.to === operation.to
    && candidate.kind === relation.kind
  ));
  invariant(!duplicate, 'ReconnectRelation would duplicate another directed relation');
  relation.from = operation.from;
  relation.to = operation.to;
  return {
    operation,
    result: {
      relationIds: [relation.id],
      reconnectedRelationId: relation.id,
      from: relation.from,
      to: relation.to,
    },
  };
}

export function normalizeOperations(input) {
  invariant(Array.isArray(input) && input.length > 0, 'operations must be a non-empty array');
  invariant(input.length <= MAX_DECISION_OPERATIONS, `operations exceed ${MAX_DECISION_OPERATIONS}`);
  return Object.freeze(input.map((operation) => normalizeOperation(operation)));
}
