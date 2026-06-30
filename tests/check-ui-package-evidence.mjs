import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const responsePath = 'packages/ui-claims/package-responses.v1.jsonl';
const projectionPath = 'packages/ui-projection-evidence/projection-evidence.v1.json';
const boundaryPath = 'packages/ui-projection-evidence/artifact-boundary-proof.v1.json';
const receiptPath = 'packages/ui-receipts/receipt.v1.json';
const residualPath = 'packages/ui-receipts/residuals.v1.jsonl';
const adoptionPath = 'packages/ui-governance-check-adoption/gov-package-validation.intent.v1.json';
const workflowPath = '.github/workflows/gov-package-validation.yml';

const requiredResponseFields = [
  'claim_id', 'adrs_ref', 'obligation_id', 'repo_locator', 'package_id', 'package_path', 'owner_role', 'state',
  'covered_requirements', 'protected_non_goals', 'test_refs', 'evidence_refs', 'receipt_ref', 'residuals',
  'evidence_freshness', 'overclaim_boundary',
];
const governanceIdentityFields = ['adrsRef', 'universe', 'repo', 'packageId', 'packagePath', 'ownerRole', 'obligationId', 'requirementId', 'requiredTestId'];

const responses = readJsonl(responsePath);
assert.ok(responses.length >= 4, 'UI must emit package-level responses for all owned obligations');
for (const response of responses) {
  assert.equal(response.kind, 'governance.packageResponse.v1');
  assert.equal(response.uiKind, 'ui.packageResponse.v1');
  for (const field of requiredResponseFields) assert.ok(field in response, `${response.claim_id || 'response'} missing ${field}`);
  for (const field of governanceIdentityFields) assert.ok(typeof response[field] === 'string' && response[field], `${response.claim_id} missing governance field ${field}`);
  assert.equal(response.repo, 'roccho-dev/ui');
  assert.equal(response.repo_locator, 'github:roccho-dev/ui');
  assert.equal(response.state, 'implemented');
  assert.equal(response.status, 'pass');
  assert.ok(Array.isArray(response.tests) && response.tests.includes(response.requiredTestId));
  assert.equal(response.evidenceFresh, true);
  assert.equal(response.receiptPresent, true);
  assert.equal(response.residualsVisible, true);
  assert.equal(response.checkAdoption, true);
  assert.equal(response.generatedOutputBoundary, true);
  assert.equal(response.readmeArtifactBoundary, true);
  assert.ok(Array.isArray(response.covered_requirements) && response.covered_requirements.length > 0);
  assert.ok(Array.isArray(response.protected_non_goals));
  assert.ok(response.test_refs.includes('tests/check-ui-package-evidence.mjs'));
  assert.equal(response.receipt_ref, receiptPath);
  assert.deepEqual(response.residuals, []);
  assert.equal(response.overclaim_boundary?.diagnostic_only === true || response.overclaim_boundary?.ui_source_authority === false || response.overclaim_boundary?.readme_artifact_is_authority === false, true, `${response.claim_id} needs a non-authority boundary`);
  for (const ref of [...response.evidence_refs, response.receipt_ref]) assertFile(ref);
}

const projection = readJson(projectionPath);
assert.equal(projection.kind, 'ui.projectionEvidence.v1');
assert.equal(projection.source_authority, false);
assert.ok(projection.projection_surfaces.length >= 5);
assert.ok(projection.checked_by.includes(workflowPath));
assert.equal(projection.overclaim_boundary.ui_is_meaning_authority, false);
assert.equal(projection.overclaim_boundary.generated_artifacts_are_source_authority, false);

const boundary = readJson(boundaryPath);
assert.equal(boundary.kind, 'ui.artifactBoundaryProof.v1');
assert.equal(boundary.readme_as_artifact.expected_non_authority, true);
assert.equal(boundary.readme_as_artifact.authority, false);
assert.ok(boundary.generated_artifact_boundaries.every((item) => item.tracked_as_authority === false));
assert.ok(boundary.protected_non_goals.some((item) => /Do not make UI source authority/.test(item)));

const receipt = readJson(receiptPath);
assert.equal(receipt.kind, 'ui.packageReceipt.v1');
assert.equal(receipt.repo_locator, 'github:roccho-dev/ui');
assert.equal(receipt.state, 'closed');
for (const gap of ['ui-package-response-output', 'ui-projection-evidence-output', 'ui-artifact-boundary-proof', 'ui-ci-governance-check-adoption', 'ui-exported-governance-check-adoption']) assert.ok(receipt.closed_gaps.includes(gap), `receipt missing ${gap}`);
for (const ref of receipt.evidence_refs) assertFile(ref);
assert.deepEqual(receipt.residuals, []);
assert.equal(receipt.overclaim_boundary.ui_meaning_authority, false);
assert.equal(receipt.overclaim_boundary.residuals_returned, true);

const residuals = readJsonl(residualPath);
assert.ok(residuals.length >= 1);
assert.ok(residuals.every((item) => item.state !== 'open'));
assert.ok(residuals.every((item) => item.return_path || item.closed_by));

const adoption = readJson(adoptionPath);
assert.equal(adoption.kind, 'ui.govPackageValidationIntent.v1');
assert.equal(adoption.workflow, workflowPath);
assert.match(adoption.entrypoint, /governance-export\/tools\/check-package-export\.py/);
assert.match(adoption.entrypoint, /packages\/ui-claims\/package-responses\.v1\.jsonl/);
for (const group of ['claim-shape', 'requirement-to-test', 'evidence-freshness', 'receipt-residual', 'readme-artifact-boundary', 'generated-output-boundary', 'check-adoption']) assert.ok(adoption.governance_check_groups.includes(group), `missing governance check group ${group}`);
for (const ref of adoption.outputs.filter((item) => item !== 'gov-package-validation-report.json')) assertFile(ref);
assert.equal(adoption.overclaim_boundary.ui_is_not_governance_authority, true);
assert.equal(adoption.overclaim_boundary.governance_tool_adopted, true);

const workflowText = readText(workflowPath);
assert.match(workflowText, /name:\s*Governance package validation/);
assert.match(workflowText, /repository:\s*roccho-dev\/governance/);
assert.match(workflowText, /governance-export\/tools\/check-package-export\.py/);
assert.match(workflowText, /node tests\/check-ui-package-evidence\.mjs/);
assert.match(workflowText, /actions\/upload-artifact@v4/);

console.log(JSON.stringify({
  status: 'ui-package-evidence-check-pass',
  packageResponses: responses.length,
  projectionSurfaces: projection.projection_surfaces.map((item) => item.id),
  governanceCheckGroups: adoption.governance_check_groups,
  residuals: residuals.map((item) => `${item.id}:${item.state}`),
}, null, 2));

function readJson(relPath) { return JSON.parse(readText(relPath)); }
function readJsonl(relPath) {
  return readText(relPath).trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${relPath}:${index + 1} invalid JSON: ${error.message}`); }
  });
}
function readText(relPath) { return fs.readFileSync(path.join(root, relPath), 'utf8'); }
function assertFile(relPath) { assert.equal(fs.existsSync(path.join(root, relPath)), true, `${relPath} must exist`); }
