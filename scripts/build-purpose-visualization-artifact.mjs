import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPurposeVisualizationArtifact, purposeVisualizationArtifactAdapter } from "#core-port";

if (process.env.PURPOSE_VISUALIZATION_BYPASS_CORE_PORT === "1") {
  throw new Error("purpose visualization bypass guard: build must use #core-port stateless adapter path");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const out = path.resolve(options.out || process.env.PURPOSE_VISUALIZATION_OUT || "purpose-visualization-result");
const htmlDir = path.join(out, "purpose-visualization-html");
const shotDir = path.join(out, "purpose-visualization-screenshots");
const evDir = path.join(out, "purpose-visualization-evidence");
const closurePath = requiredInputPath("closure JSONL", options.closureJsonl || process.env.PURPOSE_CLOSURE_JSONL || process.env.PURPOSE_VISUALIZATION_CLOSURE_JSONL);
const surfacePath = requiredInputPath("surface JSONL", options.surfaceJsonl || process.env.PURPOSE_SURFACE_JSONL || process.env.PURPOSE_VISUALIZATION_SURFACE_JSONL);
const inputContract = {
  kind: "ui.purposeVisualizationInputContract.v1",
  provider: options.inputProvider || process.env.PURPOSE_INPUT_PROVIDER || process.env.PURPOSE_VISUALIZATION_INPUT_PROVIDER || "cli",
  injectedBy: options.injectedBy || process.env.PURPOSE_INPUT_INJECTED_BY || process.env.PURPOSE_VISUALIZATION_INPUT_INJECTED_BY || "cli",
  inputs: {
    closure: { role: "purpose-closure-jsonl", path: closurePath },
    surface: { role: "purpose-atlas-surface-jsonl", path: surfacePath },
  },
};

fs.rmSync(out, { recursive: true, force: true });
[htmlDir, shotDir, evDir, path.join(htmlDir, "source")].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const closureJsonl = readInput(closurePath);
const surfaceJsonl = readInput(surfacePath);
const artifact = buildPurposeVisualizationArtifact({ closureJsonl, surfaceJsonl, closurePath, surfacePath });
if (artifact.adapter.id !== purposeVisualizationArtifactAdapter.id) throw new Error("unexpected adapter id");
if (artifact.adapter.ownsState !== false) throw new Error("purpose visualization adapter must be stateless");
const tokens = ["Purpose Decision Atlas v6", "Purpose visualization", "ADRS merge slide", "Purpose closure object", "Selected gap", "Work order", "Receipt", "receipt states are separated", "Residual next input", "returned residuals", "高価値法人構築と売却", "runtime executed", "目的", "責務", "選択"];
for (const token of tokens) if (!artifact.html.includes(token)) throw new Error(`missing token ${token}`);
if (artifact.html.includes("purpose-atlas-preview")) throw new Error("retired preview name leaked into generated HTML");

write(path.join(htmlDir, "index.html"), artifact.html);
write(path.join(htmlDir, "source", "purpose-atlas.surface.jsonl"), surfaceJsonl);
write(path.join(htmlDir, "source", "purpose-closure.valid.jsonl"), closureJsonl);
const bundledSourceParity =
  sha256(fs.readFileSync(path.join(htmlDir, "source", "purpose-closure.valid.jsonl"), "utf8")) === artifact.sourceDigests.closure.sha256 &&
  sha256(fs.readFileSync(path.join(htmlDir, "source", "purpose-atlas.surface.jsonl"), "utf8")) === artifact.sourceDigests.surface.sha256;
if (!bundledSourceParity) throw new Error("bundled source parity failed against declared JSONL inputs");
const manifest = {
  kind: "ui.purposeVisualizationArtifactManifest.v1",
  status: "purpose-visualization-artifact-ready",
  commit: process.env.GITHUB_SHA || "local",
  buildCommand: buildCommandSummary(options),
  screenshotCommand: "node scripts/smoke-purpose-visualization.mjs purpose-visualization-result",
  outputPaths: { html: "purpose-visualization-html/index.html", screenshots: "purpose-visualization-screenshots/*.png", evidence: "purpose-visualization-evidence/manifest.json" },
  requiredVisibleTokens: tokens,
  inputContract,
  adapter: artifact.evidence.adapter,
  source: artifact.sourceDigests,
  bundledSourceParity,
  generatedArtifactsAreAuthority: false,
};
write(path.join(htmlDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
manifest.files = files(out);
write(path.join(evDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: manifest.status, inputContract: manifest.inputContract, adapter: manifest.adapter, files: manifest.files }, null, 2));

function parseArgs(args) {
  const result = { positionals: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      result.positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const rawKey = arg.slice(2, eq >= 0 ? eq : undefined);
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const value = eq >= 0 ? arg.slice(eq + 1) : args[++index];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${rawKey}`);
    result[key] = value;
  }
  if (!result.out && result.positionals[0]) result.out = result.positionals[0];
  if (result.positionals.length > 1) throw new Error(`unexpected positional arguments: ${result.positionals.slice(1).join(", ")}`);
  return result;
}
function requiredInputPath(label, value) {
  if (!value) throw new Error(`explicit ${label} input path is required; pass --${label.startsWith("closure") ? "closure" : "surface"}-jsonl or the matching PURPOSE_*_JSONL environment variable`);
  return value;
}
function readInput(inputPath) { return fs.readFileSync(path.isAbsolute(inputPath) ? inputPath : path.join(root, inputPath), "utf8"); }
function buildCommandSummary(options) {
  const prefix = inputContract.injectedBy === "nix" ? "nix-declared" : "cli-declared";
  const outArg = options.out || "purpose-visualization-result";
  return `${prefix}: node scripts/build-purpose-visualization-artifact.mjs --out ${outArg} --closure-jsonl ${closurePath} --surface-jsonl ${surfacePath}`;
}
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, "utf8"); }
function files(dir, prefix = "") { return fs.readdirSync(dir).sort().flatMap((name) => { const p = path.join(dir, name); const rel = prefix ? `${prefix}/${name}` : name; return fs.statSync(p).isDirectory() ? files(p, rel) : [rel]; }); }
function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
