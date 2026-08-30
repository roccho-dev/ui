import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createArtifactInvocationRuntime } from '../../../packages/artifact-invocation/src/index.mjs';
import { projectDecisionPacket } from '../../../packages/decision-packet/projection/to-semantic-map.js';
import { buildRegistry } from '../scripts/build-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const capabilityRoot = path.join(appRoot, 'capabilities', 'render-decision-packet');
const registryOutput = path.join(appRoot, 'generated', 'capability-registry.mjs');
const registry = await buildRegistry({ capabilitiesRoot: path.join(appRoot, 'capabilities'), check: true, output: registryOutput });
const manifest = registry.manifests.find(item => item.id === 'render.decision-packet');
assert.ok(manifest, 'render.decision-packet manifest is missing');
assert.deepEqual(manifest.requires.services, ['ui.package.execute']);

let serviceCalls = 0;
const runtime = await createArtifactInvocationRuntime({
  engineBaseUrl: pathToFileURL(registryOutput).href,
  environment: { runtime: 'browser', features: ['crypto.subtle', 'dom', 'fetch'] },
  fetchEngine: async href => new Response(await fs.readFile(fileURLToPath(new URL(href))), { headers: { 'content-type': 'text/javascript' } }),
  manifests: registry.manifests,
  runtimeBuild: { digest: registry.runtimeBuild.digest, id: registry.runtimeBuild.id, version: registry.runtimeBuild.version },
  services: {
    'ui.package.execute': async ({ packageId, input }) => {
      assert.equal(packageId, 'decision-packet');
      const projected = await projectDecisionPacket(input.packet);
      serviceCalls += 1;
      return Object.freeze({
        schema: 'decision-packet-render-receipt/1',
        decisionId: projected.packet.decision_id,
        checkpointId: projected.packet.checkpoint_id,
        packetDigest: projected.packet.packet_digest,
        map: Object.freeze({ schema: 'semantic-map-render-receipt/1', pattern: projected.envelope.view.pattern }),
        source: Object.freeze({ contract: 'decision-packet/1', mode: 'test-service' }),
      });
    },
  },
});

const files = [...manifest.fixtures.pass.map(file => ['pass', file]), ...manifest.fixtures.destructive.map(file => ['destructive', file])];
const outcomes = [];
for (const [kind, relative] of files) {
  const fixture = JSON.parse(await fs.readFile(path.join(capabilityRoot, relative), 'utf8'));
  const outcome = await runtime.execute({ request: fixture.request });
  assert.equal(outcome.result.status, fixture.expected.status, fixture.id);
  assert.deepEqual(outcome.result.outputs.map(item => item.contract), fixture.expected.outputContracts, fixture.id);
  if (kind === 'pass') {
    assert.equal(outcome.manifest.id, 'render.decision-packet');
    assert.equal(outcome.result.outputs[0].value.schema, 'decision-packet-render-receipt/1');
    assert.equal(outcome.result.outputs[0].value.map.pattern, 'graph/1');
  }
  outcomes.push(Object.freeze({ id: fixture.id, kind, status: outcome.result.status }));
}
assert.equal(serviceCalls, manifest.fixtures.pass.length);
assert.deepEqual(runtime.loadedCapabilities(), ['render.decision-packet@1']);
console.log(JSON.stringify({ schema: 'decision-packet-capability-integration/1', status: 'PASS', fixtures: outcomes.length, serviceCalls, outcomes }));
