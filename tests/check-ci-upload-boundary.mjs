import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = fs.readFileSync(path.join(root, "ci.intent.v1.jsonl"), "utf8").trim().split(/\n+/).map(JSON.parse);
assert.deepEqual(rows.find((row) => row.kind === "ui.ciIntent.v1")?.artifact_upload_events, ["workflow_dispatch"]);

// Deliberately accept only the three reviewed step conditions, not arbitrary YAML/expressions.
const manual = "github.event_name == 'workflow_dispatch'";
const conditions = new Set([
  manual,
  `\${{ always() && ${manual} }}`,
  `\${{ always() && ${manual} && steps.ssg_proof_scope.outputs.run == 'true' }}`,
]);
function checkUploads(text) {
  const occurrences = [...text.matchAll(/uses:\s*actions\/upload-artifact@[^\s]+/g)].length;
  const steps = text.split(/(?=^      - )/m).filter((block) => /^      - /.test(block) && /uses:\s*actions\/upload-artifact@/.test(block));
  assert.equal(steps.length, occurrences, "E_CI_UPLOAD_BOUNDARY: unparsed upload step");
  for (const block of steps) {
    assert.match(block, /^(?:      - |        )uses: actions\/upload-artifact@v4\s*$/m, "E_CI_UPLOAD_BOUNDARY: unsupported upload declaration");
    const guards = [...block.matchAll(/^        if: (.+)$/gm)].map((match) => match[1].trim());
    assert.equal(guards.length, 1, "E_CI_UPLOAD_BOUNDARY: upload needs one step condition");
    assert.ok(conditions.has(guards[0]), "E_CI_UPLOAD_BOUNDARY: upload is not manual-only");
  }
  return steps.length;
}

const good = `      - uses: actions/upload-artifact@v4\n        if: ${manual}\n        with:\n          name: proof\n          path: proof.json\n`;
for (const condition of conditions) assert.equal(checkUploads(good.replace(manual, condition)), 1);
const attacks = [
  good.replace(`        if: ${manual}\n`, ""),
  good.replace(manual, "always()"),
  good.replace(manual, "github.event_name == 'push'"),
  good.replace(manual, "github.event_name == 'pull_request'"),
  good.replace(manual, `\${{ ${manual} || true }}`),
  good.replace(manual, `\${{ ${manual} || failure() }}`),
  good.replace(manual, `\${{ !(${manual}) }}`),
  good.replace(`        if: ${manual}`, `        # if: ${manual}`),
  good.replace(`        if: ${manual}`, `          if: ${manual}`),
  good.replace(`        if: ${manual}`, `        if: ${manual}\n        if: always()`),
  good.replace("      - uses:", "    - uses:"),
  good.replace("actions/upload-artifact@v4", "actions/upload-artifact@v5"),
];
for (const text of attacks) assert.throws(() => checkUploads(text), /E_CI_UPLOAD_BOUNDARY/);

const workflows = fs.readdirSync(path.join(root, ".github/workflows")).filter((name) => /\.ya?ml$/.test(name)).sort();
let uploads = 0;
for (const name of workflows) uploads += checkUploads(fs.readFileSync(path.join(root, ".github/workflows", name), "utf8"));
assert.ok(uploads > 0, "E_CI_UPLOAD_BOUNDARY: existing explicit delivery must not silently disappear");
console.log(JSON.stringify({ kind: "ui.ci-upload-boundary/1", status: "PASS", workflows: workflows.length, uploadSteps: uploads, negativeCases: attacks.length, automaticUpload: false }));
