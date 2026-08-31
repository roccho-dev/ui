import { validateArtifactInvocation, validateSha256 } from "./contract.mjs";
import { MAX_URL_MODULE_CHARS, canonicalJson, decodeUrlModule, encodeUrlModule, sha256Hex } from "../../url-module/src/index.mjs";

export const ARTIFACT_INVOCATION_REFERENCE_SCHEMA = "artifact-invocation-reference/1";
export const ARTIFACT_INVOCATION_OBSERVATION_SCHEMA = "artifact-invocation-observation/1";
export const ARTIFACT_INVOCATION_CODEC_ID = "url-module";
export const ARTIFACT_INVOCATION_CODEC_VERSION = "1";
export const ARTIFACT_INVOCATION_FRAGMENT = "invoke";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-invocation-reference: ${message}`); };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, required, optional, name) => {
  invariant(plain(value), `${name} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};
const token = (value, name, maximum = 160) => {
  invariant(typeof value === "string" && value.length > 0 && value.length <= maximum, `${name} is invalid`);
  invariant(/^[a-z0-9][a-z0-9._:/-]*$/u.test(value), `${name} is invalid`);
  return value;
};
const version = (value, name) => {
  const result = token(value, name, 128);
  invariant(!new Set(["current", "head", "latest"]).has(result.toLowerCase()), `${name} is mutable`);
  return result;
};
const digest = (value, name) => validateSha256(value, name);
const secretName = /(?:^|[?&#])(access[_-]?token|api[_-]?key|authorization|credential|password|secret|signature|sig|token)=/iu;
const mutableSegment = /(?:^|\/)(?:current|head|latest)(?:\/|$)/iu;

const releaseRelativePath = (value, name) => {
  invariant(typeof value === "string" && value.startsWith("./"), `${name} must be Release-root-relative`);
  invariant(!value.includes("\\"), `${name} must not contain backslashes`);
  invariant(!value.includes("?") && !value.includes("#"), `${name} must not contain query or fragment`);
  invariant(!secretName.test(value), `${name} contains secret-bearing fields`);
  invariant(!mutableSegment.test(value), `${name} contains a mutable segment`);
  const segments = value.slice(2).split("/");
  invariant(segments.length > 0 && segments.every(segment => segment.length > 0 && segment !== "." && segment !== ".."), `${name} is unsafe`);
  return value;
};
const normalizeExactComponent = (value, name, digestKey) => {
  exactKeys(value, ["id", "version", digestKey], [], name);
  return Object.freeze({
    [digestKey]: digest(value[digestKey], `${name}.${digestKey}`),
    id: token(value.id, `${name}.id`),
    version: version(value.version, `${name}.version`),
  });
};
const normalizeSemantic = value => {
  exactKeys(value, ["digest", "id"], [], "semantic");
  return Object.freeze({ digest: digest(value.digest, "semantic.digest"), id: token(value.id, "semantic.id") });
};
const normalizeProjection = (value, request) => {
  exactKeys(value, ["intent", "version"], [], "projection");
  const result = Object.freeze({ intent: token(value.intent, "projection.intent"), version: version(value.version, "projection.version") });
  invariant(result.intent === request.intent, "projection.intent must equal request.intent");
  return result;
};
const normalizeRuntime = value => {
  exactKeys(value, ["id", "kernelDigest", "path", "version"], [], "runtime");
  return Object.freeze({
    id: token(value.id, "runtime.id"),
    kernelDigest: digest(value.kernelDigest, "runtime.kernelDigest"),
    path: releaseRelativePath(value.path, "runtime.path"),
    version: version(value.version, "runtime.version"),
  });
};
const normalizeCodec = value => {
  exactKeys(value, ["digest", "id", "version"], [], "codec");
  invariant(value.id === ARTIFACT_INVOCATION_CODEC_ID, `codec.id must be ${ARTIFACT_INVOCATION_CODEC_ID}`);
  return Object.freeze({ digest: digest(value.digest, "codec.digest"), id: value.id, version: version(value.version, "codec.version") });
};
const normalizeCapability = value => normalizeExactComponent(value, "capability", "engineDigest");
const normalizeProfile = value => normalizeExactComponent(value, "profile", "digest");

const assertInlineDigest = async input => {
  if (!Object.hasOwn(input, "digest")) return;
  const observed = `sha256:${await sha256Hex(canonicalJson(input.source.value))}`;
  invariant(input.digest === observed, `request input ${input.id} digest mismatch`);
};
const assertCanonicalSources = async request => {
  for (const input of request.inputs) {
    if (input.source.kind === "inline") {
      await assertInlineDigest(input);
      continue;
    }
    if (input.source.kind === "url") {
      releaseRelativePath(input.source.href, `request input ${input.id} href`);
      invariant(Object.hasOwn(input, "digest"), `request input ${input.id} external source requires digest`);
      continue;
    }
    if (input.source.kind === "reference") {
      releaseRelativePath(input.source.reference.href, `request input ${input.id} reference.href`);
      invariant(Object.hasOwn(input, "digest"), `request input ${input.id} reference requires digest`);
      continue;
    }
    throw new Error(`artifact-invocation-reference: request input ${input.id} source ${input.source.kind} is local-only`);
  }
};
const transportOf = request => request.inputs.some(input => input.source.kind === "url" || input.source.kind === "reference") ? "external" : "inline";
const referenceFromToken = (runtimePath, encoded) => `${runtimePath}#${ARTIFACT_INVOCATION_FRAGMENT}=${encoded}`;
const digestText = async value => `sha256:${await sha256Hex(value)}`;
const compiledRequest = (request, invocationId) => validateArtifactInvocation({ ...request, id: invocationId });

export const createArtifactInvocationIdentity = async value => {
  exactKeys(value, ["capability", "codec", "profile", "projection", "request", "runtime", "semantic"], [], "input");
  const request = validateArtifactInvocation(value.request);
  await assertCanonicalSources(request);
  return Object.freeze({
    capability: normalizeCapability(value.capability),
    codec: normalizeCodec(value.codec),
    profile: normalizeProfile(value.profile),
    projection: normalizeProjection(value.projection, request),
    request,
    runtime: normalizeRuntime(value.runtime),
    semantic: normalizeSemantic(value.semantic),
  });
};

const compileOnce = async input => {
  const identity = await createArtifactInvocationIdentity(input);
  const identityBytes = canonicalJson(identity);
  const identityDigest = await digestText(identityBytes);
  const invocationId = `invocation.${identityDigest.slice("sha256:".length)}`;
  const request = compiledRequest(identity.request, invocationId);
  const encoded = await encodeUrlModule(request);
  const reference = referenceFromToken(identity.runtime.path, encoded);
  const requestBytes = canonicalJson(request);
  return Object.freeze({
    authority: false,
    identity,
    identityDigest,
    invocationId,
    reference,
    referenceDigest: await digestText(reference),
    request,
    requestDigest: await digestText(requestBytes),
    schema: ARTIFACT_INVOCATION_REFERENCE_SCHEMA,
    transport: transportOf(request),
  });
};

export const compileArtifactInvocationReference = async value => {
  exactKeys(value, ["capability", "codec", "profile", "projection", "request", "runtime", "semantic"], ["externalize", "maxReferenceChars"], "compile");
  const maximum = value.maxReferenceChars ?? MAX_URL_MODULE_CHARS;
  invariant(Number.isSafeInteger(maximum) && maximum > 0 && maximum <= MAX_URL_MODULE_CHARS, "maxReferenceChars is invalid");
  const input = Object.freeze({
    capability: value.capability,
    codec: value.codec,
    profile: value.profile,
    projection: value.projection,
    request: value.request,
    runtime: value.runtime,
    semantic: value.semantic,
  });
  const first = await compileOnce(input);
  if (first.reference.length <= maximum) return first;
  invariant(typeof value.externalize === "function", `inline reference exceeds ${maximum} characters and exact external transport is absent`);
  const external = await value.externalize(first.identity.request);
  const second = await compileOnce({ ...input, request: external });
  invariant(second.transport === "external", "externalize must return an external request");
  invariant(second.reference.length <= maximum, `external reference exceeds ${maximum} characters`);
  return second;
};

const parseReference = reference => {
  invariant(typeof reference === "string" && reference.length <= MAX_URL_MODULE_CHARS, "reference is invalid");
  const marker = `#${ARTIFACT_INVOCATION_FRAGMENT}=`;
  const position = reference.indexOf(marker);
  invariant(position > 0 && reference.indexOf("#", position + 1) < 0, "reference must contain one #invoke field");
  const runtimePath = reference.slice(0, position);
  releaseRelativePath(runtimePath, "reference runtime path");
  const encoded = reference.slice(position + marker.length);
  invariant(encoded.length > 0 && /^[A-Za-z0-9_-]+$/u.test(encoded), "reference invoke token is invalid");
  return Object.freeze({ encoded, runtimePath });
};

export const decodeArtifactInvocationReference = async reference => {
  const parsed = parseReference(reference);
  return Object.freeze({ request: validateArtifactInvocation(await decodeUrlModule(parsed.encoded)), runtimePath: parsed.runtimePath });
};

export const verifyArtifactInvocationReference = async record => {
  exactKeys(record, ["authority", "identity", "identityDigest", "invocationId", "reference", "referenceDigest", "request", "requestDigest", "schema", "transport"], [], "record");
  invariant(record.schema === ARTIFACT_INVOCATION_REFERENCE_SCHEMA, `record.schema must be ${ARTIFACT_INVOCATION_REFERENCE_SCHEMA}`);
  invariant(record.authority === false, "record.authority must be false");
  const rebuilt = await compileOnce(record.identity);
  invariant(canonicalJson(rebuilt) === canonicalJson(record), "record is not the canonical invocation reference");
  const decoded = await decodeArtifactInvocationReference(record.reference);
  invariant(canonicalJson(decoded.request) === canonicalJson(record.request), "reference request differs from record.request");
  return record;
};

const expectedInputDigests = request => new Map(request.inputs.map(input => {
  if (Object.hasOwn(input, "digest")) return [input.id, input.digest];
  return [input.id, null];
}));

export const verifyArtifactInvocationProof = async ({ expectedSemanticOutputDigest, proof, record }) => {
  await verifyArtifactInvocationReference(record);
  digest(expectedSemanticOutputDigest, "expectedSemanticOutputDigest");
  invariant(plain(proof), "proof must be a plain object");
  const outcome = proof.outcome;
  invariant(plain(outcome) && plain(outcome.receipt) && plain(outcome.result), "proof.outcome is incomplete");
  invariant(outcome.result.status === "PASS", "proof result must be PASS");
  invariant(Array.isArray(outcome.result.outputs) && outcome.result.outputs.length > 0, "proof PASS must contain semantic output");
  invariant(outcome.receipt.authority === false, "proof receipt authority must be false");
  invariant(outcome.receipt.request?.id === record.invocationId, "proof request id mismatch");
  invariant(outcome.receipt.request?.digest === record.requestDigest, "proof request digest mismatch");
  invariant(outcome.receipt.runtime?.build?.id === record.identity.runtime.id, "proof runtime id mismatch");
  invariant(outcome.receipt.runtime?.build?.version === record.identity.runtime.version, "proof runtime version mismatch");
  invariant(outcome.receipt.runtime?.build?.digest === record.identity.runtime.kernelDigest, "proof runtime digest mismatch");
  invariant(outcome.receipt.capability?.id === record.identity.capability.id, "proof capability id mismatch");
  invariant(outcome.receipt.capability?.version === record.identity.capability.version, "proof capability version mismatch");
  invariant(outcome.receipt.capability?.engine?.digest === record.identity.capability.engineDigest, "proof capability engine mismatch");
  invariant(proof.semanticOutputDigest === expectedSemanticOutputDigest, "proof semantic output digest mismatch");
  const evidence = new Map((outcome.receipt.inputs ?? []).map(input => [input.id, input.sha256]));
  for (const [id, expected] of expectedInputDigests(record.request)) if (expected !== null) invariant(evidence.get(id) === expected, `proof input ${id} digest mismatch`);
  return Object.freeze({
    authority: false,
    invocationId: record.invocationId,
    observedAt: proof.observedAt ?? null,
    requestDigest: record.requestDigest,
    result: "PASS",
    runtimeDigest: record.identity.runtime.kernelDigest,
    schema: ARTIFACT_INVOCATION_OBSERVATION_SCHEMA,
    semanticOutputDigest: expectedSemanticOutputDigest,
  });
};
