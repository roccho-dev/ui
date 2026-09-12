import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { projectInternalOrganizationBundle } from './internal-organization-map-project.mjs';

const profile = JSON.parse(
  (await fs.readFile(new URL('./internal-organization-map-profile.jsonl', import.meta.url), 'utf8')).trim(),
);
const sourceDigest = `sha256:${'a'.repeat(64)}`;
const inputDigest = `sha256:${'b'.repeat(64)}`;
const semanticDigest = `sha256:${'c'.repeat(64)}`;
const roles = {
  contractGraph: 'contractGraph.current.v1',
  decisionImpact: 'decisionImpact.current.v1',
  evidenceState: 'evidenceState.current.v1',
  obligationState: 'obligationState.current.v1',
  responsibilityClosure: 'responsibilityClosure.current.v1',
  workCurrent: 'workLifecycle.current.v1',
};
const exactSha = 'd'.repeat(40);
const snapshots = [
  ['roccho-dev/adrs', 'authority', 'unknown', [], ['accepted-decision-ledger']],
  ['roccho-dev/governance', 'governance', 'observed', ['repo-governance'], ['repo-governance']],
  ['roccho-dev/hq', 'platform', 'unknown', [], ['transition-kernel']],
  ['roccho-dev/ops', 'factory', 'observed', ['artifact-assembly', 'gov-release-proxy'], ['source-observer']],
  ['roccho-dev/ui', 'renderer', 'observed', ['semantic-map', 'semantic-map-profiles'], ['control-surface-projector']],
  ['roccho-dev/edits', 'adapter', 'observed', ['core'], ['vim-intent-submit-adapter']],
  ['roccho-dev/diagrams', 'renderer', 'unknown', [], ['semantic-visual-roundtrip']],
  ['roccho-dev/envs', 'platform', 'unknown', [], ['local-control-runtime']],
].map(([repoId, repoClass, inventoryState, packages, requiredPackageExpectations]) => ({
  kind: 'organizationMap.repositorySnapshot.v1',
  id: `repo:${repoId}`,
  repoId,
  repoClass,
  packageRoot: 'packages',
  sourceRev: exactSha,
  sourceRef: `https://github.com/${repoId}/tree/${exactSha}`,
  inventoryState,
  status: 'observed',
  packages,
  packageCount: packages.length,
  requiredPackageExpectations,
  requiredPackageExpectationCount: requiredPackageExpectations.length,
  requiredContractRef: 'https://github.com/roccho-dev/adrs/issues/243',
  authority: false,
}));
const repositoryEntities = snapshots.map(snapshot => ({
  id: snapshot.id,
  entityKind: 'repository',
  repoId: snapshot.repoId,
  repoClass: snapshot.repoClass,
  sourceRev: snapshot.sourceRev,
  sourceRef: snapshot.sourceRef,
  inventoryState: snapshot.inventoryState,
  authority: false,
}));
const packageEntities = snapshots.flatMap(snapshot => snapshot.packages.map(packageId => ({
  id: `package:${snapshot.repoId}:${packageId}`,
  entityKind: 'package',
  repoId: snapshot.repoId,
  packageId,
  packagePath: `${snapshot.packageRoot}/${packageId}`,
  sourceRev: snapshot.sourceRev,
  sourceRef: `${snapshot.sourceRef}/${snapshot.packageRoot}/${packageId}`,
  status: 'observed',
  authority: false,
})));
const requirementEntities = snapshots.flatMap(snapshot => snapshot.requiredPackageExpectations.map(packageId => ({
  id: `requirement:${snapshot.repoId}:${packageId}`,
  entityKind: 'required-package-expectation',
  repoId: snapshot.repoId,
  packageId,
  contractRef: snapshot.requiredContractRef,
  contractState: 'proposed-target',
  status: snapshot.packages.includes(packageId) ? 'observed-match' : 'missing-or-unmatched',
  authority: false,
})));
const decision = {
  kind: 'organizationMap.decision.v1',
  id: 'decision:adrs:331',
  authority: false,
  decisionRef: 'https://github.com/roccho-dev/adrs/issues/331',
  sourceRef: 'https://github.com/roccho-dev/adrs/pull/332',
  acceptedCommit: exactSha,
  status: 'accepted',
  title: 'Internal Organization Semantic Map',
};
const obligation = {
  kind: 'organizationMap.obligation.v1',
  id: 'obligation:331:governance-bundle',
  authority: false,
  decisionId: decision.id,
  ownerRepoId: 'roccho-dev/governance',
  sourceRef: decision.decisionRef,
  status: 'complete',
  title: 'Build current organization bundle',
};
const work = {
  kind: 'organizationMap.work.v1',
  id: 'work:331:ops',
  authority: false,
  repoId: 'roccho-dev/ops',
  sourceRef: 'https://github.com/roccho-dev/ops/pull/364',
  status: 'pending',
};
const closures = snapshots.map(snapshot => ({
  id: `closure:repo:${snapshot.repoId}`,
  repoId: snapshot.repoId,
  inventoryState: snapshot.inventoryState,
  observedPackageCount: snapshot.packageCount,
  requiredExpectationCount: snapshot.requiredPackageExpectationCount,
  status: snapshot.inventoryState === 'observed' ? 'observed' : 'unknown',
  authority: false,
}));
const evidences = snapshots.map(snapshot => ({
  id: `evidence:repo:${snapshot.repoId}`,
  repoId: snapshot.repoId,
  sourceRev: snapshot.sourceRev,
  sourceRef: snapshot.sourceRef,
  status: 'readback',
  authority: false,
}));
const states = {
  contractGraph: {
    kind: roles.contractGraph,
    authority: false,
    sourceDigest,
    repositories: snapshots,
    entities: [...repositoryEntities, ...packageEntities, ...requirementEntities],
    spines: [{
      kind: 'organizationMap.factorySpine.v1',
      id: 'spine:331:test',
      steps: [
        { from: decision.id, to: obligation.id, label: 'requires' },
        { from: obligation.id, to: 'requirement:roccho-dev/governance:repo-governance', label: 'requires' },
        { from: 'requirement:roccho-dev/governance:repo-governance', to: 'package:roccho-dev/governance:repo-governance', label: 'matches' },
      ],
    }],
  },
  decisionImpact: {
    kind: roles.decisionImpact,
    authority: false,
    sourceDigest,
    decisions: [decision],
    obligations: [obligation],
  },
  evidenceState: {
    kind: roles.evidenceState,
    authority: false,
    sourceDigest,
    rows: evidences,
  },
  obligationState: {
    kind: roles.obligationState,
    authority: false,
    sourceDigest,
    rows: [obligation],
  },
  responsibilityClosure: {
    kind: roles.responsibilityClosure,
    authority: false,
    sourceDigest,
    rows: closures,
  },
  workCurrent: {
    kind: roles.workCurrent,
    authority: false,
    sourceDigest,
    rows: [work],
  },
};
const bundle = {
  kind: 'controlSurface.bundle.v1',
  authority: false,
  decisionRef: 'https://github.com/roccho-dev/adrs/issues/331',
  inputDigest,
  semanticDigest,
  inputs: Object.entries(roles).map(([role, kind]) => ({
    role,
    kind,
    sourceRef: `fixture://${role}@rev-1`,
    digest: `sha256:${'0'.repeat(64)}`,
  })),
  states,
};

