#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderMarkdownDocument } from "#core-port";

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!out) throw new Error("--out is required");
fs.mkdirSync(out, { recursive: true });

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const write = (name, text) => fs.writeFileSync(path.join(out, name), text);
const writeJson = (name, value) => write(name, JSON.stringify(value, null, 2) + "\n");

const model = {
  kind: "document.model.v1",
  blocks: [
    { kind: "heading", depth: 1, text: "ui" },
    { kind: "paragraph", text: "Non-authority README artifact for the ui repository." },
    { kind: "heading", depth: 2, text: "Purpose" },
    { kind: "paragraph", text: "Provide renderer-neutral document models and deterministic Markdown rendering." },
    { kind: "heading", depth: 2, text: "Authority boundary" },
    { kind: "list", items: ["adrs owns accepted meaning", "governance projects and checks accepted inputs", "ui renders Markdown bytes", "README artifacts are evidence, not authority"] },
    { kind: "heading", depth: 2, text: "Inputs" },
    { kind: "list", items: ["document.model.v1", "md.template.block.v1", "renderer version", "repo-local artifact intent"] },
    { kind: "heading", depth: 2, text: "Outputs / artifacts" },
    { kind: "list", items: ["README.md", "manifest.json", "sources.jsonl", "receipt.json"] },
    { kind: "heading", depth: 2, text: "Checks" },
    { kind: "list", items: ["nix flake check", "readme-artifact packet check", "markdown-document-renderer check"] },
    { kind: "heading", depth: 2, text: "Ownership / handoff" },
    { kind: "paragraph", text: "ui repo CI owns this artifact packet. ui-lib does not own artifact upload or lifecycle outside the consuming repository." }
  ]
};

const result = renderMarkdownDocument({ model });
if (!result.ok) throw new Error("Markdown renderer returned blocking diagnostics");
const modelText = JSON.stringify(model, null, 2) + "\n";
write("README.md", result.markdown);
write("document.model.json", modelText);
write("sources.jsonl", JSON.stringify({ kind: "artifact.source.v1", artifact: "ui-readme", sourceKind: "renderer", ref: "roccho-dev/ui:packages/core-port/src/markdown-document-renderer.mjs", authority: false }) + "\n");
writeJson("manifest.json", {
  kind: "repo.readmeArtifact.manifest.v1",
  repo: "roccho-dev/ui",
  artifactOwner: "repo-ci",
  nonAuthority: true,
  readmeMode: "generated",
  workflow_definition: "checked_in",
  artifact_source: "nix-output",
  artifact_generation: "generated",
  renderer: result.provenance,
  modelDigest: sha256(modelText),
  readmeDigest: sha256(result.markdown)
});
writeJson("receipt.json", {
  kind: "repo.readmeArtifact.receipt.v1",
  repo: "roccho-dev/ui",
  artifactOwner: "repo-ci",
  nonAuthority: true,
  source: "nix-output",
  entrypoint: "nix build .#readme-artifact",
  requiredFiles: ["README.md", "manifest.json", "sources.jsonl", "receipt.json"]
});
