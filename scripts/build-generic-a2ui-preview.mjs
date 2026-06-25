import fs from "node:fs";
import path from "node:path";

import { buildGenericA2uiPreview, jsonlLines, sha256 } from "../src/a2ui-shell-builder.mjs";

const outDir = path.resolve(process.argv[2] || "generic-a2ui-preview");
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

const built = buildGenericA2uiPreview();

writeText("shell/index.html", built.shellHtml);
writeText("preview-a/index.html", built.previewAHtml);
writeText("preview-b/index.html", built.previewBHtml);
writeText("shell/shell.json", JSON.stringify(built.shell, null, 2) + "\n");
writeText("data/data-a.jsonl", jsonlLines(built.dataA));
writeText("data/data-b.jsonl", jsonlLines(built.dataB));
writeText("data/data-contract.json", JSON.stringify(built.contract, null, 2) + "\n");
writeText("verification-receipt.json", JSON.stringify(built.receipt, null, 2) + "\n");

const manifest = collectFiles()
  .filter((file) => file !== "MANIFEST.sha256")
  .map((file) => `${sha256(fs.readFileSync(path.join(outDir, file), "utf8"))}  ${file}`)
  .join("\n") + "\n";
writeText("MANIFEST.sha256", manifest);

const summary = {
  kind: "ui.generic-a2ui-preview.artifact-summary.v1",
  files: collectFiles(),
  generatedArtifactsAreAuthority: false,
};
writeText("artifact-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
