import assert from 'node:assert/strict';
import {
  createDecisionLog,
  createEnvelope,
} from '../protocol/index.js';
import {
  MAX_ENVELOPE_BYTES,
  MAX_PUBLISH_RECEIPT_BYTES,
  MAX_URL_CHARS,
  PUBLISH_RECEIPT_SCHEMA,
  artifactUrlForDigest,
  createHttpArtifactPublisher,
  createInlineSmapUrl,
  createSmapReferenceUrl,
  inspectSmapDelivery,
  planSmapDelivery,
  publishSmapReference,
  readSmapHash,
  readSmapInvocation,
  resolveSmapInvocation,
} from '../transport/index.js';

const records = Object.freeze([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Delivery proof' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 900, 620], summary: '' },
  { type: 'region', id: 'proof', parent: 'root', label: 'Proof', kind: 'evidence', bounds: [70, 90, 320, 210], summary: '' },
]);
const log = await createDecisionLog(records, 'semantic-map:test:url-delivery');

function view(sourceHref) {
  return {
    pattern: 'graph/1',
    resourceComposition: {
      schema: 'typed-resource-composition/1',
      resources: [{
        id: 'external-image',
        contract: 'image/1',
        source: { type: 'url', href: sourceHref },
        provenanceRef: 'provenance:url-delivery-proof:2026-08-13',
      }],
      placements: [{
        id: 'as-element',
        resourceRef: 'external-image',
        targetRef: 'element:resource-panel',
        slot: 'content',
        view: { alt: 'External proof image', fit: 'contain' },
      }],
    },
  };
}

async function envelope(sourceHref) {
  return createEnvelope(log.log, null, view(sourceHref));
}

function deterministicNoise(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = 0x6d2b79f5;
  let result = '';
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result += alphabet[(state >>> 0) % alphabet.length];
  }
  return result;
}

const base = 'https://proof.example.test/app';
const small = await envelope('https://assets.example.test/image.svg?rev=7');
const inspected = await inspectSmapDelivery(small, { base });
assert.equal(inspected.status, 'ready');
assert.equal(inspected.canRender, true);
assert.equal(inspected.canInline, true);
assert.equal(inspected.canPublish, true);
assert.ok(inspected.urlChars < MAX_URL_CHARS);
assert.equal(inspected.externalResources, 1);
assert.ok(inspected.diagnostics.some((item) => item.code === 'MUTABLE_EXTERNAL_RESOURCE'));

const inlineUrl = await createInlineSmapUrl(small, { base });
assert.equal(readSmapInvocation(inlineUrl).mode, 'inline');
const inlineResolved = await resolveSmapInvocation(inlineUrl);
assert.deepEqual(inlineResolved.envelope, small);
const inlinePlan = await planSmapDelivery(small, { base });
assert.equal(inlinePlan.status, 'ready');
assert.equal(inlinePlan.mode, 'inline');
assert.equal(inlinePlan.requiresPublish, false);

const oversized = await envelope(`https://assets.example.test/image.svg#smap=${deterministicNoise(7_700)}`);
const oversizedInspection = await inspectSmapDelivery(oversized, { base });
assert.equal(oversizedInspection.canRender, true);
assert.equal(oversizedInspection.canInline, false);
assert.equal(oversizedInspection.canPublish, true);
assert.ok(oversizedInspection.urlChars > MAX_URL_CHARS);
assert.ok(oversizedInspection.diagnostics.some((item) => item.code === 'INLINE_URL_TOO_LARGE'));
await assert.rejects(() => createInlineSmapUrl(oversized, { base }), /INLINE_URL_TOO_LARGE/u);
const missingPublisherPlan = await planSmapDelivery(oversized, { base });
assert.equal(missingPublisherPlan.status, 'publisher-required');
assert.equal(missingPublisherPlan.code, 'PUBLISHER_REQUIRED');
assert.equal(missingPublisherPlan.mode, 'reference');
assert.equal(missingPublisherPlan.available, false);
assert.equal(missingPublisherPlan.stored, false);
const publishPlan = await planSmapDelivery(oversized, { base, publisherAvailable: true });
assert.equal(publishPlan.status, 'publish-required');
assert.equal(publishPlan.code, 'PUBLISH_CONFIRMATION_REQUIRED');
assert.equal(publishPlan.url, createSmapReferenceUrl(oversizedInspection.digest, base));
const knownArtifactUrl = artifactUrlForDigest(oversizedInspection.digest, { base });
const knownPlan = await planSmapDelivery(oversized, { base, knownReferences: [knownArtifactUrl] });
assert.equal(knownPlan.status, 'ready');
assert.equal(knownPlan.mode, 'reference');
assert.equal(knownPlan.available, true);
assert.equal(knownPlan.stored, true);
assert.equal(knownPlan.artifactUrl, knownArtifactUrl);
const otherOriginPlan = await planSmapDelivery(oversized, {
  base: 'https://other.example.test/app',
  knownReferences: [knownArtifactUrl],
});
assert.equal(otherOriginPlan.status, 'publisher-required', 'MUTATION:publisher-reference-exact-location');

