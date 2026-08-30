import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as source from '../transport/public-codec.js';
import * as published from '../dist/protocol/v3/codec.mjs';

const records = readFileSync(new URL('../examples/new.jsonl', import.meta.url), 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const viewTypeDirectory = new URL('../pattern/view-types/', import.meta.url);
const viewTypeModules = readdirSync(viewTypeDirectory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => JSON.parse(readFileSync(new URL(`${entry.name}/module.json`, viewTypeDirectory), 'utf8')))
  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  .map(({ order: _order, ...module }) => module);

assert.deepEqual(
  Object.keys(published).sort(),
  Object.keys(source).sort(),
  'published codec surface must exactly equal the source public codec surface',
);

const sourceLog = await source.createDecisionLog(records, 'public-codec-map');
const publishedLog = await published.createDecisionLog(records, 'public-codec-map');
assert.equal(publishedLog.log, sourceLog.log);
assert.equal(publishedLog.head, sourceLog.head);

const operations = [{ type: 'RenameRegion', regionId: 'root', label: 'Published' }];
const sourceProposal = (await source.createDecision(sourceLog.head, operations, sourceLog.records)).decision;
const publishedProposal = (await published.createDecision(publishedLog.head, operations, publishedLog.records)).decision;
assert.deepEqual(publishedProposal, sourceProposal);

const view = { pattern: 'map/1', frame: { focus: 'root', scale: 1.2, select: ['root'] } };
const sourceEnvelope = await source.createEnvelope(sourceLog.log, sourceProposal, view);
const publishedEnvelope = await published.createEnvelope(publishedLog.log, publishedProposal, view);
assert.equal(source.ENVELOPE_SCHEMA, 'semantic-map-envelope/3');
assert.equal(source.DECISION_SCHEMA, 'semantic-map-decision/2');
assert.equal(source.STATE_SCHEMA, 'semantic-map-state/1');

const sourceToken = await source.encodeEnvelopeToken(sourceEnvelope);
const publishedToken = await published.encodeEnvelopeToken(publishedEnvelope);
assert.equal(publishedToken, sourceToken, 'app and published codec must produce identical bytes');
const decoded = await published.decodeEnvelopeToken(sourceToken);
assert.equal(decoded.base.head, sourceLog.head);
assert.equal(decoded.preview.stateHash, sourceProposal.stateHash);
assert.deepEqual(decoded.envelope.view, view);

const manifest = JSON.parse(readFileSync(new URL('../dist/.well-known/semantic-map.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest, {
  appearance: {
    sceneFields: ['shape', 'directed', 'line', 'visual', 'zIndex', 'foreground'],
    themeOwner: 'renderer-maxgraph',
    transported: false,
  },
  codec: '/protocol/v3/codec.mjs',
  contracts: {
    decision: 'semantic-map-decision/2',
    envelope: 'semantic-map-envelope/3',
    resourceComposition: 'typed-resource-composition/1',
    sourceExport: 'semantic-map-source-export/1',
    state: 'semantic-map-state/1',
  },
  coordinates: {
    chartMatrix: 'matrix/1',
    chartPolarHierarchy: 'polar-hierarchy/1',
    chartQuantitative: 'quantitative/1',
    graph: 'topology/1',
    map: 'semantic-2d/1',
    seqCalendar: 'calendar/1',
    seqOrdinal: 'ordinal/1',
  },
  delivery: {
    inspection: 'semantic-map-delivery-inspection/1',
    inline: {
      encoding: 'gzip+base64url',
      fragment: 'smap',
      maxUrlChars: 8192,
      sideEffect: false,
    },
    publish: {
      automaticFallback: false,
      backendBundled: false,
      defaultBase: 'current-application-origin',
      explicit: true,
      method: 'POST',
      acceptedReceiptMediaTypes: ['application/json', 'application/*+json'],
      baseRequiredOutsideHttpDocument: true,
      baseSchemes: ['http', 'https'],
      credentials: 'same-origin',
      maxReceiptBytes: 65536,
      receiptDigestRequired: true,
      receiptDigestSource: 'server-response',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      planFunction: 'planSmapDelivery',
      planSchema: 'semantic-map-delivery-plan/1',
      publisherConfig: 'artifactStore.publisher',
      publisherConfigSchema: 'semantic-map-explicit-publisher/1',
      requiredDisclosureFields: ['label', 'visibility', 'retention', 'cost'],
      statuses: ['ready', 'publish-required', 'publisher-required', 'blocked'],
      previewWrites: false,
      reviewActions: ['Publish & Accept', 'Publish & Reject'],
      receiptRequired: true,
      receiptSchema: 'semantic-map-artifact-store-receipt/1',
      receiptFields: ['digest', 'stored', 'location'],
      continuationPlan: 'semantic-map-continuation-plan/1',
      continuationResult: 'semantic-map-continuation-result/1',
      appliesTo: ['accept', 'reject-url-proposal', 'view-change'],
      localReject: 'retain-existing-url',
      missingPublisherCode: 'PUBLISHER_REQUIRED',
      confirmationCode: 'PUBLISH_CONFIRMATION_REQUIRED',
      commitOrder: ['preflight', 'explicit-publish-if-required', 'url-and-runtime-commit'],
    },
    query: {
      role: 'optional-large-safe-query-adapter',
      usedByCore: false,
    },
    reference: {
      acceptedMediaTypes: ['application/json', 'application/*+json'],
      credentials: 'omit',
      defaultPath: '/artifacts/{digest}',
      digest: 'sha256',
      fragment: 'smap-ref',
      httpCaching: 'allowed-with-post-fetch-digest-verification',
      maxResponseBytes: 262144,
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      resolveMethod: 'GET',
      verification: 'canonical-envelope-sha256',
      baseRequiredOutsideHttpDocument: true,
      baseSchemes: ['http', 'https'],
      endpointConfig: 'artifactStore.endpoint',
      storeConfigSchema: 'semantic-map-http-artifact-store/1',
      readRequiresPublisher: false,
    },
  },
  encoding: 'gzip+base64url',
  fragment: 'smap',
  sourceExport: {
    schema: 'semantic-map-source-export/1',
    function: 'decompileSmapInvocation',
    inputs: ['smap', 'smap-ref'],
    outputs: ['stateJSONL', 'proposalStateJSONL', 'decisionLogJSONL', 'envelopeJSON'],
    proposalState: true,
    stateRole: 'accepted',
    originalLexicalJSONL: false,
    compatibilityAliases: [{
      path: '/protocol/v3/modules/transport/smap-source.js',
      canonical: '/protocol/v3/modules/transport/source-export.js',
      exports: ['SOURCE_EXPORT_SCHEMA', 'decompileSmapInvocation'],
      status: 'supported',
    }],
  },
  geoSpec: {
    crs: 'OGC:CRS84',
    editable: false,
    field: 'meta.geoSpec',
    geometries: ['Point', 'Polygon'],
    schema: 'semantic-map-geo-spec/1',
  },
  help: '/help',
  legacyAccepted: false,
  limits: { scenePrimitives: 2048, urlChars: 8192 },
  operations: source.OPERATION_TYPES.filter((type) => type !== 'CreateMap'),
  patterns: {
    modules: viewTypeModules,
    reserved: source.RESERVED_PATTERNS,
    sceneCardinality: 'exactly-one',
    supported: source.SUPPORTED_PATTERNS,
  },
  policy: { rootKind: 'policy-model/1', validation: 'fail-closed' },
  protocol: 'semantic-map/3',
  schema: 'semantic-map-manifest/3',
  view: {
    frame: { fields: ['focus', 'scale', 'select', 'bbox', 'viewport'] },
    optional: ['seq', 'chart', 'frame', 'resourceComposition'],
    required: ['pattern'],
    resourceComposition: {
      placement: {
        actionKinds: ['navigate'],
        fields: ['id', 'resourceRef', 'targetRef', 'slot', 'view', 'action'],
        slots: ['background', 'content'],
      },
      registry: {
        documentBoundary: 'sandboxed',
        provenanceRequiredFor: ['image/1', 'video/1'],
        runtimeOwned: ['adapter', 'boundary', 'target-catalog'],
        semanticMapNodeBoundary: 'validated-read-only',
        semanticMapSource: 'single-#smap-token-required',
        urlSchemes: ['http', 'https'],
        userinfo: false,
        integrity: {
          accepted: false,
          owner: 'verified-reference-adapter',
        },
        sceneImageExport: {
          sameOriginImage: true,
          crossOriginImage: false,
          videoFrame: false,
          surfaceDocument: false,
        },
      },
      resource: {
        contracts: ['image/1', 'semantic-map-envelope/3', 'document/1', 'video/1'],
        fields: ['id', 'contract', 'source', 'provenanceRef'],
        sourceTypes: ['url'],
      },
      schema: 'typed-resource-composition/1',
      serialized: ['resources', 'placements'],
    },
    seq: { fields: ['axis', 'groupBy'], requiredFor: 'seq/1' },
    chart: { fields: ['type', 'layers', 'focus'], requiredFor: 'chart/1', types: ['bar-horizontal/1', 'bar-vertical/1', 'line/1', 'pie/1', 'donut/1', 'scatter/1', 'heatmap/1', 'sunburst/1'] },
  },
});
assert.equal(source.MAX_PUBLISH_RECEIPT_BYTES, 65536);
assert.equal(source.DELIVERY_PLAN_SCHEMA, 'semantic-map-delivery-plan/1');
assert.equal(source.PUBLISH_RECEIPT_SCHEMA, 'semantic-map-artifact-store-receipt/1');
assert.equal(typeof source.planSmapDelivery, 'function');
assert.equal(typeof source.decompileSmapInvocation, 'function');
assert.equal(typeof source.decompileSmapUrl, 'function');
assert.equal(typeof source.exportEnvelopeSources, 'function');
assert.equal(published.MAX_PUBLISH_RECEIPT_BYTES, source.MAX_PUBLISH_RECEIPT_BYTES);

assert.equal(existsSync(new URL('../dist/protocol/v1/', import.meta.url)), false);
assert.equal(existsSync(new URL('../dist/protocol/v2/', import.meta.url)), false);
assert.equal(existsSync(new URL('../compat/', import.meta.url)), false);
assert.equal('DEFAULT_PATTERN' in source, false, 'MUTATION:implicit-pattern-default');
assert.equal('DEFAULT_PATTERN' in published, false, 'MUTATION:implicit-pattern-default');
await assert.rejects(
  published.inspectEnvelope({ ...sourceEnvelope, schema: 'semantic-map-envelope/2' }),
  /not semantic-map-envelope\/3/u,
);
await assert.rejects(
  published.createEnvelope(sourceLog.log, null, { pattern: 'flow/1' }),
  /unsupported Pattern flow\/1/u,
);
await assert.rejects(
  published.createEnvelope(sourceLog.log, null, { pattern: source.CHART_PATTERN }),
  /View.chart is required/u,
);
const chartRecords = readFileSync(new URL('../examples/chart.jsonl', import.meta.url), 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map(line => JSON.parse(line));
const chartLog = await published.createDecisionLog(chartRecords, 'public-codec-chart');
const chartEnvelope = await published.createEnvelope(chartLog.log, null, {
  pattern: source.CHART_PATTERN,
  chart: { type: source.BAR_HORIZONTAL_CHART },
});
assert.deepEqual(chartEnvelope.view, { pattern: 'chart/1', chart: { type: 'bar-horizontal/1' } });
const overlayEnvelope = await published.createEnvelope(chartLog.log, null, {
  pattern: source.CHART_PATTERN,
  chart: { layers: [source.DONUT_CHART, source.PIE_CHART, 'scatter/1', source.LINE_CHART, source.BAR_VERTICAL_CHART, source.BAR_HORIZONTAL_CHART] },
});
assert.deepEqual(overlayEnvelope.view, {
  pattern: 'chart/1',
  chart: { layers: ['bar-horizontal/1', 'bar-vertical/1', 'line/1', 'pie/1', 'donut/1', 'scatter/1'] },
});
assert.equal(source.CHART_COMBINATION_COUNT, 65);
assert.equal(source.MAX_CHART_LAYERS, 6);

console.log(JSON.stringify({
  schema: 'semantic-map-public-codec-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  exports: Object.keys(published).length,
  envelopeSchema: source.ENVELOPE_SCHEMA,
  legacyAccepted: manifest.legacyAccepted,
  patterns: manifest.patterns,
  tokenChars: sourceToken.length,
  head: sourceLog.head,
}, null, 2));
