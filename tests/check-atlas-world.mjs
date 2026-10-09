// Pure World input contract checks. No browser, build, host or network is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_COMPARISON_AXES, ATLAS_WORLD_KIND, comparisonsForPair, containmentIndex, entityKey, parseAtlasWorldInput, relationKey, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { fitCamera } from '../packages/semantic-map/camera-fit.js';
import { displayedRegionLabel } from '../packages/semantic-map/renderer-maxgraph/labels.js';
import { DEFAULT_THEME } from '../packages/semantic-map/renderer-maxgraph/theme.js';

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
const judgementText = projection => projection.detail.logicalLines.join('\n');
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
assert.doesNotMatch(judgementText(noRecord), /evidence from counterpart/u, 'no counterpart evidence is invented when both records are missing');
assert.match(judgementText(noRecord), /Evidence side: UNKNOWN/u);

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

// R343-01: the missing After must not hide the supplied Before context.
const removedKey = relationKey({ space: 'world-relation', kind: 'reviews', id: 'agent3.agent2.review' });
const removed = projectComparison(normalizedFixture, removedKey);
assert.match(judgementText(removed), /Context: workRef=work.x/u);
assert.match(judgementText(removed), /Evidence side: Before .*counterpart only; current record missing/u);
assert.match(judgementText(removed), /Endpoints: from=entity:agents:agent:shared · to=entity:agents:agent:agent.2/u);
assert.match(judgementText(removed), /After: after .*record missing · reason\/time UNKNOWN/u);
assert.equal(removed.selected.record, null);
assert.equal(removed.selected.counterpart.context.workRef, 'work.x');

const ownerFixture = JSON.parse(readFileSync(new URL('../examples/atlas/input/prepared-comparison.json', import.meta.url), 'utf8'));
const ownerInput = assertStable(ownerFixture, 'prepared-owner-six-axes');
const ownerWorld = projectComparison(ownerInput, preparedRelationKey).worldComparison;
assert.equal(ownerWorld.owners.length, 1);
assert.deepEqual(Object.keys(ownerWorld.owners[0].axes), ATLAS_COMPARISON_AXES);
assert.match(ownerWorld.lines.join('\n'), /Owner axis M: UNCHANGED/u);
assert.match(ownerWorld.lines.join('\n'), /Owner gap business: UNKNOWN/u);
assert.match(ownerWorld.lines.join('\n'), /Work\/Receipt completion does not establish Purpose achievement/u);

const withOwner = (input, axes) => {
  const raw = structuredClone(input);
  const owner = structuredClone(ownerFixture.comparisons[0]);
  owner.before = { frameId: raw.frames[0].id, rev: raw.frames[0].rev, asOf: raw.frames[0].asOf };
  owner.after = { frameId: raw.frames.at(-1).id, rev: raw.frames.at(-1).rev, asOf: raw.frames.at(-1).asOf };
  owner.axes = axes;
  raw.comparisons = [owner];
  return parseAtlasWorldInput(raw);
};
const ownerM = structuredClone(ownerFixture.comparisons[0].axes.M);
ownerM.status = 'changed'; ownerM.summary = 'Meaning changed according to the prepared owner receipt';
const sameFieldsOwnerM = projectComparison(withOwner(prepared, { M: ownerM }), preparedEntityKey);
assert.equal(sameFieldsOwnerM.selected.comparison.changes.length, 0, 'field equality does not erase owner M');
assert.equal(sameFieldsOwnerM.worldComparison.owners[0].axes.M.status, 'changed');
assert.match(sameFieldsOwnerM.worldComparison.lines.join('\n'), /Owner axis N: NOT SUPPLIED \/ UNKNOWN/u);
assert.match(sameFieldsOwnerM.worldComparison.lines.join('\n'), /Reason M: UNKNOWN/u);

