import { validateArtifactReference } from "../../artifact-reference/src/index.mjs";
import { canonicalValue } from "../../url-module/src/index.mjs";

export const ARTIFACT_INVOCATION_SCHEMA = "artifact-invocation/2";
export const ARTIFACT_CAPABILITY_DECLARATION_SCHEMA = "artifact-capability-declaration/2";
export const ARTIFACT_CAPABILITY_MANIFEST_SCHEMA = "artifact-capability-manifest/2";
export const ARTIFACT_CAPABILITY_FIXTURE_SCHEMA = "artifact-capability-fixture/2";
export const ARTIFACT_INVOCATION_RESULT_SCHEMA = "artifact-invocation-result/2";
export const ARTIFACT_INVOCATION_RECEIPT_SCHEMA = "artifact-invocation-receipt/2";
export const ARTIFACT_INVOCATION_RUNTIME_ID = "artifact-invocation-runtime";
export const ARTIFACT_INVOCATION_RUNTIME_VERSION = "2";
export const ARTIFACT_INPUT_SOURCE_KINDS = Object.freeze(["inline", "url", "reference", "file", "directory"]);
export const ARTIFACT_INPUT_SHAPES = Object.freeze(["blob", "directory"]);
export const ARTIFACT_ENGINE_KINDS = Object.freeze(["esm"]);
export const ARTIFACT_RUNTIME_KINDS = Object.freeze(["browser", "node"]);
export const ARTIFACT_RESULT_STATUSES = Object.freeze(["PASS", "FAIL", "UNSUPPORTED", "INCONCLUSIVE"]);
export const ARTIFACT_DIAGNOSTIC_SEVERITIES = Object.freeze(["info", "warning", "error"]);
export const ARTIFACT_FIXTURE_KINDS = Object.freeze(["pass", "destructive"]);
export const MAX_ARTIFACT_INPUTS = 32;
export const MAX_ARTIFACT_OUTPUTS = 64;
export const MAX_ARTIFACT_DIAGNOSTICS = 256;

export const ARTIFACT_INVOCATION_RUNTIME_CONTRACT = Object.freeze({
  capabilityManifestSchema: ARTIFACT_CAPABILITY_MANIFEST_SCHEMA,
  engineKinds: ARTIFACT_ENGINE_KINDS,
  fixtureSchema: ARTIFACT_CAPABILITY_FIXTURE_SCHEMA,
  id: ARTIFACT_INVOCATION_RUNTIME_ID,
  inputShapes: ARTIFACT_INPUT_SHAPES,
  inputSourceKinds: ARTIFACT_INPUT_SOURCE_KINDS,
  invocationSchema: ARTIFACT_INVOCATION_SCHEMA,
  receiptSchema: ARTIFACT_INVOCATION_RECEIPT_SCHEMA,
  resultSchema: ARTIFACT_INVOCATION_RESULT_SCHEMA,
  resultStatuses: ARTIFACT_RESULT_STATUSES,
  runtimes: ARTIFACT_RUNTIME_KINDS,
  version: ARTIFACT_INVOCATION_RUNTIME_VERSION,
});

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-invocation: ${message}`); };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, required, optional, name) => {
  invariant(plain(value), `${name} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};
