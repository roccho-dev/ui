import assert from 'node:assert/strict';
import {
  ConnectabilityError,
  canonicalJson,
  createJsonConnectability,
} from '../src/index.mjs';

const BASE = 'sha256:8f087d7babfbb04bce7e9e6a1bd21169dec5d37299c58bfcbb49c5756468c461';
const PROPOSAL_ID = 'adrs318-semantic-map-connectability-canary-v1';

function proposalFrom(input) {
  return {
    schema: 'adrs.uiProposal.canary.v2',
    sample: true,
    authority: false,
    target_repository: 'roccho-dev/adrs',
    target_issue: 318,
    proposal_id: PROPOSAL_ID,
    base_release_digest: BASE,
    operations: [{
      op: 'set-responsibility',
      package_id: input.package_id,
      value: 'Semantic Map connectability can emit a reviewed package proposal without carrying renderer geometry.',
    }],
    reason: 'Prove map/1 selection → canonical proposal → same-origin ingress → ADRS Issue recorded.',
    idempotency_key: PROPOSAL_ID,
    cutover: false,
  };
}

assert.equal(
  canonicalJson({ z: 1, a: { y: 2, x: 1 } }),
  '{"a":{"x":1,"y":2},"z":1}\n',
);
assert.throws(
  () => createJsonConnectability({
    prepare: proposalFrom,
    endpoint: 'https://example.com/api/proposals',
    fetch: async () => null,
  }),
  error => error instanceof ConnectabilityError && error.code === 'INVALID_ENDPOINT',
);

const requests = [];
const fetch = async (url, init) => {
  requests.push({ url, init });
  if (init.method === 'POST') {
    return new Response(JSON.stringify({
      status: 'PASS',
      state: 'submitted',
      proposal_id: PROPOSAL_ID,
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({
    status: 'PASS',
    state: 'recorded',
    proposal_id: PROPOSAL_ID,
    exact_comment_readback: true,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const connection = createJsonConnectability({ prepare: proposalFrom, fetch });
const prepared = await connection.prepare({
  package_id: 'pkg.adrs318.semantic-map-connectability-canary',
  bounds: [10, 20, 300, 180],
  x: 10,
  y: 20,
  zoom: 1.4,
  view: 'map/1',
});

assert.equal(prepared.id, PROPOSAL_ID);
assert.match(prepared.digest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(prepared.byteLength, new TextEncoder().encode(prepared.bytes).byteLength);
const rendererKeys = new Set(['bounds', 'x', 'y', 'zoom', 'view', 'region', 'relation']);
function assertNoRendererKeys(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRendererKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.equal(rendererKeys.has(key), false, `renderer field leaked: ${path}.${key}`);
    assertNoRendererKeys(item, `${path}.${key}`);
  }
}
assertNoRendererKeys(prepared.value);
assert.equal(Object.isFrozen(prepared), true);
assert.equal(Object.isFrozen(prepared.value.operations[0]), true);

const submitted = await connection.submit(prepared);
assert.equal(submitted.state, 'submitted');
assert.equal(requests[0].url, '/api/proposals');
assert.equal(requests[0].init.body, prepared.bytes);
assert.equal(requests[0].init.credentials, 'same-origin');
assert.equal(requests[0].init.redirect, 'error');

const observed = await connection.observe(PROPOSAL_ID);
assert.equal(observed.state, 'recorded');
assert.equal(observed.value.exact_comment_readback, true);
assert.equal(requests[1].url, `/api/proposals/${PROPOSAL_ID}`);

await assert.rejects(
  () => connection.submit({ ...prepared, bytes: `${prepared.bytes} ` }),
  error => error instanceof ConnectabilityError && error.code === 'PROPOSAL_CHANGED',
);

const conflict = createJsonConnectability({
  prepare: proposalFrom,
  fetch: async () => new Response(JSON.stringify({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'different meaning',
  }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  }),
});
await assert.rejects(
  async () => conflict.submit(await conflict.prepare({
    package_id: 'pkg.adrs318.semantic-map-connectability-canary',
  })),
  error => (
    error instanceof ConnectabilityError
    && error.code === 'IDEMPOTENCY_CONFLICT'
    && error.status === 409
  ),
);

const tiny = createJsonConnectability({ prepare: proposalFrom, maxBytes: 32, fetch });
await assert.rejects(
  () => tiny.prepare({ package_id: 'pkg.adrs318.semantic-map-connectability-canary' }),
  error => error instanceof ConnectabilityError && error.code === 'PROPOSAL_TOO_LARGE',
);

console.log(JSON.stringify({
  schema: 'check-receipt/1',
  checkId: 'ui.connectability',
  status: 'PASS',
  assertions: 24,
  endpoint: connection.endpoint,
  proposalId: prepared.id,
  proposalDigest: prepared.digest,
  geometryLeaked: false,
  githubKnown: false,
  opsKnown: false,
}));
