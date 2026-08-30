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
  const log = await createDecisionLog(state, `semantic-map:proof:chart-composition:${definition.id}`);
  const view = Object.freeze({
    pattern: 'chart/1',
    chart: Object.freeze({ layers: Object.freeze([...definition.layers]) }),
  });
  const envelope = await createEnvelope(log.log, null, view);
  const url = await createSmapUrl(envelope, baseUrl);
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    source: definition.source.replace('../examples/', 'examples/'),
    records: state,
    view,
    url,
    relativeUrl: `/app${new URL(url).hash}`,
    urlChars: url.length,
    expectedMarks: definition.expectedMarks,
    expectedLineRelations: definition.expectedLineRelations,
  });
}

const children = await Promise.all([
  child({
    id: 'sales',
    title: '月次売上',
    source: '../examples/chart-composition/sales.jsonl',
    layers: ['bar-vertical/1'],
    expectedMarks: 4,
    expectedLineRelations: 0,
  }),
  child({
    id: 'active',
    title: '利用者推移',
    source: '../examples/chart-composition/active.jsonl',
    layers: ['line/1'],
    expectedMarks: 4,
    expectedLineRelations: 3,
  }),
  child({
    id: 'share',
    title: '構成比',
    source: '../examples/chart-composition/share.jsonl',
    layers: ['pie/1', 'donut/1'],
    expectedMarks: 8,
    expectedLineRelations: 0,
  }),
]);

const baseRecords = Object.freeze([
  Object.freeze({
    type: 'meta',
    schema: 'semantic-map-state/1',
    root: 'dashboard',
    title: '3 independent chart URLs',
  }),
  Object.freeze({
    type: 'region',
    id: 'dashboard',
    parent: null,
    label: '3 charts / 1 parent URL',
    kind: 'root',
    bounds: Object.freeze([0, 0, 1200, 900]),
    summary: 'JSONL末尾へchart URLをappendして合成',
  }),
]);

const placements = Object.freeze([
  Object.freeze({
    type: 'region',
    id: 'sales-panel',
    parent: 'dashboard',
    label: '月次売上',
    kind: 'module',
    bounds: Object.freeze([30, 70, 560, 350]),
    summary: 'child chart URL 1',
    mount: Object.freeze({ src: children[0].relativeUrl }),
  }),
  Object.freeze({
    type: 'region',
    id: 'active-panel',
    parent: 'dashboard',
    label: '利用者推移',
    kind: 'module',
    bounds: Object.freeze([610, 70, 560, 350]),
    summary: 'child chart URL 2',
    mount: Object.freeze({ src: children[1].relativeUrl }),
  }),
  Object.freeze({
    type: 'region',
    id: 'share-panel',
    parent: 'dashboard',
    label: '構成比',
    kind: 'module',
    bounds: Object.freeze([325, 470, 560, 350]),
    summary: 'child chart URL 3',
    mount: Object.freeze({ src: children[2].relativeUrl }),
  }),
]);

const parentView = Object.freeze({
  pattern: 'map/1',
  frame: Object.freeze({
    bbox: Object.freeze([0, 0, 1200, 900]),
    viewport: Object.freeze([1280, 900]),
  }),
});

const parents = [];
for (let count = 1; count <= placements.length; count += 1) {
  const state = Object.freeze([...baseRecords, ...placements.slice(0, count)]);
  const log = await createDecisionLog(state, `semantic-map:proof:chart-composition:parent:${count}`);
  const envelope = await createEnvelope(log.log, null, parentView);
  const url = await createSmapUrl(envelope, baseUrl);
  parents.push(Object.freeze({
    count,
    records: state,
    appendedRecord: placements[count - 1],
    view: parentView,
    url,
    urlChars: url.length,
  }));
}

console.log(JSON.stringify({
  schema: 'chart-url-composition-fixture/1',
  children,
  parents,
}));
