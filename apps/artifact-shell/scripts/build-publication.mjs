import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArtifactShellPublication } from "../src/publication.mjs";
const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf("=");
  if (index < 1 || !argument.startsWith("--")) throw new Error(`artifact-shell-publication: expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
const result = await buildArtifactShellPublication({
  capabilitiesRoot: path.resolve(repoRoot, args.capabilities ?? "apps/artifact-shell/capabilities"),
  outputRoot: path.resolve(repoRoot, args.out ?? "generated/artifact-shell-publication"),
  repoRoot,
});
console.log(JSON.stringify({ schema: "artifact-shell-publication-build-receipt/2", status: "PASS", capabilities: result.catalog.capabilities.length, files: result.artifactManifest.files.length, treeDigest: result.artifactManifest.treeDigest }));
