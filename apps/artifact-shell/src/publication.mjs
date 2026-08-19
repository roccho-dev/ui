import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_CAPABILITY_FIXTURE_SCHEMA,
  ARTIFACT_CAPABILITY_MANIFEST_SCHEMA,
  ARTIFACT_INVOCATION_RUNTIME_CONTRACT,
  validateArtifactCapabilityDeclaration,
  validateArtifactCapabilityFixture,
  validateArtifactCapabilityManifest,
} from "../../../packages/artifact-invocation/src/index.mjs";
import { canonicalJson } from "../../../packages/url-module/src/index.mjs";
import { buildRegistry } from "../scripts/build-registry.mjs";

export const ARTIFACT_CAPABILITY_PUBLICATION_SCHEMA = "artifact-capability-publication/2";
export const ARTIFACT_CAPABILITY_AGENT_SCHEMA = "artifact-capability-agent-projection/2";
export const ARTIFACT_CAPABILITY_CATALOG_SCHEMA = "artifact-capability-catalog/2";
const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-shell-publication: ${message}`); };
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const jsonBytes = value => Buffer.from(`${canonicalJson(value)}\n`);
const posix = value => value.split(path.sep).join("/");
const writeJson = (target, value) => fs.writeFile(target, jsonBytes(value));
const inside = (root, target) => {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  invariant(resolved === base || resolved.startsWith(`${base}${path.sep}`), `${target} escapes ${root}`);
  return resolved;
};
const listFiles = async root => {
  const result = [];
  const walk = async directory => {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) result.push(target);
      else throw new Error(`artifact-shell-publication: unsupported entry ${target}`);
    }
  };
  await walk(root);
  return result;
};
const descriptor = async (root, target) => {
  const bytes = await fs.readFile(target);
  return Object.freeze({ bytes: bytes.byteLength, path: posix(path.relative(root, target)), sha256: sha(bytes) });
};
const copyFile = async (source, target) => { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, await fs.readFile(source)); };
const selfContainedEsm = source => !/\bimport\s*(?:\(|["'{*])/u.test(source) && !/\bexport\s+[^;\n]*\sfrom\s*["']/u.test(source);
const publicationEntrySource = kernelId => `import { artifactShellElements, createArtifactShell } from "./kernel/${kernelId}/apps/artifact-shell/src/shell-core.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(\`artifact-publication-entry: \${message}\`); };
export const bootPublishedArtifactShell = async ({ scope = globalThis } = {}) => {
  const getJson = async href => {
    const url = new URL(href, import.meta.url);
    invariant(url.origin === scope.location.origin, "registry URL must be same-origin");
    const response = await scope.fetch(url.href, { cache: "force-cache", credentials: "omit", method: "GET", redirect: "error", referrerPolicy: "no-referrer" });
    invariant(response.ok, \`registry fetch failed: \${response.status}\`);
    return response.json();
  };
  const catalogUrl = new URL("./catalog.json", import.meta.url);
  invariant(catalogUrl.origin === scope.location.origin, "catalog must be same-origin");
  const catalog = await getJson(catalogUrl);
  invariant(catalog.schema === "artifact-capability-catalog/2", "catalog schema is unsupported");
  const manifests = await Promise.all(catalog.capabilities.map(async entry => {
    const publicationUrl = new URL(\`./\${entry.root}/manifest.json\`, catalogUrl);
    const publication = await getJson(publicationUrl);
    invariant(publication.schema === "artifact-capability-publication/2", "capability publication schema is unsupported");
    invariant(publication.releaseHash === entry.releaseHash, "capability release hash mismatch");
    invariant(publication.capability.id === entry.capability.id && publication.capability.version === entry.capability.version, "capability identity mismatch");
    return Object.freeze({
      ...publication.capability,
      engine: Object.freeze({ ...publication.capability.engine, href: new URL("./engine.mjs", publicationUrl).href }),
    });
  }));
  const elements = artifactShellElements(scope.document);
  return createArtifactShell({ elements, registry: { baseUrl: catalogUrl.href, manifests, runtimeBuild: catalog.kernel }, scope });
};
if (globalThis.location?.protocol === "http:" || globalThis.location?.protocol === "https:") {
  bootPublishedArtifactShell().catch(error => {
    const status = globalThis.document?.querySelector?.("#status");
    if (status) { status.dataset.state = "inconclusive"; status.textContent = \`INCONCLUSIVE · \${error.message}\`; }
    globalThis.artifactShellProof = Object.freeze({ error: String(error.message) });
  });
}
`;
const publicationIndexHtml = source => {
  const expected = '<script type="module" src="./src/entry.mjs"></script>';
  invariant(source.includes(expected), "source shell index entry is missing");
  return source.replace(expected, '<script type="module" src="./entry.mjs"></script>');
};
const viewHtml = title => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n<style>:root{font-family:ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText}main{width:min(960px,100%);margin:auto;padding:clamp(16px,4vw,40px);display:grid;gap:18px}header{display:flex;justify-content:space-between;gap:16px;align-items:baseline}section{border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:14px;padding:16px}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}#surface:empty{display:none}</style>\n</head>\n<body><main><header><h1>${title}</h1><output id="status" data-state="loading">Loading</output></header><section id="surface"></section><section><h2>Result</h2><pre id="result"></pre></section><section><h2>Receipt</h2><pre id="receipt"></pre></section></main><script type="module" src="./view.mjs"></script></body></html>\n`;

export const buildArtifactShellPublication = async ({ capabilitiesRoot, outputRoot, repoRoot }) => {
  const appRoot = path.join(repoRoot, "apps", "artifact-shell");
  const registryOutput = path.join(appRoot, "generated", "capability-registry.mjs");
  const registry = await buildRegistry({ capabilitiesRoot, check: false, output: registryOutput });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const kernelBody = Object.freeze({
    contract: ARTIFACT_INVOCATION_RUNTIME_CONTRACT,
    files: registry.runtimeBuild.files,
    id: registry.runtimeBuild.id,
    schema: "artifact-runtime-kernel/2",
    version: registry.runtimeBuild.version,
  });
  const kernelDigest = sha(Buffer.from(canonicalJson(kernelBody)));
  const kernelId = kernelDigest.slice("sha256:".length);
  const kernelRoot = path.join(outputRoot, "kernel", kernelId);
  for (const item of registry.runtimeBuild.files) await copyFile(path.join(repoRoot, item.path), path.join(kernelRoot, item.path));
  const kernel = Object.freeze({ digest: kernelDigest, id: "artifact-shell", version: "2" });
  await writeJson(path.join(kernelRoot, "manifest.json"), Object.freeze({ ...kernelBody, digest: kernelDigest }));

  const entries = [];
  for (const directory of (await fs.readdir(capabilitiesRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const sourceRoot = path.join(capabilitiesRoot, directory.name);
    const declaration = validateArtifactCapabilityDeclaration(JSON.parse(await fs.readFile(path.join(sourceRoot, "manifest.json"), "utf8")));
    const enginePath = inside(sourceRoot, path.join(sourceRoot, declaration.engine.file));
    const engineBytes = await fs.readFile(enginePath);
    invariant(selfContainedEsm(engineBytes.toString("utf8")), `${declaration.id} engine must be self-contained ESM`);
    const capability = validateArtifactCapabilityManifest({ ...declaration, engine: { bytes: engineBytes.byteLength, digest: sha(engineBytes), href: "./engine.mjs", kind: "esm" }, schema: ARTIFACT_CAPABILITY_MANIFEST_SCHEMA });
    const fixtures = { pass: [], destructive: [] };
    for (const kind of ["pass", "destructive"]) {
      for (const fixtureRelative of declaration.fixtures[kind]) {
        const fixturePath = inside(sourceRoot, path.join(sourceRoot, fixtureRelative));
        const fixture = validateArtifactCapabilityFixture(JSON.parse(await fs.readFile(fixturePath, "utf8")));
        invariant(fixture.schema === ARTIFACT_CAPABILITY_FIXTURE_SCHEMA && fixture.kind === kind, `${fixtureRelative} is not a ${kind} fixture`);
        const body = await fs.readFile(fixturePath);
        fixtures[kind].push(Object.freeze({ bytes: body.byteLength, href: `./${posix(fixtureRelative)}`, id: fixture.id, sha256: sha(body) }));
      }
    }
    const releaseBody = Object.freeze({ capability, fixtures, kernel, source: Object.freeze({ directory: directory.name, engine: Object.freeze({ bytes: engineBytes.byteLength, sha256: sha(engineBytes) }) }) });
    const releaseHash = sha(Buffer.from(canonicalJson(releaseBody)));
    const releaseRoot = path.join(outputRoot, "capabilities", directory.name, releaseHash.slice("sha256:".length));
    await fs.mkdir(releaseRoot, { recursive: true });
    await fs.writeFile(path.join(releaseRoot, "engine.mjs"), engineBytes);
    for (const kind of ["pass", "destructive"]) for (const item of declaration.fixtures[kind]) await copyFile(path.join(sourceRoot, item), path.join(releaseRoot, item));
    const pinnedRelative = posix(path.relative(releaseRoot, path.join(kernelRoot, "apps", "artifact-shell", "src", "pinned-view.mjs")));
    const pinnedHref = pinnedRelative.startsWith(".") ? pinnedRelative : `./${pinnedRelative}`;
    await fs.writeFile(path.join(releaseRoot, "view.html"), viewHtml(`${capability.id}@${capability.version}`));
    await fs.writeFile(path.join(releaseRoot, "view.mjs"), `import { bootPublishedCapabilityView } from ${JSON.stringify(pinnedHref)};\nawait bootPublishedCapabilityView({ publicationUrl: "./manifest.json" });\n`);
    const publication = Object.freeze({
      agent: Object.freeze({ href: "./agent.json" }),
      authority: false,
      capability,
      fixtures: Object.freeze({ pass: Object.freeze(fixtures.pass), destructive: Object.freeze(fixtures.destructive) }),
      human: Object.freeze({ href: "./view.html" }),
      kernel,
      releaseHash,
      schema: ARTIFACT_CAPABILITY_PUBLICATION_SCHEMA,
    });
    const agent = Object.freeze({
      authority: false,
      capability,
      engine: capability.engine,
      fixtures: publication.fixtures,
      invocationSchema: ARTIFACT_INVOCATION_RUNTIME_CONTRACT.invocationSchema,
      kernel,
      releaseHash,
      runtimeContract: ARTIFACT_INVOCATION_RUNTIME_CONTRACT,
      schema: ARTIFACT_CAPABILITY_AGENT_SCHEMA,
    });
    await writeJson(path.join(releaseRoot, "manifest.json"), publication);
    await writeJson(path.join(releaseRoot, "agent.json"), agent);
    entries.push(Object.freeze({ agent: publication.agent, capability: Object.freeze({ id: capability.id, version: capability.version }), human: publication.human, releaseHash, root: posix(path.relative(outputRoot, releaseRoot)) }));
  }
  const catalog = Object.freeze({ capabilities: Object.freeze(entries), kernel, schema: ARTIFACT_CAPABILITY_CATALOG_SCHEMA });
  await writeJson(path.join(outputRoot, "catalog.json"), catalog);
  await fs.writeFile(path.join(outputRoot, "entry.mjs"), publicationEntrySource(kernelId));
  await fs.writeFile(path.join(outputRoot, "index.html"), publicationIndexHtml(await fs.readFile(path.join(appRoot, "index.html"), "utf8")));
  const files = await listFiles(outputRoot);
  const described = Object.freeze(await Promise.all(files.map(file => descriptor(outputRoot, file))));
  const treeDigest = sha(Buffer.from(canonicalJson(described)));
  const artifactManifest = Object.freeze({ files: described, schema: "artifact-shell-publication-artifact/2", treeDigest });
  await writeJson(path.join(outputRoot, "artifact-manifest.json"), artifactManifest);
  return Object.freeze({ artifactManifest, catalog, kernel, outputRoot });
};
