export const ARTIFACT_REFERENCE_SCHEMA = "artifact-reference/1";
export const MAX_ARTIFACT_REFERENCE_BYTES = 8 * 1_024 * 1_024;

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-reference: ${message}`); };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, required, optional, name) => {
  invariant(plain(value), `${name} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};
const nonEmpty = (value, name) => {
  invariant(typeof value === "string" && value.trim().length > 0, `${name} must be a non-empty string`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${name} contains control characters`);
  return value;
};
const validateHref = value => {
  const href = nonEmpty(value, "reference.href");
  invariant(!href.includes("\\"), "reference.href backslashes are not allowed");
  invariant(!href.startsWith("//"), "reference.href scheme-relative URLs are not allowed");
  const relative = href.startsWith("/") || href.startsWith("./") || href.startsWith("../");
  let parsed;
  try { parsed = new URL(href, relative ? "https://artifact-reference.invalid/" : undefined); } catch (_) { throw new Error("artifact-reference: reference.href is invalid"); }
  invariant(relative || parsed.protocol === "https:", "reference.href must be relative or https");
  invariant(!parsed.username && !parsed.password, "reference.href credentials are not allowed");
  return href;
};

export const validateArtifactReference = value => {
  exactKeys(value, ["bytes", "href", "mediaType", "schema", "sha256"], [], "reference");
  invariant(value.schema === ARTIFACT_REFERENCE_SCHEMA, `reference.schema must be ${ARTIFACT_REFERENCE_SCHEMA}`);
  invariant(Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= MAX_ARTIFACT_REFERENCE_BYTES, `reference.bytes must be 1..${MAX_ARTIFACT_REFERENCE_BYTES}`);
  const sha256 = nonEmpty(value.sha256, "reference.sha256");
  invariant(/^[0-9a-f]{64}$/u.test(sha256), "reference.sha256 must be 64 lowercase hex characters");
  const mediaType = nonEmpty(value.mediaType, "reference.mediaType").toLowerCase();
  invariant(mediaType === "application/json", "reference.mediaType must be application/json");
  return Object.freeze({
    bytes: value.bytes,
    href: validateHref(value.href),
    mediaType,
    schema: ARTIFACT_REFERENCE_SCHEMA,
    sha256,
  });
};

export const artifactReferenceInvariant = invariant;
