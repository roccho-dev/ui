import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { editExistingField } from '../../../packages/control/editor.mjs';
import { parseControl } from '../../../packages/control/src/control-graph.mjs';
import { createServer, MAX_BODY_BYTES } from '../server.mjs';

const sourcePath = process.env.POLICY_EDITOR_CONTROL_SOURCE;
const tempRoot = process.env.POLICY_EDITOR_TEST_TMP_DIR;
const sha = value => createHash('sha256').update(value).digest('hex');

test('same-size disposable fixture: conditional save, readback, and bounded rejection', async () => {
  assert.ok(sourcePath && path.isAbsolute(sourcePath), 'POLICY_EDITOR_CONTROL_SOURCE must be absolute');
  assert.ok(tempRoot && path.isAbsolute(tempRoot), 'POLICY_EDITOR_TEST_TMP_DIR must be absolute');
  const source = await readFile(sourcePath);
  assert.ok(source.length >= 520020, `source must be at least current 520020 bytes; got ${source.length}`);
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

    const reject = async (body, headers, expectedStatus, target = url) => {
      const preimage = await readFile(fixture);
      const response = await fetch(target, {
        method: 'PUT',
        headers: { Origin: origin, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'If-Match': after.headers.get('etag'), ...headers },
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
    const rows = stored.toString('utf8').split('\n');
    const changed = JSON.parse(rows[0]);
    rows[0] = JSON.stringify({ ...changed, id: `${changed.id}-renamed` });
    await reject(rows.join('\n'), {}, 400);
    rows[0] = JSON.stringify({ ...changed, rel: { parent: changed.id, kind: 'details' } });
    await reject(rows.join('\n'), {}, 400);
    const allRecords = parseControl(stored.toString('utf8'));
    const parentIds = new Set(allRecords.map(record => record.rel?.parent).filter(Boolean));
    const leaf = allRecords.find(record => record.rel && !parentIds.has(record.id));
    assert.ok(leaf, 'leaf required for graph-valid identity bypass');
    const leafLines = stored.toString('utf8').split('\n');
    leafLines[leaf.line - 1] = JSON.stringify({ ...leaf, id: `${leaf.id}-renamed` });
    await reject(leafLines.join('\n'), {}, 400);
    const movable = allRecords.find(record => record.rel?.parent !== firstRecord.id && record.rel?.parent && !parentIds.has(record.id));
    assert.ok(movable, 'graph-valid reparent candidate required');
    const movedLines = stored.toString('utf8').split('\n');
    movedLines[movable.line - 1] = JSON.stringify({ ...movable, rel: { ...movable.rel, parent: firstRecord.id } });
    await reject(movedLines.join('\n'), {}, 400);
    for (const target of ['/apps/control/main.mjs', '/%2e%2e/policy/control.jsonl', '/%5csecret', '/.env']) {
      const response = await fetch(`${origin}${target}`, { method: 'PUT', headers: { Origin: origin }, body: 'x' });
      assert.ok(response.status >= 400);
      assert.deepEqual(await readFile(fixture), stored);
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

    const external = editExistingField({ source: stored.toString('utf8'), id: firstRecord.id, key: 'emoji', value: 'external update' });
    await writeFile(fixture, external);
    const stale = await put(next, { 'If-Match': after.headers.get('etag') });
    assert.equal(stale.status, 412);
    assert.equal((await readFile(fixture)).toString('utf8'), external);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await unlink(fixture);
    await rmdir(directory);
    assert.equal(sha(await readFile(sourcePath)), sourceHash, 'actual policy source must remain byte-identical');
  }
});
