// Pure World input contract checks. No browser, build, host or network is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_WORLD_KIND, containmentIndex, entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld } from '../packages/control/src/atlas-world-projection.mjs';

const fixture = JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8'));

const setField = (input, keys, value) => {
  const owner = keys.slice(0, -1).reduce((record, key) => record[key], input);
  if (value === undefined) delete owner[keys.at(-1)];
  else owner[keys.at(-1)] = value;
};

// The public normalizer must accept its own output and preserve values through
// the same JSON boundary used by embedded app input and full snapshots.
const assertStable = (input, label) => {
  const before = structuredClone(input);
  const normalized = parseAtlasWorldInput(input);
  assert.deepEqual(input, before, label + ': input is not mutated');
  assert.deepEqual(parseAtlasWorldInput(normalized), normalized, label + ': normalized input is stable');
  assert.deepEqual(parseAtlasWorldInput(JSON.stringify(normalized)), normalized, label + ': normalized JSON is stable');
  assert.deepEqual(parseAtlasWorldInput(JSON.stringify(input)), normalized, label + ': input JSON has the same meaning');
  return normalized;
};

const normalizedFixture = assertStable(fixture, 'checked-in fixture');
assert.equal(normalizedFixture.kind, ATLAS_WORLD_KIND);
assert.equal(normalizedFixture.authority, false);

const optionalFields = [
  { path: ['note'], at: 'input.note' },
  { path: ['frames', 0, 'relations', 0, 'label'], at: 'frames[0].relations[0].label' },
  // summary already allowed empty text; sharing its helper must preserve that contract.
  { path: ['frames', 0, 'entities', 0, 'summary'], at: 'frames[0].entities[0].summary' },
];
const textCases = [
  ['omitted', undefined],
  ['null', null],
  ['empty', ''],
  ['non-empty', '  preserved text / λ  '],
];

for (const field of optionalFields) {
  for (const [name, value] of textCases) {
    const input = structuredClone(fixture);
    const expected = structuredClone(normalizedFixture);
    setField(input, field.path, value);
    setField(expected, field.path, value ?? '');
    const label = field.at + ': ' + name;
    assert.deepEqual(assertStable(input, label), expected, label + ': only the optional text changes');
  }
}

const bothOmitted = structuredClone(fixture);
const bothExpected = structuredClone(normalizedFixture);
for (const field of optionalFields.slice(0, 2)) {
  setField(bothOmitted, field.path, undefined);
  setField(bothExpected, field.path, '');
}
assert.deepEqual(assertStable(bothOmitted, 'both optional fields omitted'), bothExpected);

const invalidTypes = [0, false, [], {}];
for (const field of optionalFields) {
  for (const value of invalidTypes) {
    const input = structuredClone(fixture);
    setField(input, field.path, value);
    assert.throws(() => parseAtlasWorldInput(input),
      { message: 'atlas-world: ' + field.at + ' must be text' },
      field.at + ': rejects ' + JSON.stringify(value));
  }
}

// Required text keeps its non-empty contract; optional text must not weaken it.
const requiredFields = [
  { path: ['frames', 0, 'entities', 0, 'ref', 'space'], at: 'frames[0].entities[0].ref.space' },
  { path: ['frames', 0, 'entities', 0, 'ref', 'kind'], at: 'frames[0].entities[0].ref.kind' },
  { path: ['frames', 0, 'entities', 0, 'ref', 'id'], at: 'frames[0].entities[0].ref.id' },
  { path: ['frames', 0, 'entities', 0, 'label'], at: 'frames[0].entities[0].label' },
  { path: ['frames', 0, 'relations', 0, 'kind'], at: 'frames[0].relations[0].kind' },
];
for (const field of requiredFields) {
  for (const value of [undefined, null, '', ...invalidTypes]) {
    const input = structuredClone(fixture);
    setField(input, field.path, value);
    assert.throws(() => parseAtlasWorldInput(input),
      { message: 'atlas-world: ' + field.at + ' must be non-empty text' },
      field.at + ': rejects ' + JSON.stringify(value));
  }
}
for (const value of [undefined, null, '', ...invalidTypes, 'ui.atlasWorldInput.v0']) {
  const input = structuredClone(fixture);
  setField(input, ['kind'], value);
  assert.throws(() => parseAtlasWorldInput(input),
    { message: 'atlas-world: input.kind must be ' + ATLAS_WORLD_KIND },
    'input.kind: rejects ' + JSON.stringify(value));
}

