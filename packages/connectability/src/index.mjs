const DEFAULT_ENDPOINT = '/api/proposals';
const DEFAULT_MAX_BYTES = 4_096;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function invariant(condition, code, message) {
  if (!condition) throw new ConnectabilityError(code, message);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalize(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'INVALID_VALUE', `${path} must be finite`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normalize(item, `${path}[${index}]`));
  invariant(plainObject(value), 'INVALID_VALUE', `${path} must be a plain JSON value`);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    invariant(value[key] !== undefined, 'INVALID_VALUE', `${path}.${key} must not be undefined`);
    result[key] = normalize(value[key], `${path}.${key}`);
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function bytesOf(text) {
  return new TextEncoder().encode(text).byteLength;
}

async function digestOf(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

function endpointValue(value) {
  invariant(
    typeof value === 'string' && value.startsWith('/') && !value.startsWith('//'),
    'INVALID_ENDPOINT',
    'endpoint must be a root-relative same-origin path',
  );
  const parsed = new URL(value, 'https://connectability.invalid');
  invariant(
    parsed.origin === 'https://connectability.invalid' && !parsed.username && !parsed.password && !parsed.hash,
    'INVALID_ENDPOINT',
    'endpoint must remain same-origin and must not contain credentials or a fragment',
  );
  return `${parsed.pathname}${parsed.search}`;
}

async function responseJson(response) {
  let value;
  try {
    value = await response.json();
  } catch (error) {
    throw new ConnectabilityError(
      'INVALID_RESPONSE',
      `response is not JSON (${response.status})`,
      response.status,
      error,
    );
  }
  invariant(plainObject(value), 'INVALID_RESPONSE', 'response body must be an object');
  if (!response.ok) {
    throw new ConnectabilityError(
      typeof value.code === 'string' ? value.code : 'HTTP_ERROR',
      typeof value.message === 'string' ? value.message : `HTTP ${response.status}`,
      response.status,
    );
  }
  return value;
}

export class ConnectabilityError extends Error {
  constructor(code, message, status = null, cause = undefined) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ConnectabilityError';
    this.code = code;
    this.status = status;
  }
}

export function canonicalJson(value) {
  return `${JSON.stringify(normalize(value))}\n`;
}

export function createJsonConnectability({
  prepare: prepareValue,
  endpoint = DEFAULT_ENDPOINT,
  fetch: fetchValue = globalThis.fetch,
  idOf = value => value.proposal_id,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  invariant(typeof prepareValue === 'function', 'INVALID_CONFIG', 'prepare must be a function');
  invariant(typeof fetchValue === 'function', 'INVALID_CONFIG', 'fetch must be a function');
  invariant(typeof idOf === 'function', 'INVALID_CONFIG', 'idOf must be a function');
  invariant(
    Number.isSafeInteger(maxBytes) && maxBytes > 0,
    'INVALID_CONFIG',
    'maxBytes must be a positive safe integer',
  );
  const target = endpointValue(endpoint);
  const preparedDigests = new Set();

  async function prepare(input) {
    const value = normalize(await prepareValue(input));
    invariant(plainObject(value), 'INVALID_PROPOSAL', 'prepared proposal must be an object');
    const id = idOf(value);
    invariant(
      typeof id === 'string' && id.length > 0 && id.length <= 240,
      'INVALID_PROPOSAL',
      'prepared proposal must have a stable id',
    );
    const bytes = canonicalJson(value);
    const byteLength = bytesOf(bytes);
    invariant(byteLength <= maxBytes, 'PROPOSAL_TOO_LARGE', `proposal exceeds ${maxBytes} bytes`);
    const digest = await digestOf(bytes);
    invariant(SHA256.test(digest), 'DIGEST_FAILED', 'proposal digest is invalid');
    preparedDigests.add(digest);
    return deepFreeze({
      schema: 'ui.connectability.prepared/1',
      id,
      digest,
      bytes,
      byteLength,
      value,
    });
  }

  async function submit(prepared) {
    invariant(
      plainObject(prepared) && prepared.schema === 'ui.connectability.prepared/1',
      'UNPREPARED_PROPOSAL',
      'submit requires a prepared proposal',
    );
    invariant(
      preparedDigests.has(prepared.digest),
      'UNPREPARED_PROPOSAL',
      'proposal was not prepared by this connection',
    );
    invariant(
      await digestOf(prepared.bytes) === prepared.digest,
      'PROPOSAL_CHANGED',
      'prepared proposal bytes changed after preparation',
    );
    const response = await fetchValue(target, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: prepared.bytes,
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    });
    const value = await responseJson(response);
    return deepFreeze({
      schema: 'ui.connectability.submit-result/1',
      id: prepared.id,
      digest: prepared.digest,
      state: typeof value.state === 'string' ? value.state : 'submitted',
      value: normalize(value),
    });
  }

  async function observe(id) {
    invariant(
      typeof id === 'string' && id.length > 0 && id.length <= 240,
      'INVALID_ID',
      'id must be a non-empty stable string',
    );
    const response = await fetchValue(`${target}/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    });
    const value = await responseJson(response);
    return deepFreeze({
      schema: 'ui.connectability.observation/1',
      id,
      state: typeof value.state === 'string' ? value.state : 'unknown',
      value: normalize(value),
    });
  }

  return Object.freeze({
    schema: 'ui.connectability/1',
    endpoint: target,
    maxBytes,
    prepare,
    submit,
    observe,
  });
}
