import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChild, deleteLeaf, editExistingField, updateRecord } from '../../../packages/control/editor.mjs';
import { parseControl } from '../../../packages/control/src/control-graph.mjs';
import { createServer, MAX_BODY_BYTES } from '../server.mjs';

const sourcePath = process.env.POLICY_EDITOR_CONTROL_SOURCE;
const tempRoot = process.env.POLICY_EDITOR_TEST_TMP_DIR;
const sha = value => createHash('sha256').update(value).digest('hex');

test('same-size disposable fixture: conditional save, readback, and bounded rejection', async () => {
  assert.ok(sourcePath && path.isAbsolute(sourcePath), 'POLICY_EDITOR_CONTROL_SOURCE must be absolute');
  assert.ok(tempRoot && path.isAbsolute(tempRoot), 'POLICY_EDITOR_TEST_TMP_DIR must be absolute');
  const source = await readFile(sourcePath);
  assert.ok(source.length > 0 && source.length < MAX_BODY_BYTES, `current exact source must fit streamed limit; got ${source.length}`);
  const sourceHash = sha(source);
  const directory = path.join(tempRoot, `control-editor-${randomUUID()}`);
  const fixture = path.join(directory, 'control.jsonl');
  await mkdir(directory);
  await writeFile(fixture, source, { flag: 'wx' });
  const server = createServer({ controlPath: fixture });
  try {
    const nonLoopback = spawnSync(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), fixture, '4173', '0.0.0.0'], { encoding: 'utf8' });
    assert.notEqual(nonLoopback.status, 0, 'CLI must refuse non-loopback bind override');
    assert.match(nonLoopback.stderr, /host override prohibited/u);
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const url = `${origin}/data/control.jsonl`;
    const get = () => fetch(url);
    const put = (body, headers = {}) => fetch(url, {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'application/x-ndjson; charset=utf-8', ...headers },
      body,
    });
    const initial = await get();
    assert.equal(initial.status, 200);
    assert.equal(initial.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
    const before = await initial.text();
    assert.equal(before, source.toString('utf8'));
    const etag = initial.headers.get('etag');
    assert.match(etag, /^"sha256-[a-f0-9]{64}"$/u);
    for (const [asset, type] of [['/', 'text/html'], ['/design.json', 'application/json'], ['/apps/control/main.mjs', 'text/javascript'], ['/packages/control/editor.mjs', 'text/javascript']]) {
      const response = await fetch(`${origin}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.ok(response.headers.get('content-type').startsWith(type), asset);
    }
    assert.equal((await fetch(`${origin}/data/claims.jsonl`)).status, 404);
    const firstRecord = JSON.parse(before.split(/\r?\n/u)[0]);
    const next = editExistingField({ source: before, id: firstRecord.id, key: 'emoji', value: `${firstRecord.emoji} local proof` });
    const second = editExistingField({ source: before, id: firstRecord.id, key: 'emoji', value: `${firstRecord.emoji} stale proof` });

    const [one, two] = await Promise.all([
      put(next, { 'If-Match': etag }),
      put(second, { 'If-Match': etag }),
    ]);
    assert.deepEqual([one.status, two.status].sort(), [200, 412]);
    const stored = await readFile(fixture);
    assert.equal(stored.toString('utf8'), one.status === 200 ? next : second);
    const after = await get();
    assert.equal(after.headers.get('etag'), `"sha256-${sha(stored)}"`);
    assert.equal(await after.text(), stored.toString('utf8'));

    let current = stored.toString('utf8');
    let currentEtag = after.headers.get('etag');
    const full = updateRecord({ source: current, id: firstRecord.id, value: { ...parseControl(current)[0], emoji: '✳️ full record', proofKey: true } });
    assert.equal((await put(full, { 'If-Match': currentEtag })).status, 200);
    current = full;
    currentEtag = (await get()).headers.get('etag');
    const inserted = createChild({ source: current, parentId: firstRecord.id, value: { id: 'disposable.browser.proof', rel: { parent: firstRecord.id, kind: 'notes' }, state: 'active', emoji: '🧪' } });
    assert.equal((await put(inserted, { 'If-Match': currentEtag })).status, 200);
    current = inserted;
    currentEtag = (await get()).headers.get('etag');
    const deleted = deleteLeaf({ source: current, id: 'disposable.browser.proof' });
    assert.equal((await put(deleted, { 'If-Match': currentEtag })).status, 200);
    current = deleted;
    currentEtag = (await get()).headers.get('etag');
    assert.equal((await readFile(fixture)).toString('utf8'), current);

    const reject = async (body, headers, expectedStatus, target = url) => {
      const preimage = await readFile(fixture);
      const response = await fetch(target, {
        method: 'PUT',
        headers: { Origin: origin, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'If-Match': currentEtag, ...headers },
        body,
      });
      assert.equal(response.status, expectedStatus);
      assert.deepEqual(await readFile(fixture), preimage);
    };
    const missing = await fetch(url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/x-ndjson' }, body: next });
    assert.equal(missing.status, 428);
    await reject(next, { 'If-Match': 'W/"sha256-' + 'a'.repeat(64) + '"' }, 400);
    await reject(next, { 'If-Match': '*' }, 400);
    await reject(next, { Origin: 'http://evil.example' }, 403);
    await reject(next, { 'Content-Type': 'text/plain' }, 415);
    await reject(Buffer.alloc(MAX_BODY_BYTES + 1, 65), {}, 413);
    await reject(Buffer.from([0xff, 0xfe]), {}, 400);
    await reject('{broken}\n', {}, 400);
    const rows = current.split('\n');
    const changed = JSON.parse(rows[0]);
    rows[0] = JSON.stringify({ ...changed, id: `${changed.id}-renamed` });
    await reject(rows.join('\n'), {}, 400);
    rows[0] = JSON.stringify({ ...changed, rel: { parent: changed.id, kind: 'details' } });
    await reject(rows.join('\n'), {}, 400);
    const allRecords = parseControl(current);
    const parentIds = new Set(allRecords.map(record => record.rel?.parent).filter(Boolean));
    const leaf = allRecords.find(record => record.rel && !parentIds.has(record.id));
    assert.ok(leaf, 'leaf required for graph-valid identity bypass');
    const leafLines = current.split('\n');
    leafLines[leaf.line - 1] = JSON.stringify({ ...leaf, id: `${leaf.id}-renamed` });
    await reject(leafLines.join('\n'), {}, 400);
    const movable = allRecords.find(record => record.rel?.parent !== firstRecord.id && record.rel?.parent && !parentIds.has(record.id));
    assert.ok(movable, 'graph-valid reparent candidate required');
    const movedLines = current.split('\n');
    movedLines[movable.line - 1] = JSON.stringify({ ...movable, rel: { ...movable.rel, parent: firstRecord.id } });
    await reject(movedLines.join('\n'), {}, 400);
    const twice = updateRecord({ source: updateRecord({ source: current, id: firstRecord.id, value: { ...parseControl(current)[0], emoji: 'one' } }), id: leaf.id, value: { ...leaf, emoji: 'two' } });
    await reject(twice, {}, 400);
    const newChild = createChild({ source: current, parentId: firstRecord.id, value: { id: 'wrong.position', rel: { parent: firstRecord.id, kind: 'notes' }, state: 'active' } });
    const shifted = newChild.split('\n');
    const insertedLine = shifted.splice(1, 1)[0];
    shifted.splice(3, 0, insertedLine);
    await reject(shifted.join('\n'), {}, 400);
    const rootDeleted = current.slice(current.indexOf('\n') + 1);
    await reject(rootDeleted, {}, 400);
    const nonleaf = allRecords.find(record => record.rel && parentIds.has(record.id));
    assert.ok(nonleaf, 'nonleaf required');
    const nonleafLine = nonleaf.sourceLine;
    await reject(current.slice(0, nonleafLine.start) + current.slice(nonleafLine.end), {}, 400);
    for (const target of ['/apps/control/main.mjs', '/%2e%2e/policy/control.jsonl', '/%5csecret', '/.env']) {
      const response = await fetch(`${origin}${target}`, { method: 'PUT', headers: { Origin: origin }, body: 'x' });
      assert.ok(response.status >= 400);
      assert.equal((await readFile(fixture)).toString('utf8'), current);
    }
    const wrongHost = await new Promise((resolve, reject) => {
      const request = httpRequest(url, { headers: { Host: `evil.example:${port}` } }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(wrongHost, 403);

    const external = editExistingField({ source: current, id: firstRecord.id, key: 'emoji', value: 'external update' });
    await writeFile(fixture, external);
    const stale = await put(next, { 'If-Match': currentEtag });
    assert.equal(stale.status, 412);
    assert.equal((await readFile(fixture)).toString('utf8'), external);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await unlink(fixture);
    await rmdir(directory);
    assert.equal(sha(await readFile(sourcePath)), sourceHash, 'actual policy source must remain byte-identical');
  }
});
