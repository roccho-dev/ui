import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SemanticDomainStore, createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import { createDecision, createDecisionLog, createEnvelope } from '../protocol/index.js';
import { DecisionRuntime } from '../authoring/runtime.js';

const records = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8'));

function deterministicNoise(length, seed) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = seed >>> 0;
  let result = '';
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result += alphabet[(state >>> 0) % alphabet.length];
  }
  return result;
}

function oversizedRecords() {
  const value = structuredClone(records);
  const additions = [];
  for (let index = 0; index < 16; index += 1) {
    additions.push({
      type: 'region',
      id: `delivery-proof-${index}`,
      parent: 'map',
      label: `Delivery proof ${index}`,
      kind: 'evidence',
      bounds: [380 + (index % 4) * 170, 40 + Math.floor(index / 4) * 150, 150, 120],
      summary: deterministicNoise(1_800, 0x6d2b79f5 ^ (index * 0x9e3779b9)),
    });
  }
  const firstRelation = value.findIndex((record) => record.type === 'relation');
  value.splice(firstRelation < 0 ? value.length : firstRelation, 0, ...additions);
  return value;
}

const publisherDisclosure = Object.freeze({
  label: 'Immutable proof store',
  visibility: 'shared by reference URL',
  retention: 'immutable test lifetime',
  cost: 'no test charge',
});
const publisherEndpoint = 'https://example.test/artifacts';
function publisherReceipt(request, detail = {}) {
  return Object.freeze({
    schema: 'semantic-map-artifact-store-receipt/1',
    digest: request.digest,
    stored: true,
    location: `${publisherEndpoint}/${encodeURIComponent(request.digest)}`,
    ...detail,
  });
}
function publisherPort(publish) {
  return Object.freeze({
    schema: 'semantic-map-publisher-port/1',
    kind: 'explicit-http-write',
    disclosure: publisherDisclosure,
    publish,
  });
}
const log = await createDecisionLog(records, 'urn:test:runtime');
const envelope = await createEnvelope(log.log, null, { pattern: 'map/1' });
const replacements = [];
const validateRecords = async (candidate, context) => {
  createSemanticMap(candidate);
  assert.ok(context.view.pattern);
  return { validated: true };
};
const runtime = await DecisionRuntime.create(envelope, {
  baseUrl: () => replacements.at(-1) ?? 'https://example.test/app',
  replaceUrl: (url) => replacements.push(url),
  validateRecords,
});
const store = new SemanticDomainStore(createSemanticMap(runtime.records));
runtime.attachStore(store);
assert.equal(runtime.ready, true);
assert.equal(typeof runtime.setView, 'undefined', 'obsolete API alias must not exist');
const canonical = await runtime.canonicalize();
assert.equal(replacements.at(-1), canonical);
assert.match(canonical, /\/app#smap=/u);

store.perform({ type: 'RenameRegion', regionId: 'request', label: 'Runtime draft' });
assert.equal(runtime.draftCount(), 1);
const proposal = await runtime.createDraftProposal();
const proposalUrl = await runtime.proposalUrl(proposal);
assert.match(proposalUrl, /#smap=/u);
const oldHead = runtime.head;
const accepted = await runtime.accept(proposal);
assert.notEqual(runtime.head, oldHead);
assert.equal(accepted.decisionId, runtime.head);
assert.equal(runtime.draftCount(), 0);
assert.equal(store.domain.regions.get('request').label, 'Runtime draft');
assert.equal(runtime.proposal, null);

const graphChange = await runtime.changeView({ pattern: 'graph/1' });
assert.equal(runtime.view.pattern, 'graph/1');
assert.equal(graphChange.head, runtime.head, 'View change must not change semantic Head');
store.perform({ type: 'RenameRegion', regionId: 'request', label: 'second draft' });
await assert.rejects(runtime.changeView({ pattern: 'map/1' }), /Local Draft is active/u);
const rejectedUrl = await runtime.reject({ local: true });
assert.match(rejectedUrl, /#smap=/u);
assert.equal(runtime.draftCount(), 0);
assert.equal(store.domain.regions.get('request').label, 'Runtime draft');

const rollbackReplacements = [];
const rollbackRuntime = await DecisionRuntime.create(
  await createEnvelope(runtime.log, null, { pattern: 'map/1' }),
  {
    baseUrl: () => rollbackReplacements.at(-1) ?? 'https://example.test/app#accepted',
    replaceUrl: (url) => rollbackReplacements.push(url),
    validateRecords,
  },
);
const rollbackStore = new SemanticDomainStore(createSemanticMap(rollbackRuntime.records));
rollbackRuntime.attachStore(rollbackStore);
rollbackStore.perform({ type: 'RenameRegion', regionId: 'request', label: 'rollback draft' });
const rollbackProposal = await rollbackRuntime.createDraftProposal();
const originalReplaceRecords = rollbackStore.replaceRecords.bind(rollbackStore);
let replaceCalls = 0;
rollbackStore.replaceRecords = (nextRecords, options) => {
  replaceCalls += 1;
  if (replaceCalls === 1) throw new Error('synthetic store replacement failure');
  return originalReplaceRecords(nextRecords, options);
};
const rollbackHead = rollbackRuntime.head;
const rollbackLog = rollbackRuntime.log;
const rollbackState = rollbackStore.toJSONL();
await assert.rejects(rollbackRuntime.accept(rollbackProposal), /synthetic store replacement failure/u);
assert.equal(rollbackRuntime.head, rollbackHead);
assert.equal(rollbackRuntime.log, rollbackLog);
assert.equal(rollbackStore.toJSONL(), rollbackState);
assert.equal(rollbackReplacements.at(-1), 'https://example.test/app#accepted', 'MUTATION:remove-accept-url-rollback');

const largeLog = await createDecisionLog(oversizedRecords(), 'urn:test:runtime-large');
const largeEnvelope = await createEnvelope(largeLog.log, null, { pattern: 'map/1' });
const referenceBase = `https://example.test/app#smap-ref=sha256%3A${'1'.repeat(64)}`;

const blockedReplacements = [];
const blockedRuntime = await DecisionRuntime.create(largeEnvelope, {
  artifactEndpoint: publisherEndpoint,
  baseUrl: () => blockedReplacements.at(-1) ?? referenceBase,
  replaceUrl: (url) => blockedReplacements.push(url),
  validateRecords,
});
const blockedStore = new SemanticDomainStore(createSemanticMap(blockedRuntime.records));
blockedRuntime.attachStore(blockedStore);
blockedStore.perform({ type: 'RenameRegion', regionId: 'request', label: 'Publisher required' });
const blockedProposal = await blockedRuntime.createDraftProposal();
const blockedPlan = await blockedRuntime.preflightAccept(blockedProposal);
assert.equal(blockedPlan.delivery.mode, 'reference');
assert.equal(blockedPlan.delivery.status, 'blocked', 'MUTATION:require-publisher');
assert.equal(blockedPlan.delivery.code, 'PUBLISHER_REQUIRED');
assert.match(blockedPlan.delivery.plannedUrl, /#smap-ref=/u);
const blockedHead = blockedRuntime.head;
await assert.rejects(
  blockedRuntime.accept(blockedProposal, { confirmPublish: true, expectedDigest: blockedPlan.delivery.digest }),
  (error) => error.code === 'PUBLISHER_REQUIRED',
  'MUTATION:require-publisher',
);
assert.equal(blockedRuntime.head, blockedHead);
assert.equal(blockedRuntime.draftCount(), 1, 'blocked publication must preserve the Local Draft');
assert.equal(blockedReplacements.length, 0, 'blocked publication must not replace the URL');
const blockedRejectedUrl = await blockedRuntime.reject({ local: true });
assert.equal(blockedRejectedUrl, referenceBase, 'MUTATION:local-reject-zero-write Local Reject must retain the accepted reference URL');
assert.equal(blockedRuntime.draftCount(), 0);
assert.equal(blockedStore.domain.regions.get('request').label, records.find((item) => item.id === 'request').label);
assert.equal(blockedReplacements.length, 0, 'MUTATION:local-reject-zero-write Local Reject must not publish or replace the accepted URL');

const publishRequests = [];
const publishedReplacements = [];
const publishedRuntime = await DecisionRuntime.create(largeEnvelope, {
  baseUrl: () => publishedReplacements.at(-1) ?? referenceBase,
  replaceUrl: (url) => publishedReplacements.push(url),
  validateRecords,
  artifactEndpoint: publisherEndpoint,
  publisherPort: publisherPort(async (request) => {
    publishRequests.push(request);
    return publisherReceipt(request);
  }),
});
const publishedStore = new SemanticDomainStore(createSemanticMap(publishedRuntime.records));
publishedRuntime.attachStore(publishedStore);
publishedStore.perform({ type: 'RenameRegion', regionId: 'request', label: 'Published continuation' });
const publishedProposal = await publishedRuntime.createDraftProposal();
const publishedPlan = await publishedRuntime.preflightAccept(publishedProposal);
assert.equal(publishedPlan.delivery.mode, 'reference');
assert.equal(publishedPlan.delivery.status, 'confirmation-required');
assert.equal(publishedPlan.delivery.code, 'PUBLISH_CONFIRMATION_REQUIRED');
assert.deepEqual(publishedPlan.delivery.publisher, publisherDisclosure);
assert.equal(publishRequests.length, 0, 'preflight must not publish');
const publishedHead = publishedRuntime.head;
await assert.rejects(
  publishedRuntime.accept(publishedProposal, { expectedDigest: publishedPlan.delivery.digest }),
  (error) => error.code === 'PUBLISH_CONFIRMATION_REQUIRED',
  'MUTATION:require-publish-confirmation',
);
assert.equal(publishRequests.length, 0, 'Accept without explicit confirmation must not publish');
assert.equal(publishedRuntime.head, publishedHead);
assert.equal(publishedRuntime.draftCount(), 1);
const publishedAccepted = await publishedRuntime.accept(publishedProposal, {
  confirmPublish: true,
  expectedDigest: publishedPlan.delivery.digest,
});
assert.equal(publishRequests.length, 1);
assert.equal(publishedAccepted.delivery.mode, 'reference');
assert.equal(publishedAccepted.delivery.digest, publishRequests[0].digest);
assert.equal(publishedAccepted.delivery.receipt.stored, true);
assert.equal(publishedAccepted.url, publishedPlan.delivery.plannedUrl);
assert.match(publishedAccepted.url, /#smap-ref=/u);
assert.equal(publishedRuntime.draftCount(), 0);
assert.equal(publishedStore.domain.regions.get('request').label, 'Published continuation');

let failedPublishCalls = 0;
const failedRuntime = await DecisionRuntime.create(largeEnvelope, {
  baseUrl: () => referenceBase,
  replaceUrl: () => { throw new Error('URL must not change after failed publish'); },
  validateRecords,
  artifactEndpoint: publisherEndpoint,
  publisherPort: publisherPort(async () => {
    failedPublishCalls += 1;
    throw new Error('synthetic publisher failure');
  }),
});
const failedStore = new SemanticDomainStore(createSemanticMap(failedRuntime.records));
failedRuntime.attachStore(failedStore);
failedStore.perform({ type: 'RenameRegion', regionId: 'request', label: 'Failed publication draft' });
const failedProposal = await failedRuntime.createDraftProposal();
const failedPlan = await failedRuntime.preflightAccept(failedProposal);
const failedHead = failedRuntime.head;
await assert.rejects(
  failedRuntime.accept(failedProposal, { confirmPublish: true, expectedDigest: failedPlan.delivery.digest }),
  /synthetic publisher failure/u,
);
assert.equal(failedPublishCalls, 1);
assert.equal(failedRuntime.head, failedHead);
assert.equal(failedRuntime.draftCount(), 1);
assert.equal(failedStore.domain.regions.get('request').label, 'Failed publication draft');

const stalePublishRequests = [];
const staleReplacements = [];
let staleStore = null;
const staleRuntime = await DecisionRuntime.create(largeEnvelope, {
  baseUrl: () => referenceBase,
  replaceUrl: (url) => staleReplacements.push(url),
  validateRecords,
  artifactEndpoint: publisherEndpoint,
  publisherPort: publisherPort(async (request) => {
    stalePublishRequests.push(request);
    staleStore.perform({ type: 'RenameRegion', regionId: 'request', label: 'Concurrent draft during publish' });
    return publisherReceipt(request);
  }),
});
staleStore = new SemanticDomainStore(createSemanticMap(staleRuntime.records));
staleRuntime.attachStore(staleStore);
staleStore.perform({ type: 'RenameRegion', regionId: 'request', label: 'Planned before publish' });
const staleProposal = await staleRuntime.createDraftProposal();
const stalePlan = await staleRuntime.preflightAccept(staleProposal);
const staleHead = staleRuntime.head;
await assert.rejects(
  staleRuntime.accept(staleProposal, { confirmPublish: true, expectedDigest: stalePlan.delivery.digest }),
  /Accept draft changed during delivery/u,
  'MUTATION:reject-stale-published-accept',
);
assert.equal(stalePublishRequests.length, 1);
assert.equal(staleRuntime.head, staleHead);
assert.equal(staleReplacements.length, 0);
assert.equal(staleRuntime.draftCount(), 2);
assert.equal(staleStore.domain.regions.get('request').label, 'Concurrent draft during publish');

const viewPublishRequests = [];
const viewReplacements = [];
const viewRuntime = await DecisionRuntime.create(largeEnvelope, {
  baseUrl: () => viewReplacements.at(-1) ?? referenceBase,
  replaceUrl: (url) => viewReplacements.push(url),
  validateRecords,
  artifactEndpoint: publisherEndpoint,
  publisherPort: publisherPort(async (request) => {
    viewPublishRequests.push(request);
    return publisherReceipt(request);
  }),
});
viewRuntime.attachStore(new SemanticDomainStore(createSemanticMap(viewRuntime.records)));
const viewHead = viewRuntime.head;
const viewLog = viewRuntime.log;
const viewPlan = await viewRuntime.preflightView({ pattern: 'graph/1' });
assert.equal(viewPlan.delivery.status, 'confirmation-required');
await assert.rejects(
  viewRuntime.changeView({ pattern: 'graph/1' }),
  (error) => error.code === 'PUBLISH_CONFIRMATION_REQUIRED',
);
assert.equal(viewPublishRequests.length, 0);
assert.equal(viewRuntime.view.pattern, 'map/1');
const viewChanged = await viewRuntime.changeView({ pattern: 'graph/1' }, { confirmPublish: true });
assert.equal(viewPublishRequests.length, 1);
assert.equal(viewChanged.delivery.mode, 'reference');
assert.equal(viewRuntime.view.pattern, 'graph/1');
assert.equal(viewRuntime.head, viewHead, 'Pattern publish must not append a Decision');
assert.equal(viewRuntime.log, viewLog, 'Pattern publish must not alter DecisionLog');
assert.match(viewReplacements.at(-1), /#smap-ref=/u);

const proposalCreated = await createDecision(
  largeLog.head,
  [{ type: 'RenameRegion', regionId: 'request', label: 'Reject this URL Proposal' }],
  largeLog.records,
);
const proposalEnvelope = await createEnvelope(largeLog.log, proposalCreated.decision, { pattern: 'map/1' });
const rejectionPublishRequests = [];
const rejectionReplacements = [];
const rejectionRuntime = await DecisionRuntime.create(proposalEnvelope, {
  baseUrl: () => rejectionReplacements.at(-1) ?? referenceBase,
  replaceUrl: (url) => rejectionReplacements.push(url),
  validateRecords,
  artifactEndpoint: publisherEndpoint,
  publisherPort: publisherPort(async (request) => {
    rejectionPublishRequests.push(request);
    return publisherReceipt(request);
  }),
});
rejectionRuntime.attachStore(new SemanticDomainStore(createSemanticMap(rejectionRuntime.records)));
const rejectionHead = rejectionRuntime.head;
const rejectionLog = rejectionRuntime.log;
const rejectionPlan = await rejectionRuntime.preflightReject({ local: false });
assert.equal(rejectionPlan.delivery.status, 'confirmation-required');
await assert.rejects(
  rejectionRuntime.reject({ expectedDigest: rejectionPlan.delivery.digest }),
  (error) => error.code === 'PUBLISH_CONFIRMATION_REQUIRED',
);
assert.equal(rejectionPublishRequests.length, 0);
assert.ok(rejectionRuntime.proposal);
const proposalRejectedUrl = await rejectionRuntime.reject({
  confirmPublish: true,
  expectedDigest: rejectionPlan.delivery.digest,
});
assert.equal(rejectionPublishRequests.length, 1);
assert.match(proposalRejectedUrl, /#smap-ref=/u);
assert.equal(rejectionRuntime.proposal, null);
assert.equal(rejectionRuntime.head, rejectionHead);
assert.equal(rejectionRuntime.log, rejectionLog, 'Reject must not alter DecisionLog');

console.log(JSON.stringify({
  schema: 'semantic-map-runtime-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  exactAppend: true,
  viewIsNonSemantic: true,
  localRejectRestored: true,
  failedAcceptRolledBack: true,
  oversizedPublisherRequired: true,
  explicitPublishBeforeAccept: true,
  failedPublishPreservesDraft: true,
  stalePublishedAcceptRejected: true,
  blockedAcceptCanRejectWithoutPublisher: true,
  patternChangeUsesContinuationPlan: true,
  urlProposalRejectUsesContinuationPlan: true,
  obsoleteApiRejected: true,
  urlReplacements: replacements.length,
}));
