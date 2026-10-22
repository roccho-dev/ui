import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { detailOf } from '../src/index.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNMSUlhYGBgYmBgYGBgAAAOOgEwlhiigQAAAABJRU5ErkJggg==';
const requestId = 'a'.repeat(64);
const source = 'flowchart TB\nA["comment"]-->B["proposal"]';
const row = id => ({ id, representation: '同じ表示', meaning: { kind: 'text' }, evidence: {},
  detail: { format: 'mermaid', source, preview: { png, sourceSha256: sha(source) } } });
const make = () => ({ requestId, proposals: [row('A'), row('B')] });
const choose = { requestId, id: 'B' };
globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); };

test('same label does not replace selected original identity', async () => {
  const out = await detailOf(make(), choose);
  assert.equal(out.id, 'B'); assert.equal(out.index, 1);
  assert.equal(out.source, source); assert.equal(out.preview.png, png);
});
test('reordered list resolves by ID, not old index', async () => {
  const set = make(); set.proposals.reverse();
  assert.equal((await detailOf(set, choose)).index, 0);
});
test('different request identity is refused', async () => {
  await assert.rejects(detailOf(make(), { ...choose, requestId: 'b'.repeat(64) }), /STALE_DETAIL/);
});
test('unknown ID is refused', async () => {
  await assert.rejects(detailOf(make(), { ...choose, id: 'missing' }), /UNKNOWN_PROPOSAL/);
});
test('duplicate ID is refused', async () => {
  const set = make(); set.proposals[0].id = 'B';
  await assert.rejects(detailOf(set, choose), /INVALID_PROPOSAL_SET/);
});
test('raw JSONL is preserved exactly and malformed input is refused', async () => {
  const set = make(); set.proposals[1].detail = { format: 'jsonl', source: '{"id":"B"}\n{"text":"日本語"}\n' };
  assert.equal((await detailOf(set, choose)).source, set.proposals[1].detail.source);
  set.proposals[1].detail.source = '{broken}';
  await assert.rejects(detailOf(set, choose), SyntaxError);
});
test('image bound to another source is refused', async () => {
  const set = make(); set.proposals[1].detail.source += ' changed';
  await assert.rejects(detailOf(set, choose), /PREVIEW_SOURCE_MISMATCH/);
});
test('non-PNG preview is refused', async () => {
  const set = make(); set.proposals[1].detail.preview.png = btoa('<svg/>');
  await assert.rejects(detailOf(set, choose), /INVALID_PNG/);
});
test('oversized dimensions are refused before image decode', async () => {
  const set = make(), bytes = Buffer.from(png, 'base64'); bytes.writeUInt32BE(4096, 16);
  set.proposals[1].detail.preview.png = bytes.toString('base64');
  await assert.rejects(detailOf(set, choose), /PNG_TOO_LARGE/);
});
test('oversized source is not silently clipped', async () => {
  const set = make(); set.proposals[1].detail.source = 'x'.repeat(16385);
  await assert.rejects(detailOf(set, choose), /INVALID_DETAIL/);
});
test('caller changes during digest cannot change the captured result', async () => {
  const set = make(); const pending = detailOf(set, choose);
  set.proposals[1].detail.source = 'changed';
  assert.equal((await pending).source, source);
});
test('missing detail uses representation; SVG stays inert source', async () => {
  const set = make(); set.proposals[1].detail = null;
  assert.equal((await detailOf(set, choose)).source, '同じ表示');
  set.proposals[1].detail = { format: 'svg', source: '<svg><script>throw 1</script></svg>' };
  assert.equal((await detailOf(set, choose)).source, set.proposals[1].detail.source);
});
