// Pure World input contract checks. No browser, build, host or network is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_WORLD_KIND, parseAtlasWorldInput } from '../packages/control/src/atlas-world.mjs';

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

console.log('atlas-world-checks-pass');
