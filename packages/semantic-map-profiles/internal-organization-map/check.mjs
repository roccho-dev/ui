import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { projectInternalOrganizationBundle } from './project.mjs';

const profile = JSON.parse(
  (await fs.readFile(new URL('./profile.jsonl', import.meta.url), 'utf8')).trim(),
);
const digest = `sha256:${'a'.repeat(64)}`;
const sourceKinds = {
  contractGraph: 'contractGraph.current.v1',
  decisionImpact: 'decisionImpact.current.v1',
  evidenceState: 'evidenceState.current.v1',
  obligationState: 'obligationState.current.v1',
  responsibilityClosure: 'responsibilityClosure.current.v1',
  workCurrent: 'workLifecycle.current.v1',
};
const source = role => ({
  role,
  kind: sourceKinds[role],
  sourceRef: `fixture://${role}@rev-1`,
  digest,
});
const repository = (repoId, packageNames, inventoryState = 'observed') => ({
  kind: 'organizationMap.repositorySnapshot.v1',
  id: `repo:${repoId}`,
  repoId,
  repoClass: repoId.endsWith('/ops') ? 'factory' : 'renderer',
  packageRoot: 'packages',
  sourceRev: 'b'.repeat(40),
  sourceRef: `https://github.com/${repoId}/tree/${'b'.repeat(40)}`,
  inventoryState,
  status: 'observed',
  packages: packageNames,
  packageCount: packageNames.length,
  requiredPackageExpectations: ['required-package'],
  requiredPackageExpectationCount: 1,
  requiredContractRef: 'https://github.com/roccho-dev/adrs/issues/243',
  authority: false,
});
const repositories = [
  repository('roccho-dev/adrs', [], 'unknown'),
  repository('roccho-dev/ops', ['artifact-assembly']),
  repository('roccho-dev/ui', [], 'unknown'),
];
const entities = [
  {
    kind: 'organizationMap.entity.v1',
    id: 'package:roccho-dev/ops:artifact-assembly',
    entityKind: 'package',
    repoId: 'roccho-dev/ops',
    label: 'artifact-assembly',
    path: 'packages/artifact-assembly',
    status: 'observed',
    sourceRef: repositories[1].sourceRef,
    authority: false,
  },
  {
    kind: 'organizationMap.entity.v1',
    id: 'requirement:roccho-dev/ui:required-package',
    entityKind: 'requirement',
    repoId: 'roccho-dev/ui',
    label: 'required-package',
    contractRef: 'https://github.com/roccho-dev/adrs/issues/243',
    status: 'required',
    authority: false,
  },
];
const bundle = {
  kind: 'controlSurface.bundle.v1',
  authority: false,
  decisionRef: 'https://github.com/roccho-dev/adrs/issues/331',
  inputDigest: digest,
  semanticDigest: digest,
  inputs: Object.keys(sourceKinds).map(source),
  states: {
    contractGraph: {
      kind: 'contractGraph.current.v1',
      authority: false,
      repositories,
      entities,
      spines: [
        {
          kind: 'organizationMap.factorySpine.v1',
          id: 'spine:331:test',
          steps: [
            {
              from: 'decision:adrs:331',
              to: 'obligation:331:ops-staging',
              label: 'requires',
            },
            {
              from: 'obligation:331:ops-staging',
              to: 'package:roccho-dev/ops:artifact-assembly',
              label: 'feeds',
            },
          ],
        },
      ],
    },
    decisionImpact: {
      kind: 'decisionImpact.current.v1',
      authority: false,
      decisions: [
        {
          kind: 'organizationMap.decision.v1',
          id: 'decision:adrs:331',
          title: 'Internal Organization Semantic Map',
          status: 'accepted',
          decisionRef: 'https://github.com/roccho-dev/adrs/issues/331',
          sourceRef: 'https://github.com/roccho-dev/adrs/pull/332',
          authority: false,
        },
      ],
      obligations: [],
    },
    obligationState: {
      kind: 'obligationState.current.v1',
      authority: false,
      rows: [
        {
          kind: 'organizationMap.obligation.v1',
          id: 'obligation:331:ops-staging',
          decisionId: 'decision:adrs:331',
          ownerRepoId: 'roccho-dev/ops',
          title: 'Deploy staging map',
          status: 'pending',
          sourceRef: 'https://github.com/roccho-dev/adrs/issues/331',
          authority: false,
        },
      ],
    },
    workCurrent: {
      kind: 'workLifecycle.current.v1',
      authority: false,
      rows: [
        {
          kind: 'organizationMap.work.v1',
          id: 'work:331:ops',
          repoId: 'roccho-dev/ops',
          status: 'pending',
          sourceRef: 'https://github.com/roccho-dev/ops/pull/360',
          authority: false,
        },
      ],
    },
    responsibilityClosure: {
      kind: 'responsibilityClosure.current.v1',
      authority: false,
      rows: [
        {
          kind: 'organizationMap.responsibilityClosure.v1',
          id: 'closure:roccho-dev/ui:required-package',
          repoId: 'roccho-dev/ui',
          expectation: 'required-package',
          status: 'unknown',
          matchedPackageIds: [],
          inventoryState: 'unknown',
          authority: false,
        },
      ],
    },
    evidenceState: {
      kind: 'evidenceState.current.v1',
      authority: false,
      rows: [],
    },
  },
};

