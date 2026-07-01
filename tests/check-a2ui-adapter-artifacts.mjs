import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/a2ui-adapter-artifacts');

for (const file of ['registry.json','ports.json','requirements/live.json','a2ui/live-surface.json','data/live-input.json','scripts/build.mjs']) {
  assert.equal(fs.existsSync(path.join(pkg, file)), true, file);
}
assert.equal(fs.existsSync(path.join(pkg, 'requirements/purpose.json')), false, 'retired purpose requirement pack must not remain');
for (const generated of ['.generated','dist','preview','ci-artifacts']) assert.equal(fs.existsSync(path.join(pkg, generated)), false, `${generated} must not be tracked`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-a2ui-adapter-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, ADAPTER_ARTIFACT_OUT: tmp}});

const liveBase = path.join(tmp, 'live-adapter-artifact');
assert.equal(fs.existsSync(path.join(liveBase, 'dist/a2ui/live.surface.jsonl')), true);
assert.equal(fs.existsSync(path.join(liveBase, 'dist/a2ui/live.data-model-update.jsonl')), true);
assert.equal(fs.existsSync(path.join(liveBase, 'dist/data/live.data-model.json')), true);
assert.equal(fs.existsSync(path.join(liveBase, 'preview/index.html')), true);
assert.equal(fs.existsSync(path.join(tmp, 'purpose-adapter-artifact')), false, 'retired purpose artifact must not be generated');

const proof = JSON.parse(fs.readFileSync(path.join(liveBase, 'proof/live-adapter-proof-report.json'), 'utf8'));
assert.equal(proof.status, 'live-adapter-proof-pass');
assert.equal(Object.values(proof.boundaries).every(Boolean), true);
assert.ok(proof.source.digest.startsWith('sha256:'));
assert.ok(proof.projection.digest.startsWith('sha256:'));
assert.ok(Array.isArray(proof.checkedInputs));
assert.ok(Array.isArray(proof.checkedOutputs));
assert.ok(proof.checkedOutputs.includes('proof/live-adapter-proof-report.json'));
assert.equal(proof.workOrder.currentProjectionDigest, proof.projection.digest);
assert.ok(proof.closedGaps.includes('gap-live-adapter-artifact'));
assert.deepEqual(proof.residuals, []);

const index = JSON.parse(fs.readFileSync(path.join(tmp, 'adapter-artifact-index.json'), 'utf8'));
assert.equal(index.status, 'adapter-ci-artifacts-ready');
assert.equal(index.allPresent, true);
assert.deepEqual(index.artifacts.map((item) => item.name), ['live-adapter-artifact']);
assert.ok(index.retiredArtifacts.some((item) => item.name === 'purpose-adapter-artifact' && item.status === 'generator-removed'));
console.log(JSON.stringify({status:'a2ui-adapter-artifacts-check-pass', artifacts:index.artifacts.map((item)=>item.name), retired:index.retiredArtifacts.map((item)=>item.name)}, null, 2));
