import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDecisionPacket } from '../projection/to-semantic-map.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const inputPath = path.join(repoRoot, 'examples', 'render.decision-packet', 'input', 'decision-packet.json');
const distRoot = path.join(repoRoot, 'examples', 'render.decision-packet', 'dist');

await assert.rejects(fs.access(distRoot), undefined, 'decision-packet dist must not be checked in');
const packet = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const first = await projectDecisionPacket(packet);
const second = await projectDecisionPacket(structuredClone(packet));
assert.deepEqual(first.envelope, second.envelope);
assert.deepEqual(first.records, second.records);
assert.equal(first.packetDigest, packet.packet_digest);

console.log(JSON.stringify({
  schema: 'decision-packet-example-reproducibility/2',
  status: 'PASS',
  checkedInDist: false,
  deterministicProjection: true,
}));
