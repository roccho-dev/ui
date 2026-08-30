import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { projectGovPackageOutput } from './project.mjs';

const fixtureRows = [
  {
    kind: 'govPackageOutput.v1',
    repoId: 'roccho-dev/governance',
    repoClass: 'governance',
    owner: 'governance',
    finalGateTarget: 'gov-final-scope-purpose-join',
    status: 'not-applicable',
    sourceRef: 'governance/docs/gov-package-output/repo.json',
    authority: false,
  },
  {
    kind: 'govPackageOutput.v1',
    repoId: 'roccho-dev/ops',
    repoClass: 'factory',
    owner: 'ops',
    finalGateTarget: 'gov-final-scope-purpose-join',
    status: 'active',
    sourceRef: 'ops/docs/gov-package-output/repo.json',
    authority: false,
  },
];
const profile = {
  schema: 'ui.semanticMapProjectionProfile/1',
  profileId: 'gov-package-output-map/1',
  authority: false,
  input: {
    kind: 'govPackageOutput.v1',
    repositoryKey: 'repoId',
    requiredFields: [
      'kind',
      'repoId',
      'repoClass',
      'owner',
      'finalGateTarget',
      'status',
      'sourceRef',
      'authority',
    ],
    expectedRepos: ['roccho-dev/governance', 'roccho-dev/ops'],
  },
  map: {
    root: {
      id: 'gov-package-output-map',
      label: 'gov package output',
      kind: 'root',
      bounds: [0, 0, 1400, 800],
    },
    repoOrder: ['roccho-dev/governance', 'roccho-dev/ops'],
    regionBounds: {
      'roccho-dev/governance': [80, 120, 560, 520],
      'roccho-dev/ops': [760, 120, 560, 520],
    },
    relation: {
      from: 'roccho-dev/governance',
      to: 'roccho-dev/ops',
      kind: 'governs',
      label: 'governs',
    },
  },
  view: {
    pattern: 'map/1',
    frame: { bbox: [0, 0, 1400, 800], viewport: [1440, 900] },
  },
  generatedArtifactsAreAuthority: false,
};
const projected = projectGovPackageOutput({ rows: fixtureRows, profile });
assert.equal(projected.profileId, 'gov-package-output-map/1');
assert.equal(projected.authority, false);
assert.equal(projected.records.length, 4);
assert.equal(projected.records[0].type, 'meta');
assert.equal(projected.records[1].id, 'roccho-dev/governance');
assert.equal(projected.records[2].id, 'roccho-dev/ops');
assert.equal(projected.records[3].type, 'relation');
assert.equal(projected.records[3].from, 'roccho-dev/governance');
assert.equal(projected.records[3].to, 'roccho-dev/ops');
assert.equal(projected.view.pattern, 'map/1');
assert.equal(projected.inputDigest.length, 64);
assert.equal(projected.profileDigest.length, 64);
assert.equal(Object.isFrozen(projected.records), true);
assert.equal(Object.isFrozen(projected.records[1]), true);
assert.deepEqual(fixtureRows.map(row => row.authority), [false, false]);

const reversed = projectGovPackageOutput({
  rows: [...fixtureRows].reverse(),
  profile,
});
assert.deepEqual(projected.records, reversed.records);
assert.equal(projected.inputDigest, reversed.inputDigest);

const originalDigest = projected.inputDigest;
const changed = projectGovPackageOutput({
  rows: fixtureRows.map(row =>
    row.repoId === 'roccho-dev/ops' ? { ...row, status: 'blocked' } : row,
  ),
  profile,
});
assert.notEqual(changed.inputDigest, originalDigest);

for (const invalid of [
  fixtureRows.slice(0, 1),
  [...fixtureRows, fixtureRows[1]],
  fixtureRows.map(row => ({ ...row, authority: true })),
]) {
  assert.throws(
    () => projectGovPackageOutput({ rows: invalid, profile }),
    /(?:exactly|duplicate|authority=false)/u,
  );
}
assert.throws(
  () => projectGovPackageOutput({
    rows: fixtureRows,
    profile: { ...profile, authority: true },
  }),
  /unsupported projection profile/u,
);
console.log('gov-package-output-profile-pass');
await import('./internal-organization-map-check.mjs');