const orderOnly = structuredClone(prepared);
orderOnly.frames[1].entities.at(-1).order = 8;
const independentMeaning = projectComparison(withOwner(orderOnly, { M: ownerFixture.comparisons[0].axes.M }), preparedEntityKey);
assert.deepEqual(independentMeaning.selected.comparison.changes.map(item => item.field), ['order']);
assert.equal(independentMeaning.worldComparison.owners[0].axes.M.status, 'unchanged', 'order is not interpreted as owner M');
const relationST = structuredClone(prepared);
relationST.frames[1].relations.at(-1).source.sourceDigest = 'owner-supplied-new-evidence';
relationST.frames[1].relations.at(-1).time.effectiveAt = '2026-10-09T02:00:00Z';
const stProjection = projectComparison(withOwner(relationST, { S: ownerFixture.comparisons[0].axes.S, T: ownerFixture.comparisons[0].axes.T }), preparedRelationKey);
assert.deepEqual(stProjection.selected.comparison.changes.map(item => item.field), ['source', 'time']);
assert.match(stProjection.worldComparison.lines.join('\n'), /Record delta relation:prepared:relation:same: fields=source, time/u);
assert.match(stProjection.worldComparison.lines.join('\n'), /Owner axis M: NOT SUPPLIED \/ UNKNOWN/u);
const wrongPair = structuredClone(ownerFixture);
wrongPair.comparisons[0].after.rev += 1;
assert.equal(projectComparison(parseAtlasWorldInput(wrongPair), preparedEntityKey).worldComparison.owners.length, 0, 'same frame ID with different rev cannot bind an owner receipt');
for (const [label, change, pattern] of [
  ['unknown axis', raw => { raw.comparisons[0].axes.X = {}; }, /unknown field X/u],
  ['invented status', raw => { raw.comparisons[0].axes.M.status = 'completed'; }, /status must be/u],
  ['unqualified reference', raw => { raw.comparisons[0].axes.M.refs = [{ type: 'entity', ref: { id: '7' } }]; }, /space must be/u],
  ['duplicate receipt', raw => raw.comparisons.push(structuredClone(raw.comparisons[0])), /comparison ids must be unique/u],
]) {
  const raw = structuredClone(ownerFixture); change(raw);
  assert.throws(() => parseAtlasWorldInput(raw), pattern, label);
}
const heldPair = worldPair(ownerInput);
const replacedInput = structuredClone(ownerFixture);
replacedInput.frames[1].entities[0].label = 'New content under the same ID';
const replacement = parseAtlasWorldInput(replacedInput);
assert.equal(heldPair.after, ownerInput.frames[1]);
assert.notEqual(heldPair.after, replacement.frames[1]);
assert.equal(comparisonsForPair(heldPair.input, heldPair.before, heldPair.after)[0], ownerInput.comparisons[0]);
assert.ok(Object.isFrozen(heldPair.after.entities[0]) && Object.isFrozen(heldPair.input.comparisons[0].axes.M));

// R343-04: exact selected relation and all supplied alternative references.
const exampleRelation = id => relationKey({ space: 'example-relations', kind: 'addresses', id });
const bDirection = projectComparison(normalizedFixture, exampleRelation('pkg-a.issue-b')).direction;
assert.ok(bDirection.routes.length > 0);
assert.ok(bDirection.routes.every(route => route.relations[0] === exampleRelation('pkg-a.issue-b')
  && route.entities[1] === 'entity:example-issues-b:issue:7'
  && !route.entities.includes('entity:example-issues-a:issue:7') && route.status === 'PROPOSAL / not accepted'));
const packagePaths = projectComparison(normalizedFixture, 'entity:example-packages:package:pkg-a').direction.routes;
assert.ok(['pkg-a.issue-a.req', 'pkg-a.issue-a.alt', 'pkg-a.issue-b'].every(id => packagePaths.some(route => route.relations[0] === exampleRelation(id))));
const noPath = projectComparison(normalizedFixture, 'relation:world-relation:serves:agent1.purposea').direction;
assert.equal(noPath.routes.length, 0);
assert.match(noPath.reason, /path=false/u);
const missingEndpoint = structuredClone(prepared);
missingEndpoint.frames[1].relations.at(-1).path = true;
missingEndpoint.frames[1].relations.at(-1).to = { space: 'missing', kind: 'purpose', id: 'same' };
assert.match(projectComparison(parseAtlasWorldInput(missingEndpoint), preparedRelationKey).direction.reason, /endpoint missing/u);
const targets = structuredClone(prepared);
const secondPurpose = { space: 'prepared-purposes', kind: 'purpose', id: 'second' };
targets.presentation.directionTargets.push(secondPurpose);
targets.frames[1].entities.push({ ...structuredClone(preparedBefore.entities.at(-1)), ref: secondPurpose, label: 'Second Purpose', area: 'purpose' });
targets.frames[1].relations.at(-1).path = true;
targets.frames[1].relations.push({ ...structuredClone(targets.frames[1].relations.at(-1)),
  ref: { space: 'prepared', kind: 'relation', id: 'second-purpose' }, to: secondPurpose });
const targetPaths = projectComparison(parseAtlasWorldInput(targets), preparedEntityKey).direction.routes;
assert.deepEqual(new Set(targetPaths.map(route => route.entities.at(-1))),
  new Set([entityKey(fixture.presentation.directionTargets[0]), entityKey(secondPurpose)]), 'both supplied Purpose paths remain alternatives');

// P clipping counterexamples: full long multi-field values must remain exactly
// reconstructible through physical pages at supported viewports and cameras.
const longInput = structuredClone(prepared);
longInput.frames[1].relations.at(-1).context = { japanese: '長い供給済みの根拠λ🙂'.repeat(30), quote: '<>&"',
  edges: '  leading and trailing  ', consecutive: 'one    two', spacesOnly: ' '.repeat(180),
  lines: '\n\nfirst\tsecond\r\nlast\n', literal: '\\n is literal; \n is a newline',
  separators: 'a\u0085b\u2028c\u2029d', escape: '\\ " \t', empty: '' };
