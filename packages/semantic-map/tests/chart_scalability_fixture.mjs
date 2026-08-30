import fs from 'node:fs/promises';

import { parseSemanticMapRecords } from '../domain/index.js';
import { createDecisionLog, createEnvelope } from '../protocol/index.js';
import { createSmapUrl } from '../transport/index.js';

const baseUrl = process.argv[2] ?? 'https://semantic.test/app';

async function records(path) {
  return parseSemanticMapRecords(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
}

async function child(definition) {
  const state = await records(definition.source);
  const log = await createDecisionLog(state, `semantic-map:proof:chart-scalability:${definition.id}`);
  const view = Object.freeze({ pattern: 'chart/1', chart: Object.freeze({ ...definition.chart }) });
  const envelope = await createEnvelope(log.log, null, view);
  const url = await createSmapUrl(envelope, baseUrl);
  return Object.freeze({
    ...definition,
    source: definition.source.replace('../examples/', 'examples/'),
    records: state,
    view,
    url,
    relativeUrl: `/app${new URL(url).hash}`,
    urlChars: url.length,
  });
}

const children = await Promise.all([
  child({
    id: 'scatter',
    title: '投入量と成果',
    source: '../examples/chart-scatter.jsonl',
    chart: { type: 'scatter/1' },
    expectedMarks: 4,
    expectedRegions: 5,
    expectedAxis: { type: 'scatter/1', xMinimum: 0, xMaximum: 9, maximum: 44 },
  }),
  child({
    id: 'heatmap',
    title: '拠点別時間帯アクセス',
    source: '../examples/chart-heatmap.jsonl',
    chart: { type: 'heatmap/1' },
    expectedMarks: 12,
    expectedRegions: 16,
    expectedAxis: { type: 'heatmap/1', rows: 3, columns: 4, minimum: 12, maximum: 72 },
  }),
]);

const parentRecords = Object.freeze([
  Object.freeze({
    type: 'meta', schema: 'semantic-map-state/1', root: 'dashboard', title: 'Scatter + heatmap scalability proof',
  }),
  Object.freeze({
    type: 'region', id: 'dashboard', parent: null, label: 'Scatter + heatmap', kind: 'root',
    bounds: Object.freeze([0, 0, 1240, 720]), summary: '異なるデータ形を同じ親URLへ合成',
  }),
  Object.freeze({
    type: 'region', id: 'scatter-panel', parent: 'dashboard', label: 'Scatter', kind: 'module',
    bounds: Object.freeze([20, 60, 590, 620]), summary: 'flat order + value child chart',
    mount: Object.freeze({ src: children[0].relativeUrl }),
  }),
  Object.freeze({
    type: 'region', id: 'heatmap-panel', parent: 'dashboard', label: 'Heatmap', kind: 'module',
    bounds: Object.freeze([630, 60, 590, 620]), summary: 'row to cell matrix child chart',
    mount: Object.freeze({ src: children[1].relativeUrl }),
  }),
]);
const parentView = Object.freeze({
  pattern: 'map/1',
  frame: Object.freeze({ bbox: Object.freeze([0, 0, 1240, 720]), viewport: Object.freeze([1280, 800]) }),
});
const parentLog = await createDecisionLog(parentRecords, 'semantic-map:proof:chart-scalability:parent');
const parentEnvelope = await createEnvelope(parentLog.log, null, parentView);
const parentUrl = await createSmapUrl(parentEnvelope, baseUrl);

console.log(JSON.stringify({
  schema: 'chart-scalability-fixture/1',
  children,
  parent: {
    records: parentRecords,
    view: parentView,
    url: parentUrl,
    urlChars: parentUrl.length,
  },
}));