const projected = projectInternalOrganizationBundle({ bundle, profile });
assert.equal(projected.profileId, 'internal-organization-map/1');
assert.equal(projected.authority, false);
assert.equal(projected.counts.repositories, 3);
assert.equal(projected.counts.packages, 1);
assert.equal(projected.counts.requirements, 1);
assert.equal(projected.counts.unresolvedClosures, 1);
assert.equal(projected.view.pattern, 'map/1');
const regions = new Map(
  projected.records
    .filter(row => row.type === 'region')
    .map(row => [row.id, row]),
);
const relations = new Map(
  projected.records
    .filter(row => row.type === 'relation')
    .map(row => [row.id, row]),
);
for (const id of [
  'organization:roccho-dev:control-surface',
  'repo:roccho-dev/adrs',
  'repo:roccho-dev/ops',
  'repo:roccho-dev/ui',
  'package:roccho-dev/ops:artifact-assembly',
  'requirement:roccho-dev/ui:required-package',
  'closure:roccho-dev/ui:required-package',
  'decision:adrs:331',
  'obligation:331:ops-staging',
]) {
  assert.ok(regions.has(id), id);
}
assert.ok(
  [...regions.values()].some(row =>
    row.label.includes('[UNKNOWN] package inventory'),
  ),
);
assert.ok(relations.has('spine:spine:331:test:0'));
assert.ok(relations.has('spine:spine:331:test:1'));
assert.ok(
  [...relations.values()].every(
    row => regions.has(row.from) && regions.has(row.to),
  ),
);
assert.ok(
  projected.records
    .filter(row => row.temporal)
    .every(row => regions.has(row.temporal.actor)),
);
assert.equal(projected.input.semanticDigest, digest);

for (const mutate of [
  value => {
    value.authority = true;
  },
  value => {
    value.states.contractGraph.repositories.push(
      value.states.contractGraph.repositories[0],
    );
  },
  value => {
    value.states.contractGraph.spines[0].steps[0].from = 'missing';
  },
  value => {
    value.states.contractGraph.repositories[0].packageCount = 99;
  },
  value => {
    delete value.states.evidenceState;
    value.inputs = value.inputs.filter(row => row.role !== 'evidenceState');
  },
]) {
  const broken = structuredClone(bundle);
  mutate(broken);
  assert.throws(() =>
    projectInternalOrganizationBundle({ bundle: broken, profile }),
  );
}

console.log(
  JSON.stringify({
    status: 'PASS',
    profileId: projected.profileId,
    ...projected.counts,
  }),
);
