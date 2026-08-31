import { validateArtifactInvocation, validateSha256, verifyArtifactInvocationReference } from "../../../packages/artifact-invocation/src/index.mjs";
import { canonicalJson, sha256Hex } from "../../../packages/url-module/src/index.mjs";

export const ARTIFACT_INVOCATION_INDEX_SCHEMA = "artifact-invocation-index/1";
export const ARTIFACT_INVOCATION_INDEX_ROW_SCHEMA = "artifact-invocation-index-row/1";
export const ARTIFACT_INVOCATION_INDEX_SOURCE_SCHEMA = "artifact-invocation-index-source/1";
export const ARTIFACT_INVOCATION_INDEX_OBSERVATION_SCHEMA = "artifact-invocation-index-observation/1";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-invocation-index: ${message}`); };
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
const token = (value, name) => {
  const result = text(value, name, 160);
  invariant(/^[a-z0-9][a-z0-9._:/-]*$/u.test(result), `${name} is invalid`);
  return result;
};
const digest = (value, name) => validateSha256(value, name);
const hashText = async value => `sha256:${await sha256Hex(value)}`;
const canonicalLine = value => canonicalJson(value);

const normalizeTimestamp = (value, name) => {
  text(value, name, 64);
  const date = new Date(value);
  invariant(Number.isFinite(date.getTime()), `${name} is invalid`);
  return date.toISOString();
};
const normalizeObservation = (value, invocationId, index) => {
  const name = `source.observations[${index}]`;
  exactKeys(value, ["invocationId", "observedAt", "proofRef", "result", "schema"], [], name);
  invariant(value.schema === ARTIFACT_INVOCATION_INDEX_OBSERVATION_SCHEMA, `${name}.schema is unsupported`);
  invariant(value.invocationId === invocationId, `${name} observation invocation mismatch`);
  invariant(value.result === "PASS" || value.result === "FAIL", `${name}.result is invalid`);
  return Object.freeze({
    invocationId,
    observedAt: normalizeTimestamp(value.observedAt, `${name}.observedAt`),
    proofRef: text(value.proofRef, `${name}.proofRef`, 1_024),
    result: value.result,
    schema: ARTIFACT_INVOCATION_INDEX_OBSERVATION_SCHEMA,
  });
};
const normalizeObservations = (values, invocationId) => {
  invariant(Array.isArray(values), "source.observations must be an array");
  const byIdentity = new Map();
  for (const [index, value] of values.entries()) {
    const observation = normalizeObservation(value, invocationId, index);
    const identity = `${observation.observedAt}\u0000${observation.proofRef}`;
    const encoded = canonicalLine(observation);
    if (byIdentity.has(identity)) invariant(byIdentity.get(identity) === encoded, "conflicting duplicate observation");
    else byIdentity.set(identity, encoded);
  }
  return Object.freeze([...byIdentity.values()].map(JSON.parse).sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt)
    || left.proofRef.localeCompare(right.proofRef)
    || left.result.localeCompare(right.result)));
};
const normalizeRelease = value => {
  exactKeys(value, ["digest", "id", "ref"], [], "source.release");
  return Object.freeze({
    digest: digest(value.digest, "source.release.digest"),
    id: token(value.id, "source.release.id"),
    ref: text(value.ref, "source.release.ref", 1_024),
  });
};
const normalizeSourceRefs = values => {
  invariant(Array.isArray(values) && values.length > 0, "source.sourceRefs must contain at least one reference");
  const refs = values.map((value, index) => text(value, `source.sourceRefs[${index}]`, 1_024));
  invariant(new Set(refs).size === refs.length, "source.sourceRefs contains duplicates");
  return Object.freeze([...refs].sort());
};
const statusFrom = observations => observations.length === 0
  ? "unobserved"
  : observations.at(-1).result === "PASS" ? "verified" : "failed";

const sourceToRow = async value => {
  exactKeys(value, ["invocation", "observations", "release", "schema", "sourceRefs", "title"], [], "source");
  invariant(value.schema === ARTIFACT_INVOCATION_INDEX_SOURCE_SCHEMA, "source.schema is unsupported");
  const invocation = await verifyArtifactInvocationReference(value.invocation);
  const observations = normalizeObservations(value.observations, invocation.invocationId);
  return Object.freeze({
    authority: false,
    id: invocation.invocationId,
    invocation,
    invocationId: invocation.invocationId,
    observations,
    reference: invocation.reference,
    release: normalizeRelease(value.release),
    schema: ARTIFACT_INVOCATION_INDEX_ROW_SCHEMA,
    sourceRefs: normalizeSourceRefs(value.sourceRefs),
    status: statusFrom(observations),
    title: text(value.title, "source.title", 512),
  });
};

const encodeRows = rows => rows.length === 0 ? "" : `${rows.map(canonicalLine).join("\n")}\n`;
const buildFromRows = async rows => {
  const rowBytes = encodeRows(rows);
  const meta = Object.freeze({
    authority: false,
    entriesDigest: await hashText(rowBytes),
    rowCount: rows.length,
    schema: ARTIFACT_INVOCATION_INDEX_SCHEMA,
  });
  const jsonl = `${canonicalLine(meta)}\n${rowBytes}`;
  return Object.freeze({
    authority: false,
    digest: await hashText(jsonl),
    jsonl,
    meta,
    rows: Object.freeze(rows),
    schema: ARTIFACT_INVOCATION_INDEX_SCHEMA,
  });
};

export const buildArtifactInvocationIndex = async ({ sources }) => {
  invariant(Array.isArray(sources), "sources must be an array");
  const byId = new Map();
  for (const value of sources) {
    const row = await sourceToRow(value);
    const encoded = canonicalLine(row);
    if (byId.has(row.id)) invariant(byId.get(row.id) === encoded, `conflicting duplicate invocation: ${row.id}`);
    else byId.set(row.id, encoded);
  }
  const rows = [...byId.values()].map(JSON.parse).sort((left, right) => left.id.localeCompare(right.id));
  return buildFromRows(rows);
};

const rowToSource = row => {
  exactKeys(row, ["authority", "id", "invocation", "invocationId", "observations", "reference", "release", "schema", "sourceRefs", "status", "title"], [], "row");
  invariant(row.authority === false, "row.authority must be false");
  invariant(row.schema === ARTIFACT_INVOCATION_INDEX_ROW_SCHEMA, "row.schema is unsupported");
  invariant(row.id === row.invocationId, "row identity mismatch");
  invariant(row.reference === row.invocation?.reference, "row reference mismatch");
  invariant(row.status === "verified" || row.status === "failed" || row.status === "unobserved", "row.status is invalid");
  return Object.freeze({
    invocation: row.invocation,
    observations: row.observations,
    release: row.release,
    schema: ARTIFACT_INVOCATION_INDEX_SOURCE_SCHEMA,
    sourceRefs: row.sourceRefs,
    title: row.title,
  });
};

export const parseArtifactInvocationIndex = async jsonl => {
  invariant(typeof jsonl === "string" && jsonl.endsWith("\n") && !jsonl.includes("\r"), "jsonl must be canonical newline-terminated text");
  const lines = jsonl.slice(0, -1).split("\n");
  invariant(lines.length >= 1 && lines.every(line => line.length > 0), "jsonl contains an empty record");
  let values;
  try { values = lines.map(line => JSON.parse(line)); }
  catch (error) { throw new Error(`artifact-invocation-index: jsonl parse failed: ${error.message}`); }
  const [meta, ...rows] = values;
  exactKeys(meta, ["authority", "entriesDigest", "rowCount", "schema"], [], "meta");
  invariant(meta.authority === false, "meta.authority must be false");
  invariant(meta.schema === ARTIFACT_INVOCATION_INDEX_SCHEMA, "meta.schema is unsupported");
  digest(meta.entriesDigest, "meta.entriesDigest");
  invariant(Number.isSafeInteger(meta.rowCount) && meta.rowCount === rows.length, "meta.rowCount mismatch");
  const rebuilt = await buildArtifactInvocationIndex({ sources: rows.map(rowToSource) });
  invariant(rebuilt.jsonl === jsonl, "jsonl is not the canonical reconstructable index");
  return rebuilt;
};

const componentId = (index, suffix) => `invocation-${index}-${suffix}`;
export const createArtifactInvocationIndexApp = index => {
  invariant(index?.schema === ARTIFACT_INVOCATION_INDEX_SCHEMA && Array.isArray(index.rows), "index is invalid");
  const components = [
    Object.freeze({ children: ["catalog-title", "catalog-authority", "catalog-summary", ...index.rows.map((_, item) => componentId(item, "card"))], component: "Column", gap: 12, id: "root" }),
    Object.freeze({ component: "Text", id: "catalog-title", text: "Version-fixed invocation index", variant: "h1" }),
    Object.freeze({ component: "Text", id: "catalog-authority", text: "authority=false", variant: "caption" }),
    Object.freeze({ component: "Text", id: "catalog-summary", text: `${index.rows.length} invocation${index.rows.length === 1 ? "" : "s"}` }),
  ];
  for (const [item, row] of index.rows.entries()) {
    const titleId = componentId(item, "title");
    const statusId = componentId(item, "status");
    const sourceId = componentId(item, "source");
    const referenceId = componentId(item, "reference");
    const openId = componentId(item, "open");
    components.push(
      Object.freeze({ children: [titleId, statusId, sourceId, referenceId, openId], component: "Card", id: componentId(item, "card") }),
      Object.freeze({ component: "Text", id: titleId, text: row.title, variant: "h2" }),
      Object.freeze({ component: "Text", id: statusId, text: `status=${row.status}` }),
      Object.freeze({ component: "Text", id: sourceId, text: `sources=${row.sourceRefs.join(",")}` }),
      Object.freeze({ component: "Text", id: referenceId, text: row.reference, variant: "caption" }),
      Object.freeze({
        action: "artifact.invocation.open",
        component: "Button",
        context: Object.freeze({ history: "push", reference: row.reference, schema: "artifact-invocation-open-action/1" }),
        id: openId,
        label: "Open exact version",
      }),
    );
  }
  return Object.freeze({
    schema: "a2ui-app/1",
    state: Object.freeze({ authority: false, indexDigest: index.digest, rowCount: index.rows.length }),
    surface: Object.freeze({ components: Object.freeze(components), rootId: "root", surfaceId: "artifact-invocation-index" }),
  });
};

export const createArtifactInvocationIndexRequest = ({ id, index }) => validateArtifactInvocation({
  constraints: Object.freeze({ allowedRuntimes: Object.freeze(["browser"]), noUpload: true }),
  expects: Object.freeze(["a2ui-app-render-receipt/1"]),
  id: token(id, "id"),
  inputs: Object.freeze([Object.freeze({
    id: "app",
    mediaType: "application/vnd.roccho.a2ui-app+json",
    schema: "a2ui-app/1",
    source: Object.freeze({ kind: "inline", value: createArtifactInvocationIndexApp(index) }),
  })]),
  intent: "interact",
  schema: "artifact-invocation/2",
});
