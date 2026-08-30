import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSemanticMapRecords } from '../domain/index.js';
import {
  DECISION_SCHEMA,
  ENVELOPE_SCHEMA,
  appendDecision,
  canonicalJson,
  createDecision,
  createDecisionLog,
  createEnvelope,
  decisionId,
  inspectEnvelope,
  parseDecisionLog,
  verifyDecisionLog,
} from '../protocol/index.js';
import { createSmapUrl, decodeEnvelopeToken, encodeEnvelopeToken, readSmapHash } from '../transport/index.js';

const records = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8'));
const created = await createDecisionLog(records, 'urn:test:protocol');
assert.equal(created.decisions.length, 1);
assert.equal(created.decisions[0].schema, DECISION_SCHEMA);
assert.equal(created.head, await decisionId(created.decisions[0]));
assert.equal(created.log, `${canonicalJson(created.decisions[0])}\n`);
assert.deepEqual(parseDecisionLog(created.log), created.decisions);

const proposalResult = await createDecision(created.head, [
  { type: 'RenameRegion', regionId: 'request', label: 'Protocol proposal' },
], created.records);
const proposal = proposalResult.decision;
const preview = await appendDecision(created.log, proposal);
assert.equal(preview.log, `${created.log}${canonicalJson(proposal)}\n`);
assert.equal(preview.records.find((item) => item.id === 'request').label, 'Protocol proposal');
assert.equal((await verifyDecisionLog(preview.log)).head, preview.head);

const view = { pattern: 'map/1', frame: { focus: 'request', scale: 2, select: ['request'] } };
const envelope = await createEnvelope(created.log, proposal, view);
assert.equal(envelope.schema, ENVELOPE_SCHEMA);
const inspection = await inspectEnvelope(envelope);
assert.equal(inspection.base.head, created.head);
assert.equal(inspection.preview.head, preview.head);
assert.deepEqual(inspection.envelope.view, view);

const token = await encodeEnvelopeToken(envelope);
assert.deepEqual(await decodeEnvelopeToken(token), inspection);
const url = await createSmapUrl(envelope, 'https://example.test/old/path?x=1#old');
assert.match(url, /^https:\/\/example\.test\/app#smap=/u);
assert.deepEqual(await readSmapHash(url), inspection);

await assert.rejects(inspectEnvelope({ ...envelope, schema: 'semantic-map-envelope/2' }), /is not semantic-map-envelope\/3/u, 'MUTATION:accept-old-envelope-schema');
const first = JSON.parse(created.log.trim());
const oldDecisionLog = `${canonicalJson({ ...first, schema: 'semantic-map-decision/1' })}\n`;
await assert.rejects(verifyDecisionLog(oldDecisionLog), /is not semantic-map-decision\/2/u, 'MUTATION:accept-old-decision-schema');
await assert.rejects(inspectEnvelope({ ...envelope, obsolete: true }), /obsolete is not allowed/u);
await assert.rejects(verifyDecisionLog(created.log.trim()), /must end with LF/u);
const tampered = `${created.log.slice(0, -2)}x\n`;
await assert.rejects(verifyDecisionLog(tampered), /invalid line/u);
const wrongParent = { ...proposal, parent: `sha256:${'0'.repeat(64)}` };
await assert.rejects(appendDecision(created.log, wrongParent), /is not head/u);

console.log(JSON.stringify({
  schema: 'semantic-map-protocol-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  envelopeSchema: ENVELOPE_SCHEMA,
  decisionSchema: DECISION_SCHEMA,
  decisionsVerified: 2,
  exactAppend: true,
  currentOnly: true,
  tokenChars: token.length,
}));
