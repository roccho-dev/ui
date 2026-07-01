import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = (rel) => path.join(root, rel);
const exists = (rel) => fs.existsSync(repoPath(rel));

function readJsonl(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
}

const rows = readJsonl('packages/ui-claims/package-responses.v1.jsonl');
const inventory = rows.filter((row) => row.kind === 'packageInventory.v1');
const responses = rows.filter((row) => row.kind === 'governance.packageResponse.v1');

assert.equal(inventory.length, 5);
for (const row of inventory) {
  for (const field of ['repo_locator', 'package_path', 'package_id_candidate', 'source_kind', 'entrypoints', 'tests', 'confidence', 'discovered_by', 'digest']) {
    assert.ok(Object.hasOwn(row, field), field);
  }
  assert.equal(row.repo_locator, 'github:roccho-dev/ui');
  assert.equal(row.source_authority, false);
  assert.equal(row.generated_artifact, false);
  assert.equal(row.status, 'pass');
  assert.ok(row.tests.includes(row.requiredTestId));
  assert.ok(!/^dist\/|^preview\/|^screenshots\/|^proof\//.test(row.package_path), row.package_path);
}
const inventoryById = new Map(inventory.map((row) => [row.package_id_candidate, row.package_path]));
assert.equal(inventoryById.get('ui.core-port'), 'packages/core-port');
assert.equal(inventoryById.get('ui.a2ui-adapter-artifacts'), 'packages/a2ui-adapter-artifacts');
assert.equal(inventoryById.get('ui.ui-claims'), 'packages/ui-claims');
assert.equal(inventoryById.get('ui.ui-projection-evidence'), 'packages/ui-projection-evidence');
assert.equal(inventoryById.get('ui.ui-receipts'), 'packages/ui-receipts');
assert.equal(inventoryById.has('ui.jsx-a2ui-compiler'), false);

assert.equal(responses.length, 5);
for (const row of responses) {
  assert.equal(row.repo, 'roccho-dev/ui');
  assert.equal(row.status, 'pass');
  assert.equal(row.evidenceFresh, true);
  assert.equal(row.receiptPresent, true);
  assert.equal(row.residualsVisible, true);
  assert.equal(row.checkAdoption, true);
  assert.equal(row.generatedOutputBoundary, true);
  assert.equal(row.readmeArtifactBoundary, true);
  assert.ok(row.tests.includes(row.requiredTestId));
  for (const ref of row.evidence_refs) assert.equal(exists(ref), true, ref);
  assert.equal(exists(row.receipt_ref), true, row.receipt_ref);
}
const responseByPackage = new Map(responses.map((row) => [row.packageId, row]));
for (const id of ['ui.projection-evidence', 'ui.receipts', 'ui.artifact-boundary', 'ui.gov-check-adoption']) {
  assert.equal(responseByPackage.get(id)?.state, 'implemented', id);
}
const compilerResponse = responseByPackage.get('ui.jsx-a2ui-compiler');
assert.equal(compilerResponse.state, 'residual');
assert.ok(compilerResponse.blocked_reason);
assert.equal(compilerResponse.overclaim_boundary.compiler_implemented, false);
assert.equal(compilerResponse.overclaim_boundary.compiler_tests_passed, false);
for (const testId of ['jsx-a2ui-compiler-fixture-check', 'a2ui-protocol-shape-check', 'brand-token-variation-check', 'generated-output-boundary-check', 'deterministic-output-check']) {
  assert.ok(compilerResponse.future_required_tests.includes(testId), testId);
}

const projection = JSON.parse(fs.readFileSync(repoPath('packages/ui-projection-evidence/projection-evidence.v1.json'), 'utf8'));
assert.equal(projection.source_authority, false);
assert.equal(projection.package_inventory_ref, 'packages/ui-claims/package-responses.v1.jsonl');
assert.equal(projection.package_response_ref, 'packages/ui-claims/package-responses.v1.jsonl');

const boundary = JSON.parse(fs.readFileSync(repoPath('packages/ui-projection-evidence/artifact-boundary-proof.v1.json'), 'utf8'));
assert.equal(boundary.readme_as_artifact.authority, false);
assert.equal(boundary.inventory_excludes_generated_artifacts, true);

const receipt = JSON.parse(fs.readFileSync(repoPath('packages/ui-receipts/receipt.v1.json'), 'utf8'));
assert.equal(receipt.state, 'closed-with-residual');
assert.ok(receipt.residuals.includes('residual-ui-jsx-a2ui-compiler-not-implemented-260701'));
assert.equal(receipt.overclaim_boundary.jsx_a2ui_compiler_implemented, false);

const residuals = readJsonl('packages/ui-receipts/residuals.v1.jsonl');
const compilerResidual = residuals.find((item) => item.id === 'residual-ui-jsx-a2ui-compiler-not-implemented-260701');
assert.equal(compilerResidual.state, 'open');
assert.equal(compilerResidual.hidden, false);
assert.equal(compilerResidual.package_id, 'ui.jsx-a2ui-compiler');
assert.ok(compilerResidual.next.length >= 5);
assert.deepEqual(residuals.filter((item) => item.state === 'open' && item.id !== compilerResidual.id), []);

console.log('ui-package-evidence-check-pass');
