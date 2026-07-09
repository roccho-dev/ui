import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parsePreviewDigestVerifyArgs(argv = []) {
  const parsed = { receiptPath: null, previewPath: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--receipt') parsed.receiptPath = requireValue(argv, ++i, arg);
    else if (arg === '--preview') parsed.previewPath = requireValue(argv, ++i, arg);
    else throw new Error(`unknown preview digest verifier option: ${arg}`);
  }
  if (!parsed.receiptPath) throw new Error('--receipt is required');
  if (!parsed.previewPath) throw new Error('--preview is required');
  return parsed;
}

export function verifyRepoMapPreviewDigest(options = {}) {
  const receiptPath = path.resolve(options.receiptPath);
  const previewPath = path.resolve(options.previewPath);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const expectedDigest = receipt.previewDigest || receipt.generatedPreviewDigest || receipt.generatedArtifactDigest;
  if (!expectedDigest) throw new Error('ops receipt missing preview digest');
  const actualDigest = sha256File(previewPath);
  if (actualDigest !== expectedDigest) throw new Error(`preview digest mismatch: expected ${expectedDigest}, got ${actualDigest}`);
  const result = {
    kind: 'ui.previewDigestVerification.v1',
    status: 'PASS',
    receiptKind: receipt.kind || null,
    receiptPath,
    previewPath,
    expectedDigest,
    actualDigest,
    authority: false,
    generatedArtifactsAreAuthority: false,
    readOnly: true
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function sha256File(file) { return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`; }
function requireValue(argv, index, name) { if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`${name} requires a value`); return argv[index]; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyRepoMapPreviewDigest(parsePreviewDigestVerifyArgs(process.argv.slice(2)));
