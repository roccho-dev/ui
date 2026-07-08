import assert from 'node:assert/strict';
import { REPO_MAP_KINDS, makeRepoMapFixtureJsonl, makeLegacyRepoMapFixtureJsonl, parseJsonl, snapshotRecordsToCrudEvents, reduceModelGraph, projectGraph, normalizeRepoMapProjection } from '../packages/a2ui-adapter-artifacts/repo-map-svgpanzoom/src/core.mjs';

const stableRecords = parseJsonl(makeRepoMapFixtureJsonl());
assert.equal(stableRecords[0].kind, REPO_MAP_KINDS.policy);
assert.ok(stableRecords.some((record) => record.kind === REPO_MAP_KINDS.node));
assert.ok(stableRecords.some((record) => record.kind === REPO_MAP_KINDS.edge));

const graph = reduceModelGraph(snapshotRecordsToCrudEvents(stableRecords));
assert.equal(graph.kind, REPO_MAP_KINDS.world);
assert.equal(graph.contract.kind, 'ui.repoMap.contract.v1');
assert.equal(graph.contract.boundary, 'stable read model; renderer consumes only this projection boundary');
assert.equal(graph.authority.generatedArtifactsAreAuthority, false);
assert.equal(graph.authority.uiRepoIsStateStore, false);

const projection = projectGraph(graph, { z: 42, focusId: 'repo:repo-04' });
assert.equal(projection.kind, REPO_MAP_KINDS.projection);
assert.equal(projection.contract.readModelBoundary, true);
assert.equal(projection.authority.generatedArtifactsAreAuthority, false);
assert.ok(Array.isArray(projection.nodes));
assert.ok(Array.isArray(projection.edges));

const legacyGraph = reduceModelGraph(snapshotRecordsToCrudEvents(parseJsonl(makeLegacyRepoMapFixtureJsonl())));
assert.equal(legacyGraph.kind, REPO_MAP_KINDS.world);
assert.equal(legacyGraph.repos.length, graph.repos.length);
assert.equal(legacyGraph.packages.length, graph.packages.length);
assert.equal(legacyGraph.models.length, graph.models.length);

const normalizedLegacyProjection = normalizeRepoMapProjection({ ...projection, kind: 'projection.view.v1' });
assert.equal(normalizedLegacyProjection.kind, REPO_MAP_KINDS.projection);

console.log(JSON.stringify({ status: 'repo-map-stable-read-model-boundary-check-pass', graphKind: graph.kind, projectionKind: projection.kind }, null, 2));
