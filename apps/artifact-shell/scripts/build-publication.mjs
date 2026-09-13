import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, createUrlModuleUrl } from "../../../packages/url-module/src/index.mjs";
import { buildArtifactShellPublication } from "../src/publication.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf("=");
  if (index < 1 || !argument.startsWith("--")) throw new Error(`artifact-shell-publication: expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
const outputRoot = path.resolve(repoRoot, args.out ?? "generated/artifact-shell-publication");
const result = await buildArtifactShellPublication({
  capabilitiesRoot: path.resolve(repoRoot, args.capabilities ?? "apps/artifact-shell/capabilities"),
  outputRoot,
  repoRoot,
});

const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fixtureRoot = path.join(repoRoot, "apps", "artifact-shell", "capabilities", "render-semantic-map", "fixtures");
const launcher = {};
for (const name of ["graph", "map", "seq"]) {
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureRoot, `${name}.pass.json`), "utf8"));
  const encoded = new URL(await createUrlModuleUrl({
    base: `https://artifact-shell.invalid/?launch=${name}`,
    fragment: "invoke",
    value: fixture.request,
  }));
  launcher[name] = `?launch=${name}${encoded.hash}`;
}

const indexPath = path.join(outputRoot, "index.html");
let index = await fs.readFile(indexPath, "utf8");
for (const [name, href] of Object.entries(launcher)) {
  const marker = `__ARTIFACT_SHELL_${name.toUpperCase()}__`;
  if (!index.includes(marker)) throw new Error(`artifact-shell-publication: launcher marker missing: ${marker}`);
  index = index.replace(marker, href);
}
if (index.includes("__ARTIFACT_SHELL_")) throw new Error("artifact-shell-publication: unresolved launcher marker");
await fs.writeFile(indexPath, index);

const entryPath = path.join(outputRoot, "entry.mjs");
const publishedMode = `const setPublishedShellMode = () => {\n  const hash = new URL(globalThis.location.href).hash;\n  globalThis.document.body.dataset.mode = hash.startsWith("#invoke=") ? "invoke" : "launcher";\n};\nsetPublishedShellMode();\nglobalThis.addEventListener("popstate", setPublishedShellMode);\nglobalThis.addEventListener("hashchange", setPublishedShellMode);\n\n`;
await fs.writeFile(entryPath, `${publishedMode}${await fs.readFile(entryPath, "utf8")}`);

const manifestPath = path.join(outputRoot, "artifact-manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const files = [];
for (const descriptor of manifest.files) {
  if (descriptor.path !== "index.html" && descriptor.path !== "entry.mjs") {
    files.push(descriptor);
    continue;
  }
  const bytes = await fs.readFile(path.join(outputRoot, descriptor.path));
  files.push({ bytes: bytes.byteLength, path: descriptor.path, sha256: sha(bytes) });
}
const treeDigest = sha(Buffer.from(canonicalJson(files)));
await fs.writeFile(manifestPath, `${canonicalJson({ ...manifest, files, treeDigest })}\n`);

console.log(JSON.stringify({
  schema: "artifact-shell-publication-build-receipt/2",
  status: "PASS",
  capabilities: result.catalog.capabilities.length,
  files: files.length,
  treeDigest,
  launcher: Object.keys(launcher),
}));