let publishCalls = 0;
const published = await publishSmapReference(oversized, {
  base,
  publisher: async (request) => {
    publishCalls += 1;
    assert.equal(request.schema, 'semantic-map-artifact-publish-request/1');
    assert.deepEqual(request.envelope, oversizedInspection.envelope);
    assert.equal(request.digest, oversizedInspection.digest);
    return {
      schema: PUBLISH_RECEIPT_SCHEMA,
      digest: request.digest,
      stored: true,
      location: artifactUrlForDigest(request.digest, { base }),
    };
  },
});
assert.equal(publishCalls, 1, 'publish must occur only after explicit publishSmapReference');
assert.equal(published.mode, 'reference');
assert.equal(readSmapInvocation(published.url).mode, 'reference');
assert.equal(published.digest, oversizedInspection.digest);
await assert.rejects(() => readSmapHash(published.url), /unsupported fragment/u, 'nested resolver must remain inline-only');

await assert.rejects(
  () => publishSmapReference(oversized, {
    base,
    publisher: async (request) => ({
      schema: PUBLISH_RECEIPT_SCHEMA,
      digest: request.digest,
      stored: false,
      location: artifactUrlForDigest(request.digest, { base }),
    }),
  }),
  /did not confirm storage/u,
  'MUTATION:publisher-receipt-stored',
);
await assert.rejects(
  () => publishSmapReference(oversized, {
    base,
    publisher: async (request) => ({
      schema: PUBLISH_RECEIPT_SCHEMA,
      digest: request.digest,
      stored: true,
      location: 'https://wrong.example.test/artifacts/value',
    }),
  }),
  /location mismatch/u,
  'MUTATION:publisher-receipt-location',
);

