import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSemanticMapRecords } from '../domain/index.js';
import {
  createDecisionLog,
  createEnvelope,
  inspectEnvelope,
  normalizeFrame,
  normalizeView,
  projectView,
} from '../protocol/index.js';
import { createSmapUrl, readSmapHash } from '../transport/index.js';

const records = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8'));
const chartRecords = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/chart.jsonl', import.meta.url), 'utf8'));
assert.deepEqual(normalizeView({ pattern: 'map/1' }), { pattern: 'map/1' });
assert.deepEqual(normalizeView({ pattern: 'seq/1', seq: { groupBy: 'actor', axis: 'ordinal' } }), {
  pattern: 'seq/1',
  seq: { groupBy: 'actor', axis: 'ordinal' },
});
assert.deepEqual(normalizeView({ pattern: 'chart/1', chart: { type: 'bar-horizontal/1' } }), {
  pattern: 'chart/1',
  chart: { type: 'bar-horizontal/1' },
});
assert.deepEqual(normalizeView({ pattern: 'chart/1', chart: { layers: ['donut/1', 'line/1', 'pie/1'] } }), {
  pattern: 'chart/1',
  chart: { layers: ['line/1', 'pie/1', 'donut/1'] },
});
assert.deepEqual(normalizeView({ pattern: 'chart/1', chart: { type: 'heatmap/1' } }), {
  pattern: 'chart/1',
  chart: { type: 'heatmap/1' },
});
assert.throws(() => normalizeView({ pattern: 'chart/1', chart: { layers: ['heatmap/1'] } }), /standalone and cannot be layered/u);
assert.deepEqual(normalizeFrame({ focus: 'request', scale: 2, select: ['request'] }), {
  focus: 'request', scale: 2, select: ['request'],
});
assert.deepEqual(normalizeFrame({ bbox: [0, 0, 100, 80], viewport: [412, 915] }), {
  bbox: [0, 0, 100, 80], viewport: [412, 915],
});
assert.throws(() => normalizeView({}), /pattern is required/u);
assert.throws(() => normalizeView({ pattern: 'flow/1' }), /unsupported Pattern/u);
assert.throws(() => normalizeView({ pattern: 'map/1', focus: 'request', scale: 2 }), /View.focus is not allowed/u);
assert.throws(() => normalizeView({ pattern: 'map/1', seq: { groupBy: 'actor', axis: 'ordinal' } }), /View.seq is not allowed/u);
assert.throws(() => normalizeView({ pattern: 'seq/1' }), /View.seq is required/u);
assert.throws(() => normalizeView({ pattern: 'chart/1' }), /View.chart is required/u);
assert.throws(() => normalizeView({ pattern: 'map/1', chart: { type: 'bar-horizontal/1' } }), /View.chart is not allowed/u);
assert.throws(() => normalizeFrame({ focus: 'request' }), /specified together/u);
assert.throws(() => normalizeFrame({ bbox: [0, 0, 100, 80] }), /specified together/u, 'MUTATION:allow-partial-exact-frame');
assert.throws(() => normalizeFrame({ focus: 'request', scale: 2, bbox: [0, 0, 100, 80], viewport: [412, 915] }), /must not combine/u);
assert.throws(() => normalizeFrame({ select: ['request', 'request'] }), /duplicates/u);

assert.deepEqual(projectView({ pattern: 'map/1', frame: { focus: 'missing', scale: 2, select: ['request', 'missing'] } }, records), {
  pattern: 'map/1', frame: { select: ['request'] },
});

const log = await createDecisionLog(records, 'urn:test:view');
const envelope = await createEnvelope(log.log, null, {
  pattern: 'map/1',
  frame: { bbox: [0, 0, 1180, 760], viewport: [412, 915], select: ['request'] },
});
const url = await createSmapUrl(envelope, 'https://example.test/app');
const opened = await readSmapHash(url);
assert.deepEqual(opened.envelope.view, envelope.view);
const chartLog = await createDecisionLog(chartRecords, 'urn:test:view:chart');
const chartEnvelope = await createEnvelope(chartLog.log, null, {
  pattern: 'chart/1',
  chart: { layers: ['bar-horizontal/1', 'bar-vertical/1', 'line/1', 'pie/1', 'donut/1', 'scatter/1'] },
});
assert.deepEqual((await readSmapHash(await createSmapUrl(chartEnvelope, 'https://example.test/app'))).envelope.view, chartEnvelope.view);
await assert.rejects(inspectEnvelope({ ...envelope, view: { pattern: 'map/1', frame: { focus: 'missing', scale: 2 } } }), /region not found/u);

console.log(JSON.stringify({
  schema: 'semantic-map-view-contract-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  nestedFrame: true,
  flatFieldsRejected: true,
  explicitSeq: true,
  explicitChart: true,
  prunedSelection: ['request'],
}));
