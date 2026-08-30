import { SHA256_PATTERN, canonicalJson, inspectEnvelope, sha256 } from '../protocol/index.js';
import {
  MAX_ENVELOPE_BYTES,
  MAX_URL_CHARS,
  SMAP_FRAGMENT,
  assertUrlWithinLimit,
  canonicalBaseUrl,
  decodeEnvelopeToken,
  encodeEnvelopePayload,
} from './smap-codec.js';

export const SMAP_REFERENCE_FRAGMENT = 'smap-ref';
export const PUBLISH_REQUEST_SCHEMA = 'semantic-map-artifact-publish-request/1';
export const PUBLISH_RECEIPT_SCHEMA = 'semantic-map-artifact-store-receipt/1';
export const PUBLISH_RESULT_SCHEMA = 'semantic-map-artifact-publish-result/1';
export const DELIVERY_INSPECTION_SCHEMA = 'semantic-map-delivery-inspection/1';
export const DELIVERY_PLAN_SCHEMA = 'semantic-map-delivery-plan/1';
export const MAX_PUBLISH_RECEIPT_BYTES = 64 * 1_024;

const SECRET_KEY = /(?:^|[_-])(access|api|auth|credential|jwt|key|password|secret|signature|token)(?:$|[_-])/iu;

function currentLocationHref() {
  return typeof location !== 'undefined' && typeof location.href === 'string'
    ? location.href
    : 'https://semantic-map.invalid/app';
}

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-delivery: ${message}`);
}

function contentLength(response, subject) {
  const value = response?.headers?.get?.('content-length');
  if (value === null || value === undefined) return null;
  invariant(/^\d+$/u.test(value), `${subject} Content-Length is invalid`);
  const length = Number(value);
  invariant(Number.isSafeInteger(length), `${subject} Content-Length is invalid`);
  return length;
}

function applicationJsonMediaType(response, subject) {
  const mediaType = response?.headers?.get?.('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  invariant(
    mediaType === 'application/json' || (mediaType.startsWith('application/') && mediaType.endsWith('+json')),
    `${subject} Content-Type must be application JSON`,
  );
  return mediaType;
}

async function readBoundedJson(response, maximum, subject) {
  const declared = contentLength(response, subject);
  invariant(declared === null || declared <= maximum, `${subject} exceeds ${maximum} bytes`);

  let bytes;
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        invariant(value instanceof Uint8Array, `${subject} body is invalid`);
        total += value.byteLength;
        if (total > maximum) {
          try { await reader.cancel(); } catch (_) { /* best effort cancellation */ }
          invariant(false, `${subject} exceeds ${maximum} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    invariant(declared !== null, `${subject} requires a readable stream or Content-Length`);
    const text = await response.text();
    bytes = new TextEncoder().encode(text);
    invariant(bytes.byteLength <= maximum, `${subject} exceeds ${maximum} bytes`);
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (_) {
    throw new Error(`semantic-delivery: ${subject} is not valid UTF-8 JSON`);
  }
}

function diagnostic(severity, code, message, path = null, scope = 'all') {
  return Object.freeze({ severity, code, message, path, scope });
}

function blocks(diagnostics, lane) {
  return diagnostics.some((item) => item.severity === 'error' && (
    item.scope === 'all'
    || item.scope === lane
    || (item.scope === 'share' && (lane === 'inline' || lane === 'publish'))
  ));
}

function result(value) {
  const canRender = !blocks(value.diagnostics, 'render');
  const canInline = canRender && !blocks(value.diagnostics, 'inline');
  const canPublish = canRender && !blocks(value.diagnostics, 'publish');
  return Object.freeze({
    ...value,
    status: canRender ? 'ready' : 'blocked',
    canRender,
    canInline,
    canPublish,
    lanes: Object.freeze({
      inline: Object.freeze({ status: canInline ? 'ready' : 'blocked' }),
      publish: Object.freeze({ status: canPublish ? 'ready' : 'blocked' }),
    }),
    diagnostics: Object.freeze([...value.diagnostics]),
  });
}

function urlFrom(value, base, name) {
  try {
    return new URL(String(value), base);
  } catch (_) {
    throw new Error(`semantic-delivery: ${name} is not a valid URL`);
  }
}