let getCalls = 0;
const referenceResolved = await resolveSmapInvocation(published.url, {
  fetchImpl: async (url, init) => {
    getCalls += 1;
    assert.deepEqual({
      method: init.method,
      credentials: init.credentials,
      redirect: init.redirect,
      referrerPolicy: init.referrerPolicy,
    }, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    }, 'MUTATION:reference-fetch-boundary');
    assert.match(url, /\/artifacts\/sha256%3A[0-9a-f]{64}$/u);
    return new Response(JSON.stringify(oversizedInspection.envelope), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
assert.equal(getCalls, 1);
assert.deepEqual(referenceResolved.envelope, oversizedInspection.envelope);
assert.equal(referenceResolved.delivery.digest, published.digest);

const wrongReference = createSmapReferenceUrl(`sha256:${'0'.repeat(64)}`, base);
await assert.rejects(
  () => resolveSmapInvocation(wrongReference, {
    fetchImpl: async () => new Response(JSON.stringify(small), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  }),
  /digest mismatch/u,
);

const paddedArtifact = `${JSON.stringify(inspected.envelope)}${' '.repeat(MAX_ENVELOPE_BYTES)}`;
await assert.rejects(
  () => resolveSmapInvocation(createSmapReferenceUrl(inspected.digest, base), {
    fetchImpl: async () => new Response(paddedArtifact, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  }),
  new RegExp(`artifact response exceeds ${MAX_ENVELOPE_BYTES} bytes`, 'u'),
  'MUTATION:reference-response-byte-limit',
);

await assert.rejects(
  () => resolveSmapInvocation(createSmapReferenceUrl(inspected.digest, base), {
    fetchImpl: async () => new Response(JSON.stringify(inspected.envelope), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
  }),
  /Content-Type must be application JSON/u,
  'MUTATION:require-reference-json-content-type',
);



await assert.rejects(
  () => resolveSmapInvocation(createSmapReferenceUrl(inspected.digest, base), {
    fetchImpl: async () => new Response(JSON.stringify(inspected.envelope), {
      status: 200,
      headers: { 'content-type': 'text/problem+json' },
    }),
  }),
  /Content-Type must be application JSON/u,
  'MUTATION:reject-non-application-plus-json',
);

assert.throws(
  () => createSmapReferenceUrl(inspected.digest, 'file:///tmp/app'),
  /reference base requires an absolute HTTP\(S\) URL/u,
  'MUTATION:reference-base-http-only',
);

await assert.rejects(
  () => publishSmapReference(small, {
    base,
    publisher: async () => ({ schema: PUBLISH_RECEIPT_SCHEMA }),
  }),
  /publisher receipt digest mismatch/u,
  'MUTATION:require-publisher-receipt-digest',
);

const priorLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'location', {
  configurable: true,
  value: { href: 'https://customer.example.test/app#draft' },
});
let defaultOriginPublished;
let defaultOriginPostUrl = null;
try {
  defaultOriginPublished = await publishSmapReference(small, {
    publisher: async (request) => ({
      schema: PUBLISH_RECEIPT_SCHEMA,
      digest: request.digest,
      stored: true,
      location: artifactUrlForDigest(request.digest, { base: globalThis.location.href }),
    }),
  });
  assert.equal(
    new URL(defaultOriginPublished.url).origin,
    'https://customer.example.test',
    'MUTATION:publish-default-current-origin',
  );

  const defaultOriginPublisher = createHttpArtifactPublisher({
    fetchImpl: async (url, init) => {
      defaultOriginPostUrl = url;
      assert.equal(url, 'https://customer.example.test/artifacts', 'MUTATION:publisher-default-current-origin');
      assert.deepEqual({
        method: init.method,
        credentials: init.credentials,
        redirect: init.redirect,
        referrerPolicy: init.referrerPolicy,
      }, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }, 'MUTATION:publisher-fetch-boundary');
      const location = `/artifacts/${encodeURIComponent(inspected.digest)}`;
      return new Response(JSON.stringify({
        schema: PUBLISH_RECEIPT_SCHEMA,
        digest: inspected.digest,
        stored: true,
        location,
      }), {
        status: 201,
        headers: { 'content-type': 'application/json', location },
      });
    },
  });
  await publishSmapReference(small, { publisher: defaultOriginPublisher });
  assert.equal(
    artifactUrlForDigest(inspected.digest, { input: `/app#smap-ref=${encodeURIComponent(inspected.digest)}` }),
    `https://customer.example.test/artifacts/${encodeURIComponent(inspected.digest)}`,
    'MUTATION:relative-reference-uses-current-origin',
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { baseURI: 'https://base-element.example.test/redirected-app' },
  });
  assert.equal(
    new URL(createSmapReferenceUrl(inspected.digest)).origin,
    'https://customer.example.test',
    'MUTATION:current-origin-not-document-base',
  );
} finally {
  if (priorLocation) Object.defineProperty(globalThis, 'location', priorLocation);
  else delete globalThis.location;
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
  else delete globalThis.document;
}

if (!priorLocation) {
  assert.throws(
    () => createSmapReferenceUrl(inspected.digest),
    /reference base requires an absolute HTTP\(S\) URL or current HTTP\(S\) document/u,
    'MUTATION:no-placeholder-reference-origin',
  );
}

const secret = await envelope('https://assets.example.test/image.svg?api_token=do-not-share');
const secretInspection = await inspectSmapDelivery(secret, { base });
assert.equal(secretInspection.canRender, true);
assert.equal(secretInspection.canInline, false);
assert.equal(secretInspection.canPublish, false);
assert.ok(secretInspection.diagnostics.some((item) => item.code === 'POSSIBLE_SECRET_IN_URL'));
let forbiddenPublishCalls = 0;
await assert.rejects(
  () => publishSmapReference(secret, {
    base,
    publisher: async () => { forbiddenPublishCalls += 1; return {}; },
  }),
  /POSSIBLE_SECRET_IN_URL/u,
);
assert.equal(forbiddenPublishCalls, 0);

let httpRequest = null;
const httpPublisher = createHttpArtifactPublisher({
  base,
  fetchImpl: async (url, init) => {
    httpRequest = { url, ...init };
    const location = `/artifacts/${encodeURIComponent(inspected.digest)}`;
    return new Response(JSON.stringify({
      schema: PUBLISH_RECEIPT_SCHEMA,
      digest: inspected.digest,
      stored: true,
      location,
    }), {
      status: 201,
      headers: {
        'content-type': 'application/vnd.roccho.semantic-map-artifact-receipt+json',
        location,
      },
    });
  },
});
const httpPublished = await publishSmapReference(small, { base, publisher: httpPublisher });
assert.equal(httpRequest.method, 'POST');
assert.notEqual(httpRequest.method, 'QUERY');
assert.equal(httpRequest.url, 'https://proof.example.test/artifacts');
assert.equal(httpRequest.credentials, 'same-origin');
assert.equal(httpRequest.redirect, 'error');
assert.equal(httpRequest.referrerPolicy, 'no-referrer');
assert.deepEqual(JSON.parse(httpRequest.body), small);
assert.equal(httpPublished.receipt.method, 'POST');
assert.equal(httpPublished.receipt.digest, inspected.digest);
assert.equal(httpPublished.receipt.body.digest, inspected.digest);

const unboundHttpPublisher = createHttpArtifactPublisher({
  base,
  fetchImpl: async () => new Response(JSON.stringify({
    schema: PUBLISH_RECEIPT_SCHEMA,
    stored: true,
    location: `/artifacts/${encodeURIComponent(inspected.digest)}`,
  }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  }),
});
await assert.rejects(
  () => publishSmapReference(small, { base, publisher: unboundHttpPublisher }),
  /artifact POST digest mismatch/u,
  'MUTATION:http-receipt-must-be-server-bound',
);

const oversizedReceiptPublisher = createHttpArtifactPublisher({
  base,
  fetchImpl: async () => new Response(
    `${JSON.stringify({ schema: PUBLISH_RECEIPT_SCHEMA, digest: inspected.digest, stored: true, location: `/artifacts/${encodeURIComponent(inspected.digest)}` })}${' '.repeat(MAX_PUBLISH_RECEIPT_BYTES)}`,
    { status: 201, headers: { 'content-type': 'application/json' } },
  ),
});
await assert.rejects(
  () => publishSmapReference(small, { base, publisher: oversizedReceiptPublisher }),
  new RegExp(`publisher receipt exceeds ${MAX_PUBLISH_RECEIPT_BYTES} bytes`, 'u'),
  'MUTATION:publisher-receipt-byte-limit',
);

assert.throws(
  () => createHttpArtifactPublisher({ base, endpoint: 'javascript:alert(1)', fetchImpl: async () => null }),
  /publisher endpoint must use http or https/u,
  'MUTATION:publisher-endpoint-http-only',
);

console.log(JSON.stringify({
  schema: 'semantic-map-url-delivery-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  inlineUrlChars: inspected.urlChars,
  oversizedUrlChars: oversizedInspection.urlChars,
  referenceUrlChars: published.url.length,
  publishCalls,
  getCalls,
  publishMethod: httpRequest.method,
  queryUsed: false,
  referenceMaxBytes: MAX_ENVELOPE_BYTES,
  publishReceiptMaxBytes: MAX_PUBLISH_RECEIPT_BYTES,
  defaultReferenceOrigin: new URL(defaultOriginPublished.url).origin,
  defaultPublisherEndpoint: defaultOriginPostUrl,
  plans: {
    inline: inlinePlan.status,
    missingPublisher: missingPublisherPlan.status,
    explicitPublish: publishPlan.status,
    knownReference: knownPlan.status,
  },
}));
