import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapter as createGraphAdapter } from '../../../apps/artifact-shell/adapters/graph.mjs';
import { createAdapter as createPresentationAdapter } from '../../../apps/artifact-shell/adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../../../apps/artifact-shell/adapters/seq.mjs';
import { compileBusinessModelPresentationPayload } from '../../business-model/presentation.mjs';
import { parseBusinessModelRuntimeJsonl } from '../../business-model/runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from '../../business-model/semantic-map.mjs';
import { createSemanticMap } from '../domain/index.js';
import { validatePatternDomain } from '../pattern/index.js';
import { defaultViewForPattern } from '../protocol/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const adapters = [createGraphAdapter(), createSeqAdapter(), createPresentationAdapter()];
const sources = new Set(adapters.map(adapter => adapter.source));
assert.equal(sources.size, 1);
assert.equal(new Set(adapters.map(adapter => adapter.featureModule)).size, 1);
const source = adapters[0].source;
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
  schema: 'unified-runtime-data-contract-test/1',
  status: 'PASS',
  source,
  sourceId: runtimeData.model.id,
  runtimes: adapters.map(adapter => adapter.id),
  semanticRecords: records.length,
  stages: presentation.sequence.stages.length,
  compiledViewData: false,
}));