function inspectSecretKeys(url, path, diagnostics) {
  for (const key of url.searchParams.keys()) {
    if (!SECRET_KEY.test(key)) continue;
    diagnostics.push(diagnostic(
      'error',
      'POSSIBLE_SECRET_IN_URL',
      `URL query field “${key}” looks secret and must not be placed in a shared artifact.`,
      path,
      'share',
    ));
  }
}

function inspectEnvelopeUrls(envelope, base, diagnostics) {
  let externalResources = 0;
  for (const resource of envelope.view.resourceComposition?.resources ?? []) {
    const path = `view.resourceComposition.resources.${resource.id}.source.href`;
    const url = urlFrom(resource.source.href, base, path);
    inspectSecretKeys(url, path, diagnostics);
    if (url.origin === base.origin) continue;
    externalResources += 1;
    diagnostics.push(diagnostic('info', 'EXTERNAL_RESOURCE', `External resource: ${url.origin}`, path));
    diagnostics.push(diagnostic(
      'warning',
      'MUTABLE_EXTERNAL_RESOURCE',
      'External content can change or disappear because this contract has no enforced snapshot digest.',
      path,
    ));
  }
  for (const placement of envelope.view.resourceComposition?.placements ?? []) {
    if (!placement.action) continue;
    const path = `view.resourceComposition.placements.${placement.id}.action.href`;
    inspectSecretKeys(urlFrom(placement.action.href, base, path), path, diagnostics);
  }
  return externalResources;
}

function inlineUrl(token, base) {
  const url = canonicalBaseUrl(base);
  url.hash = `${SMAP_FRAGMENT}=${token}`;
  return url.href;
}

export async function envelopeDigest(input) {
  const inspection = await inspectEnvelope(input);
  return sha256(canonicalJson(inspection.envelope));
}

export async function inspectSmapDelivery(input, options = {}) {
  const diagnostics = [];
  const maximum = options.maxUrlChars ?? MAX_URL_CHARS;
  invariant(Number.isSafeInteger(maximum) && maximum > 0, 'maxUrlChars must be a positive safe integer');

  let payload;
  try {
    payload = await encodeEnvelopePayload(input);
  } catch (error) {
    diagnostics.push(diagnostic('error', 'INVALID_ENVELOPE', error.message));
    return result({
      schema: DELIVERY_INSPECTION_SCHEMA,
      envelope: null,
      digest: null,
      inlineUrl: null,
      canonicalBytes: 0,
      compressedBytes: 0,
      urlChars: 0,
      maxUrlChars: maximum,
      budgetRatio: 0,
      externalResources: 0,
      diagnostics,
    });
  }

  const base = canonicalBaseUrl(options.base ?? currentLocationHref());
  const resourceBase = httpBase(base)
    ?? (typeof document !== 'undefined' ? httpBase(document.baseURI) : null)
    ?? canonicalBaseUrl('https://semantic-map.invalid/app');
  const externalResources = inspectEnvelopeUrls(payload.inspection.envelope, resourceBase, diagnostics);
  const url = inlineUrl(payload.token, base);
  const budgetRatio = url.length / maximum;
  if (url.length > maximum) {
    diagnostics.push(diagnostic(
      'error',
      'INLINE_URL_TOO_LARGE',
      `Inline URL is ${url.length} characters; the limit is ${maximum}. Publish is a separate explicit action.`,
      null,
      'inline',
    ));
  } else if (budgetRatio >= 0.8) {
    diagnostics.push(diagnostic(
      'warning',
      'INLINE_URL_NEAR_LIMIT',
      `Inline URL uses ${Math.round(budgetRatio * 100)}% of the allowed budget.`,
      null,
      'inline',
    ));
  }

  return result({
    schema: DELIVERY_INSPECTION_SCHEMA,
    envelope: payload.inspection.envelope,
    digest: await sha256(canonicalJson(payload.inspection.envelope)),
    inlineUrl: url,
    canonicalBytes: payload.canonicalBytes,
    compressedBytes: payload.compressedBytes,
    urlChars: url.length,
    maxUrlChars: maximum,
    budgetRatio,
    externalResources,
    diagnostics,
  });
}

