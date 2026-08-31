#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!out) throw new Error("--out is required");
fs.mkdirSync(out, { recursive: true });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "docs", "readme-materialization", "README.source.md");
const readme = fs.readFileSync(sourcePath, "utf8");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const write = (name, text) => fs.writeFileSync(path.join(out, name), text);
const writeJson = (name, value) => write(name, JSON.stringify(value, null, 2) + "\n");

write("README.md", readme);
writeJson("document.model.json", {
  kind: "ui.readmeMaterializationSource.v1",
  repo: "roccho-dev/ui",
  source: "docs/readme-materialization/README.source.md",
  sourceDigest: sha256(readme),
  outputKind: "markdown.bytes.v1",
  nonAuthority: true,
});
write("sources.jsonl", JSON.stringify({ kind: "artifact.source.v1", artifact: "ui-readme", sourceKind: "checked-in-readme-source", ref: "roccho-dev/ui:docs/readme-materialization/README.source.md", authority: false }) + "\n");
writeJson("manifest.json", {
  kind: "repo.readmeArtifact.manifest.v1",
  repo: "roccho-dev/ui",
  artifactOwner: "repo-ci",
  nonAuthority: true,
  readmeMode: "generated",
  workflow_definition: "checked_in",
  artifact_source: "nix-output",
  artifact_generation: "generated",
  source: "docs/readme-materialization/README.source.md",
  readmeDigest: sha256(readme),
});
writeJson("receipt.json", {
  kind: "repo.readmeArtifact.receipt.v1",
  repo: "roccho-dev/ui",
  artifactOwner: "repo-ci",
  nonAuthority: true,
  source: "nix-output",
  entrypoint: "nix build .#readme-artifact",
  requiredFiles: ["README.md", "manifest.json", "sources.jsonl", "receipt.json"],
});
