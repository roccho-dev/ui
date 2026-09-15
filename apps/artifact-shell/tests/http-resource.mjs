import assert from 'node:assert/strict';
import { createHttpResource } from '../publication/http-resource.mjs';

let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };
const rejects = async (...args) => { await assert.rejects(...args); assertions += 1; };

const jsonl = '{"id":"root","rel":null}\n';
const calls = [];
let version = 1;
let currentEtag = `"v${version}"`;
const fetch = async (_href, options = {}) => {
  calls.push(options);
  if ((options.method ?? 'GET') === 'GET') {
    return new Response(jsonl, {
      status: 200,
      headers: {
        'Content-Length': String(new TextEncoder().encode(jsonl).byteLength),
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        ETag: currentEtag,
      },
    });
  }
  equal(options.headers['If-Match'], currentEtag);
  equal(options.headers['Content-Type'], 'application/x-ndjson');
  equal(options.body, jsonl);
  version += 1;
  currentEtag = `"v${version}"`;
  return new Response(JSON.stringify({ ok: true, etag: currentEtag }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: currentEtag },
  });
};
const resource = createHttpResource({ fetch, href: 'http://127.0.0.1:4173/control.jsonl' });
equal(await resource.read(), jsonl);
equal(await resource.put(jsonl), jsonl);
equal(await resource.put(jsonl), jsonl);
equal(calls.length, 3);
equal(calls[1].method, 'PUT');
equal(calls[2].method, 'PUT');

const jsonResource = createHttpResource({
  href: 'https://example.invalid/data.json',
  fetch: async () => new Response('{"ok":true}', {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: '"json-v1"' },
  }),
});
deepEqual(await jsonResource.read(), { ok: true });

const stale = createHttpResource({
  href: 'https://example.invalid/control.jsonl',
  fetch: async (_href, options = {}) => (options.method === 'PUT'
    ? new Response('stale\n', { status: 412 })
    : new Response(jsonl, { status: 200, headers: { 'Content-Type': 'application/x-ndjson', ETag: '"v1"' } })),
});
await stale.read();
await rejects(() => stale.put(jsonl), error => error.code === 'STALE_RESOURCE' && /stale/.test(error.message));

const noEtag = createHttpResource({
  href: 'https://example.invalid/control.jsonl',
  fetch: async () => new Response(jsonl, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }),
});
await noEtag.read();
await rejects(() => noEtag.put(jsonl), /ETag required/);

const unsupported = createHttpResource({
  href: 'https://example.invalid/control.txt',
  fetch: async () => new Response('x', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
});
await rejects(() => unsupported.read(), /unsupported content-type/);

const oversized = createHttpResource({
  href: 'https://example.invalid/large.jsonl',
  fetch: async () => new Response('x', {
    status: 200,
    headers: { 'Content-Length': String(256 * 1024 + 1), 'Content-Type': 'application/x-ndjson' },
  }),
});
await rejects(() => oversized.read(), /exceeds 262144 bytes/);

console.log(JSON.stringify({ assertions, schema: 'ui.http-resource-proof/1', status: 'PASS' }));
