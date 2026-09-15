import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapter as createGraphAdapter } from '../../../apps/artifact-shell/adapters/graph.mjs';
import { createAdapter as createPresentationAdapter } from '../../../apps/artifact-shell/adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../../../apps/artifact-shell/adapters/seq.mjs';
import { parseBusinessModelRuntimeJsonl } from '../../business-model/runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from '../../business-model/semantic-map.mjs';
import { compileBusinessModelPresentationPlan } from '../../presentation/compiler/profile.mjs';
import { derivePublicBusinessModelProjectionProfile } from '../../presentation/compiler/public-profile.mjs';
import { createSemanticMap } from '../domain/index.js';
import { validatePatternDomain } from '../pattern/index.js';
import { defaultViewForPattern } from '../protocol/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const graph = createGraphAdapter();
const seq = createSeqAdapter();
const presentation = createPresentationAdapter();
assert.equal(graph.source, seq.source, 'Graph and Seq must share one semantic JSONL');
assert.equal(presentation.source.presentation, graph.source, 'Presentation must consume the same semantic JSONL');
assert.equal(typeof presentation.source.design, 'string');
assert.equal(graph.featureModule, seq.featureModule);
assert.notEqual(presentation.featureModule, graph.featureModule, 'Presentation UI must use the common A2UI app entry');

const source = graph.source;
const input = await fs.readFile(path.join(repoRoot, source), 'utf8');
const runtimeData = parseBusinessModelRuntimeJsonl(input);
assert.equal(runtimeData.schema, 'business-model-runtime-data/1');
assert.equal(runtimeData.model.sourceSchema, 'business-model-semantic-jsonl/2');
assert.equal(Object.hasOwn(runtimeData, 'presentation'), false, 'business-model runtime data must not own Presentation A2UI design');
assert.equal(input.includes('"type":"presentation"'), false);

const design = JSON.parse(await fs.readFile(path.join(repoRoot, presentation.source.design), 'utf8'));
assert.equal(design.schema, 'ui-a2ui-app-design/1');
assert.equal(design.app, 'presentation');
assert.equal(design.profileId, 'business-model/1');
assert.equal(design.messages[0].createSurface.sendDataModel, true);

const records = projectBusinessModelSemanticMapRecords(runtimeData.model);
const domain = createSemanticMap(records);
const graphView = defaultViewForPattern('graph/1');
validatePatternDomain(domain, graphView.pattern, null);
const seqView = defaultViewForPattern('seq/1');
validatePatternDomain(domain, seqView.pattern, seqView.seq);
assert.equal(records.some(record => record.type === 'region' && record.temporal), true);
assert.equal(records.some(record => record.type === 'relation'), true);

const profile = derivePublicBusinessModelProjectionProfile(runtimeData.model);
assert.equal(profile.id, design.profileId);
const plan = compileBusinessModelPresentationPlan(runtimeData.model, profile);
assert.equal(plan.modelId, runtimeData.model.id);
assert.deepEqual(plan.stageIds, runtimeData.model.stages.map(stage => stage.id));

console.log(JSON.stringify({
  schema: 'unified-runtime-data-contract-test/2',
  status: 'PASS',
  source,
  design: presentation.source.design,
  sourceId: runtimeData.model.id,
  runtimes: [graph.id, seq.id, presentation.id],
  semanticRecords: records.length,
  stages: plan.stageIds.length,
  presentationDesignData: true,
}));
