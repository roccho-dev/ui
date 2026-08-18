import { sha256Hex } from "../../url-module/src/index.mjs";
import { artifactCapabilityKey, validateArtifactCapabilityImplementation, validateArtifactCapabilityManifest } from "./contract.mjs";
import { readResponseBytes } from "./input.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-engine: ${message}`); };
const javascriptTypes = new Set(["application/javascript", "text/javascript", "application/ecmascript", "text/ecmascript"]);

const bytesToBase64 = bytes => {
  if (typeof Buffer === "function") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

const importVerifiedSource = async ({ bytes, importModule = value => import(value) }) => {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const browserBlob = typeof document === "object" && typeof Blob === "function" && typeof URL?.createObjectURL === "function";
  const moduleUrl = browserBlob
    ? URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
    : `data:text/javascript;base64,${bytesToBase64(bytes)}`;
  try { return await importModule(moduleUrl); } finally { if (browserBlob) URL.revokeObjectURL(moduleUrl); }
};

export const loadArtifactCapabilityEngine = async ({ baseUrl, fetchEngine, importModule, manifest: manifestInput }) => {
  const manifest = validateArtifactCapabilityManifest(manifestInput);
  invariant(manifest.engine.kind === "esm", `unsupported engine kind: ${manifest.engine.kind}`);
  invariant(typeof fetchEngine === "function", "fetchEngine is required");
  const engineUrl = new URL(manifest.engine.href, baseUrl);
  engineUrl.searchParams.set("sha256", manifest.engine.digest.slice("sha256:".length));
  const href = engineUrl.href;
  const response = await fetchEngine(href);
  const type = String(response?.headers?.get?.("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  invariant(!type || javascriptTypes.has(type), `engine content-type is not JavaScript: ${type}`);
  const bytes = await readResponseBytes({ maximum: manifest.limits.maxEngineBytes, name: `engine ${artifactCapabilityKey(manifest)}`, response });
  invariant(bytes.byteLength === manifest.engine.bytes, `engine byte length mismatch: ${bytes.byteLength} != ${manifest.engine.bytes}`);
  const digest = `sha256:${await sha256Hex(bytes)}`;
  invariant(digest === manifest.engine.digest, `engine digest mismatch: ${digest}`);
  const loaded = await importVerifiedSource({ bytes, importModule });
  const capability = validateArtifactCapabilityImplementation(loaded.capability ?? loaded.default ?? loaded, manifest);
  return Object.freeze({
    capability,
    evidence: Object.freeze({ bytes: bytes.byteLength, digest, href, kind: manifest.engine.kind }),
  });
};
