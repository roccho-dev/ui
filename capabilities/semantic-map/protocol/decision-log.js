import { canonicalJson, MAX_DECISION_OPERATIONS, normalizeOperations, normalizeStateRecords, reduceOperations } from '../domain/index.js';
import { stateHash } from './state-hash.js';
import { SHA256_PATTERN, sha256 } from './sha256.js';

export const DECISION_SCHEMA = 'semantic-map-decision/2';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-decision-log: ${message}`);
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

export function normalizeDecision(input) {
  const value = plainObject(input, 'Decision');
  exactKeys(value, ['schema', 'parent', 'operations', 'stateHash'], 'Decision');
  invariant(value.schema === DECISION_SCHEMA, `schema ${value.schema} is not ${DECISION_SCHEMA}`);
  invariant(value.parent === null || SHA256_PATTERN.test(value.parent), 'parent must be null or sha256');
  const operations = normalizeOperations(value.operations);
  invariant(operations.length <= MAX_DECISION_OPERATIONS, `operations exceed ${MAX_DECISION_OPERATIONS}`);
  invariant(SHA256_PATTERN.test(value.stateHash), 'stateHash must be sha256');
  return Object.freeze({ schema: value.schema, parent: value.parent, operations, stateHash: value.stateHash });
}

export function decisionLine(input) {
  return canonicalJson(normalizeDecision(input));
}

export async function decisionId(input) {
  return sha256(decisionLine(input));
}

export function parseDecisionLog(input) {
  const text = String(input ?? '');
  invariant(text.length > 0, 'log must not be empty');
  invariant(text.endsWith('\n'), 'log must end with LF');
  invariant(!text.includes('\r'), 'log must use LF line endings');
  const lines = text.slice(0, -1).split('\n');
  invariant(lines.every((line) => line.length > 0), 'log must not contain blank lines');
  return Object.freeze(lines.map((line, index) => {
    try {
      const decision = normalizeDecision(JSON.parse(line));
      invariant(line === canonicalJson(decision), `line ${index + 1} is not canonical JSON`);
      return decision;
    } catch (error) {
      throw new Error(`semantic-decision-log: invalid line ${index + 1}: ${error.message}`);
    }
  }));
}

export async function verifyDecisionLog(input) {
  const log = String(input ?? '');
  const decisions = parseDecisionLog(log);
  let records = null;
  let mapId = null;
  let parent = null;
  let currentStateHash = null;
  const ids = [];
  const seen = new Set();

  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index];
    invariant(decision.parent === parent, `line ${index + 1} parent does not match current head`);
    const createOperations = decision.operations.filter((operation) => operation.type === 'CreateMap');
    if (index === 0) {
      invariant(decision.operations.length === 1 && createOperations.length === 1, 'first Decision must contain only CreateMap');
      mapId = createOperations[0].mapId;
      records = normalizeStateRecords(createOperations[0].records);
    } else {
      invariant(createOperations.length === 0, 'CreateMap is only valid in the first Decision');
      records = reduceOperations(records, decision.operations).records;
    }
    currentStateHash = await stateHash(records);
    invariant(decision.stateHash === currentStateHash, `line ${index + 1} stateHash ${decision.stateHash} is not ${currentStateHash}`);
    const id = await decisionId(decision);
    invariant(!seen.has(id), `duplicate Decision ${id}`);
    seen.add(id);
    ids.push(id);
    parent = id;
  }

  return Object.freeze({
    log,
    decisions,
    ids: Object.freeze(ids),
    head: parent,
    mapId,
    records,
    stateHash: currentStateHash,
  });
}

export async function createDecisionLog(records, mapId) {
  const normalizedRecords = normalizeStateRecords(records);
  const decision = normalizeDecision({
    schema: DECISION_SCHEMA,
    parent: null,
    operations: [{ type: 'CreateMap', mapId, records: normalizedRecords }],
    stateHash: await stateHash(normalizedRecords),
  });
  const log = `${decisionLine(decision)}\n`;
  return verifyDecisionLog(log);
}

export async function createDecision(parent, operations, baseRecords) {
  invariant(SHA256_PATTERN.test(parent), 'parent must be the current head');
  const reduced = reduceOperations(baseRecords, operations);
  const decision = normalizeDecision({
    schema: DECISION_SCHEMA,
    parent,
    operations: reduced.operations,
    stateHash: await stateHash(reduced.records),
  });
  return Object.freeze({ decision, records: reduced.records, entries: reduced.entries });
}

export async function previewDecision(logInput, proposalInput) {
  const base = await verifyDecisionLog(logInput);
  const proposal = normalizeDecision(proposalInput);
  invariant(proposal.parent === base.head, `proposal parent ${proposal.parent} is not head ${base.head}`);
  invariant(proposal.operations.every((operation) => operation.type !== 'CreateMap'), 'proposal must not contain CreateMap');
  const reduced = reduceOperations(base.records, proposal.operations);
  const expected = await stateHash(reduced.records);
  invariant(proposal.stateHash === expected, `proposal stateHash ${proposal.stateHash} is not ${expected}`);
  const id = await decisionId(proposal);
  const nextLog = `${base.log}${decisionLine(proposal)}\n`;
  return Object.freeze({
    base,
    proposal,
    decisionId: id,
    log: nextLog,
    head: id,
    records: reduced.records,
    stateHash: expected,
    entries: reduced.entries,
  });
}

export async function appendDecision(logInput, proposalInput) {
  const preview = await previewDecision(logInput, proposalInput);
  const verified = await verifyDecisionLog(preview.log);
  invariant(verified.head === preview.head, 'appended head verification failed');
  return Object.freeze({ ...preview, verified });
}
