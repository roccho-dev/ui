const MAX_RESOURCE_BYTES = 256 * 1024;
const invariant = (condition, message) => { if (!condition) throw new Error(`ui-http-resource: ${message}`); };
const mediaType = response => String(response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
const byteLength = value => new TextEncoder().encode(value).byteLength;

const readText = async response => {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared)) invariant(declared <= MAX_RESOURCE_BYTES, `resource exceeds ${MAX_RESOURCE_BYTES} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  invariant(bytes.byteLength <= MAX_RESOURCE_BYTES, `resource exceeds ${MAX_RESOURCE_BYTES} bytes`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('ui-http-resource: invalid UTF-8'); }
};

const decode = (type, text) => {
  if (type === 'application/x-ndjson') return text;
  if (type === 'application/json') return JSON.parse(text);
  throw new Error(`ui-http-resource: unsupported content-type: ${type || '(missing)'}`);
};

const encode = (type, value) => {
  if (type === 'application/x-ndjson') {
    invariant(typeof value === 'string', 'NDJSON write requires string');
    return value;
  }
  if (type === 'application/json') return JSON.stringify(value);
  throw new Error(`ui-http-resource: unsupported content-type: ${type || '(missing)'}`);
};

export const createHttpResource = ({ fetch, href }) => {
  invariant(typeof fetch === 'function', 'fetch required');
  invariant(typeof href === 'string' && href, 'href required');
  let etag = null;
  let type = null;

  const read = async () => {
    const response = await fetch(href, { cache: 'no-store', credentials: 'omit' });
    invariant(response.ok, `GET returned ${response.status}`);
    type = mediaType(response);
    const text = await readText(response);
    etag = response.headers.get('etag');
    return decode(type, text);
  };

  const put = async value => {
    invariant(type, 'read required before write');
    invariant(etag, 'ETag required for write');
    const body = encode(type, value);
    invariant(byteLength(body) <= MAX_RESOURCE_BYTES, `resource exceeds ${MAX_RESOURCE_BYTES} bytes`);
    const response = await fetch(href, {
      body,
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': type, 'If-Match': etag },
      method: 'PUT',
    });
    if (response.status === 412) {
      const error = new Error('ui-http-resource: resource is stale');
      error.code = 'STALE_RESOURCE';
      throw error;
    }
    invariant(response.ok, `PUT returned ${response.status}`);
    const nextEtag = response.headers.get('etag');
    invariant(nextEtag, 'PUT response ETag required');
    etag = nextEtag;
    return value;
  };

  return Object.freeze({ href, put, read, schema: 'ui-http-resource/1' });
};