export async function createInlineSmapUrl(input, options = {}) {
  const inspection = await inspectSmapDelivery(input, options);
  if (!inspection.canInline) {
    const codes = inspection.diagnostics
      .filter((item) => item.severity === 'error' && ['all', 'share', 'inline'].includes(item.scope))
      .map((item) => item.code);
    throw new Error(`semantic-delivery: inline URL blocked (${codes.join(', ') || 'UNKNOWN'})`);
  }
  return inspection.inlineUrl;
}

function blockingCodes(inspection, lanes) {
  return inspection.diagnostics
    .filter((item) => item.severity === 'error' && lanes.includes(item.scope))
    .map((item) => item.code);
}

export async function planSmapDelivery(input, options = {}) {
  const inspection = await inspectSmapDelivery(input, options);
  const knownReferences = new Set(Array.from(options.knownReferences ?? [], String));
  const publisherAvailable = options.publisherAvailable === true;

  if (!inspection.canRender) {
    const codes = blockingCodes(inspection, ['all', 'render']);
    return Object.freeze({
      schema: DELIVERY_PLAN_SCHEMA,
      status: 'blocked',
      code: codes[0] ?? 'RENDER_BLOCKED',
      mode: null,
      url: null,
      artifactUrl: null,
      digest: inspection.digest,
      available: false,
      stored: false,
      requiresPublish: false,
      inspection,
    });
  }

  if (inspection.canInline) {
    return Object.freeze({
      schema: DELIVERY_PLAN_SCHEMA,
      status: 'ready',
      code: null,
      mode: 'inline',
      url: inspection.inlineUrl,
      artifactUrl: null,
      digest: inspection.digest,
      available: true,
      stored: false,
      requiresPublish: false,
      inspection,
    });
  }

  if (!inspection.canPublish) {
    const codes = blockingCodes(inspection, ['all', 'share', 'publish']);
    return Object.freeze({
      schema: DELIVERY_PLAN_SCHEMA,
      status: 'blocked',
      code: codes[0] ?? 'PUBLISH_BLOCKED',
      mode: null,
      url: null,
      artifactUrl: null,
      digest: inspection.digest,
      available: false,
      stored: false,
      requiresPublish: false,
      inspection,
    });
  }

  const base = options.base ?? currentLocationHref();
  const url = createSmapReferenceUrl(inspection.digest, base);
  const artifactUrl = artifactUrlForDigest(inspection.digest, {
    base,
    endpoint: options.endpoint,
  });
  if (knownReferences.has(artifactUrl)) {
    return Object.freeze({
      schema: DELIVERY_PLAN_SCHEMA,
      status: 'ready',
      code: null,
      mode: 'reference',
      url,
      artifactUrl,
      digest: inspection.digest,
      available: true,
      stored: true,
      requiresPublish: false,
      inspection,
    });
  }

  return Object.freeze({
    schema: DELIVERY_PLAN_SCHEMA,
    status: publisherAvailable ? 'publish-required' : 'publisher-required',
    code: publisherAvailable ? 'PUBLISH_CONFIRMATION_REQUIRED' : 'PUBLISHER_REQUIRED',
    mode: 'reference',
    url,
    artifactUrl,
    digest: inspection.digest,
    available: false,
    stored: false,
    requiresPublish: true,
    inspection,
  });
}

export function createSmapReferenceUrl(digest, base) {
  invariant(SHA256_PATTERN.test(String(digest)), 'reference digest is invalid');
  const url = requiredHttpBase(base, 'reference base');
  url.hash = `${SMAP_REFERENCE_FRAGMENT}=${encodeURIComponent(String(digest))}`;
  return assertUrlWithinLimit(url.href);
}

function fragmentFromInput(input) {
  const value = String(input ?? '');
  if (!value) return '';
  if (value.startsWith('#')) {
    assertUrlWithinLimit(value);
    return value.slice(1);
  }
  let url;
  try {
    const relative = value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
    url = relative ? new URL(value, 'https://semantic-map.invalid/') : new URL(value);
  } catch (_) {
    throw new Error('semantic-delivery: invalid URL');
  }
  assertUrlWithinLimit(url.href);
  return url.hash.slice(1);
}