// Pure assertions formerly embedded in the browser gate have one Node owner.
const rejectInput = (name, error, mutate) => {
  const input = structuredClone(fixture);
  mutate(input);
  assert.throws(() => parseAtlasWorldInput(input), error, name);
};
rejectInput('reversed frame history', /frames\[\] rev must be strictly increasing/u, input => input.frames.reverse());
rejectInput('invalid frame asOf', /asOf must be a parseable instant/u, input => { input.frames[0].asOf = 'not-an-instant'; });

const afterContainment = containmentIndex(normalizedFixture.frames.at(-1));
const teamAgent1Evidence = afterContainment.evidenceByChild.get('entity:agents:agent:agent.1') ?? [];
assert.equal(teamAgent1Evidence.length, 2, 'duplicate same-parent evidence is preserved');
assert.ok(teamAgent1Evidence.some(id => id.includes('team.agent1.containment.1')));
assert.ok(teamAgent1Evidence.some(id => id.includes('team.agent1.containment.2')));

rejectInput('distinct multi-parent containment', /distinct multi-parent containment unsupported/u, input => {
  const frame = input.frames.at(-1);
  frame.relations.push({
    ...structuredClone(frame.relations.find(item => item.ref.id === 'team.agent1.containment.1')),
    ref: { space: 'world-relation', kind: 'contains', id: 'invalid.multi-parent' },
    from: { space: 'agents', kind: 'agent', id: 'shared' },
    to: { space: 'agents', kind: 'agent', id: 'agent.1' },
    containment: 'from-contains-to',
  });
});
rejectInput('self containment', /containment cannot self-parent/u, input => {
  const relation = input.frames.at(-1).relations.find(item => item.ref.id === 'team.agent1.containment.1');
  relation.from = structuredClone(relation.to);
});
rejectInput('containment cycle', /containment cycle/u, input => {
  const frame = input.frames.at(-1);
  frame.relations.push({
    ...structuredClone(frame.relations.find(item => item.ref.id === 'team.agent1.containment.1')),
    ref: { space: 'world-relation', kind: 'contains', id: 'invalid.cycle' },
    from: { space: 'agents', kind: 'agent', id: 'agent.1' },
    to: { space: 'agents', kind: 'actor', id: 'team.atlas' },
    containment: 'from-contains-to',
  });
});
rejectInput('cross-area containment', /containment must remain inside one presentation area/u, input => {
  const frame = input.frames.at(-1);
  frame.relations.push({
    ...structuredClone(frame.relations.find(item => item.ref.id === 'team.agent1.containment.1')),
    ref: { space: 'world-relation', kind: 'contains', id: 'invalid.cross-area' },
    from: { space: 'projects', kind: 'project', id: 'project.a' },
    to: { space: 'agents', kind: 'agent', id: 'agent.1' },
    containment: 'from-contains-to',
  });
});
rejectInput('unknown containment orientation', /containment must be from-contains-to\|to-contains-from\|null/u, input => {
  input.frames.at(-1).relations.find(item => item.ref.id === 'team.agent1.containment.1').containment = 'primary';
});

for (const frame of normalizedFixture.frames) {
  const records = [...frame.entities, ...frame.relations].filter(item => item.ref.space.startsWith('example-'));
  assert.equal(records.length, 16, 'synthetic Issue/Package fixture record count');
  assert.ok(records.every(item => item.source?.kind === 'synthetic'
    && item.flags.includes('synthetic') && item.flags.includes('proposal')
    && item.time.observedAt === null && item.time.acquiredAt === null && item.time.effectiveAt === null),
  'example records remain synthetic proposals with unknown observation time');
  const tracks = frame.relations.filter(item => item.ref.space === 'example-relations' && item.kind === 'tracks');
  assert.equal(tracks.length, 2, 'two supplied Work links');
  assert.ok(tracks.every(item => !item.path && item.containment === null
    && entityKey(item.to) === 'entity:example-issues-a:issue:7'),
  'only Issue A has supplied Work links, without path or containment meaning');
  assert.equal(frame.entities.filter(item => item.ref.kind === 'project').length, 2, 'existing Projects are retained');
}


