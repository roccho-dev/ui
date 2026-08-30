import {
  DELIVERY_PLAN_SCHEMA,
  PUBLISH_RESULT_SCHEMA,
  planSmapDelivery,
  publishSmapReference,
} from '../transport/index.js';
import { PUBLISHER_PORT_SCHEMA } from './publisher.js';

export const CONTINUATION_PLAN_SCHEMA = 'semantic-map-continuation-plan/1';
export const CONTINUATION_RESULT_SCHEMA = 'semantic-map-continuation-result/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-continuation: ${message}`);
}

export function continuationError(code, message, detail = {}) {
  const error = new Error(`semantic-continuation: ${code}: ${message}`);
  error.code = code;
  error.detail = Object.freeze({ ...detail });
  return error;
}

function normalizePublisherPort(input) {
  if (input == null) return null;
  invariant(input?.schema === PUBLISHER_PORT_SCHEMA, 'publisher port schema is invalid');
  invariant(input.kind === 'explicit-http-write', 'publisher port kind is invalid');
  invariant(typeof input.publish === 'function', 'publisher publish function is required');
  invariant(input.disclosure && typeof input.disclosure === 'object', 'publisher disclosure is required');
  return input;
}

function continuationPlan({ kind, base, envelope = null, delivery = null, url = null, publisher = null }) {
  const status = kind === 'keep-url'
    ? 'ready'
    : delivery.status === 'ready'
      ? 'ready'
      : delivery.status === 'publish-required'
        ? 'confirmation-required'
        : 'blocked';
  const action = kind === 'keep-url'
    ? 'keep-existing'
    : delivery.status === 'publish-required'
      ? 'publish-reference'
      : delivery.mode === 'reference'
        ? 'reuse-reference'
        : delivery.mode === 'inline'
          ? 'inline'
          : 'blocked';
  return Object.freeze({
    schema: CONTINUATION_PLAN_SCHEMA,
    kind,
    status,
    action,
    mode: kind === 'keep-url' ? 'existing' : delivery.mode,
    code: kind === 'keep-url' ? null : delivery.code,
    codes: Object.freeze(kind === 'keep-url' || !delivery.code ? [] : [delivery.code]),
    base,
    digest: kind === 'keep-url' ? null : delivery.digest,
    url: kind === 'keep-url' ? url : delivery.status === 'ready' ? delivery.url : null,
    plannedUrl: kind === 'keep-url' ? url : delivery.url,
    artifactUrl: kind === 'keep-url' ? null : delivery.artifactUrl,
    envelope,
    inspection: kind === 'keep-url' ? null : delivery.inspection,
    delivery,
    publisher,
  });
}

function continuationResult({ action, mode, digest = null, url, artifactUrl = null, receipt = null }) {
  return Object.freeze({
    schema: CONTINUATION_RESULT_SCHEMA,
    action,
    mode,
    digest,
    url,
    artifactUrl,
    receipt,
  });
}

export function createContinuationService(publisherInput = null, options = {}) {
  const publisher = normalizePublisherPort(publisherInput);
  const knownReferences = new Set(Array.from(options.knownReferences ?? [], String));
  const disclosure = publisher?.disclosure ?? null;
  const artifactEndpoint = String(options.artifactEndpoint ?? '/artifacts');
  invariant(artifactEndpoint.length > 0, 'artifact endpoint is required');

  async function prepare(envelope, { base } = {}) {
    const delivery = await planSmapDelivery(envelope, {
      base,
      endpoint: artifactEndpoint,
      publisherAvailable: publisher !== null,
      knownReferences,
    });
    invariant(delivery?.schema === DELIVERY_PLAN_SCHEMA, 'delivery plan is invalid');
    return continuationPlan({
      kind: 'new-url',
      base,
      envelope,
      delivery,
      publisher: disclosure,
    });
  }

  function keep(url) {
    invariant(typeof url === 'string' && url.length > 0, 'existing continuation URL is required');
    return continuationPlan({
      kind: 'keep-url',
      base: url,
      url,
      publisher: disclosure,
    });
  }

  async function realize(value, { confirmPublish = false } = {}) {
    invariant(value?.schema === CONTINUATION_PLAN_SCHEMA, 'continuation plan is invalid');
    if (value.status === 'ready') {
      return continuationResult({
        action: value.action,
        mode: value.mode,
        digest: value.digest,
        url: value.url,
        artifactUrl: value.artifactUrl,
      });
    }
    if (value.status === 'blocked') {
      throw continuationError(
        value.code ?? 'DELIVERY_BLOCKED',
        `continuation is blocked (${value.codes.join(', ') || 'UNKNOWN'})`,
        { plan: value },
      );
    }
    if (!confirmPublish) {
      throw continuationError('PUBLISH_CONFIRMATION_REQUIRED', 'publishing must be confirmed explicitly', { plan: value });
    }
    invariant(publisher, 'confirmation-required plan has no publisher');
    const published = await publishSmapReference(value.envelope, {
      base: value.base,
      endpoint: artifactEndpoint,
      publisher: publisher.publish,
    });
    invariant(published?.schema === PUBLISH_RESULT_SCHEMA, 'publish result is invalid');
    invariant(published.digest === value.digest, 'published digest differs from preflight');
    invariant(published.url === value.plannedUrl, 'published URL differs from preflight');
    invariant(published.artifactUrl === value.artifactUrl, 'published artifact URL differs from preflight');
    knownReferences.add(published.artifactUrl);
    return continuationResult({
      action: 'publish-reference',
      mode: 'reference',
      digest: published.digest,
      url: published.url,
      artifactUrl: published.artifactUrl,
      receipt: published.receipt,
    });
  }

  return Object.freeze({ disclosure, artifactEndpoint, prepare, keep, realize });
}
