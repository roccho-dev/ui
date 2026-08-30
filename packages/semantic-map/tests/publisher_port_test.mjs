import assert from 'node:assert/strict';
import { SemanticDomainStore, createSemanticMap } from '../domain/index.js';
import { createDecision, createDecisionLog, createEnvelope } from '../protocol/index.js';
import { PUBLISH_RECEIPT_SCHEMA, publishSmapReference } from '../transport/index.js';
import { DecisionRuntime } from '../authoring/runtime.js';
import {
  ARTIFACT_STORE_PORT_SCHEMA,
  EXPLICIT_PUBLISHER_CONFIG_SCHEMA,
  HTTP_ARTIFACT_STORE_CONFIG_SCHEMA,
  PUBLISHER_PORT_SCHEMA,
  createArtifactStorePort,
} from '../authoring/publisher.js';

const disclosure = Object.freeze({
  label: 'Proof artifact store',
  visibility: 'URLを知る利用者',
  retention: '30日',
  cost: 'この実証では0円',
});
const config = Object.freeze({
  schema: HTTP_ARTIFACT_STORE_CONFIG_SCHEMA,
  endpoint: '/semantic-artifacts',
  publisher: Object.freeze({
    schema: EXPLICIT_PUBLISHER_CONFIG_SCHEMA,
    disclosure,
  }),
});
let request = null;
let requestCount = 0;
const storePort = createArtifactStorePort(config, {
  base: 'https://proof.example/app',
  fetchImpl: async (url, init) => {
    requestCount += 1;
    request = Object.freeze({ url, ...init });
    const body = JSON.parse(init.body);
    const digest = await (await import('../transport/index.js')).envelopeDigest(body);
    const location = `/semantic-artifacts/${encodeURIComponent(digest)}`;
    return new Response(JSON.stringify({
      schema: PUBLISH_RECEIPT_SCHEMA,
      digest,
      stored: true,
      location,
    }), {
      status: 201,
      headers: { 'content-type': 'application/json', location },
    });
  },
});
const port = storePort.publisher;
assert.equal(storePort.schema, ARTIFACT_STORE_PORT_SCHEMA);
assert.equal(storePort.kind, 'http-artifact-store');
assert.equal(storePort.endpoint, 'https://proof.example/semantic-artifacts');
assert.equal(port.schema, PUBLISHER_PORT_SCHEMA);
assert.equal(port.kind, 'explicit-http-write');
assert.deepEqual(port.disclosure, disclosure);
assert.equal(typeof port.publish, 'function');
const defaultStore = createArtifactStorePort(null, { base: 'https://proof.example/app' });
assert.equal(defaultStore.endpoint, 'https://proof.example/artifacts');
assert.equal(defaultStore.publisher, null);
const detachedDefaultStore = createArtifactStorePort(null, { base: 'about:blank' });
assert.equal(detachedDefaultStore.endpoint, '/artifacts');
assert.equal(detachedDefaultStore.publisher, null, 'detached inline-only documents must not manufacture write capability');
assert.throws(
  () => createArtifactStorePort(config, { base: 'about:blank' }),
  /configured artifact store requires an absolute HTTP\(S\) base/u,
  'MUTATION:publisher-detached-explicit-config',
);
const readOnlyStore = createArtifactStorePort({
  schema: HTTP_ARTIFACT_STORE_CONFIG_SCHEMA,
  endpoint: '/semantic-artifacts',
  publisher: null,
}, { base: 'https://proof.example/app' });
assert.equal(readOnlyStore.endpoint, 'https://proof.example/semantic-artifacts');
assert.equal(readOnlyStore.publisher, null, 'reference GET configuration must not imply write capability');
assert.throws(
  () => createArtifactStorePort({ ...config, extra: true }, { base: 'https://proof.example/app' }),
  /artifact store config fields are invalid/u,
);
assert.throws(
  () => createArtifactStorePort({ ...config, endpoint: '/semantic-artifacts?token=secret' }, { base: 'https://proof.example/app' }),
  /must not contain a query/u,
  'MUTATION:publisher-endpoint-query',
);

const records = Object.freeze([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Publisher port proof' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 900, 620], summary: '' },
]);
const created = await createDecisionLog(records, 'semantic-map:test:publisher-port');
const envelope = await createEnvelope(created.log, null, { pattern: 'graph/1' });
const published = await publishSmapReference(envelope, {
  base: 'https://proof.example/app',
  endpoint: storePort.endpoint,
  publisher: port.publish,
});
assert.equal(request.method, 'POST');
assert.equal(request.url, 'https://proof.example/semantic-artifacts');
assert.equal(request.headers['content-type'], 'application/vnd.roccho.semantic-map-envelope+json');
assert.equal(published.receipt.status, 201);
assert.equal(published.receipt.body.stored, true);
assert.equal(published.artifactUrl, `https://proof.example/semantic-artifacts/${encodeURIComponent(published.digest)}`);

function deterministicNoise(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = 0x6d2b79f5;
  let value = '';
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    value += alphabet[(state >>> 0) % alphabet.length];
  }
  return value;
}

const oversizedEnvelope = await createEnvelope(created.log, null, {
  pattern: 'graph/1',
  resourceComposition: {
    schema: 'typed-resource-composition/1',
    resources: [{
      id: 'publisher-proof-resource',
      contract: 'image/1',
      source: { type: 'url', href: `https://assets.example.test/proof.svg#${deterministicNoise(7_700)}` },
      provenanceRef: 'provenance:publisher-port-test',
    }],
    placements: [{
      id: 'publisher-proof-placement',
      resourceRef: 'publisher-proof-resource',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { alt: 'Publisher proof', fit: 'contain' },
    }],
  },
});
const runtime = await DecisionRuntime.create(oversizedEnvelope, {
  baseUrl: () => 'https://proof.example/app',
  replaceUrl: () => {},
  artifactEndpoint: storePort.endpoint,
  publisherPort: port,
});
runtime.attachStore(new SemanticDomainStore(createSemanticMap(runtime.records)));
const proposal = await createDecision(runtime.head, [{
  type: 'RenameRegion',
  regionId: 'root',
  label: 'Explicit confirmation proof',
}], runtime.records);
const requestsBeforeUnconfirmedAccept = requestCount;
await assert.rejects(
  () => runtime.accept(proposal.decision),
  /PUBLISH_CONFIRMATION_REQUIRED/u,
  'MUTATION:publisher-explicit-confirmation',
);
assert.equal(requestCount, requestsBeforeUnconfirmedAccept);
assert.equal(runtime.head, created.head);

console.log(JSON.stringify({
  schema: 'semantic-map-publisher-port-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  storeConfigSchema: HTTP_ARTIFACT_STORE_CONFIG_SCHEMA,
  publisherConfigSchema: EXPLICIT_PUBLISHER_CONFIG_SCHEMA,
  portSchema: PUBLISHER_PORT_SCHEMA,
  method: request.method,
  endpoint: request.url,
  disclosure,
  unconfirmedAcceptPosts: requestCount - requestsBeforeUnconfirmedAccept,
}));
