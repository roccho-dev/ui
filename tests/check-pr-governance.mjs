import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPrBodyGoverned, findPrBodyGovernanceGaps } from "./check-pr-body-governance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const issueTemplate = read("docs/scope-to-meta-issue-template.md");
for (const phrase of ["Practical scope", "Direct purpose", "Upper purpose", "Meta purpose", "Highest objective", "Completion criteria", "Non-scope", "Merge-blocking conditions", "Tests to keep", "Tests not to keep"]) {
  assert.ok(issueTemplate.includes(phrase));
}

const prTemplate = read(".github/pull_request_template.md");
for (const phrase of ["Linked issue", "Scope", "Non-scope", "Direct purpose", "Upper purpose", "Meta purpose", "Highest objective", "Tests", "CI evidence", "Merge condition", "Merge-blocking conditions", "explicit human approval"]) {
  assert.ok(prTemplate.includes(phrase));
}

const docs = read("docs/pr-governance.md");
for (const phrase of ["Issue-first rule", "PR body guard", "Current-fact test rule", "Current purpose visualization entrypoint", "Human approval gate", "tests/fixtures/purpose-atlas/surface.v0.9.jsonl", "tests/fixtures/purpose-atlas/atlas-data.json", "tests/check-purpose-atlas.mjs", "packages/core-port"]) {
  assert.ok(docs.includes(phrase));
}

const workflow = read(".github/workflows/pr-governance.yml");
assert.ok(workflow.includes("name: PR governance"));
assert.ok(workflow.includes("pull_request:"));
assert.ok(workflow.includes("node tests/check-pr-body-governance.mjs"));
assert.ok(workflow.includes("node tests/check-pr-governance.mjs"));

assertPrBodyGoverned("## Linked issue\n\nFixes #83\n\n## Scope\n\n- Add PR governance.\n\n## Non-scope\n\n- No auto action.\n\n## Tests\n\n- Current template checks.\n\n## CI evidence\n\n- Pending.\n\n## Merge condition\n\nRequires explicit human approval.\n");

const gaps = findPrBodyGovernanceGaps("## Scope\n\nBody only.");
for (const expected of ["linked_issue", "non_scope", "ci_or_test_evidence", "merge_condition", "human_approval"]) {
  assert.ok(gaps.includes(expected));
}

console.log(JSON.stringify({ status: "pr-governance-template-check-pass" }, null, 2));
