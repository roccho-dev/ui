export const MEANING_RECOVERY_SCHEMA = 'semantic-meaning-recovery/1';
export const MEANING_RECOVERY_STATUSES = Object.freeze([
  'presentation',
  'candidate',
  'review',
  'reject',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-meaning-recovery: ${message}`);
}

function optionalText(value, label) {
  invariant(value === null || (typeof value === 'string' && value.length > 0), `${label} must be null or non-empty text`);
  return value;
}

function text(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be non-empty text`);
  return value;
}

function uniqueText(values, label) {
  invariant(Array.isArray(values), `${label} must be an array`);
  const normalized = values.map((value, index) => text(value, `${label}[${index}]`));
  invariant(new Set(normalized).size === normalized.length, `${label} must be unique`);
  return Object.freeze(normalized);
}

function operations(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return Object.freeze(value.map((operation, index) => {
    invariant(operation && typeof operation === 'object' && !Array.isArray(operation), `${label}[${index}] must be an object`);
    return Object.freeze(structuredClone(operation));
  }));
}

function candidate(value, index) {
  const label = `candidates[${index}]`;
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const meaning = text(value.meaning, `${label}.meaning`);
  invariant(typeof value.roundtrip === 'boolean', `${label}.roundtrip must be boolean`);
  invariant(typeof value.preserves === 'boolean', `${label}.preserves must be boolean`);
  invariant(value.error === null || typeof value.error === 'string', `${label}.error must be null or text`);
  return Object.freeze({
    meaning,
    operations: operations(value.operations ?? [], `${label}.operations`),
    roundtrip: value.roundtrip,
    preserves: value.preserves,
    error: value.error,
  });
}

function frozenEvidence(value) {
  if (value === null || value === undefined) return null;
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'evidence must be an object');
  return Object.freeze(structuredClone(value));
}

function candidateIsValid(item) {
  // MUTATION:meaning-recovery-validity-gates
  return Boolean(item && item.error === null && item.roundtrip && item.preserves);
}

function result({
  status,
  reason,
  currentMeaning = null,
  observedMeaning = null,
  possibleMeanings = [],
  candidates = [],
  unsupportedMeanings = [],
  operations: selectedOperations = [],
  evidence = null,
}) {
  invariant(MEANING_RECOVERY_STATUSES.includes(status), `unsupported status ${status}`);
  const normalizedCandidates = candidates.map(candidate);
  invariant(
    new Set(normalizedCandidates.map((item) => item.meaning)).size === normalizedCandidates.length,
    'candidate meanings must be unique',
  );
  return Object.freeze({
    schema: MEANING_RECOVERY_SCHEMA,
    status,
    reason: text(reason, 'reason'),
    currentMeaning: optionalText(currentMeaning, 'currentMeaning'),
    observedMeaning: optionalText(observedMeaning, 'observedMeaning'),
    possibleMeanings: uniqueText(possibleMeanings, 'possibleMeanings'),
    candidateMeanings: Object.freeze(normalizedCandidates.map((item) => item.meaning)),
    unsupportedMeanings: uniqueText(unsupportedMeanings, 'unsupportedMeanings'),
    operations: operations(selectedOperations, 'operations'),
    candidates: Object.freeze(normalizedCandidates),
    evidence: frozenEvidence(evidence),
  });
}

export function createMeaningRecoveryResult(input) {
  return result(input);
}

export function directMeaningCandidate(inputOperations, options = {}) {
  return result({
    status: inputOperations.length === 0 ? 'presentation' : 'candidate',
    reason: options.reason ?? (inputOperations.length === 0 ? 'meaning-unchanged' : 'direct-semantic-operation'),
    operations: inputOperations,
    evidence: options.evidence ?? null,
  });
}

export function evaluateMeaningRecovery(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'input must be an object');
  const declared = input.declared !== false;
  const identified = input.identified !== false;
  const currentMeaning = text(input.currentMeaning, 'currentMeaning');
  const observedMeaning = text(input.observedMeaning, 'observedMeaning');
  const possibleMeanings = uniqueText(input.possibleMeanings, 'possibleMeanings');
  invariant(possibleMeanings.length > 0, 'possibleMeanings must not be empty');
  invariant(possibleMeanings.includes(observedMeaning), 'observedMeaning must be possible');
  const normalizedCandidates = (input.candidates ?? []).map(candidate);
  invariant(
    new Set(normalizedCandidates.map((item) => item.meaning)).size === normalizedCandidates.length,
    'candidate meanings must be unique',
  );
  const evidence = input.evidence ?? null;

  if (!declared) {
    return result({
      status: 'presentation',
      reason: 'channel-not-semantic',
      currentMeaning,
      observedMeaning,
      possibleMeanings,
      candidates: normalizedCandidates,
      evidence,
    });
  }
  if (!identified) {
    return result({
      status: 'reject',
      reason: 'target-unidentified',
      currentMeaning,
      observedMeaning,
      possibleMeanings,
      candidates: normalizedCandidates,
      evidence,
    });
  }

  const changedMeanings = possibleMeanings.filter((meaning) => meaning !== currentMeaning);
  if (changedMeanings.length === 0) {
    return result({
      status: 'presentation',
      reason: 'meaning-unchanged',
      currentMeaning,
      observedMeaning,
      possibleMeanings,
      candidates: normalizedCandidates,
      evidence,
    });
  }

  const candidatesByMeaning = new Map(normalizedCandidates.map((item) => [item.meaning, item]));
  const validCandidates = changedMeanings
    .map((meaning) => candidatesByMeaning.get(meaning) ?? null)
    .filter(candidateIsValid);
  const unsupportedMeanings = changedMeanings.filter((meaning) => (
    !candidateIsValid(candidatesByMeaning.get(meaning))
  ));

  if (possibleMeanings.length > 1 || changedMeanings.length > 1) {
    return result({
      status: 'review',
      reason: 'meaning-ambiguous',
      currentMeaning,
      observedMeaning,
      possibleMeanings,
      candidates: validCandidates,
      unsupportedMeanings,
      evidence,
    });
  }

  if (validCandidates.length !== 1 || unsupportedMeanings.length > 0) {
    return result({
      status: 'reject',
      reason: 'meaning-unrepresentable',
      currentMeaning,
      observedMeaning,
      possibleMeanings,
      candidates: validCandidates,
      unsupportedMeanings,
      evidence,
    });
  }

  return result({
    status: 'candidate',
    reason: 'unique-meaning',
    currentMeaning,
    observedMeaning,
    possibleMeanings,
    candidates: validCandidates,
    operations: validCandidates[0].operations,
    evidence,
  });
}

export function normalizeMeaningRecoveryResult(value) {
  if (Array.isArray(value)) return directMeaningCandidate(value);
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'translation result must be an object or operation array');
  invariant(value.schema === MEANING_RECOVERY_SCHEMA, `schema must be ${MEANING_RECOVERY_SCHEMA}`);
  return result(value);
}
