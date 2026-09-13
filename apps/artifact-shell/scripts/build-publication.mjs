import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../../packages/url-module/src/index.mjs";
import { buildAdapters } from "../publication/build-adapters.mjs";
import { buildArtifactShellPublication } from "../src/publication.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf("=");
  if (index < 1 || !argument.startsWith("--")) throw new Error(`artifact-shell-publication: expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
const outputRoot = path.resolve(repoRoot, args.out ?? "generated/artifact-shell-publication");
const appRoot = path.join(repoRoot, "apps", "artifact-shell");
const result = await buildArtifactShellPublication({
  capabilitiesRoot: path.resolve(repoRoot, args.capabilities ?? "apps/artifact-shell/capabilities"),
  outputRoot,
  repoRoot,
});
const adapters = await buildAdapters({ appRoot, outputRoot });

const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const files = [];
const walk = async directory => {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (entry.isFile() && target !== path.join(outputRoot, "artifact-manifest.json")) {
      const bytes = await fs.readFile(target);
      files.push(Object.freeze({ bytes: bytes.byteLength, path: path.relative(outputRoot, target).split(path.sep).join("/"), sha256: sha(bytes) }));
    }
  }
};
await walk(outputRoot);
const treeDigest = sha(Buffer.from(canonicalJson(files)));
await fs.writeFile(path.join(outputRoot, "artifact-manifest.json"), `${canonicalJson({ files, schema: "artifact-shell-publication-artifact/2", treeDigest })}\n`);

console.log(JSON.stringify({
  schema: "artifact-shell-publication-build-receipt/2",
  status: "PASS",
  adapters,
  capabilities: result.catalog.capabilities.length,
  files: files.length,
  treeDigest,
}));
