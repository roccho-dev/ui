import test from 'node:test';
import assert from 'node:assert/strict';

import { editExistingField, validateSingleFieldEdit } from '../editor.mjs';
import { parseControl, scanLines } from '../src/control-graph.mjs';

const sample = delimiter => [
  JSON.stringify({ id: 'root', rel: null, op: 'document', state: 'active', schema: 3, title: '方針' }),
  JSON.stringify({ id: 'child', rel: { parent: 'root', kind: 'details' }, state: 'active', title: '旧値' }),
].join(delimiter) + delimiter;

for (const delimiter of ['\n', '\r\n']) {
  test(`one non-identity edit preserves all other bytes (${JSON.stringify(delimiter)})`, () => {
    const before = sample(delimiter);
    const after = editExistingField({ source: before, id: 'child', key: 'title', value: '新値 🐈' });
    const oldLines = scanLines(before);
    const newLines = scanLines(after);
    assert.equal(newLines[0].body, oldLines[0].body);
    assert.equal(newLines[0].delimiter, oldLines[0].delimiter);
    assert.equal(newLines[1].delimiter, oldLines[1].delimiter);
    assert.equal(parseControl(after)[1].title, '新値 🐈');
    assert.deepEqual(validateSingleFieldEdit(before, after), { id: 'child', key: 'title', line: 2 });
  });
}

test('rejects identity, relation, creation, and multi-field bypasses', () => {
  const before = sample('\n');
  const changed = replacement => before.replace(/"id":"child"[^\n]*/u, replacement);
  const original = JSON.parse(scanLines(before)[1].body);
  const rename = JSON.stringify({ ...original, id: 'renamed' });
  const reparent = JSON.stringify({ ...original, rel: { parent: 'root', kind: 'delegates' } });
  const multi = JSON.stringify({ ...original, title: 'changed', state: 'inactive' });
  assert.throws(() => editExistingField({ source: before, id: 'child', key: 'id', value: 'renamed' }), /locked/u);
  for (const candidate of [changed(rename), changed(reparent), changed(multi), before + JSON.stringify({ ...original, id: 'third' }) + '\n']) {
    assert.throws(() => validateSingleFieldEdit(before, candidate));
  }
});
