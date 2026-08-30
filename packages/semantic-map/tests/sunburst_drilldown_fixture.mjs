import fs from 'node:fs/promises';

import { parseSemanticMapRecords } from '../domain/index.js';
import { createDecisionLog, createEnvelope } from '../protocol/index.js';
import { createSmapUrl } from '../transport/index.js';

const baseUrl = process.argv[2] ?? 'https://semantic.test/app';
const records = parseSemanticMapRecords(
  await fs.readFile(new URL('../examples/chart-sunburst.jsonl', import.meta.url), 'utf8'),
);
const log = await createDecisionLog(records, 'semantic-map:proof:sunburst-drilldown');

async function invocation(focus = null) {
  const chart = focus === null
    ? Object.freeze({ type: 'sunburst/1' })
    : Object.freeze({ type: 'sunburst/1', focus });
  const view = Object.freeze({ pattern: 'chart/1', chart });
  const envelope = await createEnvelope(log.log, null, view);
  const url = await createSmapUrl(envelope, baseUrl);
  return Object.freeze({
    focus,
    view,
    url,
    relativeUrl: `/app${new URL(url).hash}`,
    urlChars: url.length,
  });
}

const initial = await invocation();
const product = await invocation('product');
const software = await invocation('software');

const parentRecords = Object.freeze([
  Object.freeze({
    type: 'meta', schema: 'semantic-map-state/1', root: 'dashboard', title: 'Sunburst URL composition proof',
  }),
  Object.freeze({
    type: 'region', id: 'dashboard', parent: null, label: '階層売上', kind: 'root',
    bounds: Object.freeze([0, 0, 1000, 720]), summary: 'sunburst/1 child URLを親URLへ配置',
  }),
  Object.freeze({
    type: 'region', id: 'sunburst-panel', parent: 'dashboard', label: '売上内訳', kind: 'module',
    bounds: Object.freeze([80, 40, 840, 640]), summary: 'read-only mounted sunburst',
    mount: Object.freeze({ src: initial.relativeUrl }),
  }),
]);
const parentView = Object.freeze({
  pattern: 'map/1',
  frame: Object.freeze({ bbox: Object.freeze([0, 0, 1000, 720]), viewport: Object.freeze([1000, 720]) }),
});
const parentLog = await createDecisionLog(parentRecords, 'semantic-map:proof:sunburst-drilldown:parent');
const parentEnvelope = await createEnvelope(parentLog.log, null, parentView);
const parentUrl = await createSmapUrl(parentEnvelope, baseUrl);

console.log(JSON.stringify({
  schema: 'sunburst-drilldown-fixture/1',
  records,
  invocations: { initial, product, software },
  expected: {
    initial: { focus: 'company', total: 100, sectors: 14, focusPath: ['company'] },
    product: { focus: 'product', total: 60, sectors: 8, focusPath: ['company', 'product'] },
    software: { focus: 'software', total: 40, sectors: 4, focusPath: ['company', 'product', 'software'] },
  },
  parent: {
    records: parentRecords,
    view: parentView,
    url: parentUrl,
    urlChars: parentUrl.length,
  },
}));
