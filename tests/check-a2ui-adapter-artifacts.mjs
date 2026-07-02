import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/a2ui-adapter-artifacts');
const requirementsDir = path.join(pkg, 'requirements');

for (const file of ['registry.json','ports.json','a2ui/live-surface.json','data/live-input.json','scripts/build.mjs']) {
  assert.equal(fs.existsSync(path.join(pkg, file)), true, file);
}
for (const generated of ['.generated','dist','preview','ci-artifacts']) {
  assert.equal(fs.existsSync(path.join(pkg, generated)), false, `${generated} must not be tracked`);
}

const requirementNames = fs.readdirSync(requirementsDir).filter((name) => name.endsWith('.json')).map((name) => path.basename(name, '.json')).sort();
const expectedArtifacts = requirementNames.map((name) => `${name}-adapter-artifact`).sort();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-a2ui-adapter-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, ADAPTER_ARTIFACT_OUT: tmp}});

const index = JSON.parse(fs.readFileSync(path.join(tmp, 'adapter-artifact-index.json'), 'utf8'));
const indexedArtifacts = index.artifacts.map((item) => item.name).sort();
const generatedDirs = fs.readdirSync(tmp, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

assert.equal(index.status, 'adapter-ci-artifacts-ready');
assert.equal(index.allPresent, true);
assert.deepEqual(indexedArtifacts, expectedArtifacts, 'generated artifact index must match source requirements');
assert.deepEqual(generatedDirs, expectedArtifacts, 'generated artifact directories must match source requirements');

for (const artifact of expectedArtifacts) {
  const adapter = artifact.replace(/-adapter-artifact$/, '');
  const base = path.join(tmp, artifact);
  assert.equal(fs.existsSync(path.join(base, 'dist/a2ui', `${adapter}.surface.jsonl`)), true);
  assert.equal(fs.existsSync(path.join(base, 'dist/a2ui', `${adapter}.data-model-update.jsonl`)), true);
  assert.equal(fs.existsSync(path.join(base, 'dist/data', `${adapter}.data-model.json`)), true);
  assert.equal(fs.existsSync(path.join(base, 'preview/index.html')), true);
  assert.equal(fs.existsSync(path.join(base, 'proof', `${adapter}-adapter-proof-report.json`)), true);
}

console.log(JSON.stringify({status:'a2ui-adapter-artifacts-check-pass', artifacts:indexedArtifacts}, null, 2));
