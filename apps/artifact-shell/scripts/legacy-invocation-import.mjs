import {
  compileArtifactInvocationReference,
  validateArtifactInvocation,
  validateSha256,
} from "../../../packages/artifact-invocation/src/index.mjs";
import {
  canonicalJson,
  canonicalValue,
  readUrlModule,
  sha256Hex,
} from "../../../packages/url-module/src/index.mjs";

export const LEGACY_INVOCATION_SEED_SCHEMA = "legacy-invocation-seed/1";
export const LEGACY_INVOCATION_SEED_ENTRY_SCHEMA = "legacy-invocation-seed-entry/1";
export const LEGACY_INVOCATION_OBSERVATION_SCHEMA = "legacy-invocation-observation/1";
export const LEGACY_INVOCATION_IMPORT_SCHEMA = "legacy-invocation-import/1";
export const LEGACY_INVOCATION_RECORD_SCHEMA = "legacy-invocation-record/1";

const invariant = (condition, message) => {
  if (!condition) throw new Error(`legacy-invocation-import: ${message}`);
};
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, required, optional, name) => {
  invariant(plain(value), `${name} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};
const text = (value, name, maximum = 4_096) => {
  invariant(typeof value === "string" && value.length > 0 && value.length <= maximum, `${name} is invalid`);
  return value;
};
const token = (value, name, maximum = 160) => {
  const result = text(value, name, maximum);
  invariant(/^[a-z0-9][a-z0-9._:/-]*$/u.test(result), `${name} is invalid`);
  return result;
};
const version = (value, name) => token(value, name, 128);
const digest = (value, name) => validateSha256(value, name);
const hashCanonical = async value => `sha256:${await sha256Hex(canonicalJson(value))}`;
const hashText = async value => `sha256:${await sha256Hex(value)}`;
const secretField = /(?:^|[?&#])(access[_-]?token|api[_-]?key|authorization|credential|password|secret|signature|sig|token)=/iu;
const mutableToken = new Set(["current", "head", "latest"]);

const normalizeUrl = value => {
  const original = text(value, "entry.originalUrl", 65_536);
  let parsed;
  try { parsed = new URL(original); }
  catch (_) { throw new Error("legacy-invocation-import: entry.originalUrl is invalid"); }
  invariant(parsed.protocol === "https:" || parsed.protocol === "http:", "entry.originalUrl protocol is unsupported");
  return Object.freeze({
    credentialBearing: Boolean(parsed.username || parsed.password || secretField.test(original)),
    original,
    pathname: parsed.pathname,
  });
};
const normalizeTimestamp = (value, name) => {
  text(value, name, 64);
  const parsed = new Date(value);
  invariant(Number.isFinite(parsed.getTime()), `${name} is invalid`);
  return parsed.toISOString();
};
const normalizeSourceRefs = values => {
  invariant(Array.isArray(values) && values.length > 0, "entry.sourceRefs must contain at least one reference");
  const refs = values.map((value, index) => text(value, `entry.sourceRefs[${index}]`, 1_024));
  invariant(new Set(refs).size === refs.length, "entry.sourceRefs contains duplicates");
  return Object.freeze([...refs].sort());
};
const normalizeObservation = (value, index) => {
  const name = `entry.observations[${index}]`;
  exactKeys(value, ["complete", "observedAt", "proofRef", "result", "schema"], ["semanticDigest"], name);
  invariant(value.schema === LEGACY_INVOCATION_OBSERVATION_SCHEMA, `${name}.schema is unsupported`);
  invariant(typeof value.complete === "boolean", `${name}.complete must be boolean`);
  invariant(value.result === "PASS" || value.result === "FAIL", `${name}.result is invalid`);
  return Object.freeze({
    complete: value.complete,
    observedAt: normalizeTimestamp(value.observedAt, `${name}.observedAt`),
    proofRef: text(value.proofRef, `${name}.proofRef`, 1_024),
    result: value.result,
    schema: LEGACY_INVOCATION_OBSERVATION_SCHEMA,
    ...(Object.hasOwn(value, "semanticDigest")
      ? { semanticDigest: digest(value.semanticDigest, `${name}.semanticDigest`) }
      : {}),
  });
};
const normalizeObservations = values => {
  invariant(Array.isArray(values), "entry.observations must be an array");
  const byIdentity = new Map();
  for (const [index, value] of values.entries()) {
    const observation = normalizeObservation(value, index);
    const identity = `${observation.observedAt}\u0000${observation.proofRef}`;
    const encoded = canonicalJson(observation);
    if (byIdentity.has(identity)) invariant(byIdentity.get(identity) === encoded, "conflicting duplicate observation");
    else byIdentity.set(identity, encoded);
  }
  return Object.freeze([...byIdentity.values()].map(JSON.parse).sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
    || left.proofRef.localeCompare(right.proofRef)
    || left.result.localeCompare(right.result)));
};
const normalizeCodec = value => {
  exactKeys(value, ["kind"], ["candidates", "digest", "id", "version"], "entry.evidence.codec");
  invariant(["ambiguous", "supported", "unsupported"].includes(value.kind), "entry.evidence.codec.kind is unsupported");
  if (value.kind === "supported") {
    exactKeys(value, ["digest", "id", "kind", "version"], [], "entry.evidence.codec");
    invariant(value.id === "url-module", "entry.evidence.codec.id is unsupported");
    return Object.freeze({
      digest: digest(value.digest, "entry.evidence.codec.digest"),
      id: value.id,
      kind: value.kind,
      version: version(value.version, "entry.evidence.codec.version"),
    });
  }
  if (value.kind === "ambiguous") {
    exactKeys(value, ["candidates", "kind"], [], "entry.evidence.codec");
    invariant(Array.isArray(value.candidates) && value.candidates.length > 1, "entry.evidence.codec.candidates are invalid");
    const candidates = value.candidates.map((candidate, index) => token(candidate, `entry.evidence.codec.candidates[${index}]`));
    invariant(new Set(candidates).size === candidates.length, "entry.evidence.codec.candidates contain duplicates");
    return Object.freeze({ candidates: Object.freeze([...candidates].sort()), kind: value.kind });
  }
  exactKeys(value, ["id", "kind"], [], "entry.evidence.codec");
  return Object.freeze({ id: token(value.id, "entry.evidence.codec.id"), kind: value.kind });
};
const normalizeProjection = value => {
  exactKeys(value, ["intent", "version"], [], "entry.evidence.projection");
  return Object.freeze({
    intent: token(value.intent, "entry.evidence.projection.intent"),
    version: version(value.version, "entry.evidence.projection.version"),
  });
};
const normalizeRuntime = value => {
  exactKeys(value, ["digest", "id", "path", "version"], [], "entry.evidence.runtime");
  return Object.freeze({
    digest: digest(value.digest, "entry.evidence.runtime.digest"),
    id: token(value.id, "entry.evidence.runtime.id"),
    path: text(value.path, "entry.evidence.runtime.path", 2_048),
    version: version(value.version, "entry.evidence.runtime.version"),
  });
};
const normalizeState = value => {
  exactKeys(value, ["digest", "inputId"], [], "entry.evidence.state");
  return Object.freeze({
    digest: digest(value.digest, "entry.evidence.state.digest"),
    inputId: token(value.inputId, "entry.evidence.state.inputId"),
  });
};
const normalizeEvidence = value => {
  exactKeys(value, ["codec"], ["projection", "runtime", "schema", "state"], "entry.evidence");
  const codec = normalizeCodec(value.codec);
  if (codec.kind === "supported") {
    for (const key of ["projection", "runtime", "schema", "state"]) {
      invariant(Object.hasOwn(value, key), `entry.evidence.${key} is required for a supported codec`);
    }
  }
  return Object.freeze({
    codec,
    ...(Object.hasOwn(value, "projection") ? { projection: normalizeProjection(value.projection) } : {}),
    ...(Object.hasOwn(value, "runtime") ? { runtime: normalizeRuntime(value.runtime) } : {}),
    ...(Object.hasOwn(value, "schema") ? { schema: token(value.schema, "entry.evidence.schema") } : {}),
    ...(Object.hasOwn(value, "state") ? { state: normalizeState(value.state) } : {}),
  });
};
const pinnedElementIsMutable = evidence => Boolean(
  (evidence.runtime && (
    mutableToken.has(evidence.runtime.version.toLowerCase())
    || evidence.runtime.path.split("/").some(segment => mutableToken.has(segment.toLowerCase()))
  ))
  || (evidence.codec.version && mutableToken.has(evidence.codec.version.toLowerCase()))
  || (evidence.projection?.version && mutableToken.has(evidence.projection.version.toLowerCase()))
);

const decodeSupported = async ({ evidence, originalUrl, pathname }) => {
  if (evidence.codec.kind !== "supported") return Object.freeze({ request: null });
  try {
    invariant(pathname === evidence.runtime.path, "supported URL runtime path differs from evidence");
    const decoded = await readUrlModule({ fragment: "invoke", input: originalUrl });
    invariant(decoded !== null, "supported URL has no invoke payload");
    const request = validateArtifactInvocation(decoded);
    invariant(request.schema === evidence.schema, "supported URL schema differs from evidence");
    invariant(request.intent === evidence.projection.intent, "supported URL projection differs from evidence");
    const input = request.inputs.find(candidate => candidate.id === evidence.state.inputId);
    invariant(input, "supported URL state input is absent");
    if (input.source.kind === "inline") {
      const observed = await hashCanonical(input.source.value);
      invariant(observed === evidence.state.digest, "supported URL state digest differs from evidence");
    } else if (Object.hasOwn(input, "digest")) {
      invariant(input.digest === evidence.state.digest, "supported URL state digest differs from evidence");
    } else {
      throw new Error("legacy-invocation-import: supported URL state is not digest-pinned");
    }
    return Object.freeze({ request });
  } catch (_) {
    return Object.freeze({
      failure: Object.freeze({ code: "supported-codec-decode-failed" }),
      request: null,
    });
  }
};
const classify = ({ credentialBearing, decodedRequest, evidence, observations }) => {
  if (credentialBearing) return "unknown";
  const latest = observations.at(-1);
  if (!latest) return "unknown";
  if (latest.result !== "PASS" || latest.complete !== true) return "broken";
  if (evidence.state && latest.semanticDigest !== evidence.state.digest) return "broken";
  if (evidence.state && pinnedElementIsMutable(evidence)) return "state-pinned";
  if (evidence.codec.kind !== "supported" || decodedRequest === null) return "unknown";
  return "exact";
};
const normalizeNormalization = async ({ normalization, stateDigest }) => {
  exactKeys(normalization, ["input", "relation"], [], "entry.normalization");
  invariant(normalization.relation === "equivalent_state", "entry.normalization.relation is unsupported");
  invariant(stateDigest, "equivalent_state requires a known state digest");
  const invocation = await compileArtifactInvocationReference(normalization.input);
  invariant(invocation.identity.semantic.digest === stateDigest, "equivalent_state requires equal state digest");
  return Object.freeze({ invocation, relation: normalization.relation });
};

const normalizeEntry = async (entry, seedDigest) => {
  exactKeys(
    entry,
    ["evidence", "observations", "originalUrl", "schema", "sourceRefs", "title"],
    ["normalization", "privateEvidenceRef"],
    "entry",
  );
  invariant(entry.schema === LEGACY_INVOCATION_SEED_ENTRY_SCHEMA, "entry.schema is unsupported");
  const url = normalizeUrl(entry.originalUrl);
  const originalUrlDigest = await hashCanonical(url.original);
  const evidence = normalizeEvidence(entry.evidence);
  const observations = normalizeObservations(entry.observations);
  const sourceRefs = normalizeSourceRefs(entry.sourceRefs);
  const title = text(entry.title, "entry.title", 512);
  const decode = url.credentialBearing
    ? Object.freeze({ request: null })
    : await decodeSupported({ evidence, originalUrl: url.original, pathname: url.pathname });
  const classification = classify({
    credentialBearing: url.credentialBearing,
    decodedRequest: decode.request,
    evidence,
    observations,
  });
  const stateDigest = evidence.state?.digest ?? null;
  const id = `legacy.${originalUrlDigest.slice("sha256:".length)}`;
  const record = {
    authority: false,
    classification,
    evidence,
    id,
    observations,
    originalUrlDigest,
    schema: LEGACY_INVOCATION_RECORD_SCHEMA,
    seedDigest,
    sourceRefs,
    title,
    ...(decode.failure ? { decodeFailure: decode.failure } : {}),
    ...(decode.request ? { decodedRequest: decode.request } : {}),
    ...(stateDigest ? { stateDigest } : {}),
  };
  if (url.credentialBearing) {
    invariant(Object.hasOwn(entry, "privateEvidenceRef"), "credential-bearing URL requires privateEvidenceRef");
    record.quarantine = Object.freeze({
      privateEvidenceRef: text(entry.privateEvidenceRef, "entry.privateEvidenceRef", 1_024),
      reason: "credential-bearing-url",
    });
  } else {
    invariant(!Object.hasOwn(entry, "privateEvidenceRef"), "entry.privateEvidenceRef is only allowed for quarantined URLs");
    record.originalUrl = url.original;
  }
  if (Object.hasOwn(entry, "normalization")) {
    invariant(!url.credentialBearing, "credential-bearing URL cannot be normalized from public seed material");
    record.normalized = await normalizeNormalization({ normalization: entry.normalization, stateDigest });
  }
  return Object.freeze(canonicalValue(record));
};

const normalizeDecodeFailure = value => {
  exactKeys(value, ["code"], [], "record.decodeFailure");
  invariant(value.code === "supported-codec-decode-failed", "record.decodeFailure.code is unsupported");
  return Object.freeze({ code: value.code });
};
const normalizeRecord = value => {
  const required = ["authority", "classification", "evidence", "id", "observations", "originalUrlDigest", "schema", "seedDigest", "sourceRefs", "title"];
  const optional = ["decodeFailure", "decodedRequest", "normalized", "originalUrl", "quarantine", "stateDigest"];
  exactKeys(value, required, optional, "record");
  invariant(value.authority === false, "record.authority must be false");
  invariant(value.schema === LEGACY_INVOCATION_RECORD_SCHEMA, "record.schema is unsupported");
  invariant(["broken", "exact", "state-pinned", "unknown"].includes(value.classification), "record.classification is invalid");
  const originalUrlDigest = digest(value.originalUrlDigest, "record.originalUrlDigest");
  invariant(value.id === `legacy.${originalUrlDigest.slice("sha256:".length)}`, "record.id mismatch");
  const seedDigest = digest(value.seedDigest, "record.seedDigest");
  const evidence = normalizeEvidence(value.evidence);
  const observations = normalizeObservations(value.observations);
  const sourceRefs = normalizeSourceRefs(value.sourceRefs);
  const title = text(value.title, "record.title", 512);
  const originalUrl = Object.hasOwn(value, "originalUrl") ? normalizeUrl(value.originalUrl).original : null;
  const decodeFailure = Object.hasOwn(value, "decodeFailure") ? normalizeDecodeFailure(value.decodeFailure) : null;
  const decodedRequest = Object.hasOwn(value, "decodedRequest") ? validateArtifactInvocation(value.decodedRequest) : null;
  invariant(!(decodeFailure && decodedRequest), "record cannot contain both decodeFailure and decodedRequest");
  const stateDigest = Object.hasOwn(value, "stateDigest") ? digest(value.stateDigest, "record.stateDigest") : null;
  invariant(stateDigest === (evidence.state?.digest ?? null), "record.stateDigest mismatch");
  if (evidence.codec.kind === "supported" && !Object.hasOwn(value, "quarantine")) {
    invariant(decodedRequest || decodeFailure, "supported record requires decodedRequest or decodeFailure");
  }
  if (evidence.codec.kind !== "supported") {
    invariant(!decodedRequest, "unsupported record must not invent decodedRequest");
    invariant(!decodeFailure, "unsupported record must not invent decodeFailure");
  }
  let quarantine = null;
  if (Object.hasOwn(value, "quarantine")) {
    exactKeys(value.quarantine, ["privateEvidenceRef", "reason"], [], "record.quarantine");
    invariant(value.quarantine.reason === "credential-bearing-url", "record.quarantine.reason is invalid");
    quarantine = Object.freeze({
      privateEvidenceRef: text(value.quarantine.privateEvidenceRef, "record.quarantine.privateEvidenceRef", 1_024),
      reason: value.quarantine.reason,
    });
    invariant(originalUrl === null, "quarantined record must not expose originalUrl");
    invariant(!decodedRequest && !decodeFailure, "quarantined record must not expose decode material");
  } else {
    invariant(originalUrl !== null, "non-quarantined record requires originalUrl");
  }
  let normalized = null;
  if (Object.hasOwn(value, "normalized")) {
    exactKeys(value.normalized, ["invocation", "relation"], [], "record.normalized");
    invariant(value.normalized.relation === "equivalent_state", "record.normalized.relation is unsupported");
    invariant(value.normalized.invocation?.identity?.semantic?.digest === stateDigest, "record.normalized equivalent_state digest mismatch");
    normalized = Object.freeze({ invocation: value.normalized.invocation, relation: value.normalized.relation });
  }
  const expectedClassification = classify({
    credentialBearing: quarantine !== null,
    decodedRequest,
    evidence,
    observations,
  });
  invariant(value.classification === expectedClassification, "record.classification is not evidence-derived");
  return Object.freeze(canonicalValue({
    authority: false,
    classification: value.classification,
    evidence,
    id: value.id,
    observations,
    originalUrlDigest,
    schema: LEGACY_INVOCATION_RECORD_SCHEMA,
    seedDigest,
    sourceRefs,
    title,
    ...(decodeFailure ? { decodeFailure } : {}),
    ...(decodedRequest ? { decodedRequest } : {}),
    ...(normalized ? { normalized } : {}),
    ...(originalUrl ? { originalUrl } : {}),
    ...(quarantine ? { quarantine } : {}),
    ...(stateDigest ? { stateDigest } : {}),
  }));
};

export const verifyLegacyInvocationRecord = async value => {
  const normalized = normalizeRecord(value);
  if (Object.hasOwn(normalized, "originalUrl")) {
    invariant(await hashCanonical(normalized.originalUrl) === normalized.originalUrlDigest, "record.originalUrlDigest mismatch");
    if (normalized.evidence.codec.kind === "supported") {
      const parsed = normalizeUrl(normalized.originalUrl);
      const decode = await decodeSupported({
        evidence: normalized.evidence,
        originalUrl: normalized.originalUrl,
        pathname: parsed.pathname,
      });
      if (decode.request) {
        invariant(Object.hasOwn(normalized, "decodedRequest"), "record.decodedRequest is missing");
        invariant(canonicalJson(decode.request) === canonicalJson(normalized.decodedRequest), "record.decodedRequest mismatch");
      } else {
        invariant(Object.hasOwn(normalized, "decodeFailure"), "record.decodeFailure is missing");
        invariant(canonicalJson(decode.failure) === canonicalJson(normalized.decodeFailure), "record.decodeFailure mismatch");
      }
    }
  }
  if (Object.hasOwn(normalized, "normalized")) {
    const rebuilt = await compileArtifactInvocationReference(normalized.normalized.invocation.identity);
    invariant(canonicalJson(rebuilt) === canonicalJson(normalized.normalized.invocation), "record.normalized invocation is not canonical");
  }
  return normalized;
};

export const importLegacyInvocationSeed = async options => {
  exactKeys(options, ["seed", "seedDigest"], [], "options");
  const { seed, seedDigest } = options;
  digest(seedDigest, "seedDigest");
  exactKeys(seed, ["entries", "schema"], [], "seed");
  invariant(seed.schema === LEGACY_INVOCATION_SEED_SCHEMA, "seed.schema is unsupported");
  invariant(Array.isArray(seed.entries), "seed.entries must be an array");
  invariant(await hashCanonical(seed) === seedDigest, "seed digest mismatch");
  const byId = new Map();
  for (const entry of seed.entries) {
    const record = await normalizeEntry(entry, seedDigest);
    const encoded = canonicalJson(record);
    if (byId.has(record.id)) invariant(byId.get(record.id) === encoded, `conflicting duplicate legacy URL: ${record.id}`);
    else byId.set(record.id, encoded);
  }
  const records = Object.freeze([...byId.values()].map(JSON.parse).sort((left, right) => left.id.localeCompare(right.id)));
  const rows = records.map(canonicalJson).join("\n");
  const meta = Object.freeze({ authority: false, recordCount: records.length, schema: LEGACY_INVOCATION_IMPORT_SCHEMA, seedDigest });
  const jsonl = `${canonicalJson(meta)}\n${rows}${rows ? "\n" : ""}`;
  return Object.freeze({
    authority: false,
    digest: await hashText(jsonl),
    jsonl,
    meta,
    records,
    schema: LEGACY_INVOCATION_IMPORT_SCHEMA,
  });
};
