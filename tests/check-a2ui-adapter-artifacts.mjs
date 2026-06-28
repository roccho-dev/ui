import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/a2ui-adapter-artifacts');
for (const file of ['registry.json','ports.json','requirements/live.json','requirements/purpose.json','a2ui/live-surface.json','data/live-input.json','scripts/build.mjs']) assert.equal(fs.existsSync(path.join(pkg, file)), true, file);
for (const generated of ['.generated','dist','preview','ci-artifacts']) assert.equal(fs.existsSync(path.join(pkg, generated)), false, `${generated} must not be tracked`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-a2ui-adapter-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, ADAPTER_ARTIFACT_OUT: tmp}});
for (const adapter of ['live','purpose']) {
  const base = path.join(tmp, `${adapter}-adapter-artifact`);
  assert.equal(fs.existsSync(path.join(base, 'dist/a2ui', `${adapter}.surface.jsonl`)), true);
  assert.equal(fs.existsSync(path.join(base, 'dist/a2ui', `${adapter}.data-model-update.jsonl`)), true);
  assert.equal(fs.existsSync(path.join(base, 'dist/data', `${adapter}.data-model.json`)), true);
  assert.equal(fs.existsSync(path.join(base, 'preview/index.html')), true);
  const proof = JSON.parse(fs.readFileSync(path.join(base, 'proof', `${adapter}-adapter-proof-report.json`), 'utf8'));
  assert.equal(proof.status, `${adapter}-adapter-proof-pass`);
  assert.equal(Object.values(proof.boundaries).every(Boolean), true);
}
const index = JSON.parse(fs.readFileSync(path.join(tmp, 'adapter-artifact-index.json'), 'utf8'));
assert.equal(index.status, 'adapter-ci-artifacts-ready');
assert.equal(index.allPresent, true);
console.log(JSON.stringify({status:'a2ui-adapter-artifacts-check-pass', artifacts:index.artifacts.map((item)=>item.name)}, null, 2));