// Named prepared comparisons exercise the public normalizer + projection together.
const preparedEntityRef = { space: 'prepared', kind: 'entity', id: 'same' };
const preparedRelationRef = { space: 'prepared', kind: 'relation', id: 'same' };
const preparedEntityKey = entityKey(preparedEntityRef);
const preparedRelationKey = relationKey(preparedRelationRef);
const prepared = structuredClone(fixture);
const preparedBefore = structuredClone(fixture.frames[0]);
preparedBefore.id = 'prepared-before';
preparedBefore.entities.push({
  ref: preparedEntityRef, label: 'Prepared record', area: 'agents', order: 0,
  visible: true, activity: 'none', summary: '',
  source: { sourceRef: 'fixture:prepared', sourceDigest: null, kind: 'synthetic' },
  time: { observedAt: null, acquiredAt: null, effectiveAt: null }, flags: ['synthetic', 'proposal'],
});
preparedBefore.relations.push({
  ref: preparedRelationRef, from: preparedEntityRef, to: fixture.presentation.directionTargets[0],
  kind: 'reference', label: 'Prepared reference', context: { a: 1, b: { c: 2, d: 3 } },
  source: { sourceRef: 'fixture:prepared', sourceDigest: null, kind: 'synthetic' },
  time: { observedAt: null, acquiredAt: null, effectiveAt: null }, flags: ['synthetic', 'proposal'],
  path: false, visible: true, activity: 'none', containment: null,
});
const preparedAfter = structuredClone(preparedBefore);
preparedAfter.id = 'prepared-after';
preparedAfter.rev += 1;
prepared.frames = [preparedBefore, preparedAfter];

const projectComparison = (input, selected, reverse = false) => projectAtlasWorld({
  input, selected, frame: input.frames[reverse ? 0 : input.frames.length - 1],
  counterpart: input.frames.length > 1 ? input.frames[reverse ? input.frames.length - 1 : 0] : null,
});
const judgementText = projection => projection.scene.representations
  .filter(item => item.atlas?.kind === 'judgement-line').map(item => item.label).join('\n');