const text = (value, name, { maximum = 2_000, empty = false } = {}) => {
  invariant(typeof value === "string", `${name} must be a string`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  invariant(value.length <= maximum, `${name} exceeds ${maximum} characters`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${name} contains control characters`);
  return value;
};
export const artifactToken = (value, name = "token") => {
  const result = text(value, name, { maximum: 160 });
  invariant(/^[a-z0-9][a-z0-9._:/-]{0,159}$/u.test(result), `${name} is invalid`);
  return result;
};
const moduleToken = (value, name) => {
  const result = text(value, name, { maximum: 128 });
  invariant(/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(result), `${name} is invalid`);
  return result;
};
const uniqueStringList = (value, name, { allowed = null, minimum = 0, validate = artifactToken } = {}) => {
  invariant(Array.isArray(value) && value.length >= minimum, `${name} must contain at least ${minimum} item(s)`);
  const result = value.map((item, index) => validate(item, `${name}[${index}]`));
  invariant(new Set(result).size === result.length, `${name} contains duplicates`);
  if (allowed) for (const item of result) invariant(allowed.includes(item), `${name} contains unsupported value: ${item}`);
  return Object.freeze(result);
};
const positiveInteger = (value, name, maximum = Number.MAX_SAFE_INTEGER) => {
  invariant(Number.isSafeInteger(value) && value > 0 && value <= maximum, `${name} must be 1..${maximum}`);
  return value;
};
export const validateSha256 = (value, name = "sha256") => {
  const result = text(value, name, { maximum: 71 });
  invariant(/^sha256:[0-9a-f]{64}$/u.test(result), `${name} must be sha256:<64 lowercase hex>`);
  return result;
};
const mediaType = (value, name, { pattern = false } = {}) => {
  const result = text(value, name, { maximum: 128 }).toLowerCase();
  if (pattern && result === "*/*") return result;
  if (pattern && /^[a-z0-9!#$&^_.+-]+\/\*$/u.test(result)) return result;
  invariant(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\+[a-z0-9!#$&^_.+-]+)?$/u.test(result), `${name} is invalid`);
  return result;
};
const schemaPattern = (value, name) => value === "*" ? "*" : artifactToken(value, name);
const normalizeHref = (value, name) => {
  const href = text(value, name, { maximum: 8_192 });
  invariant(href.trim() === href, `${name} has surrounding whitespace`);
  invariant(!href.startsWith("//"), `${name} must not be protocol-relative`);
  const relative = href.startsWith("/") || href.startsWith("./") || href.startsWith("../");
  let parsed;
  try { parsed = new URL(href, relative ? "https://artifact-invocation.invalid/" : undefined); } catch (_) { throw new Error(`artifact-invocation: ${name} is invalid`); }
  invariant(relative || parsed.protocol === "https:", `${name} must be relative or https`);
  invariant(!parsed.username && !parsed.password, `${name} credentials are not allowed`);
  return href;
};
const normalizeSource = (value, name) => {
  exactKeys(value, ["kind"], ["binding", "href", "reference", "value"], name);
  const kind = artifactToken(value.kind, `${name}.kind`);
  invariant(ARTIFACT_INPUT_SOURCE_KINDS.includes(kind), `${name}.kind is unsupported`);
  if (kind === "inline") {
    exactKeys(value, ["kind", "value"], [], name);
    return Object.freeze({ kind, value: canonicalValue(value.value) });
  }
  if (kind === "url") {
    exactKeys(value, ["href", "kind"], [], name);
    return Object.freeze({ href: normalizeHref(value.href, `${name}.href`), kind });
  }
  if (kind === "reference") {
    exactKeys(value, ["kind", "reference"], [], name);
    return Object.freeze({ kind, reference: validateArtifactReference(value.reference) });
  }
  exactKeys(value, ["binding", "kind"], [], name);
  return Object.freeze({ binding: artifactToken(value.binding, `${name}.binding`), kind });
};
export const artifactInputShape = input => input.source.kind === "directory" ? "directory" : "blob";
const normalizeInput = (value, index) => {
  const name = `request.inputs[${index}]`;
  exactKeys(value, ["id", "mediaType", "source"], ["digest", "schema"], name);
  const result = {
    id: artifactToken(value.id, `${name}.id`),
    mediaType: mediaType(value.mediaType, `${name}.mediaType`),
    source: normalizeSource(value.source, `${name}.source`),
  };
  if (Object.hasOwn(value, "schema")) result.schema = artifactToken(value.schema, `${name}.schema`);
  if (Object.hasOwn(value, "digest")) result.digest = validateSha256(value.digest, `${name}.digest`);
  if (result.source.kind === "reference") {
    invariant(result.mediaType === result.source.reference.mediaType, `${name}.mediaType must match reference.mediaType`);
    const digest = `sha256:${result.source.reference.sha256}`;
    if (result.digest) invariant(result.digest === digest, `${name}.digest must match reference.sha256`);
    else result.digest = digest;
  }
  return Object.freeze(result);
};
const normalizeConstraints = value => {
  exactKeys(value, ["allowedRuntimes", "noUpload"], [], "request.constraints");
  invariant(value.noUpload === true, "request.constraints.noUpload must be true");
  return Object.freeze({
    allowedRuntimes: uniqueStringList(value.allowedRuntimes, "request.constraints.allowedRuntimes", { allowed: ARTIFACT_RUNTIME_KINDS, minimum: 1 }),
    noUpload: true,
  });
};
export const validateArtifactInvocation = value => {
  exactKeys(value, ["constraints", "id", "inputs", "intent", "schema"], ["expects"], "request");
  invariant(value.schema === ARTIFACT_INVOCATION_SCHEMA, `request.schema must be ${ARTIFACT_INVOCATION_SCHEMA}`);
  invariant(Array.isArray(value.inputs) && value.inputs.length <= MAX_ARTIFACT_INPUTS, `request.inputs must contain 0..${MAX_ARTIFACT_INPUTS} items`);
  const inputs = Object.freeze(value.inputs.map(normalizeInput));
  invariant(new Set(inputs.map(input => input.id)).size === inputs.length, "request.inputs contains duplicate ids");
  const result = {
    constraints: normalizeConstraints(value.constraints),
    id: artifactToken(value.id, "request.id"),
    inputs,
    intent: artifactToken(value.intent, "request.intent"),
    schema: ARTIFACT_INVOCATION_SCHEMA,
  };
  if (Object.hasOwn(value, "expects")) result.expects = uniqueStringList(value.expects, "request.expects");
  return Object.freeze(result);
};
const normalizeAccepts = value => {
  exactKeys(value, ["intents", "maxInputs", "mediaTypes", "minInputs", "schemas", "shapes"], [], "capability.accepts");
  const minInputs = Number(value.minInputs);
  const maxInputs = Number(value.maxInputs);
  invariant(Number.isSafeInteger(minInputs) && minInputs >= 0 && minInputs <= MAX_ARTIFACT_INPUTS, `capability.accepts.minInputs must be 0..${MAX_ARTIFACT_INPUTS}`);
  invariant(Number.isSafeInteger(maxInputs) && maxInputs >= minInputs && maxInputs <= MAX_ARTIFACT_INPUTS, `capability.accepts.maxInputs must be ${minInputs}..${MAX_ARTIFACT_INPUTS}`);
  return Object.freeze({
    intents: uniqueStringList(value.intents, "capability.accepts.intents", { minimum: 1 }),
    maxInputs,
    mediaTypes: uniqueStringList(value.mediaTypes, "capability.accepts.mediaTypes", { minimum: 1, validate: (item, name) => mediaType(item, name, { pattern: true }) }),
    minInputs,
    schemas: uniqueStringList(value.schemas, "capability.accepts.schemas", { minimum: 1, validate: schemaPattern }),
    shapes: uniqueStringList(value.shapes, "capability.accepts.shapes", { allowed: ARTIFACT_INPUT_SHAPES, minimum: 1 }),
  });
};
const normalizeLimits = value => {
  exactKeys(value, ["maxEngineBytes", "maxEntries", "maxInputBytes", "maxTotalBytes"], [], "capability.limits");
  const maxInputBytes = positiveInteger(value.maxInputBytes, "capability.limits.maxInputBytes", 512 * 1_024 * 1_024);
  const maxTotalBytes = positiveInteger(value.maxTotalBytes, "capability.limits.maxTotalBytes", 2 * 1_024 * 1_024 * 1_024);
  invariant(maxTotalBytes >= maxInputBytes, "capability.limits.maxTotalBytes must be >= maxInputBytes");
  return Object.freeze({
    maxEngineBytes: positiveInteger(value.maxEngineBytes, "capability.limits.maxEngineBytes", 4 * 1_024 * 1_024),
    maxEntries: positiveInteger(value.maxEntries, "capability.limits.maxEntries", 100_000),
    maxInputBytes,
    maxTotalBytes,
  });
};
const normalizeRequires = value => {
  exactKeys(value, ["features", "runtimes", "services"], [], "capability.requires");
  return Object.freeze({
    features: uniqueStringList(value.features, "capability.requires.features"),
    runtimes: uniqueStringList(value.runtimes, "capability.requires.runtimes", { allowed: ARTIFACT_RUNTIME_KINDS, minimum: 1 }),
    services: uniqueStringList(value.services, "capability.requires.services"),
  });
};
const normalizeFixtures = value => {
  exactKeys(value, ["destructive", "pass"], [], "capability.fixtures");
  return Object.freeze({
    destructive: uniqueStringList(value.destructive, "capability.fixtures.destructive", { minimum: 1 }),
    pass: uniqueStringList(value.pass, "capability.fixtures.pass", { minimum: 1 }),
  });
};
const normalizeEngineDeclaration = value => {
  exactKeys(value, ["file", "kind"], [], "capability.engine");
  invariant(value.kind === "esm", "capability.engine.kind must be esm");
  const file = text(value.file, "capability.engine.file", { maximum: 160 });
  invariant(/^[a-z0-9][a-z0-9._-]{0,155}\.mjs$/u.test(file), "capability.engine.file must be a local .mjs file name");
  return Object.freeze({ file, kind: "esm" });
};
const normalizeEngineManifest = value => {
  exactKeys(value, ["bytes", "digest", "href", "kind"], [], "capability.engine");
  invariant(ARTIFACT_ENGINE_KINDS.includes(value.kind), "capability.engine.kind is unsupported");
  return Object.freeze({
    bytes: positiveInteger(value.bytes, "capability.engine.bytes", 4 * 1_024 * 1_024),
    digest: validateSha256(value.digest, "capability.engine.digest"),
    href: normalizeHref(value.href, "capability.engine.href"),
    kind: value.kind,
  });
};
const normalizeCapabilityBase = (value, schema, engineNormalizer) => {
  exactKeys(value, ["accepts", "engine", "fixtures", "id", "limits", "produces", "provides", "requires", "schema", "version"], [], "capability");
  invariant(value.schema === schema, `capability.schema must be ${schema}`);
  return Object.freeze({
    accepts: normalizeAccepts(value.accepts),
    engine: engineNormalizer(value.engine),
    fixtures: normalizeFixtures(value.fixtures),
    id: artifactToken(value.id, "capability.id"),
    limits: normalizeLimits(value.limits),
    produces: uniqueStringList(value.produces, "capability.produces", { minimum: 1 }),
    provides: uniqueStringList(value.provides, "capability.provides", { minimum: 1 }),
    requires: normalizeRequires(value.requires),
    schema,
    version: moduleToken(value.version, "capability.version"),
  });
};
export const validateArtifactCapabilityDeclaration = value => normalizeCapabilityBase(value, ARTIFACT_CAPABILITY_DECLARATION_SCHEMA, normalizeEngineDeclaration);
export const validateArtifactCapabilityManifest = value => normalizeCapabilityBase(value, ARTIFACT_CAPABILITY_MANIFEST_SCHEMA, normalizeEngineManifest);
export const artifactCapabilityKey = value => `${value.id}@${value.version}`;
const normalizeDiagnostic = (value, index, request) => {
  const name = `result.diagnostics[${index}]`;
  exactKeys(value, ["code", "message", "severity"], ["inputId"], name);
  const result = {
    code: artifactToken(value.code, `${name}.code`),
    message: text(value.message, `${name}.message`, { maximum: 8_192 }),
    severity: artifactToken(value.severity, `${name}.severity`),
  };
  invariant(ARTIFACT_DIAGNOSTIC_SEVERITIES.includes(result.severity), `${name}.severity is unsupported`);
  if (Object.hasOwn(value, "inputId")) {
    result.inputId = artifactToken(value.inputId, `${name}.inputId`);
    invariant(request.inputs.some(input => input.id === result.inputId), `${name}.inputId is unknown`);
  }
  return Object.freeze(result);
};
const normalizeOutput = (value, index, manifest) => {
  const name = `result.outputs[${index}]`;
  exactKeys(value, ["contract", "value"], [], name);
  const contract = artifactToken(value.contract, `${name}.contract`);
  invariant(manifest.produces.includes(contract), `${name}.contract is not declared by ${artifactCapabilityKey(manifest)}`);
  return Object.freeze({ contract, value: canonicalValue(value.value) });
};
export const validateArtifactCapabilityResult = (value, { manifest, request }) => {
  exactKeys(value, ["diagnostics", "outputs", "status"], [], "result");
  const status = text(value.status, "result.status", { maximum: 16 });
  invariant(ARTIFACT_RESULT_STATUSES.includes(status), "result.status is unsupported");
  invariant(status !== "UNSUPPORTED", "selected capability must not return UNSUPPORTED");
  invariant(Array.isArray(value.outputs) && value.outputs.length <= MAX_ARTIFACT_OUTPUTS, `result.outputs exceeds ${MAX_ARTIFACT_OUTPUTS}`);
  invariant(Array.isArray(value.diagnostics) && value.diagnostics.length <= MAX_ARTIFACT_DIAGNOSTICS, `result.diagnostics exceeds ${MAX_ARTIFACT_DIAGNOSTICS}`);
  const outputs = Object.freeze(value.outputs.map((output, index) => normalizeOutput(output, index, manifest)));
  const diagnostics = Object.freeze(value.diagnostics.map((diagnostic, index) => normalizeDiagnostic(diagnostic, index, request)));
  if (status === "PASS") invariant(!diagnostics.some(item => item.severity === "error"), "PASS result must not contain error diagnostics");
  return Object.freeze({ diagnostics, outputs, status });
};
export const validateArtifactCapabilityImplementation = (value, manifestInput) => {
  const manifest = validateArtifactCapabilityManifest(manifestInput);
  exactKeys(value, ["id", "run", "version"], [], "implementation");
  invariant(value.id === manifest.id, "implementation.id does not match manifest");
  invariant(value.version === manifest.version, "implementation.version does not match manifest");
  invariant(typeof value.run === "function", "implementation.run must be a function");
  return Object.freeze({ id: value.id, run: value.run, version: value.version });
};
export const validateArtifactRuntimeEnvironment = value => {
  exactKeys(value, ["features", "runtime"], [], "environment");
  invariant(ARTIFACT_RUNTIME_KINDS.includes(value.runtime), "environment.runtime is unsupported");
  return Object.freeze({ features: uniqueStringList(value.features, "environment.features"), runtime: value.runtime });
};
export const validateArtifactCapabilityFixture = value => {
  exactKeys(value, ["expected", "id", "kind", "request", "runtimes", "schema"], [], "fixture");
  invariant(value.schema === ARTIFACT_CAPABILITY_FIXTURE_SCHEMA, `fixture.schema must be ${ARTIFACT_CAPABILITY_FIXTURE_SCHEMA}`);
  const kind = artifactToken(value.kind, "fixture.kind");
  invariant(ARTIFACT_FIXTURE_KINDS.includes(kind), "fixture.kind is unsupported");
  exactKeys(value.expected, ["outputContracts", "status"], [], "fixture.expected");
  const status = text(value.expected.status, "fixture.expected.status", { maximum: 16 }).toUpperCase();
  invariant(ARTIFACT_RESULT_STATUSES.includes(status), "fixture.expected.status is unsupported");
  if (kind === "pass") invariant(status === "PASS", "pass fixture must expect PASS");
  else invariant(status !== "PASS", "destructive fixture must not expect PASS");
  return Object.freeze({
    expected: Object.freeze({ outputContracts: uniqueStringList(value.expected.outputContracts, "fixture.expected.outputContracts"), status }),
    id: artifactToken(value.id, "fixture.id"),
    kind,
    request: validateArtifactInvocation(value.request),
    runtimes: uniqueStringList(value.runtimes, "fixture.runtimes", { allowed: ARTIFACT_RUNTIME_KINDS, minimum: 1 }),
    schema: ARTIFACT_CAPABILITY_FIXTURE_SCHEMA,
  });
};
