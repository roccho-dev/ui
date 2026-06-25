import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const intentPath = path.join(root, "ci.intent.v1.jsonl");

const intentRows = fs.readFileSync(intentPath, "utf8")
  .trim()
  .split(/\n+/)
  .map((line) => JSON.parse(line));
assert.equal(intentRows.length, 1);

const intent = intentRows[0];
assert.equal(intent.kind, "ui.ciIntent.v1");
assert.equal(intent.command, "nix flake check --print-build-logs");
assert.deepEqual(intent.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.match(intent.authority, /non-authority/);

const workflowFiles = fs.readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => `.github/workflows/${name}`)
  .sort();
assert.deepEqual(workflowFiles, [...intent.entrypoints].sort());

const workflowText = fs.readFileSync(path.join(root, intent.entrypoints[0]), "utf8");
assert.match(workflowText, /name:\s*Nix Flake Check/);
assert.match(workflowText, /nix flake check --print-build-logs/);
assert.doesNotMatch(workflowText, /upload-artifact|setup-node|npm test|node scripts\/build-generic-a2ui-preview/);

for (const forbiddenPath of intent.forbiddenEntryGlobs) {
  assert.equal(fs.existsSync(path.join(root, forbiddenPath)), false, `${forbiddenPath} must not be a provider CI entrypoint`);
}

console.log(JSON.stringify({
  status: "ui-ci-workflows-check-pass",
  entrypoints: workflowFiles,
}, null, 2));
