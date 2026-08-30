import { createHttpArtifactPublisher, normalizeArtifactEndpoint } from '../transport/index.js';

export const HTTP_ARTIFACT_STORE_CONFIG_SCHEMA = 'semantic-map-http-artifact-store/1';
export const EXPLICIT_PUBLISHER_CONFIG_SCHEMA = 'semantic-map-explicit-publisher/1';
export const ARTIFACT_STORE_PORT_SCHEMA = 'semantic-map-artifact-store-port/1';
export const PUBLISHER_PORT_SCHEMA = 'semantic-map-publisher-port/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-publisher: ${message}`);
}

function exactKeys(value, keys, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${name} fields are invalid`);
}

function text(value, name) {
  invariant(typeof value === 'string' && value.trim() === value && value.length > 0, `${name} is required`);
  return value;
}

function publisherPort(input, { endpoint, base, fetchImpl }) {
  if (input == null) return null;
  exactKeys(input, ['schema', 'disclosure'], 'publisher config');
  invariant(input.schema === EXPLICIT_PUBLISHER_CONFIG_SCHEMA, 'publisher config schema is invalid');
  exactKeys(input.disclosure, ['label', 'visibility', 'retention', 'cost'], 'publisher disclosure');
  const disclosure = Object.freeze({
    label: text(input.disclosure.label, 'publisher disclosure label'),
    visibility: text(input.disclosure.visibility, 'publisher visibility'),
    retention: text(input.disclosure.retention, 'publisher retention'),
    cost: text(input.disclosure.cost, 'publisher cost'),
  });
  return Object.freeze({
    schema: PUBLISHER_PORT_SCHEMA,
    kind: 'explicit-http-write',
    disclosure,
    publish: createHttpArtifactPublisher({ base, endpoint, fetchImpl }),
  });
}

function httpBase(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch (_) {
    return null;
  }
}

export function createArtifactStorePort(input = null, options = {}) {
  const baseValue = String(options.base ?? document.baseURI);
  const base = httpBase(baseValue);
  if (input !== null) {
    exactKeys(input, ['schema', 'endpoint', 'publisher'], 'artifact store config');
    invariant(input.schema === HTTP_ARTIFACT_STORE_CONFIG_SCHEMA, 'artifact store config schema is invalid');
    invariant(base, 'configured artifact store requires an absolute HTTP(S) base');
  }
  const endpointValue = text(input?.endpoint ?? '/artifacts', 'artifact store endpoint');
  const endpoint = base
    ? normalizeArtifactEndpoint(endpointValue, { base: base.href })
    : endpointValue;
  const publisher = publisherPort(input?.publisher ?? null, {
    endpoint,
    base: base?.href,
    fetchImpl: options.fetchImpl,
  });
  return Object.freeze({
    schema: ARTIFACT_STORE_PORT_SCHEMA,
    kind: 'http-artifact-store',
    endpoint,
    publisher,
  });
}
