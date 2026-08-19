import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createArtifactInvocationRuntime, validateArtifactCapabilityFixture } from "../../../packages/artifact-invocation/src/index.mjs";
import { buildArtifactShellPublication } from "../src/publication.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };
const ok = (...args) => { assert.ok(...args); assertions += 1; };
const readJson = async target => JSON.parse(await fs.readFile(target, "utf8"));
const files = async root => {
  const result = [];
  const walk = async directory => {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target); else if (entry.isFile()) result.push(target);
    }
  };
  await walk(root);
  return result;
};
const snapshot = async root => Object.fromEntries(await Promise.all((await files(root)).map(async target => [path.relative(root, target).split(path.sep).join("/"), (await fs.readFile(target)).toString("base64")] )));
const staticImportSpecifiers = source => {
  const result = [];
  for (const pattern of [
    /\bimport\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']/gu,
  ]) for (const match of source.matchAll(pattern)) result.push(match[1]);
  return result;
};
const assertStaticModuleClosure = async root => {
  let imports = 0;
  for (const target of await files(root)) {
    if (!target.endsWith(".mjs")) continue;
    const source = await fs.readFile(target, "utf8");
    for (const specifier of staticImportSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(target), specifier.split(/[?#]/u, 1)[0]);
      ok(resolved.startsWith(`${path.resolve(root)}${path.sep}`), `${specifier} escapes publication from ${target}`);
      await fs.access(resolved);
      imports += 1;
    }
  }
  return imports;
};
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-publication-"));
try {
  const outputA = path.join(temp, "a");
  const outputB = path.join(temp, "b");
  const input = { capabilitiesRoot: path.join(appRoot, "capabilities"), repoRoot };
  const first = await buildArtifactShellPublication({ ...input, outputRoot: outputA });
  const second = await buildArtifactShellPublication({ ...input, outputRoot: outputB });
  deepEqual(await snapshot(outputA), await snapshot(outputB));
  equal(first.artifactManifest.treeDigest, second.artifactManifest.treeDigest);
  equal(first.catalog.schema, "artifact-capability-catalog/2");
  equal(first.catalog.capabilities.length, 2);
  equal((await fs.readdir(path.join(outputA, "kernel"))).length, 1);
  equal(first.kernel.digest.startsWith("sha256:"), true);
  equal((await fs.readFile(path.join(outputA, "index.html"), "utf8")).includes('src="./entry.mjs"'), true);
  const publicationEntry = await fs.readFile(path.join(outputA, "entry.mjs"), "utf8");
  ok(publicationEntry.includes("./catalog.json"));
  ok(publicationEntry.includes(`./kernel/${first.kernel.digest.slice("sha256:".length)}/apps/artifact-shell/src/shell-core.mjs`));
  const kernelRoot = path.join(outputA, "kernel", first.kernel.digest.slice("sha256:".length));
  equal(await fs.stat(path.join(kernelRoot, "apps", "artifact-shell", "src", "shell-core.mjs")).then(() => true), true);
  await assert.rejects(() => fs.access(path.join(kernelRoot, "apps", "artifact-shell", "src", "entry.mjs"))); assertions += 1;
  await assert.rejects(() => fs.access(path.join(kernelRoot, "apps", "artifact-shell", "src", "publication.mjs"))); assertions += 1;
  ok((await assertStaticModuleClosure(outputA)) > 0);

  let nodeFixtures = 0;
  for (const entry of first.catalog.capabilities) {
    const releaseRoot = path.join(outputA, entry.root);
    const publication = await readJson(path.join(releaseRoot, "manifest.json"));
    const agent = await readJson(path.join(releaseRoot, "agent.json"));
    equal(publication.schema, "artifact-capability-publication/2");
    equal(agent.schema, "artifact-capability-agent-projection/2");
    equal(publication.releaseHash, entry.releaseHash);
    equal(agent.releaseHash, entry.releaseHash);
    equal(agent.engine.digest, publication.capability.engine.digest);
    const engine = await fs.readFile(path.join(releaseRoot, "engine.mjs"));
    equal(engine.byteLength, publication.capability.engine.bytes);
    const sourceEngine = await fs.readFile(path.join(appRoot, "capabilities", entry.root.split("/")[1], "engine.mjs"));
    deepEqual(engine, sourceEngine);
    const view = await fs.readFile(path.join(releaseRoot, "view.mjs"), "utf8");
    ok(view.includes("kernel/"));
    ok(view.includes("pinned-view.mjs"));
    equal((await fs.readFile(path.join(releaseRoot, "view.html"), "utf8")).includes("./view.mjs"), true);

    for (const kind of ["pass", "destructive"]) {
      for (const descriptor of publication.fixtures[kind]) {
        const fixture = validateArtifactCapabilityFixture(await readJson(path.join(releaseRoot, descriptor.href)));
        equal(fixture.kind, kind);
        if (!fixture.runtimes.includes("node")) continue;
        const baseUrl = pathToFileURL(path.join(releaseRoot, "manifest.json")).href;
        let engineFetches = 0;
        const runtime = await createArtifactInvocationRuntime({
          engineBaseUrl: baseUrl,
          environment: { runtime: "node", features: ["crypto.subtle"] },
          fetchEngine: async href => {
            engineFetches += 1;
            const url = new URL(href); url.search = "";
            return new Response(await fs.readFile(fileURLToPath(url)), { headers: { "content-type": "text/javascript" } });
          },
          fetchInput: async () => { throw new Error("unexpected input fetch"); },
          manifests: [publication.capability],
          runtimeBuild: publication.kernel,
        });
        const outcome = await runtime.execute({ request: fixture.request });
        equal(outcome.result.status, fixture.expected.status);
        deepEqual(outcome.result.outputs.map(item => item.contract), fixture.expected.outputContracts);
        if (kind === "destructive") equal(engineFetches, 0);
        nodeFixtures += 1;
      }
    }
  }
  equal(nodeFixtures, 2);
  equal(first.artifactManifest.files.some(item => item.path.includes("agent.json")), true);
  equal(first.artifactManifest.files.some(item => item.path.includes("view.html")), true);
  equal(first.artifactManifest.files.some(item => item.path === "index.html"), true);
  equal(first.artifactManifest.files.some(item => item.path === "entry.mjs"), true);

  console.log(JSON.stringify({ schema: "check-receipt/1", checkId: "ui.artifact-shell.publication", ownerRepo: "ui", lane: "repo", kind: "normal", status: "PASS", assertions, capabilities: first.catalog.capabilities.length, nodeFixtures, treeDigest: first.artifactManifest.treeDigest }));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
