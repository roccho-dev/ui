import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPurposeVisualizationArtifact, purposeVisualizationArtifactAdapter } from "#core-port";

if (process.env.PURPOSE_VISUALIZATION_BYPASS_CORE_PORT === "1") {
  throw new Error("purpose visualization bypass guard: build must use #core-port stateless adapter path");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || "purpose-visualization-result");
const htmlDir = path.join(out, "purpose-visualization-html");
const shotDir = path.join(out, "purpose-visualization-screenshots");
const evDir = path.join(out, "purpose-visualization-evidence");
const closurePath = "tests/fixtures/purpose-closure/one-loop.valid.jsonl";
const surfacePath = "tests/fixtures/purpose-atlas/surface.v0.9.jsonl";

fs.rmSync(out, { recursive: true, force: true });
[htmlDir, shotDir, evDir, path.join(htmlDir, "source")].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const closureJsonl = read(closurePath);
const surfaceJsonl = read(surfacePath);
const artifact = buildPurposeVisualizationArtifact({ closureJsonl, surfaceJsonl, closurePath, surfacePath });
if (artifact.adapter.id !== purposeVisualizationArtifactAdapter.id) throw new Error("unexpected adapter id");
if (artifact.adapter.ownsState !== false) throw new Error("purpose visualization adapter must be stateless");
const tokens = ["Purpose Decision Atlas v6", "Purpose visualization", "ADRS merge slide", "Purpose closure object", "Selected gap", "Work order", "Receipt", "receipt states are separated", "Residual next input", "returned residuals", "高価値法人構築と売却", "runtime executed", "目的", "責務", "選択"];
for (const token of tokens) if (!artifact.html.includes(token)) throw new Error(`missing token ${token}`);
if (artifact.html.includes("purpose-atlas-preview")) throw new Error("retired preview name leaked into generated HTML");

write(path.join(htmlDir, "index.html"), artifact.html);
write(path.join(htmlDir, "source", "purpose-atlas.surface.jsonl"), surfaceJsonl.endsWith("\n") ? surfaceJsonl : `${surfaceJsonl}\n`);
write(path.join(htmlDir, "source", "purpose-closure.valid.jsonl"), closureJsonl.endsWith("\n") ? closureJsonl : `${closureJsonl}\n`);
const manifest = {
  kind: "ui.purposeVisualizationArtifactManifest.v1",
  status: "purpose-visualization-artifact-ready",
  commit: process.env.GITHUB_SHA || "local",
  buildCommand: "node scripts/build-purpose-visualization-artifact.mjs purpose-visualization-result",
  screenshotCommand: "node scripts/smoke-purpose-visualization.mjs purpose-visualization-result",
  outputPaths: { html: "purpose-visualization-html/index.html", screenshots: "purpose-visualization-screenshots/*.png", evidence: "purpose-visualization-evidence/manifest.json" },
  requiredVisibleTokens: tokens,
  adapter: artifact.evidence.adapter,
  source: artifact.sourceDigests,
  generatedArtifactsAreAuthority: false,
};
write(path.join(htmlDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
manifest.files = files(out);
write(path.join(evDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: manifest.status, adapter: manifest.adapter, files: manifest.files }, null, 2));

function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, "utf8"); }
function files(dir, prefix = "") { return fs.readdirSync(dir).sort().flatMap((name) => { const p = path.join(dir, name); const rel = prefix ? `${prefix}/${name}` : name; return fs.statSync(p).isDirectory() ? files(p, rel) : [rel]; }); }
