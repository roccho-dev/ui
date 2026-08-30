import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndProject, projectGovPackageRows } from './project.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(root, 'profile.jsonl');
const meaningPath = path.join(root, 'fixtures', 'packages.jsonl');
const sourceCommit = '6b20ba62e5b84de7549cc1df801af453dec03a38';
const rows = (await fs.readFile(meaningPath, 'utf8')).trim().split('\n').map(JSON.parse);
const profile = JSON.parse((await fs.readFile(profilePath, 'utf8')).trim());

const first = await loadAndProject({ meaningPath, profilePath, sourceCommit });
const reversed = projectGovPackageRows({ rows: [...rows].reverse(), profile, sourceCommit });
assert.deepEqual(first, reversed);
assert.equal(first.authority, false);
assert.equal(first.profileId, 'gov-package-output-map/1');
assert.equal(first.view.pattern, 'map/1');
assert.deepEqual(first.counts, { rows: 2, regions: 13, relations: 10 });
assert.equal(first.records[0].type, 'meta');
assert.deepEqual(first.records.filter(record => record.kind === 'package').map(record => record.label), ['modules', 'tools']);
assert(first.records.every(record => !('accepted' in record) && !('current' in record) && !('public' in record)));
assert.throws(
  () => projectGovPackageRows({ rows: [...rows, rows[0]], profile, sourceCommit }),
  /duplicate packageId/u,
);
assert.throws(
  () => projectGovPackageRows({ rows: [{ ...rows[0], surprise: true }], profile, sourceCommit }),
  /unknown fields/u,
);
for (const field of ['accepted', 'current', 'public']) {
  assert.throws(
    () => projectGovPackageRows({ rows: [{ ...rows[0], [field]: true }], profile, sourceCommit }),
    /unknown fields/u,
  );
}
assert.throws(
  () => projectGovPackageRows({ rows: [{ ...rows[0], kind: 'other' }], profile, sourceCommit }),
  /unsupported kind/u,
);
assert.throws(
  () => projectGovPackageRows({ rows, profile, sourceCommit: sourceCommit.slice(0, -1) }),
  /exact Git SHA/u,
);
assert.throws(
  () => projectGovPackageRows({ rows, profile, sourceCommit: sourceCommit.toUpperCase() }),
  /exact Git SHA/u,
);
assert.throws(
  () => projectGovPackageRows({ rows: [{ ...rows[0], repoId: 'roccho-dev' }], profile, sourceCommit }),
  /exact owner\/repository identity/u,
);
assert.throws(
  () => projectGovPackageRows({
    rows: [rows[0], { ...rows[1], repoId: 'other/governance' }],
    profile,
    sourceCommit,
  }),
  /one repository/u,
);
assert.throws(
  () => projectGovPackageRows({ rows, profile: { ...profile, authority: true }, sourceCommit }),
  /unsupported projection profile/u,
);
assert.throws(
  () => projectGovPackageRows({ rows, profile: { ...profile, generatedArtifactsAreAuthority: true }, sourceCommit }),
  /unsupported projection profile/u,
);
console.log('gov-package-output-profile-pass');
