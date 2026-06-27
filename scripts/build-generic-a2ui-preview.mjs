import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGenericA2uiPreviewFromJsonl, jsonlLines, sha256 } from "#core-port/a2ui-shell-builder";

const outDir = path.resolve(process.argv[2] || "generic-a2ui-preview");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(root, "tests", "fixtures");
fs.mkdirSync(outDir, { recursive: true });

function writeText(relativePath, text) {
  const filePath = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function collectFiles(dir = outDir, prefix = "") {
  const files = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) files.push(...collectFiles(full, rel));
    else files.push(rel);
  }
  return files;
}

function readText(relativePath) {
  return fs.readFileSync(path.join(fixtureDir, relativePath), "utf8");
}

const contract = JSON.parse(readText("generic-a2ui-contract.json"));
const shellJsonl = readText("generic-a2ui-shell.v0.9.jsonl");
const dataAJsonl = readText("generic-a2ui-data-a.jsonl");
const dataBJsonl = readText("generic-a2ui-data-b.jsonl");
const built = buildGenericA2uiPreviewFromJsonl({ contract, shellJsonl, dataAJsonl, dataBJsonl });
const receipt = {
  ...built.receipt,
  sourceKind: "checked-in JSONL fixtures",
  proofKind: "jsonl-to-html",
  sourceJsonlDigests: {
    shell: sha256(shellJsonl),
    dataA: sha256(dataAJsonl),
    dataB: sha256(dataBJsonl),
  },
};

writeText("shell/index.html", built.shellHtml);
writeText("preview-a/index.html", built.previewAHtml);
writeText("preview-b/index.html", built.previewBHtml);
writeText("shell/shell.json", JSON.stringify(built.shell, null, 2) + "\n");
writeText("data/shell.source.jsonl", shellJsonl);
writeText("data/data-a.source.jsonl", dataAJsonl);
writeText("data/data-b.source.jsonl", dataBJsonl);
writeText("data/data-a.normalized.jsonl", jsonlLines(built.dataA));
writeText("data/data-b.normalized.jsonl", jsonlLines(built.dataB));
writeText("data/data-contract.json", JSON.stringify(built.contract, null, 2) + "\n");
writeText("verification-receipt.json", JSON.stringify(receipt, null, 2) + "\n");

const manifest = collectFiles()
  .filter((file) => file !== "MANIFEST.sha256")
  .map((file) => `${sha256(fs.readFileSync(path.join(outDir, file), "utf8"))}  ${file}`)
  .join("\n") + "\n";
writeText("MANIFEST.sha256", manifest);

const summary = {
  kind: "ui.generic-a2ui-preview.artifact-summary.v1",
  source: "checked-in JSONL fixtures",
  proofKind: "jsonl-to-html",
  files: collectFiles(),
  generatedArtifactsAreAuthority: false,
};
writeText("artifact-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
