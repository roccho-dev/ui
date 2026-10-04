import { OPERATION_TYPES } from '../domain/index.js';
import { canonicalClone, canonicalJson, decisionId, sha256 } from '../protocol/index.js';

export const REVIEW_MODEL_SCHEMA = 'semantic-map-review-model/1';

const ENTITY_TYPES = Object.freeze(['region', 'relation']);
const PROPOSAL_OPERATION_TYPES = new Set(OPERATION_TYPES.filter((type) => type !== 'CreateMap'));

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-review-model: ${message}`);
}

function plainObject(value, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${label} must be a plain object`);
  return value;
}

function exactKeys(value, allowed, label) {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) invariant(expected.has(key), `${label}.${key} is not allowed`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function immutableClone(value) {
  return deepFreeze(canonicalClone(value));
}

function optionalText(value, label, max) {
  if (value === undefined || value === null) return null;
  invariant(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`);
  invariant(value.length <= max, `${label} is too long`);
  return value;
}

function normalizeStringList(value, label) {
  if (value === undefined || value === null) return Object.freeze([]);
  invariant(Array.isArray(value), `${label} must be an array`);
  invariant(value.length <= 64, `${label} has too many entries`);
  const normalized = value.map((item, index) => {
    invariant(typeof item === 'string' && item.trim().length > 0, `${label}[${index}] must be a non-empty string`);
    invariant(item.length <= 8_192, `${label}[${index}] is too long`);
    return item;
  });
  invariant(new Set(normalized).size === normalized.length, `${label} must be unique`);
  return Object.freeze(normalized);
}

function normalizeCurrentProof(value, base) {
  if (value === undefined || value === null) return null;
  plainObject(value, 'metadata.currentProof');
  exactKeys(value, ['verified', 'baseHead', 'baseStateHash'], 'metadata.currentProof');
  invariant(value.verified === true, 'metadata.currentProof.verified must be true');
  invariant(value.baseHead === base.head, 'metadata.currentProof.baseHead does not match the reviewed base');
  invariant(
    value.baseStateHash === base.stateHash,
    'metadata.currentProof.baseStateHash does not match the reviewed base',
  );
  return Object.freeze({
    verified: true,
    baseHead: value.baseHead,
    baseStateHash: value.baseStateHash,
  });
}

function normalizeMetadata(input, base) {
  if (input === undefined || input === null) {
    return Object.freeze({
      reason: null,
      sourceRefs: Object.freeze([]),
      assessment: null,
      currentProof: null,
    });
  }
  const value = plainObject(input, 'metadata');
  exactKeys(value, ['reason', 'sourceRefs', 'assessment', 'currentProof'], 'metadata');
  return Object.freeze({
    reason: optionalText(value.reason, 'metadata.reason', 4_000),
    sourceRefs: normalizeStringList(value.sourceRefs, 'metadata.sourceRefs'),
    assessment: optionalText(value.assessment, 'metadata.assessment', 8_000),
    currentProof: normalizeCurrentProof(value.currentProof, base),
  });
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

function recordMap(records, type) {
  invariant(Array.isArray(records), 'records must be an array');
  const result = new Map();
  for (const record of records) {
    if (record?.type !== type) continue;
    invariant(typeof record.id === 'string' && record.id.length > 0, `${type} id is required`);
    invariant(!result.has(record.id), `duplicate ${type} ${record.id}`);
    result.set(record.id, record);
  }
  return result;
}

function pathFor(parent, key, arrayIndex = false) {
  if (arrayIndex) return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function changedPaths(before, after, path = '') {
  if (canonicalJson(before) === canonicalJson(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const result = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= before.length || index >= after.length) result.push(pathFor(path, index, true));
      else result.push(...changedPaths(before[index], after[index], pathFor(path, index, true)));
    }
    return result;
  }
  const beforeObject = before && typeof before === 'object' && !Array.isArray(before);
  const afterObject = after && typeof after === 'object' && !Array.isArray(after);
  if (beforeObject && afterObject) {
    const result = [];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !(path === '' && ['type', 'id'].includes(key)))
      .sort(compareText);
    for (const key of keys) {
      const next = pathFor(path, key);
      if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key)) result.push(next);
      else result.push(...changedPaths(before[key], after[key], next));
    }
    return result;
  }
  return [path || '$'];
}

function entityDelta(type, beforeRecords, afterRecords) {
  invariant(ENTITY_TYPES.includes(type), `unsupported entity type ${type}`);
  const before = recordMap(beforeRecords, type);
  const after = recordMap(afterRecords, type);
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort(compareText);
  const changed = [];
  let unchanged = 0;
  for (const id of ids) {
    const previous = before.get(id) ?? null;
    const next = after.get(id) ?? null;
    if (previous === null) {
      changed.push(Object.freeze({
        type,
        id,
        status: 'added',
        changedFields: Object.freeze([]),
        before: null,
        after: immutableClone(next),
      }));
      continue;
    }
    if (next === null) {
      changed.push(Object.freeze({
        type,
        id,
        status: 'removed',
        changedFields: Object.freeze([]),
        before: immutableClone(previous),
        after: null,
      }));
      continue;
    }
    const fields = changedPaths(previous, next).sort(compareText);
    if (fields.length === 0) {
      unchanged += 1;
      continue;
    }
    changed.push(Object.freeze({
      type,
      id,
      status: 'changed',
      changedFields: Object.freeze(fields),
      before: immutableClone(previous),
      after: immutableClone(next),
    }));
  }
  return Object.freeze({
    changed: Object.freeze(changed),
    total: ids.length,
    unchanged,
  });
}

function semanticDelta(beforeRecords, afterRecords) {
  const regions = entityDelta('region', beforeRecords, afterRecords);
  const relations = entityDelta('relation', beforeRecords, afterRecords);
  const counts = { regions: {}, relations: {} };
  for (const status of ['added', 'removed', 'changed']) {
    counts.regions[status] = regions.changed.filter((item) => item.status === status).length;
    counts.relations[status] = relations.changed.filter((item) => item.status === status).length;
  }
  counts.regions.unchanged = regions.unchanged;
  counts.relations.unchanged = relations.unchanged;
  const changeCount = regions.changed.length + relations.changed.length;
  return Object.freeze({
    regions: regions.changed,
    relations: relations.changed,
    counts: Object.freeze({
      regions: Object.freeze(counts.regions),
      relations: Object.freeze(counts.relations),
      changed: changeCount,
    }),
    netNoop: changeCount === 0,
  });
}

function recordFromRegion(region) {
  const result = {
    type: 'region',
    id: region.id,
    parent: region.parent,
    label: region.label,
    kind: region.kind,
    bounds: [region.bounds.x, region.bounds.y, region.bounds.width, region.bounds.height],
    summary: region.summary,
  };
  for (const key of ['order', 'value', 'temporal', 'href', 'mount', 'set', 'image']) {
    if (Object.hasOwn(region, key)) result[key] = canonicalClone(region[key]);
  }
  return result;
}

function recordsFromSnapshot(snapshot) {
  plainObject(snapshot, 'entry snapshot');
  const meta = plainObject(snapshot.meta, 'entry snapshot.meta');
  invariant(Array.isArray(snapshot.regions), 'entry snapshot.regions must be an array');
  invariant(Array.isArray(snapshot.relations), 'entry snapshot.relations must be an array');
  const metaRecord = { type: 'meta', ...canonicalClone(meta) };
  return [
    metaRecord,
    ...snapshot.regions.map(recordFromRegion),
    ...snapshot.relations.map((relation) => ({ type: 'relation', ...canonicalClone(relation) })),
  ];
}

function effectSubjects(delta) {
  const subject = (entry) => {
    if (entry.status === 'added') return `+${entry.type}:${entry.id}`;
    if (entry.status === 'removed') return `-${entry.type}:${entry.id}`;
    return `~${entry.type}:${entry.id}[${entry.changedFields.join(',')}]`;
  };
  return [...delta.regions, ...delta.relations].map(subject);
}

function traceEntry(entry, index) {
  plainObject(entry, `entries[${index}]`);
  const operation = plainObject(entry.operation, `entries[${index}].operation`);
  invariant(
    PROPOSAL_OPERATION_TYPES.has(operation.type),
    `entries[${index}] uses unsupported proposal Operation ${operation.type}`,
  );
  const effect = semanticDelta(recordsFromSnapshot(entry.before), recordsFromSnapshot(entry.after));
  const subjects = effectSubjects(effect);
  return Object.freeze({
    index,
    type: operation.type,
    operation: immutableClone(operation),
    result: immutableClone(entry.result ?? {}),
    effect,
    summary: `${operation.type} · ${subjects.length ? subjects.join(', ') : 'net no-op'}`,
  });
}

export function createSemanticDelta(beforeRecords, afterRecords) {
  return semanticDelta(beforeRecords, afterRecords);
}

export async function createSemanticReviewModel({
  preview,
  metadata = null,
  currentProofVerifier = null,
} = {}) {
  const value = plainObject(preview, 'preview');
  const base = plainObject(value.base, 'preview.base');
  const proposal = plainObject(value.proposal, 'preview.proposal');
  invariant(Array.isArray(base.records), 'preview.base.records must be an array');
  invariant(Array.isArray(value.records), 'preview.records must be an array');
  invariant(Array.isArray(value.entries), 'preview.entries must be an array');
  const verified = plainObject(value.verified, 'preview.verified');
  invariant(verified.head === value.head, 'verified head does not match preview head');
  invariant(verified.stateHash === value.stateHash, 'verified stateHash does not match preview stateHash');
  invariant(
    canonicalJson(verified.records) === canonicalJson(value.records),
    'verified records do not match preview records',
  );
  invariant(proposal.parent === base.head, 'proposal parent does not match base head');
  invariant(proposal.stateHash === value.stateHash, 'proposal stateHash does not match preview stateHash');

  const proposalId = await decisionId(proposal);
  invariant(value.decisionId === proposalId, 'preview decisionId does not match Proposal');
  invariant(value.head === proposalId, 'preview head does not match Proposal');

  const normalizedMetadata = normalizeMetadata(metadata, base);
  if (normalizedMetadata.currentProof) {
    invariant(typeof currentProofVerifier === 'function', 'current proof requires an upstream verifier');
    const currentVerified = await currentProofVerifier(normalizedMetadata.currentProof, Object.freeze({
      baseHead: base.head,
      baseStateHash: base.stateHash,
    }));
    invariant(currentVerified === true, 'current proof was not verified by the upstream boundary');
  }
  const proposalDigest = await sha256(canonicalJson({
    proposal,
    review: normalizedMetadata,
  }));
  const delta = semanticDelta(base.records, value.records);
  const trace = Object.freeze(value.entries.map(traceEntry));

  return Object.freeze({
    schema: REVIEW_MODEL_SCHEMA,
    authority: false,
    status: 'proposal',
    baseLabel: normalizedMetadata.currentProof ? 'current' : 'base',
    identities: Object.freeze({
      baseHead: base.head,
      baseStateHash: base.stateHash,
      proposalParent: proposal.parent,
      proposalStateHash: proposal.stateHash,
      proposalId,
      proposalDigest,
      afterHead: value.head,
      afterStateHash: value.stateHash,
    }),
    provenance: Object.freeze({
      reason: normalizedMetadata.reason,
      sourceRefs: normalizedMetadata.sourceRefs,
      assessment: normalizedMetadata.assessment,
      currentProof: normalizedMetadata.currentProof,
    }),
    delta,
    trace,
    decorations: Object.freeze({
      regions: Object.freeze(delta.regions.map((entry) => Object.freeze({
        id: entry.id,
        status: entry.status,
        changedFields: entry.changedFields,
      }))),
      relations: Object.freeze(delta.relations.map((entry) => Object.freeze({
        id: entry.id,
        status: entry.status,
        changedFields: entry.changedFields,
      }))),
    }),
  });
}
