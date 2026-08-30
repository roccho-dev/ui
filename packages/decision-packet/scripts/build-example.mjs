import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson } from '../../semantic-map/protocol/index.js';
import { inspectDecisionPacket } from '../protocol/packet.js';
import { projectDecisionPacket } from '../projection/to-semantic-map.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const semanticBuilder = path.join(repoRoot, 'packages', 'semantic-map', 'scripts', 'build-browser-example.mjs');
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const parseArgs = input => Object.fromEntries(input.map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error(`decision-packet-example: expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));

export async function buildDecisionPacketExample({ inputPath, outputRoot }) {
  const packetInput = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const inspected = await inspectDecisionPacket(packetInput);
  const projected = await projectDecisionPacket(inspected.packet);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'decision-packet-example-'));
  try {
    const envelopePath = path.join(temporary, 'envelope.json');
    await fs.writeFile(envelopePath, `${JSON.stringify(projected.envelope, null, 2)}\n`);
    await fs.rm(outputRoot, { recursive: true, force: true });
    const result = spawnSync(process.execPath, [semanticBuilder, `--input=${envelopePath}`, `--out=${outputRoot}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`semantic-map builder failed: ${result.stderr || result.stdout}`);
    const semanticReceipt = JSON.parse(await fs.readFile(path.join(outputRoot, 'receipt.json'), 'utf8'));
    const packetBytes = Buffer.from(`${JSON.stringify(inspected.packet, null, 2)}\n`);
    const htmlBytes = await fs.readFile(path.join(outputRoot, 'index.html'));
    await fs.writeFile(path.join(outputRoot, 'agent.json'), packetBytes);
    const receipt = Object.freeze({
      schema: 'decision-packet-example-build/1',
      status: 'PASS',
      input: Object.freeze({ path: 'input/decision-packet.json', sha256: sha256(await fs.readFile(inputPath)) }),
      packet: Object.freeze({ decisionId: inspected.packet.decision_id, checkpointId: inspected.packet.checkpoint_id, digest: inspected.packet.packet_digest }),
      projection: Object.freeze({ contract: 'semantic-map-envelope/3', sha256: sha256(Buffer.from(canonicalJson(projected.envelope))) }),
      output: Object.freeze({ html: Object.freeze({ path: 'dist/index.html', bytes: htmlBytes.byteLength, sha256: sha256(htmlBytes) }), agent: Object.freeze({ path: 'dist/agent.json', bytes: packetBytes.byteLength, sha256: sha256(packetBytes) }) }),
      semanticMap: semanticReceipt,
      generatedArtifactsAreAuthority: false,
    });
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    await fs.writeFile(path.join(outputRoot, 'receipt.json'), receiptBytes);
    const entries = [
      ['agent.json', packetBytes],
      ['index.html', htmlBytes],
      ['receipt.json', receiptBytes],
    ].map(([file, bytes]) => `${sha256(bytes).slice('sha256:'.length)}  ${file}`).sort();
    await fs.writeFile(path.join(outputRoot, 'MANIFEST.sha256'), `${entries.join('\n')}\n`);
    return Object.freeze({ packet: inspected.packet, projected, receipt, outputRoot });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(repoRoot, args.input ?? path.join('examples', 'render.decision-packet', 'input', 'decision-packet.json'));
  const outputRoot = path.resolve(repoRoot, args.out ?? path.join('examples', 'render.decision-packet', 'dist'));
  const result = await buildDecisionPacketExample({ inputPath, outputRoot });
  console.log(JSON.stringify({ schema: result.receipt.schema, status: result.receipt.status, output: outputRoot }));
}
