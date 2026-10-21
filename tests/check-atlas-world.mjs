// Pure World input contract checks. No browser, build, host or network is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_WORLD_KIND, comparisonsForPair, containmentIndex, entityKey, parseAtlasWorldInput, relationKey, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { searchAtlasWorld } from '../packages/control/src/atlas-world-search.mjs';
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

// The displayed (latest) frame of a World, with a record selected.
const projectComparison = (input, selected) => projectAtlasWorld({ input, selected, frame: input.frames.at(-1) });

const ownerFixture = JSON.parse(readFileSync(new URL('../examples/atlas/input/prepared-comparison.json', import.meta.url), 'utf8'));
const ownerInput = assertStable(ownerFixture, 'prepared-owner-six-axes');
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

// Literal search navigates the displayed frame, without adopting its meaning.
const searchRaw = structuredClone(prepared);
for (const [index, frame] of searchRaw.frames.entries()) {
  frame.relations.at(-1).context = {
    owner: 'writer.owner', criteria: ['criterion.delivery'],
    proof: { ref: 'proof.post.v2', evaluator: 'independent-reviewer' },
    residual: ['residual.recovery'], history: ['old-obligation.v1'],
    side: index === 0 ? 'before-only-marker' : 'after-only-marker',
    literal: '<script>window.owned=true</script>',
  };
}
const searchInput = parseAtlasWorldInput(searchRaw);
const searchBefore = searchInput.frames[0], searchAfter = searchInput.frames[1];
const searchPreserved = JSON.stringify(searchInput);
for (const word of ['writer.owner', 'criterion.delivery', 'proof.post.v2', 'residual.recovery', 'old-obligation.v1']) {
  const rows = searchAtlasWorld(searchAfter, word.toUpperCase());
  assert.equal(rows.length, 1, 'deep supplied context: ' + word);
  assert.equal(rows[0].key, preparedRelationKey);
  assert.equal(rows[0].record, searchAfter.relations.at(-1), 'exact record provenance retained');
}
assert.equal(searchAtlasWorld(searchBefore, 'before-only-marker').length, 1);
assert.equal(searchAtlasWorld(searchAfter, 'before-only-marker').length, 0, 'no counterpart union');
assert.equal(searchAtlasWorld(searchAfter, 'after-only-marker').length, 1);
for (const query of ['', '   ']) {
  assert.equal(searchAtlasWorld(searchAfter, query).length, searchAfter.entities.length + searchAfter.relations.length,
    'clearing query restores every supplied record, including hidden/omitted records');
}
assert.deepEqual(searchAtlasWorld(searchAfter, '__not-supplied-world-key__'), []);
assert.equal(searchAtlasWorld(searchAfter, '<script>window.owned=true</script>')[0].record.context.literal,
  '<script>window.owned=true</script>', 'HTML remains literal source text');
for (const space of ['example-issues-a', 'example-issues-b']) {
  const key = entityKey({ space, kind: 'issue', id: '7' });
  assert.deepEqual(searchAtlasWorld(normalizedFixture.frames[1], key).map(row => row.key), [key],
    'same raw ID across spaces stays qualified');
}
assert.equal(searchAtlasWorld(heldPair.after, 'New content under the same ID').length, 0,
  'held search never uses later received content');
assert.equal(searchAtlasWorld(replacement.frames[1], 'New content under the same ID').length, 1);
assert.equal(JSON.stringify(searchInput), searchPreserved, 'search does not mutate source/time/authority/history');
assert.throws(() => searchAtlasWorld(searchAfter, true), /query must be text/u);

console.log('atlas-world-checks-pass');
