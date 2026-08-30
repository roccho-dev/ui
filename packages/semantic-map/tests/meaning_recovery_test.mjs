import assert from 'node:assert/strict';
import {
  MEANING_RECOVERY_SCHEMA,
  directMeaningCandidate,
  evaluateMeaningRecovery,
  normalizeMeaningRecoveryResult,
} from '../authoring/meaning-recovery.js';

const overlapCandidate = {
  meaning: 'partial-overlap',
  operations: [{ type: 'ConnectRegions', relationId: 'overlap', from: 'a', to: 'b', kind: 'overlapsWith', label: '' }],
  roundtrip: true,
  preserves: true,
  error: null,
};
const subsetCandidate = {
  meaning: 'subset',
  operations: [{ type: 'ConnectRegions', relationId: 'subset', from: 'a', to: 'b', kind: 'subsetOf', label: '' }],
  roundtrip: true,
  preserves: true,
  error: null,
};

const presentation = evaluateMeaningRecovery({
  currentMeaning: 'disjoint',
  observedMeaning: 'disjoint',
  possibleMeanings: ['disjoint'],
  candidates: [],
});
assert.equal(presentation.schema, MEANING_RECOVERY_SCHEMA);
assert.equal(presentation.status, 'presentation');
assert.equal(presentation.reason, 'meaning-unchanged');
assert.deepEqual(presentation.operations, []);

const candidate = evaluateMeaningRecovery({
  currentMeaning: 'disjoint',
  observedMeaning: 'partial-overlap',
  possibleMeanings: ['partial-overlap'],
  candidates: [overlapCandidate],
});
assert.equal(candidate.status, 'candidate');
assert.equal(candidate.reason, 'unique-meaning');
assert.deepEqual(candidate.candidateMeanings, ['partial-overlap']);
assert.deepEqual(candidate.operations, overlapCandidate.operations);

const boundaryReview = evaluateMeaningRecovery({
  currentMeaning: 'disjoint',
  observedMeaning: 'disjoint',
  possibleMeanings: ['disjoint', 'partial-overlap'],
  candidates: [overlapCandidate],
});
assert.equal(boundaryReview.status, 'review', 'MUTATION:meaning-recovery-ambiguity');
assert.equal(boundaryReview.reason, 'meaning-ambiguous');
assert.deepEqual(boundaryReview.operations, []);
assert.deepEqual(boundaryReview.candidateMeanings, ['partial-overlap']);

const multipleReview = evaluateMeaningRecovery({
  currentMeaning: 'disjoint',
  observedMeaning: 'partial-overlap',
  possibleMeanings: ['partial-overlap', 'subset'],
  candidates: [overlapCandidate, subsetCandidate],
});
assert.equal(multipleReview.status, 'review');
assert.deepEqual(multipleReview.candidateMeanings, ['partial-overlap', 'subset']);

const rejected = evaluateMeaningRecovery({
  currentMeaning: 'disjoint',
  observedMeaning: 'partial-overlap',
  possibleMeanings: ['partial-overlap'],
  candidates: [{ ...overlapCandidate, roundtrip: false, error: 'semantic invariant failed' }],
});
assert.equal(rejected.status, 'reject', 'MUTATION:meaning-recovery-validity-gates');
assert.equal(rejected.reason, 'meaning-unrepresentable');
assert.deepEqual(rejected.unsupportedMeanings, ['partial-overlap']);
assert.deepEqual(rejected.operations, []);

const nonSemantic = evaluateMeaningRecovery({
  declared: false,
  currentMeaning: 'disjoint',
  observedMeaning: 'partial-overlap',
  possibleMeanings: ['partial-overlap'],
  candidates: [overlapCandidate],
});
assert.equal(nonSemantic.status, 'presentation');
assert.equal(nonSemantic.reason, 'channel-not-semantic');

const unidentified = evaluateMeaningRecovery({
  identified: false,
  currentMeaning: 'disjoint',
  observedMeaning: 'partial-overlap',
  possibleMeanings: ['partial-overlap'],
  candidates: [overlapCandidate],
});
assert.equal(unidentified.status, 'reject');
assert.equal(unidentified.reason, 'target-unidentified');

const direct = directMeaningCandidate([{ type: 'RenameRegion', regionId: 'a', label: 'A2' }]);
assert.equal(direct.status, 'candidate');
assert.deepEqual(normalizeMeaningRecoveryResult(direct), direct);
assert.equal(normalizeMeaningRecoveryResult([]).status, 'presentation');
assert.throws(
  () => evaluateMeaningRecovery({
    currentMeaning: 'disjoint',
    observedMeaning: 'partial-overlap',
    possibleMeanings: ['partial-overlap'],
    candidates: [overlapCandidate, overlapCandidate],
  }),
  /candidate meanings must be unique/u,
);

console.log(JSON.stringify({
  schema: 'semantic-meaning-recovery-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  outcomes: ['presentation', 'candidate', 'review', 'reject'],
  candidateCounting: 'semantic-state-equivalence',
  acceptedMeaningMutation: false,
}));
