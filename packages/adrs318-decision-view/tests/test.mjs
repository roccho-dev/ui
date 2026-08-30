import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  DecisionViewError, contracts, loadDecisionRoute, parseDecisionRoute, sha256,
} from '../decision-view.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const pageUrl = 'https://decisions.example.test/decisions/architecture/accepted';
const rows = [{
  schema: contracts.VIEW_SCHEMA,
  decision_id: 'ADR-1', decision_type: 'architecture', status: 'accepted',
  title: 'Demo', summary: 'Accepted', current_event_id: 'a', projection_digest: 'sha256:' + '0'.repeat(64),
}];
const bytes = new TextEncoder().encode(rows.map(JSON.stringify).join('\n') + '\n');
const digest = await sha256(bytes);
function manifest(overrides = {}) {
  return { schema: contracts.MANIFEST_SCHEMA, routes: [{
    logical_route: 'decisions/architecture/accepted', decision_type: 'architecture', status: 'accepted',
    renderer_id: 'decision-list/1', projection_contract: contracts.VIEW_SCHEMA,
    asset_url: '/data/abc/architecture/accepted.jsonl', asset_digest: digest,
    ...overrides,
  }] };
}
function response(body = bytes, { status = 200, type = 'application/x-ndjson' } = {}) {
  return new Response(body, { status, headers: { 'content-type': type, 'content-length': String(body.byteLength ?? body.length ?? 0) } });
}
const registry = new Map([['decision-list/1', (records) => records.map((x) => x.decision_id)]]);

async function expectCode(code, fn) {
  await assert.rejects(fn, (error) => error instanceof DecisionViewError && error.code === code);
}

test('parses type and status route', () => {
  assert.deepEqual(parseDecisionRoute('/decisions/architecture/accepted'), {
    decisionType: 'architecture', status: 'accepted', logicalRoute: 'decisions/architecture/accepted',
  });
});
test('same-origin fetch includes credentials and renders', async () => {
  let init;
  const out = await loadDecisionRoute({ pageUrl, manifest: manifest(), rendererRegistry: registry,
    fetchImpl: async (_url, value) => { init = value; return response(); } });
  assert.equal(init.credentials, 'include');
  assert.deepEqual(out.rendered, ['ADR-1']);
  assert.equal(out.receipt.authority, false);
});
test('cross-origin fetch omits ambient credentials', async () => {
  let init;
  await loadDecisionRoute({ pageUrl, manifest: manifest({ asset_url: 'https://cdn.example.test/a.jsonl' }), rendererRegistry: registry,
    fetchImpl: async (_url, value) => { init = value; return response(); } });
  assert.equal(init.credentials, 'omit');
});
test('401 is explicit unauthenticated state', () => expectCode('unauthenticated', () => loadDecisionRoute({
  pageUrl, manifest: manifest(), rendererRegistry: registry, fetchImpl: async () => response(new Uint8Array(), { status: 401 }),
})));
test('403 is explicit forbidden state', () => expectCode('forbidden', () => loadDecisionRoute({
  pageUrl, manifest: manifest(), rendererRegistry: registry, fetchImpl: async () => response(new Uint8Array(), { status: 403 }),
})));
test('digest mismatch fails before rendering', () => expectCode('digest-mismatch', () => loadDecisionRoute({
  pageUrl, manifest: manifest({ asset_digest: 'sha256:' + 'f'.repeat(64) }), rendererRegistry: registry, fetchImpl: async () => response(),
})));
test('unknown renderer fails closed', () => expectCode('renderer-unsupported', () => loadDecisionRoute({
  pageUrl, manifest: manifest({ renderer_id: 'unknown/1' }), rendererRegistry: registry, fetchImpl: async () => response(),
})));
test('record type mismatch fails closed', async () => {
  const bad = new TextEncoder().encode(JSON.stringify({ ...rows[0], decision_type: 'policy' }) + '\n');
  const badDigest = await sha256(bad);
  await expectCode('record-type-mismatch', () => loadDecisionRoute({
    pageUrl, manifest: manifest({ asset_digest: badDigest }), rendererRegistry: registry, fetchImpl: async () => response(bad),
  }));
});
test('record status mismatch fails closed', async () => {
  const bad = new TextEncoder().encode(JSON.stringify({ ...rows[0], status: 'proposed' }) + '\n');
  const badDigest = await sha256(bad);
  await expectCode('record-status-mismatch', () => loadDecisionRoute({
    pageUrl, manifest: manifest({ asset_digest: badDigest }), rendererRegistry: registry, fetchImpl: async () => response(bad),
  }));
});
test('wrong content type fails closed', () => expectCode('content-type-denied', () => loadDecisionRoute({
  pageUrl, manifest: manifest(), rendererRegistry: registry, fetchImpl: async () => response(bytes, { type: 'text/html' }),
})));
test('redirect is never followed', () => expectCode('redirect-denied', () => loadDecisionRoute({
  pageUrl, manifest: manifest(), rendererRegistry: registry,
  fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }),
})));
test('undeclared route fails closed', () => expectCode('route-not-found', () => loadDecisionRoute({
  pageUrl: 'https://decisions.example.test/decisions/policy/accepted', manifest: manifest(), rendererRegistry: registry,
})));
test('valid empty view is rendered explicitly', async () => {
  const empty = new Uint8Array();
  const emptyDigest = await sha256(empty);
  const out = await loadDecisionRoute({ pageUrl, manifest: manifest({ asset_digest: emptyDigest }), rendererRegistry: registry,
    fetchImpl: async () => response(empty) });
  assert.deepEqual(out.rendered, []); assert.equal(out.receipt.record_count, 0);
});
