import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOURCE_EXPORT_SCHEMA,
  appendDecision,
  createDecision,
  createDecisionLog,
  createEnvelope,
  createInlineSmapUrl,
  createSmapReferenceUrl,
  decompileSmapInvocation,
  decompileSmapUrl,
  encodeEnvelopeToken,
  envelopeDigest,
  exportEnvelopeSources,
} from '../transport/public-codec.js';
import { canonicalJson } from '../protocol/index.js';

const sourceText = readFileSync(new URL('../examples/new.jsonl', import.meta.url), 'utf8');
const records = sourceText.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const view = { pattern: 'map/1', frame: { focus: 'root', scale: 1.25 } };
const initial = await createDecisionLog(records, 'source-export-proof');
const proposal = (await createDecision(
  initial.head,
  [{ type: 'RenameRegion', regionId: 'root', label: 'URLから更新済み' }],
  initial.records,
)).decision;
const envelope = await createEnvelope(initial.log, proposal, view);
const url = await createInlineSmapUrl(envelope, { base: 'https://example.test/app' });
const exported = await decompileSmapUrl(url);
const exportedByInvocation = await decompileSmapInvocation(url);

assert.equal(exported.schema, SOURCE_EXPORT_SCHEMA);
assert.equal(exported.mapId, 'source-export-proof');
assert.equal(exported.head, initial.head);
assert.equal(exported.stateHash, initial.stateHash);
assert.equal(exported.stateJSONL.endsWith('\n'), true);
assert.equal(exported.decisionLogJSONL, initial.log);
assert.equal(exported.envelopeJSON, `${canonicalJson(envelope)}\n`);
assert.deepEqual(exported.view, view);
assert.equal(exported.delivery.mode, 'inline');
assert.equal(JSON.parse(exported.stateJSONL.split('\n')[1]).label, 'Untitled');
assert.equal(JSON.parse(exported.proposal.stateJSONL.split('\n')[1]).label, 'URLから更新済み');
assert.equal(exported.proposal.decisionId, proposal.id);
assert.equal(exported.proposalStateJSONL, exported.proposal.stateJSONL);
assert.equal(exportedByInvocation.proposalStateJSONL, exported.proposalStateJSONL);
assert.deepEqual(exportedByInvocation.view, exported.view);
assert.equal(exported.proposal.stateHash, proposal.stateHash);

const fromEnvelope = await exportEnvelopeSources(envelope);
assert.equal(fromEnvelope.stateJSONL, exported.stateJSONL);
assert.equal(fromEnvelope.decisionLogJSONL, exported.decisionLogJSONL);
assert.equal(fromEnvelope.envelopeJSON, exported.envelopeJSON);
assert.equal(fromEnvelope.delivery, null);

const roundtripEnvelope = JSON.parse(exported.envelopeJSON);
assert.equal(await encodeEnvelopeToken(roundtripEnvelope), await encodeEnvelopeToken(envelope));

const accepted = await appendDecision(initial.log, proposal);
const acceptedEnvelope = await createEnvelope(accepted.log, null, view);
const acceptedUrl = await createInlineSmapUrl(acceptedEnvelope, { base: 'https://example.test/app' });
const after = await decompileSmapUrl(acceptedUrl);
assert.equal(after.proposal, null);
assert.equal(after.proposalStateJSONL, null);
assert.equal(after.decisionLogJSONL, accepted.log);
assert.equal(after.decisionLogJSONL.trimEnd().split('\n').length, 2);
assert.equal(JSON.parse(after.stateJSONL.split('\n')[1]).label, 'URLから更新済み');
assert.notEqual(after.head, initial.head);
assert.notEqual(after.stateHash, initial.stateHash);

const digest = await envelopeDigest(acceptedEnvelope);
const referenceUrl = createSmapReferenceUrl(digest, 'https://example.test/app');
const reference = await decompileSmapUrl(referenceUrl, {
  fetchImpl: async (request, options) => {
    assert.equal(request, `https://example.test/artifacts/${encodeURIComponent(digest)}`);
    assert.equal(options.method, 'GET');
    return new Response(JSON.stringify(acceptedEnvelope), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
assert.equal(reference.delivery.mode, 'reference');
assert.equal(reference.delivery.digest, digest);
assert.equal(reference.stateJSONL, after.stateJSONL);
assert.equal(reference.decisionLogJSONL, after.decisionLogJSONL);

await assert.rejects(
  decompileSmapInvocation('https://example.test/app'),
  /URL has no #smap or #smap-ref invocation/u,
);

console.log(JSON.stringify({
  schema: 'semantic-map-source-export-proof/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  acceptedStateRecords: after.stateJSONL.trimEnd().split('\n').length,
  decisionCountBefore: exported.decisionLogJSONL.trimEnd().split('\n').length,
  decisionCountAfter: after.decisionLogJSONL.trimEnd().split('\n').length,
  proposalStateAvailable: Boolean(exported.proposal),
  inlineRoundtrip: true,
  referenceRoundtrip: true,
}, null, 2));