export function readSmapInvocation(input = currentLocationHref()) {
  const fragment = fragmentFromInput(input);
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const keys = [...new Set(params.keys())];
  invariant(keys.length === 1 && params.getAll(keys[0]).length === 1, 'exactly one fragment field is required');
  const key = keys[0];
  const value = params.get(key) ?? '';
  if (key === SMAP_FRAGMENT) {
    invariant(value.length > 0, 'inline token is required');
    return Object.freeze({ mode: 'inline', token: value });
  }
  if (key === SMAP_REFERENCE_FRAGMENT) {
    invariant(SHA256_PATTERN.test(value), 'reference digest is invalid');
    return Object.freeze({ mode: 'reference', digest: value });
  }
  throw new Error(`semantic-delivery: unsupported fragment ${key}`);
}

function httpBase(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return canonicalBaseUrl(url);
  } catch (_) {
    return null;
  }
}

function currentHttpBase() {
  const locationBase = typeof location !== 'undefined' ? httpBase(location.href) : null;
  if (locationBase) return locationBase;
  return typeof document !== 'undefined' ? httpBase(document.baseURI) : null;
}

function requiredHttpBase(value, name) {
  const base = value === undefined || value === null ? currentHttpBase() : httpBase(value);
  invariant(base, `${name} requires an absolute HTTP(S) URL or current HTTP(S) document`);
  return base;
}

function endpointUrl(value, base, name) {
  let endpoint;
  try {
    endpoint = new URL(String(value), base);
  } catch (_) {
    throw new Error(`semantic-delivery: ${name} is not a valid URL`);
  }
  invariant(endpoint.protocol === 'http:' || endpoint.protocol === 'https:', `${name} must use http or https`);
  invariant(!endpoint.username && !endpoint.password, `${name} must not contain userinfo`);
  invariant(!endpoint.search, `${name} must not contain a query`);
  invariant(!endpoint.hash, `${name} must not contain a fragment`);
  endpoint.pathname = endpoint.pathname.replace(/\/$/u, '');
  return endpoint;
}

export function normalizeArtifactEndpoint(value, options = {}) {
  const base = baseForResolution(options.input, options);
  return endpointUrl(value, base, 'artifact endpoint').href;
}

function baseForResolution(input, options) {
  if (Object.hasOwn(options, 'base')) return requiredHttpBase(options.base, 'reference base');
  const value = String(input ?? '');
  const inputBase = value && !value.startsWith('#') ? httpBase(value) : null;
  if (inputBase) return inputBase;
  return requiredHttpBase(undefined, 'reference base');
}

export function artifactUrlForDigest(digest, options = {}) {
  invariant(SHA256_PATTERN.test(String(digest)), 'artifact digest is invalid');
  const base = baseForResolution(options.input, options);
  if (options.endpoint) {
    const endpoint = endpointUrl(options.endpoint, base, 'artifact endpoint');
    endpoint.pathname = `${endpoint.pathname}/${encodeURIComponent(String(digest))}`;
    return endpoint.href;
  }
  return new URL(`/artifacts/${encodeURIComponent(String(digest))}`, base).href;
}