const suppliedCases = [
  ['entity-area-only', 'entities', 'area', 'purpose'],
  ['entity-order-only', 'entities', 'order', 7],
  ['entity-visible-only', 'entities', 'visible', false],
  ['entity-label-only', 'entities', 'label', 'New label'],
  ['entity-activity-only', 'entities', 'activity', 'unknown'],
  ['entity-summary-only', 'entities', 'summary', 'Supplied summary'],
  ['entity-source-digest-only', 'entities', 'source', { sourceRef: 'fixture:prepared', sourceDigest: 'sha256:prepared', kind: 'synthetic' }],
  ['entity-time-only', 'entities', 'time', { observedAt: '2026-10-09T02:00:00Z', acquiredAt: null, effectiveAt: null }],
  ['entity-flags-only', 'entities', 'flags', ['synthetic', 'proposal', 'unknown']],
  ['relation-path-only', 'relations', 'path', true],
  ['relation-visible-only', 'relations', 'visible', false],
  ['relation-from-only', 'relations', 'from', fixture.presentation.directionTargets[0]],
  ['relation-to-only', 'relations', 'to', preparedEntityRef],
  ['relation-kind-only', 'relations', 'kind', 'prepared-reference'],
  ['relation-label-only', 'relations', 'label', 'New reference label'],
  ['relation-context-only', 'relations', 'context', { a: 2, b: { c: 2, d: 3 } }],
  ['relation-source-only', 'relations', 'source', null],
  ['relation-time-only', 'relations', 'time', { observedAt: null, acquiredAt: null, effectiveAt: '2026-10-09T02:00:00Z' }],
  ['relation-flags-only', 'relations', 'flags', ['synthetic', 'proposal', 'unknown']],
  ['relation-activity-only', 'relations', 'activity', 'recent'],
];
for (const [name, collection, field, value] of suppliedCases) {
  const raw = structuredClone(prepared);
  raw.frames[1][collection].at(-1)[field] = value;
  const input = parseAtlasWorldInput(raw);
  const preserved = JSON.stringify(input);
  const key = collection === 'entities' ? preparedEntityKey : preparedRelationKey;
  const projection = projectComparison(input, key);
  const comparison = projection.selected.comparison;
  assert.deepEqual(comparison.changes.map(change => change.field), [field], name);
  assert.deepEqual(comparison.changes[0], {
    field, before: input.frames[0][collection].at(-1)[field],
    after: input.frames[1][collection].at(-1)[field], basis: 'supplied record field',
  }, name + ': exact supplied values and basis');
  assert.equal(comparison.before.frameId, 'prepared-before', name + ': Before identity');
  assert.equal(comparison.after.frameId, 'prepared-after', name + ': After identity');
  assert.deepEqual(projectComparison(input, key, true).selected.comparison, comparison, name + ': same oriented pair from either view');
  assert.match(judgementText(projection), /owner comparison NOT SUPPLIED/u, name + ': no inferred business comparator');
  assert.doesNotMatch(judgementText(projection), /no selected meaning change/u, name + ': no false meaning claim');
  assert.equal(JSON.stringify(input), preserved, name + ': supplied facts stay immutable');
}
const reordered = structuredClone(prepared);
reordered.frames[1].relations.at(-1).context = { b: { d: 3, c: 2 }, a: 1 };
const unchanged = projectComparison(parseAtlasWorldInput(reordered), preparedRelationKey);
assert.deepEqual(unchanged.selected.comparison.changes, [], 'context-key-order-only is not a field value change');
assert.match(judgementText(unchanged), /no supplied selected-record field change/u);
assert.match(judgementText(unchanged), /owner comparison NOT SUPPLIED/u, 'record equality is not owner meaning equality');

const replacedRef = structuredClone(prepared);
replacedRef.frames[1].entities.at(-1).ref.space = 'another-prepared-space';
const missing = projectComparison(parseAtlasWorldInput(replacedRef), preparedEntityKey);
assert.ok(missing.selected.comparison.before.record, 'qualified-counterpart-missing: Before retained');
assert.equal(missing.selected.comparison.after.record, null, 'same raw id in another space is not a counterpart');
assert.match(judgementText(missing), /record missing · reason\/time UNKNOWN/u);
assert.match(judgementText(missing), /evidence from counterpart prepared-before/u);
assert.doesNotMatch(judgementText(missing), /no supplied selected-record field change/u);

const singleFrame = structuredClone(prepared);
singleFrame.frames.pop();
const noPair = projectComparison(parseAtlasWorldInput(singleFrame), preparedEntityKey);
assert.equal(noPair.selected.comparison.before, null, 'comparison-frame-not-supplied is explicit');
assert.match(judgementText(noPair), /Before: UNKNOWN · no comparison frame/u);
const noRecord = projectComparison(parseAtlasWorldInput(prepared), 'entity:absent:entity:same');
assert.equal(noRecord.selected.comparison.before.record, null);
assert.equal(noRecord.selected.comparison.after.record, null);
assert.match(judgementText(noRecord), /not present in either compared frame/u);

const parentChange = projectComparison(normalizedFixture, entityKey({ space: 'projects', kind: 'work', id: 'work.y' }));
assert.deepEqual(parentChange.selected.comparison.changes, [{
  field: 'containment', before: null, after: 'entity:projects:project:project.b',
  basis: 'supplied containment endpoints',
}], 'supplied-containment-parent-only stays distinct from an owner meaning comparator');
const declarationChange = projectComparison(normalizedFixture, relationKey({
  space: 'world-relation', kind: 'project-participation', id: 'work.y.project.b',
}));
assert.deepEqual(declarationChange.selected.comparison.changes.map(change => change.field), ['containment', 'time'],
  'supplied containment declaration and time remain distinguishable');

console.log('atlas-world-checks-pass');
