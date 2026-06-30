import assert from 'node:assert/strict';
import fs from 'node:fs';

const responses = fs.readFileSync('packages/ui-claims/package-responses.v1.jsonl', 'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(responses.length, 4);
for (const row of responses) {
  assert.equal(row.kind, 'governance.packageResponse.v1');
  assert.equal(row.repo, 'roccho-dev/ui');
  assert.equal(row.status, 'pass');
  assert.equal(row.evidenceFresh, true);
  assert.equal(row.receiptPresent, true);
  assert.equal(row.checkAdoption, true);
  assert.ok(row.tests.includes(row.requiredTestId));
  for (const ref of row.evidence_refs) assert.equal(fs.existsSync(ref), true, ref);
  assert.equal(fs.existsSync(row.receipt_ref), true, row.receipt_ref);
}
const projection = JSON.parse(fs.readFileSync('packages/ui-projection-evidence/projection-evidence.v1.json', 'utf8'));
assert.equal(projection.source_authority, false);
assert.ok(projection.projection_surfaces.length >= 5);
const boundary = JSON.parse(fs.readFileSync('packages/ui-projection-evidence/artifact-boundary-proof.v1.json', 'utf8'));
assert.equal(boundary.readme_as_artifact.authority, false);
const receipt = JSON.parse(fs.readFileSync('packages/ui-receipts/receipt.v1.json', 'utf8'));
assert.equal(receipt.state, 'closed');
assert.deepEqual(receipt.residuals, []);
const residuals = fs.readFileSync('packages/ui-receipts/residuals.v1.jsonl', 'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.ok(residuals.every((item) => item.state !== 'open'));
console.log('ui-package-evidence-check-pass');