export async function resolveSmapInvocation(input = currentLocationHref(), options = {}) {
  const invocation = readSmapInvocation(input);
  if (!invocation) return null;
  if (invocation.mode === 'inline') return decodeEnvelopeToken(invocation.token);

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  invariant(typeof fetchImpl === 'function', 'fetch implementation is required for a reference');
  const artifactUrl = artifactUrlForDigest(invocation.digest, { ...options, input });
  const response = await fetchImpl(artifactUrl, {
    method: 'GET',
    headers: { accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  invariant(response && response.ok, `artifact GET failed: ${response?.status ?? 'NO_RESPONSE'}`);
  applicationJsonMediaType(response, 'artifact response');
  const inspection = await inspectEnvelope(await readBoundedJson(
    response,
    MAX_ENVELOPE_BYTES,
    'artifact response',
  ));
  const actual = await sha256(canonicalJson(inspection.envelope));
  invariant(actual === invocation.digest, 'artifact digest mismatch');
  return Object.freeze({
    ...inspection,
    delivery: Object.freeze({ mode: 'reference', digest: invocation.digest, artifactUrl }),
  });
}

export async function publishSmapReference(input, options = {}) {
  const publisher = options.publisher;
  invariant(typeof publisher === 'function', 'publisher is required and must be called explicitly');
  const inspection = await inspectSmapDelivery(input, options);
  if (!inspection.canPublish) {
    const codes = inspection.diagnostics
      .filter((item) => item.severity === 'error' && ['all', 'share', 'publish'].includes(item.scope))
      .map((item) => item.code);
    throw new Error(`semantic-delivery: publish blocked (${codes.join(', ') || 'UNKNOWN'})`);
  }
  const canonical = canonicalJson(inspection.envelope);
  const request = Object.freeze({
    schema: PUBLISH_REQUEST_SCHEMA,
    digest: inspection.digest,
    bytes: new TextEncoder().encode(canonical).byteLength,
    contentType: 'application/vnd.roccho.semantic-map-envelope+json',
    canonicalJson: canonical,
    envelope: inspection.envelope,
  });
  const receipt = await publisher(request);
  invariant(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'publisher returned no receipt');
  invariant(receipt.schema === PUBLISH_RECEIPT_SCHEMA, 'publisher receipt schema is invalid');
  invariant(receipt.digest === inspection.digest, 'publisher receipt digest mismatch');
  invariant(receipt.stored === true, 'publisher did not confirm storage');
  const base = options.base ?? currentLocationHref();
  const artifactUrl = artifactUrlForDigest(inspection.digest, {
    base,
    endpoint: options.endpoint,
  });
  invariant(typeof receipt.location === 'string' && receipt.location.length > 0, 'publisher receipt location is required');
  invariant(new URL(receipt.location, artifactUrl).href === artifactUrl, 'publisher receipt location mismatch');
  return Object.freeze({
    schema: PUBLISH_RESULT_SCHEMA,
    mode: 'reference',
    digest: inspection.digest,
    url: createSmapReferenceUrl(inspection.digest, base),
    artifactUrl,
    receipt: Object.freeze({ ...receipt, location: artifactUrl }),
  });
}

export function createHttpArtifactPublisher(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  invariant(typeof fetchImpl === 'function', 'fetch implementation is required');
  const base = requiredHttpBase(options.base, 'publisher base');
  const endpoint = endpointUrl(options.endpoint ?? '/artifacts', base, 'publisher endpoint').href;
  return async (request) => {
    invariant(request?.schema === PUBLISH_REQUEST_SCHEMA, 'publish request schema is invalid');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': request.contentType,
      },
      body: request.canonicalJson,
      credentials: 'same-origin',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    invariant(response && response.ok, `artifact POST failed: ${response?.status ?? 'NO_RESPONSE'}`);
    applicationJsonMediaType(response, 'publisher receipt');
    const body = await readBoundedJson(response, MAX_PUBLISH_RECEIPT_BYTES, 'publisher receipt');
    invariant(body && typeof body === 'object' && !Array.isArray(body), 'publisher receipt must be an object');
    invariant(body.schema === PUBLISH_RECEIPT_SCHEMA, 'artifact POST receipt schema is invalid');
    invariant(body.digest === request.digest, 'artifact POST digest mismatch');
    invariant(body.stored === true, 'artifact POST did not confirm storage');
    invariant(typeof body.location === 'string' && body.location.length > 0, 'artifact POST receipt location is required');
    const bodyLocation = new URL(body.location, endpoint).href;
    const expectedLocation = artifactUrlForDigest(request.digest, { base, endpoint });
    invariant(bodyLocation === expectedLocation, 'artifact POST receipt location mismatch');
    const headerLocation = response.headers.get('location');
    if (headerLocation) {
      invariant(new URL(headerLocation, endpoint).href === bodyLocation, 'artifact POST locations differ');
    }
    return Object.freeze({
      schema: PUBLISH_RECEIPT_SCHEMA,
      method: 'POST',
      status: response.status,
      digest: request.digest,
      stored: true,
      location: bodyLocation,
      body: Object.freeze({ ...body, location: bodyLocation }),
    });
  };
}
