import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecisionPacket, inspectDecisionPacket } from '../protocol/packet.js';
import { projectDecisionPacket } from '../projection/to-semantic-map.js';
import { inspectEnvelope } from '../../semantic-map/protocol/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const inputPath = path.join(repoRoot, 'examples', 'render.decision-packet', 'input', 'decision-packet.json');
const packet = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const inspected = await inspectDecisionPacket(packet);
assert.equal(inspected.packet.schema, 'decision-packet/1');
assert.equal(inspected.packet.authority, false);
assert.equal(inspected.packet.privacy_class, 'public');

const first = await projectDecisionPacket(packet);
const second = await projectDecisionPacket(structuredClone(packet));
assert.deepEqual(first.envelope, second.envelope);
assert.deepEqual(first.records, second.records);
assert.equal(first.packetDigest, packet.packet_digest);
const envelope = await inspectEnvelope(first.envelope);
assert.equal(envelope.envelope.view.pattern, 'graph/1');
assert.equal(envelope.base.records.some(record => record.type === 'region' && record.id === 'recommendation'), true);
assert.equal(envelope.base.records.some(record => record.type === 'relation' && record.kind === 'supports'), true);
assert.equal(envelope.base.records.some(record => record.type === 'region' && record.summary.includes(packet.packet_digest)), true);

const body = structuredClone(packet);
delete body.packet_digest;
assert.deepEqual(await createDecisionPacket(body), packet);

const failures = [];
async function rejects(name, mutate) {
  const value = structuredClone(packet);
  await mutate(value);
  await assert.rejects(() => inspectDecisionPacket(value), /decision-packet:/u, name);
  failures.push(name);
}
async function rejectsNormalized(name, mutate) {
  const bodyValue = structuredClone(packet);
  delete bodyValue.packet_digest;
  await mutate(bodyValue);
  await assert.rejects(() => createDecisionPacket(bodyValue), /decision-packet:/u, name);
  failures.push(name);
}
await rejects('private', value => { value.privacy_class = 'private'; });
await rejects('authority', value => { value.authority = true; });
await rejects('tampered', value => { value.recommendation += ' changed'; });
await rejects('html', value => { value.question = '<script>alert(1)</script>'; });
await rejects('secret', value => { value.rationale = 'sk-1234567890abcdefghijklmnop'; });
await rejects('email', value => { value.next_action = 'contact person@example.com'; });
await rejects('unknown field', value => { value.mergeReady = true; });
await rejectsNormalized('duplicate id', value => { value.evidence_for.push(structuredClone(value.evidence_for[0])); });

console.log(JSON.stringify({ schema: 'decision-packet-package-proof/1', status: 'PASS', assertions: 21, destructive: failures }));
