import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseModelingProposalEvidenceArgs(argv = []) {
  const parsed = { inputPath: null, outRoot: 'modeling-proposal-evidence-result' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') parsed.inputPath = requireValue(argv, ++i, arg);
    else if (arg === '--out') parsed.outRoot = requireValue(argv, ++i, arg);
    else throw new Error(`unknown modeling proposal evidence option: ${arg}`);
  }
  if (!parsed.inputPath) throw new Error('--input is required');
  return parsed;
}

export function buildModelingProposalEvidence(options = {}) {
  const inputPath = path.resolve(options.inputPath);
  const outRoot = path.resolve(options.outRoot || 'modeling-proposal-evidence-result');
  const source = fs.readFileSync(inputPath, 'utf8');
  const proposal = readProposal(source, inputPath);
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(outRoot, 'preview'), { recursive: true });
  fs.mkdirSync(path.join(outRoot, 'source'), { recursive: true });
  fs.mkdirSync(path.join(outRoot, 'proof'), { recursive: true });
  const html = renderProposalHtml(proposal);
  fs.writeFileSync(path.join(outRoot, 'preview/index.html'), html, 'utf8');
  fs.writeFileSync(path.join(outRoot, 'source/modeling-proposal.input.json'), ensureTrailingNewline(source), 'utf8');
  const manifest = {
    kind: 'ui.modelingProposalEvidenceManifest.v1',
    status: 'PASS',
    issue: 'roccho-dev/ui#133',
    inputPath,
    inputDigest: `sha256:${sha256(source)}`,
    proposalKind: proposal.kind,
    proposalId: proposal.id || null,
    authority: false,
    proposalDisplayOnly: true,
    generatedArtifactsAreAuthority: false,
    promotionOwner: proposal.promotionOwner || 'ops',
    outputs: ['preview/index.html', 'source/modeling-proposal.input.json', 'proof/manifest.json']
  };
  fs.writeFileSync(path.join(outRoot, 'proof/manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: 'modeling-proposal-evidence-built', outRoot, generatedArtifactsAreAuthority: false }, null, 2));
  return { outRoot, manifest };
}

function readProposal(source, label) {
  const trimmed = source.trim();
  if (!trimmed) throw new Error(`empty modeling proposal input: ${label}`);
  if (trimmed.startsWith('{')) return requireProposal(JSON.parse(trimmed), label);
  const records = trimmed.split(/\n+/).map((line) => JSON.parse(line));
  const proposal = records.find((record) => record.kind === 'modeling.proposal.v1' || record.kind?.endsWith('.proposal.v1'));
  return requireProposal(proposal, label);
}
function requireProposal(proposal, label) {
  if (!proposal || typeof proposal !== 'object') throw new Error(`modeling proposal missing in ${label}`);
  if (!String(proposal.kind || '').includes('proposal.v1')) throw new Error(`unsupported modeling proposal kind: ${proposal.kind || 'missing'}`);
  return proposal;
}
function renderProposalHtml(proposal) {
  const op = proposal.operation || {};
  const target = proposal.targetRef || {};
  const evidence = Array.isArray(proposal.evidence) ? proposal.evidence : [];
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generatedArtifactsAreAuthority" content="false"><title>Modeling proposal evidence</title><style>body{font-family:ui-monospace,Menlo,Consolas,monospace;margin:24px;color:#111;background:#fff}.card{border:1px solid #111;padding:16px;max-width:960px}.row{display:grid;grid-template-columns:160px 1fr;border-top:1px solid #ddd;padding:8px 0}.row:first-child{border-top:0}.badge{display:inline-block;border:1px solid #111;padding:2px 6px}</style></head><body><main class="card" data-kind="modeling.proposal.v1" data-authority="false" data-proposal-display-only="true"><h1>Modeling proposal evidence</h1><p class="badge">non-authority evidence</p><section><div class="row"><strong>proposal</strong><span>${esc(proposal.id || '')}</span></div><div class="row"><strong>status</strong><span>${esc(proposal.status || '')}</span></div><div class="row"><strong>target</strong><span>${esc(target.targetKind || '')}:${esc(target.targetId || '')}</span></div><div class="row"><strong>operation</strong><span>${esc(op.kind || '')} ${esc(op.from || '')} -> ${esc(op.to || '')} ${esc(op.relation || '')}</span></div><div class="row"><strong>promotion owner</strong><span>${esc(proposal.promotionOwner || 'ops')}</span></div><div class="row"><strong>authority</strong><span>false</span></div></section><section><h2>Evidence</h2><ul>${evidence.map((item) => `<li>${esc(item.summary || item.source || JSON.stringify(item))}</li>`).join('')}</ul></section><p>Promotion is outside UI. Human review and ops promotion/admission own the path to model queue and accepted ledger.</p></main></body></html>\n`;
}
function esc(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function ensureTrailingNewline(text) { return text.endsWith('\n') ? text : `${text}\n`; }
function requireValue(argv, index, name) { if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`${name} requires a value`); return argv[index]; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildModelingProposalEvidence(parseModelingProposalEvidenceArgs(process.argv.slice(2)));
