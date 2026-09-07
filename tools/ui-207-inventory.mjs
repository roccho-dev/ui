import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = JSON.parse(readFileSync(new URL('../requirements/baseline.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--ref'), 'usage: node tools/ui-207-inventory.mjs [--ref <40-char-sha>]');
const ref = args[1] ?? base.sourceCommit;
assert.match(ref, /^[0-9a-f]{40}$/, 'exact commit required');
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const resolved = git('rev-parse', `${ref}^{commit}`).trim();
assert.equal(resolved, ref);
const files = git('ls-tree', '-rz', '--full-tree', ref).split('\0').filter(Boolean).map(row => {
  const tab = row.indexOf('\t');
  const [mode, type, blob] = row.slice(0, tab).split(' ');
  return { path: row.slice(tab + 1), mode, type, blob };
});
assert.ok(files.length > 0, 'empty tree is not coverage');
const eligible = file => file.type === 'blob' && file.mode !== '120000'
  && !/(?:^|\/)(?:vendor|node_modules|dist)(?:\/|$)/u.test(file.path)
  && /(?:test|check|proof|spec|\.github\/workflows|package\.json$|flake\.(?:nix|lock)$|README\.md$|^docs\/|^governance\/|^schemas\/|^ci\.)/iu.test(file.path)
  && /\.(?:[cm]?js|ts|py|sh|nix|md|jsonl?|ya?ml|lock)$/iu.test(file.path);
const hints = /\b(?:assert(?:\.|\s|\()|expect\s*\(|raises\s*\(|rejects\s*\(|MUTATION:|throw\s+new\s+Error|process\.exit|sys\.exit)|\b(?:MAX|MIN|LIMIT|TIMEOUT)[A-Z_]*\b/u;
const candidates = files.filter(eligible).map(file => {
  const source = git('cat-file', 'blob', file.blob);
  const lines = source.split('\n');
  return { ...file, lines: lines.length, fullFileReviewRequired: true, meaningReview: 'PENDING',
    hints: lines.flatMap((line, index) => hints.test(line) ? [{ line: index + 1, text: line }] : []) };
});
console.log(JSON.stringify({ schema: 'ui-207-source-inventory/1', sourceCommit: ref,
  allTrackedPaths: files, candidates, status: 'INVENTORIED_NOT_REVIEWED',
  warning: 'Path and line patterns are navigation hints, not an assertion parser. Review all files, helpers, generated cases, workflows and external requirements. Zero hints is not no requirements.',
  productTestsExecuted: 0, semanticCoverage: 'PENDING', productDone: false }, null, 2));
