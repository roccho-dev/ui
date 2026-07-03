import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readJsonl = (rel) => read(rel).trim().split(/\r?\n/).map((line) => JSON.parse(line));

const flake = read("flake.nix");
assert.match(flake, /governance\s*=\s*\{/);
assert.match(flake, /github:roccho-dev\/governance\/proposals/);
assert.match(flake, /nix\/gov-package-output-producer\.nix/);
assert.match(flake, /gov-package-output = mkUiGovPackageOutput pkgs/);
assert.match(flake, /ui-gov-package-output-check/);
assert.match(flake, /repoId = "roccho-dev\/ui"/);
assert.match(flake, /projectionMode = "proposal-preview"/);
assert.match(flake, /gov-final-scope-purpose-join \/ gate/);
assert.match(flake, /producerRepo": "roccho-dev\/governance"/);

const intentRows = readJsonl("ci.intent.v1.jsonl");
const primary = intentRows.find((row) => row.kind === "ui.ciIntent.v1");
assert.ok(primary);
assert.deepEqual(primary.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.match(primary.command, /nix flake check --print-build-logs/);
assert.match(primary.command, /nix build --print-build-logs \.#gov-package-output --out-link result-gov-package-output/);
assert.equal(primary.authority.includes("non-authority"), true);
assert.deepEqual(primary.artifacts, ["ui-gov-package-output"]);
assert.equal(primary.notes.some((note) => note.includes("non-authority")), true);

const workflow = read(".github/workflows/nix-flake-check.yml");
assert.match(workflow, /name:\s*Nix Flake Check/);
assert.match(workflow, /nix flake check --print-build-logs/);
assert.match(workflow, /nix build --print-build-logs \.#gov-package-output --out-link result-gov-package-output/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /name:\s*ui-gov-package-output/);
assert.match(workflow, /path:\s*result-gov-package-output\//);

const packageResponses = readJsonl("packages/ui-claims/package-responses.v1.jsonl");
assert.equal(packageResponses.some((row) => row.repo === "roccho-dev/ui"), true);
assert.equal(packageResponses.every((row) => row.authority_boundary?.adrs_meaning_authority !== true), true);

console.log(JSON.stringify({ status: "ui-gov-package-output-check-pass" }, null, 2));
