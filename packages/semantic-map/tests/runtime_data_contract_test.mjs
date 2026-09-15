import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBusinessModelPresentationPayload } from '../../business-model/presentation.mjs';
import { parseBusinessModelRuntimeJsonl } from '../../business-model/runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from '../../business-model/semantic-map.mjs';
import { createSemanticMap } from '../domain/index.js';
import { validatePatternDomain } from '../pattern/index.js';
import { defaultViewForPattern } from '../protocol/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const previewCases = (await fs.readFile(path.join(repoRoot, 'apps/preview/cases.jsonl'), 'utf8'))
  .split(/\r?\n/u)
  .filter(Boolean)
  .map(line => JSON.parse(line));
const runtimeIds = ['graph', 'seq', 'presentation'];
const cases = runtimeIds.map(id => previewCases.find(item => item.id === id));
assert.equal(cases.every(Boolean), true, 'preview must declare graph, seq and presentation');
const sources = new Set(cases.map(item => item.source));
assert.equal(sources.size, 1, 'graph, seq and presentation must share one runtime-data source');
const source = cases[0].source;
const input = await fs.readFile(path.join(repoRoot, source), 'utf8');
const runtimeData = parseBusinessModelRuntimeJsonl(input);
assert.equal(runtimeData.schema, 'business-model-runtime-data/1');
assert.equal(runtimeData.model.sourceSchema, 'business-model-semantic-jsonl/2');
assert.equal(runtimeData.presentation.schema, 'business-model-presentation-a2ui/1');
assert.equal(runtimeData.presentation.a2ui.createSurface.sendDataModel, true);
assert.equal(runtimeData.semanticText.includes('"type":"presentation"'), false);
assert.equal(input.includes('"type":"presentation"'), true);

const records = projectBusinessModelSemanticMapRecords(runtimeData.model);
const domain = createSemanticMap(records);
const graphView = defaultViewForPattern('graph/1');
validatePatternDomain(domain, graphView.pattern, null);
const seqView = defaultViewForPattern('seq/1');
validatePatternDomain(domain, seqView.pattern, seqView.seq);
assert.equal(records.some(record => record.type === 'region' && record.temporal), true);
assert.equal(records.some(record => record.type === 'relation'), true);

const presentation = compileBusinessModelPresentationPayload(runtimeData);
assert.equal(presentation.schema, 'business-model-presentation-runtime-payload/1');
assert.equal(presentation.id, runtimeData.model.id);
assert.equal(presentation.sequence.sourceId, runtimeData.model.id);
assert.equal(Object.hasOwn(presentation, 'seqState'), false);
assert.equal(Object.hasOwn(presentation, 'mapState'), false);
assert.equal(Object.hasOwn(presentation, 'coverage'), false);
assert.deepEqual(presentation.sequence.stages[0].messages[0], runtimeData.presentation.a2ui);
assert.deepEqual(
  presentation.sequence.stages.map(stage => stage.id),
  runtimeData.model.stages.map(stage => stage.id),
);

console.log(JSON.stringify({
  schema: 'unified-runtime-data-contract-test/2',
  status: 'PASS',
  source,
  sourceId: runtimeData.model.id,
  runtimes: runtimeIds,
  semanticRecords: records.length,
  stages: presentation.sequence.stages.length,
  compiledViewData: false,
}));
