import { canonicalJson, inspectEnvelope } from '../protocol/index.js';

export const SMAP_FRAGMENT = 'smap';
export const MAX_URL_CHARS = 8_192;
export const MAX_COMPRESSED_BYTES = 64 * 1_024;
export const MAX_ENVELOPE_BYTES = 256 * 1_024;

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-transport: ${message}`);
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlDecode(input) {
  invariant(typeof input === 'string' && input.length > 0, 'empty token');
  invariant(/^[A-Za-z0-9_-]+$/u.test(input), 'invalid base64url token');
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch (_) {
    throw new Error('semantic-transport: invalid base64url token');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  invariant(bytes.byteLength <= MAX_COMPRESSED_BYTES, `compressed payload exceeds ${MAX_COMPRESSED_BYTES} bytes`);
  return bytes;
}

async function collect(stream, maximum, label) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      invariant(total <= maximum, `${label} exceeds ${maximum} bytes`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function gzip(bytes) {
  invariant(typeof CompressionStream === 'function', 'gzip compression is unavailable');
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return collect(stream, MAX_COMPRESSED_BYTES, 'compressed payload');
}

async function gunzip(bytes) {
  invariant(typeof DecompressionStream === 'function', 'gzip decompression is unavailable');
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  } catch (_) {
    throw new Error('semantic-transport: invalid gzip payload');
  }
  try {
    return await collect(stream, MAX_ENVELOPE_BYTES, 'expanded payload');
  } catch (error) {
    if (String(error.message).startsWith('semantic-transport:')) throw error;
    throw new Error('semantic-transport: invalid gzip payload');
  }
}

export async function encodeEnvelopePayload(input) {
  const inspection = await inspectEnvelope(input);
  const source = new TextEncoder().encode(canonicalJson(inspection.envelope));
  invariant(source.byteLength <= MAX_ENVELOPE_BYTES, `expanded payload exceeds ${MAX_ENVELOPE_BYTES} bytes`);
  const compressed = await gzip(source);
  return Object.freeze({
    inspection,
    token: base64UrlEncode(compressed),
    canonicalBytes: source.byteLength,
    compressedBytes: compressed.byteLength,
  });
}

export async function encodeEnvelopeToken(input) {
  return (await encodeEnvelopePayload(input)).token;
}

export async function decodeEnvelopeToken(token) {
  const source = await gunzip(base64UrlDecode(token));
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source));
  } catch (_) {
    throw new Error('semantic-transport: invalid envelope JSON');
  }
  return inspectEnvelope(value);
}

export function assertUrlWithinLimit(input) {
  const url = String(input);
  invariant(url.length <= MAX_URL_CHARS, `URL exceeds ${MAX_URL_CHARS} characters`);
  return url;
}

export function canonicalBaseUrl(base = location.href) {
  const url = new URL(String(base));
  if (url.protocol === 'http:' || url.protocol === 'https:') url.pathname = '/app';
  url.search = '';
  url.hash = '';
  return url;
}

export async function createSmapUrl(envelope, base = location.href) {
  const url = canonicalBaseUrl(base);
  url.hash = `${SMAP_FRAGMENT}=${await encodeEnvelopeToken(envelope)}`;
  return assertUrlWithinLimit(url.href);
}

function fragmentFromInput(input) {
  const value = String(input);
  if (!value) return '';
  if (value.startsWith('#')) {
    assertUrlWithinLimit(value);
    return value;
  }
  let url;
  try {
    const relative = value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
    url = relative ? new URL(value, 'https://semantic-map.invalid/') : new URL(value);
  } catch (_) {
    throw new Error('semantic-transport: invalid URL');
  }
  assertUrlWithinLimit(url.href);
  return url.hash;
}

export async function readSmapHash(input = location.href) {
  const hash = fragmentFromInput(input);
  if (!hash) return null;
  invariant(hash.startsWith(`#${SMAP_FRAGMENT}=`), `unsupported fragment ${hash.slice(0, 24)}`);
  invariant(hash.indexOf('&') === -1, 'multiple fragment fields are not allowed');
  return decodeEnvelopeToken(hash.slice(SMAP_FRAGMENT.length + 2));
}
