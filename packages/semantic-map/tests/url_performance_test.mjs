import assert from 'node:assert/strict';
import { createDecisionLog, createEnvelope } from '../protocol/index.js';
import { createSmapUrl, decodeEnvelopeToken, encodeEnvelopeToken } from '../transport/index.js';

const ENCODE_P95_BUDGET_MS = 100;
const DECODE_P95_BUDGET_MS = 100;
const URL_P95_BUDGET_MS = 125;
const SAMPLE_COUNT = 31;
const WARMUP_COUNT = 5;

function fixtureRecords(regionCount = 224) {
  const records = [
    { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'URL performance fixture' },
    { type: 'region', id: 'root', parent: null, label: 'URL performance fixture', kind: 'root', bounds: [0, 0, 1600, 3900], summary: '' },
  ];
  for (let index = 0; index < regionCount; index += 1) {
    records.push({
      type: 'region',
      id: `region-${index}`,
      parent: 'root',
      label: `Region ${index}`,
      kind: index % 7 === 0 ? 'decision' : 'concept',
      bounds: [40 + (index % 8) * 190, 50 + Math.floor(index / 8) * 130, 150, 88],
      summary: `Stable semantic fixture ${index}`,
    });
  }
  for (let index = 1; index < regionCount; index += 1) {
    records.push({
      type: 'relation',
      id: `relation-${index}`,
      from: `region-${index - 1}`,
      to: `region-${index}`,
      kind: 'flows',
      label: '',
    });
  }
  return records;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

async function measured(samples, operation) {
  const values = [];
  for (let index = 0; index < WARMUP_COUNT + samples; index += 1) {
    const start = performance.now();
    await operation();
    const elapsed = performance.now() - start;
    if (index >= WARMUP_COUNT) values.push(elapsed);
  }
  return Object.freeze({
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

const initial = await createDecisionLog(fixtureRecords(), 'semantic-map:url-performance');
const envelope = await createEnvelope(initial.log, null, {
  pattern: 'map/1',
  frame: {
    bbox: [0, 0, 1600, 1200],
    viewport: [412, 711],
    select: ['region-31'],
  },
});
const stableToken = await encodeEnvelopeToken(envelope);
const stableUrl = await createSmapUrl(envelope, 'https://example.test/app');
assert.ok(stableUrl.length <= 8192, `performance fixture exceeds URL contract: ${stableUrl.length}`);

const encode = await measured(SAMPLE_COUNT, () => encodeEnvelopeToken(envelope));
const decode = await measured(SAMPLE_COUNT, () => decodeEnvelopeToken(stableToken));
const url = await measured(SAMPLE_COUNT, () => createSmapUrl(envelope, 'https://example.test/app'));

assert.ok(encode.p95 <= ENCODE_P95_BUDGET_MS, `encode p95 ${encode.p95.toFixed(3)}ms exceeds ${ENCODE_P95_BUDGET_MS}ms`);
assert.ok(decode.p95 <= DECODE_P95_BUDGET_MS, `decode p95 ${decode.p95.toFixed(3)}ms exceeds ${DECODE_P95_BUDGET_MS}ms`);
assert.ok(url.p95 <= URL_P95_BUDGET_MS, `URL p95 ${url.p95.toFixed(3)}ms exceeds ${URL_P95_BUDGET_MS}ms`);

console.log(JSON.stringify({
  schema: 'semantic-map-url-performance-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  fixture: { regions: 225, relations: 223, urlChars: stableUrl.length, tokenChars: stableToken.length },
  samples: SAMPLE_COUNT,
  budgetMs: { encodeP95: ENCODE_P95_BUDGET_MS, decodeP95: DECODE_P95_BUDGET_MS, urlP95: URL_P95_BUDGET_MS },
  measuredMs: { encode, decode, url },
}, null, 2));
