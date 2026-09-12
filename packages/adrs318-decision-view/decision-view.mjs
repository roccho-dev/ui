const TYPE_RE = /^[a-z][a-z0-9-]{0,63}$/;
const STATUS_RE = /^[a-z][a-z0-9-]{0,63}$/;
const VIEW_SCHEMA = 'adrs.decisionView.v1';
const MANIFEST_SCHEMA = 'adrs.decisionPublication.v1';

export class DecisionViewError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DecisionViewError';
    this.code = code;
    this.details = details;
  }
}

export function parseDecisionRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'decisions' || parts.length < 2 || parts.length > 3) {
    throw new DecisionViewError('route-not-found', 'Unsupported decision route');
  }
  const [, decisionType, status = null] = parts;
  if (!TYPE_RE.test(decisionType) || (status !== null && !STATUS_RE.test(status))) {
    throw new DecisionViewError('route-invalid', 'Invalid decision type or status');
  }
  return {
    decisionType,
    status,
    logicalRoute: status ? `decisions/${decisionType}/${status}` : `decisions/${decisionType}`,
  };
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function parseJsonl(text) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new DecisionViewError('invalid-jsonl', `Invalid JSONL at line ${index + 1}`, String(error));
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DecisionViewError('invalid-record', `JSONL line ${index + 1} must be an object`);
    }
    records.push(value);
  }
  return records;
}

function assertManifest(manifest) {
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA || !Array.isArray(manifest.routes)) {
    throw new DecisionViewError('manifest-invalid', 'Unsupported publication manifest');
  }
}

function resolveRoute(manifest, requested) {
  const exact = manifest.routes.find((row) => row.logical_route === requested.logicalRoute);
  if (exact) return exact;
  if (requested.status === null) {
    const children = manifest.routes.filter(
      (row) => row.decision_type === requested.decisionType && typeof row.status === 'string',
    );
    if (children.length) {
      throw new DecisionViewError('type-route-requires-policy', 'Type route grouping policy is not declared');
    }
  }
  throw new DecisionViewError('route-not-found', 'Decision route is not present in current manifest');
}

function resolveAssetUrl(assetUrl, pageUrl) {
  let resolved;
  try {
    resolved = new URL(assetUrl, pageUrl);
  } catch (error) {
    throw new DecisionViewError('asset-url-invalid', 'Invalid asset URL', String(error));
  }
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
    throw new DecisionViewError('asset-scheme-denied', 'Only HTTP(S) decision assets are supported');
  }
  return resolved;
}

function validateRouteBinding(binding, requested) {
  if (binding.decision_type !== requested.decisionType) {
    throw new DecisionViewError('route-type-mismatch', 'Manifest route type does not match URL');
  }
  if (requested.status !== null && binding.status !== requested.status) {
    throw new DecisionViewError('route-status-mismatch', 'Manifest route status does not match URL');
  }
  if (binding.projection_contract !== VIEW_SCHEMA) {
    throw new DecisionViewError('projection-contract-unsupported', 'Unsupported decision projection contract');
  }
  if (typeof binding.renderer_id !== 'string' || !binding.renderer_id) {
    throw new DecisionViewError('renderer-missing', 'Renderer ID is required');
  }
  if (typeof binding.asset_url !== 'string' || typeof binding.asset_digest !== 'string') {
    throw new DecisionViewError('asset-binding-invalid', 'Asset URL and digest are required');
  }
}

function validateRecords(records, binding) {
  for (const [index, row] of records.entries()) {
    if (row.schema !== VIEW_SCHEMA) {
      throw new DecisionViewError('record-schema-unsupported', `Record ${index} has unsupported schema`);
    }
    if (row.decision_type !== binding.decision_type) {
      throw new DecisionViewError('record-type-mismatch', `Record ${index} has wrong decision type`);
    }
    if (binding.status && row.status !== binding.status) {
      throw new DecisionViewError('record-status-mismatch', `Record ${index} has wrong status`);
    }
  }
}

export async function loadDecisionRoute({
  pageUrl,
  pathname = new URL(pageUrl).pathname,
  manifest,
  fetchImpl = fetch,
  rendererRegistry,
  maxBytes = 2_000_000,
}) {
  assertManifest(manifest);
  const requested = parseDecisionRoute(pathname);
  const binding = resolveRoute(manifest, requested);
  validateRouteBinding(binding, requested);
  const renderer = rendererRegistry?.get?.(binding.renderer_id);
  if (typeof renderer !== 'function') {
    throw new DecisionViewError('renderer-unsupported', `Unknown renderer: ${binding.renderer_id}`);
  }

  const page = new URL(pageUrl);
  const asset = resolveAssetUrl(binding.asset_url, page);
  const sameOrigin = asset.origin === page.origin;
  let response;
  try {
    response = await fetchImpl(asset, {
      credentials: sameOrigin ? 'include' : 'omit',
      redirect: 'manual',
      headers: { Accept: 'application/x-ndjson, application/jsonl, text/plain;q=0.5' },
    });
  } catch (error) {
    throw new DecisionViewError('fetch-failed', 'Decision asset request failed', String(error));
  }
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new DecisionViewError('redirect-denied', 'Decision asset redirects are not followed');
  }
  if (response.status === 401) throw new DecisionViewError('unauthenticated', 'Authentication required');
  if (response.status === 403) throw new DecisionViewError('forbidden', 'Access denied');
  if (!response.ok) throw new DecisionViewError('http-error', `Decision asset HTTP ${response.status}`);

  const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const accepted = new Set(['application/x-ndjson', 'application/jsonl', 'text/plain']);
  if (!accepted.has(contentType)) {
    throw new DecisionViewError('content-type-denied', `Unsupported content type: ${contentType || '(missing)'}`);
  }
  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new DecisionViewError('asset-too-large', 'Decision asset exceeds byte limit');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new DecisionViewError('asset-too-large', 'Decision asset exceeds byte limit');
  const digest = await sha256(bytes);
  if (digest !== binding.asset_digest) {
    throw new DecisionViewError('digest-mismatch', 'Decision asset digest mismatch');
  }
  const records = parseJsonl(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  validateRecords(records, binding);
  const rendered = await renderer(records, { requested, binding });
  return {
    rendered,
    records,
    receipt: {
      schema: 'adrs.decisionBrowserReceipt.v1',
      status: 'PASS',
      authority: false,
      logical_route: binding.logical_route,
      renderer_id: binding.renderer_id,
      asset_digest: digest,
      credentials_mode: sameOrigin ? 'include' : 'omit',
      record_count: records.length,
    },
  };
}

export const contracts = Object.freeze({ VIEW_SCHEMA, MANIFEST_SCHEMA });
