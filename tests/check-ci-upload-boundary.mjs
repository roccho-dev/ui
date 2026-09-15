import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = fs.readFileSync(path.join(root, "ci.intent.v1.jsonl"), "utf8").trim().split(/\n+/).map(JSON.parse);
assert.deepEqual(rows.find((row) => row.kind === "ui.ciIntent.v1")?.artifact_upload_events, ["workflow_dispatch"]);

// This repository uses block mappings, unquoted keys and plain action references.
// Reject unsupported YAML before counting actions; never silently omit a declaration.
// This is a closed-format guard, not a general YAML parser or action-code audit.
const manual = "github.event_name == 'workflow_dispatch'";
const conditions = new Set([
  manual,
  `\${{ always() && ${manual} }}`,
  `\${{ always() && ${manual} && steps.ssg_proof_scope.outputs.run == 'true' }}`,
]);
function checkUploads(text) {
  const fail = (ok, reason) => assert.ok(ok, `E_CI_UPLOAD_BOUNDARY: ${reason}`);
  const steps = [];
  let step = null;
  let inSteps = false;
  let literalIndent = null;
  let declarations = 0;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^ */)[0].length;
    if (literalIndent !== null && indent > literalIndent) continue;
    literalIndent = null;
    fail(!/\t/.test(line.slice(0, line.search(/\S/))), "tab indentation is unsupported");
    const item = line.slice(indent).startsWith("- ");
    const field = line.slice(indent + (item ? 2 : 0));
    const match = field.match(/^([A-Za-z_][A-Za-z0-9_.-]*):(?: +(.*))?$/);
    if (!match) {
      // Branch/path lists may contain plain scalar items; executable mappings may not.
      fail(item && !inSteps && /^[A-Za-z0-9_./*-]+$/.test(field), "unsupported structural YAML");
      continue;
    }
    const [, key, rawValue = ""] = match;
    const value = rawValue.trimEnd();
    fail(!/^[&*!\[{]/.test(value), "anchors, aliases, tags and flow collections are unsupported");
    if (indent <= 4) {
      inSteps = indent === 4 && key === "steps" && value === "";
      step = null;
    }
    if (inSteps && item) {
      fail(indent === 6, "unsupported step indentation");
      step = new Map();
      steps.push(step);
    }
    const keyIndent = indent + (item ? 2 : 0);
    if (inSteps && keyIndent === 8) {
      fail(step !== null && !step.has(key), "missing step or duplicate step key");
      step.set(key, value);
    }
    if (key === "uses") {
      fail(inSteps && step !== null && keyIndent === 8, "action outside a parsed step");
      fail(/^[A-Za-z0-9_.\/-]+@[A-Za-z0-9_.-]+$/.test(value), "unsupported action reference");
      if (/^actions\/upload-artifact@/i.test(value)) {
        fail(value === "actions/upload-artifact@v4", "unsupported upload declaration");
        declarations += 1;
      }
    }
    if (/^[|>]/.test(value)) {
      fail(value === "|", "only literal block scalars are supported");
      literalIndent = keyIndent;
    }
  }
  const uploads = steps.filter((entry) => entry.get("uses") === "actions/upload-artifact@v4");
  fail(uploads.length === declarations, "unparsed upload declaration");
  for (const upload of uploads) {
    fail(conditions.has(upload.get("if")), "upload needs one reviewed manual-only step condition");
  }
  return uploads.length;
}
const workflow = (steps) => `name: fixture\non:\n  pull_request:\njobs:\n  proof:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

const good = `      - uses: actions/upload-artifact@v4\n        if: ${manual}\n        with:\n          name: proof\n          path: proof.json\n`;
for (const condition of conditions) assert.equal(checkUploads(workflow(good.replace(manual, condition))), 1);
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
const unguarded = good.replace(`        if: ${manual}\n`, "");
const quoted = [
  unguarded.replace("actions/upload-artifact@v4", '"actions/upload-artifact@v4"'),
  unguarded.replace("actions/upload-artifact@v4", "'actions/upload-artifact@v4'"),
  unguarded.replace("uses:", '"uses":'),
];
// R214-11: one valid step must not conceal a second unguarded declaration.
for (const text of quoted) attacks.push(good + text);
attacks.push(
  good + unguarded.replace("uses:", "'uses':"),
  good + unguarded.replace("uses:", '"u\\u0073es":'),
  good + unguarded.replace("actions/upload-artifact@v4", '"actions/\\u0075pload-artifact@v4"'),
  good + unguarded.replace("actions/upload-artifact@v4", "*uploader"),
  good + unguarded.replace("actions/upload-artifact@v4", "!!str actions/upload-artifact@v4"),
  good + "      - {uses: actions/upload-artifact@v4}\n",
  good.replace(`        if: ${manual}`, `        with:\n          if: ${manual}`),
  good + unguarded.replace("uses:", "<<:"),
  good + unguarded.replace("actions/upload-artifact@v4", "|\n          actions/upload-artifact@v4"),
  good + unguarded.replace("actions/upload-artifact@v4", "Actions/upload-artifact@v4"),
);
for (const text of attacks) assert.throws(() => checkUploads(workflow(text)), /E_CI_UPLOAD_BOUNDARY/);
assert.equal(checkUploads(workflow(good + good)), 2);
assert.equal(checkUploads(workflow(good + '      - uses: actions/checkout@v4\n')), 1);
assert.equal(checkUploads(workflow(`      - name: Proof\n        run: |\n          echo 'uses: actions/upload-artifact@v4'\n${good}`)), 1);
assert.throws(() => checkUploads(workflow(good).replace("    steps:", '    "steps":')), /E_CI_UPLOAD_BOUNDARY/);
assert.throws(() => checkUploads(workflow(good).replace("jobs:", '"jobs":')), /E_CI_UPLOAD_BOUNDARY/);

const workflows = fs.readdirSync(path.join(root, ".github/workflows")).filter((name) => /\.ya?ml$/.test(name)).sort();
let uploads = 0;
for (const name of workflows) uploads += checkUploads(fs.readFileSync(path.join(root, ".github/workflows", name), "utf8"));
assert.ok(uploads > 0, "E_CI_UPLOAD_BOUNDARY: existing explicit delivery must not silently disappear");
console.log(JSON.stringify({ kind: "ui.ci-upload-boundary/1", status: "PASS", workflows: workflows.length, uploadSteps: uploads, negativeCases: attacks.length + 2, syntax: "closed-block-mappings/plain-action-references", automaticUpload: false }));