longInput.frames[1].relations.at(-1).source.sourceDigest = 'digest-'.repeat(90);
const longNormalized = parseAtlasWorldInput(longInput);
for (const viewport of [{ width: 1200, height: 900 }, { width: 1500, height: 1000 }]) {
  for (const scale of [0.15, 0.7, 1.5, 5]) {
    let first = projectAtlasWorld({ input: longNormalized, frame: longNormalized.frames[1], counterpart: longNormalized.frames[0], selected: preparedRelationKey,
      viewport, scale, camera: { scale, translateX: -300, translateY: 700 } });
    assert.ok(first.detail.physicalLines.some(row => /^ +$/u.test(JSON.parse(row.text))),
      'spaces-only fragments remain explicit JSON strings');
    const recovered = new Map();
    for (let page = 0; page < first.detail.pageCount; page += 1) {
      const part = projectAtlasWorld({ input: longNormalized, frame: longNormalized.frames[1], counterpart: longNormalized.frames[0], selected: preparedRelationKey,
        viewport, scale, camera: { scale, translateX: -300, translateY: 700 }, detailPage: page });
      for (const row of part.detail.rows) {
        // Reproduce the existing SVG line trimming that caused the public
        // failure. Only the surviving rendered label is decoded here.
        const drawn = row.text.split('\n').map(line => line.trim()).filter(Boolean).join('');
        assert.equal(drawn, row.text, 'display delimiters survive SVG trimming');
        assert.ok(Array.from(drawn).length * 18 <= part.viewport.panel.width - 32, 'encoded width, including escapes, is bounded');
        const preceding = recovered.get(row.lineIndex) ?? '';
        assert.equal(row.offset, Array.from(preceding).length, 'no missing segment is repaired with an offset');
        recovered.set(row.lineIndex, preceding + JSON.parse(drawn));
      }
      for (const rep of part.scene.representations.filter(item => item.zIndex >= 10000)) {
        const x = (rep.bounds.x - 300) * scale, y = (rep.bounds.y + 700) * scale;
        assert.ok(x >= -1e-8 && y >= -1e-8 && x + rep.bounds.width * scale <= viewport.width + 1e-8
          && y + rep.bounds.height * scale <= viewport.height + 1e-8, 'all pinned controls and physical value rows fit');
      }
    }
    assert.deepEqual([...recovered.values()], first.detail.logicalLines, 'all supplied characters recovered without abbreviation');
  }
}

// The taller Before containment failed even though After passed. Exercise both
// with the existing renderer's label decision at the declared 13px font, without
// treating this pure decision as proof of actual browser glyph/bbox visibility.
const worldTheme = { ...DEFAULT_THEME, vertex: { ...DEFAULT_THEME.vertex, fontSize: 13, deepFontSize: 13, fontStyle: 0 } };
for (const frame of normalizedFixture.frames) {
  for (const viewport of [{ width: 1200, height: 900 }, { width: 1500, height: 1000 }]) {
    const projection = projectAtlasWorld({ input: normalizedFixture, frame, viewport });
    const camera = fitCamera(projection.world, worldViewport(viewport).graph, 0.94);
    for (const item of projection.scene.representations.filter(item => item.atlas?.kind === 'entity')) {
      assert.equal(displayedRegionLabel(item, camera.scale, worldTheme, false), item.label,
        frame.id + ' at ' + viewport.width + 'x' + viewport.height + ': complete node name ' + item.regionId);
    }
  }
}

// Declared input budgets: limit visibility, never the underlying record set.
for (const count of [40, 41]) {
  const raw = structuredClone(prepared);
  const root = raw.frames[0].entities.find(item => entityKey(item.ref) === entityKey(raw.presentation.directionTargets[0]));
  const rows = Array.from({ length: count }, (_, index) => ({ ...structuredClone(preparedBefore.entities.at(-1)),
    ref: { space: 'budget', kind: 'agent', id: String(index) }, label: 'Agent ' + index, order: index }));
  raw.presentation.defaultSelection = root.ref;
  raw.frames = [{ ...raw.frames[0], entities: [root, ...rows], relations: [] }];
  const view = projectComparison(parseAtlasWorldInput(raw), entityKey(root.ref));
  assert.equal(view.scene.representations.filter(item => item.atlas?.kind === 'entity' && item.atlas.area === 'agents').length, 40);
  assert.equal(view.omittedEntityIds.length, count - 40);
}
for (const count of [64, 65]) {
  const raw = structuredClone(prepared);
  const frame = raw.frames[0];
  frame.relations = Array.from({ length: count }, (_, index) => ({ ...structuredClone(preparedBefore.relations.at(-1)),
    ref: { space: 'budget', kind: 'relation', id: String(index) }, kind: 'relation-' + index }));
  raw.frames = [frame];
  const view = projectComparison(parseAtlasWorldInput(raw), preparedEntityKey);
  assert.equal(view.scene.relations.length, 64);
  assert.equal(view.omittedRelationIds.length, count - 64);
  assert.equal(new Set([...view.scene.relations.flatMap(item => item.relationIds), ...view.omittedRelationIds]).size, count);
}
console.log('atlas-world-checks-pass');
