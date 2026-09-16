import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFeature as getA2uiFeature } from '../../a2ui-browser/feature.mjs';
import { getFeature as getBusinessFeature } from '../../business-model/feature.mjs';
import { parseBusinessModelRuntimeJsonl } from '../../business-model/runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from '../../business-model/semantic-map.mjs';
import { compileBusinessModelPresentationPlan } from '../../presentation/compiler/profile.mjs';
import { derivePublicBusinessModelProjectionProfile } from '../../presentation/compiler/public-profile.mjs';
import { createSemanticMap } from '../domain/index.js';
import { validatePatternDomain } from '../pattern/index.js';
import { defaultViewForPattern } from '../protocol/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const graph = getBusinessFeature('graph');
const seq = getBusinessFeature('seq');
const presentation = getA2uiFeature('presentation');

assert.equal(graph.input, seq.input, 'Graph and Seq must share one semantic input group');
assert.equal(graph.input, 'presentation');
assert.deepEqual([...presentation.input], ['design', 'presentation']);
assert.ok(presentation.input.includes(graph.input), 'Presentation must consume the same semantic input');
assert.equal(graph.entry, seq.entry);
assert.equal(presentation.entry, 'packages/a2ui-browser/src/feature-app.mjs');

const sourceDir = path.join(repoRoot, 'examples', graph.input);
const jsonl = (await fs.readdir(sourceDir)).filter(name => name.endsWith('.jsonl'));
assert.deepEqual(jsonl, ['presentation.jsonl'], 'shared semantic input group must contain one JSONL');
const source = path.join('examples', graph.input, jsonl[0]);
const input = await fs.readFile(path.join(repoRoot, source), 'utf8');
const runtimeData = parseBusinessModelRuntimeJsonl(input);
assert.equal(runtimeData.schema, 'business-model-runtime-data/1');
assert.equal(runtimeData.model.sourceSchema, 'business-model-semantic-jsonl/2');
assert.equal(Object.hasOwn(runtimeData, 'presentation'), false, 'semantic runtime data must not own Presentation A2UI design');
assert.equal(input.includes('"type":"presentation"'), false);

const designPath = path.join('examples', 'presentation', 'design.json');
const design = JSON.parse(await fs.readFile(path.join(repoRoot, designPath), 'utf8'));
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
  schema: 'unified-runtime-data-contract-test/4',
  status: 'PASS',
  source,
  design: designPath,
  sourceId: runtimeData.model.id,
  runtimes: [graph.id, seq.id, presentation.id],
  semanticRecords: records.length,
  stages: plan.stageIds.length,
  presentationDesignData: true,
  previewRegistry: false,
}));
