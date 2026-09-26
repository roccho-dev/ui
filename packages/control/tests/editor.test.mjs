import test from 'node:test';
import assert from 'node:assert/strict';

import { createChild, deleteLeaf, editExistingField, updateRecord, validateMutation, validateSingleFieldEdit } from '../editor.mjs';
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

for (const delimiter of ['\n', '\r\n']) {
  test(`full-record update, create, and delete preserve surviving bytes (${JSON.stringify(delimiter)})`, () => {
    const before = sample(delimiter);
    const child = parseControl(before)[1];
    const updated = updateRecord({ source: before, id: 'child', value: { ...child, title: '新 🐈', extra: { one: true }, rel: { parent: 'root', kind: 'delegates' } } });
    assert.deepEqual(validateMutation(before, updated), { operation: 'update', id: 'child', line: 2 });
    assert.equal(scanLines(updated)[0].body, scanLines(before)[0].body);
    assert.equal(scanLines(updated)[1].delimiter, delimiter);

    const created = createChild({ source: updated, parentId: 'root', value: { id: 'new', rel: { parent: 'root', kind: 'notes' }, state: 'active', title: '新規' } });
    assert.deepEqual(validateMutation(updated, created), { operation: 'create', id: 'new', parentId: 'root', line: 2 });
    assert.equal(created.split(delimiter)[0], updated.split(delimiter)[0]);
    assert.equal(created.slice(created.indexOf(`${delimiter}{"id":"child"`)), updated.slice(updated.indexOf(`${delimiter}{"id":"child"`)));

    const deleted = deleteLeaf({ source: created, id: 'new' });
    assert.deepEqual(validateMutation(created, deleted), { operation: 'delete', id: 'new', line: 2 });
    assert.equal(deleted, updated);
  });
}

test('EOF insertion and deletion preserve original no-final-newline source', () => {
  const before = sample('\r\n').split('\r\n')[0];
  const created = createChild({ source: before, parentId: 'root', value: { id: 'new', rel: { parent: 'root', kind: 'notes' }, state: 'active' } });
  assert.equal(created.slice(0, before.length), before);
  assert.equal(deleteLeaf({ source: created, id: 'new' }), `${before}\n`);
});

test('rejects rename/reparent, wrong-parent insertion, multi-operation and root/nonleaf delete', () => {
  const before = sample('\n');
  const child = parseControl(before)[1];
  assert.throws(() => updateRecord({ source: before, id: 'child', value: { ...child, id: 'renamed' } }));
  assert.throws(() => updateRecord({ source: before, id: 'child', value: { ...child, rel: { parent: 'child', kind: 'notes' } } }));
  assert.throws(() => createChild({ source: before, parentId: 'root', value: { id: 'wrong', rel: { parent: 'child', kind: 'notes' }, state: 'active' } }));
  assert.throws(() => deleteLeaf({ source: before, id: 'root' }));
  const created = createChild({ source: before, parentId: 'root', value: { id: 'new', rel: { parent: 'root', kind: 'notes' }, state: 'active' } });
  assert.throws(() => validateMutation(before, created.replace('旧値', '変更')));
  const grandchild = createChild({ source: created, parentId: 'new', value: { id: 'grandchild', rel: { parent: 'new', kind: 'notes' }, state: 'active' } });
  assert.throws(() => deleteLeaf({ source: grandchild, id: 'new' }));
});
