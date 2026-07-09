import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanRoots = ['packages', 'scripts'];
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.jsonl']);
const forbidden = [
  { name: 'queue append writer', re: /\bappend(?:To)?Queue\b|\bqueueAppend\b|\bwriteQueueRow\b|\bappend\s+queue\s+rows?\b/i },
  { name: 'accepted ledger writer', re: /\bwriteAcceptedLedger\b|\bacceptedLedgerWriter\b|\bappendAcceptedLedger\b|\bwrite\s+accepted\s+ledger\s+rows?\b/i },
  { name: 'admission owner', re: /\badmissionGate\b|\bperformAdmission\b|\badmitModelCommit\b|\bperform\s+admission\b/i },
  { name: 'browser approval action', re: /\bapproveModelCommit\b|\bpromoteProposal\b|\bdispatchAgentTask\b|\bmergeModelChange\b|\bfireCommand\b/i },
];

const violations = [];
for (const rel of scanRoots.flatMap((scanRoot) => collect(path.join(root, scanRoot)))) {
  const ext = path.extname(rel);
  if (!extensions.has(ext)) continue;
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const rule of forbidden) {
    if (rule.re.test(text)) violations.push({ file: rel, rule: rule.name });
  }
}

assert.deepEqual(violations, []);
const docs = fs.readFileSync(path.join(root, 'docs/editor-to-queue-to-ui-boundary.md'), 'utf8');
assert.match(docs, /Forbidden in ui/);
assert.match(docs, /Append queue rows from browser code/);
assert.match(docs, /Write accepted ledger rows/);
assert.match(docs, /Perform admission or promotion/);
console.log(JSON.stringify({ status: 'ui-forbidden-authority-boundary-check-pass', scannedRoots: scanRoots }, null, 2));

function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (entry.isDirectory()) return collect(full);
    if (entry.isFile()) return [rel];
    return [];
  });
}
