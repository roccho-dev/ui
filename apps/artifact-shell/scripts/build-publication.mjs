import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublicationOutsideSources, buildArtifactShellPublication } from "../src/publication.mjs";
const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const args = Object.create(null);
for (const argument of process.argv.slice(2)) {
  const index = argument.indexOf("=");
  if (index < 1 || !argument.startsWith("--")) throw new Error(`artifact-shell-publication: expected --name=value, got ${argument}`);
  const name = argument.slice(2, index);
  const value = argument.slice(index + 1);
  if (!["out", "capabilities"].includes(name) || !value || Object.hasOwn(args, name)) {
    throw new Error(`artifact-shell-publication: invalid or duplicate argument ${argument}`);
  }
  args[name] = value;
}
const capabilitiesRoot = path.resolve(repoRoot, args.capabilities ?? "apps/artifact-shell/capabilities");
let outputRoot;
if (args.out === undefined) {
  const tempRoot = await fs.realpath(os.tmpdir());
  await assertPublicationOutsideSources(tempRoot, { repoRoot, capabilitiesRoot });
  outputRoot = path.join(await fs.mkdtemp(path.join(tempRoot, "artifact-shell-publication-")), "publication");
} else {
  outputRoot = path.resolve(repoRoot, args.out);
}
const result = await buildArtifactShellPublication({
  capabilitiesRoot,
  outputRoot,
  repoRoot,
});
console.log(JSON.stringify({ schema: "artifact-shell-publication-build-receipt/2", status: "PASS", capabilities: result.catalog.capabilities.length, files: result.artifactManifest.files.length, treeDigest: result.artifactManifest.treeDigest, outputRoot: result.outputRoot }));