const projected = projectInternalOrganizationBundle({ bundle, profile });
const reordered = projectInternalOrganizationBundle({
  bundle: {
    ...bundle,
    inputs: [...bundle.inputs].reverse(),
    states: Object.fromEntries(Object.entries(bundle.states).reverse()),
  },
  profile,
});
assert.deepEqual(projected, reordered);
assert.equal(projected.authority, false);
assert.equal(projected.profileId, 'internal-organization-map/1');
assert.equal(projected.view.pattern, 'map/1');
assert.deepEqual(projected.counts, {
  repositories: 8,
  packages: 6,
  requirements: 8,
  inventoryUnknown: 4,
  unresolvedRequirements: 7,
  events: 11,
  regions: 59,
  relations: 33,
});
const regions = new Map(projected.records.filter(row => row.type === 'region').map(row => [row.id, row]));
const relations = projected.records.filter(row => row.type === 'relation');
for (const id of [
  profile.root.id,
  'repo:roccho-dev/ops',
  'package:roccho-dev/ops:artifact-assembly',
  'requirement:roccho-dev/governance:repo-governance',
  'finding:roccho-dev/adrs:inventory-unknown',
  'finding:requirement:roccho-dev/ops:source-observer',
  decision.id,
  obligation.id,
  work.id,
  'evidence:repo:roccho-dev/ui',
]) assert.ok(regions.has(id), id);
assert.equal(regions.get('package:roccho-dev/ops:artifact-assembly').label, 'artifact-assembly');
assert.match(regions.get('requirement:roccho-dev/ops:source-observer').label, /MISSING-OR-UNMATCHED/u);
assert.match(regions.get('finding:roccho-dev/adrs:inventory-unknown').label, /UNKNOWN/u);
assert(relations.some(row => row.kind === 'matches'));
assert(relations.every(row => regions.has(row.from) && regions.has(row.to)));
assert(projected.records.filter(row => row.temporal).every(row => regions.has(row.temporal.actor)));
assert.equal(projected.input.semanticDigest, semanticDigest);
assert.equal(projected.input.sourceDigest, sourceDigest);

for (const mutate of [
  value => { value.authority = true; },
  value => { value.states.contractGraph.repositories.push(value.states.contractGraph.repositories[0]); },
  value => { value.states.contractGraph.spines[0].steps[0].from = 'missing'; },
  value => { value.states.contractGraph.repositories[0].packageCount = 99; },
  value => { value.states.contractGraph.entities.find(row => row.entityKind === 'required-package-expectation').entityKind = 'requirement'; },
  value => {
    delete value.states.evidenceState;
    value.inputs = value.inputs.filter(row => row.role !== 'evidenceState');
  },
  value => { value.states.workCurrent.sourceDigest = `sha256:${'e'.repeat(64)}`; },
]) {
  const broken = structuredClone(bundle);
  mutate(broken);
  assert.throws(() => projectInternalOrganizationBundle({ bundle: broken, profile }));
}

console.log(JSON.stringify({ status: 'PASS', profileId: projected.profileId, ...projected.counts }));
