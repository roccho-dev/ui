import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseSemanticMapRecords } from '../domain/index.js';
import { readSmapHash } from '../transport/index.js';

const exampleUrl = new URL('../examples/example.jsonl', import.meta.url);
const governanceUrl = new URL('../examples/governance-scale.jsonl', import.meta.url);
const before = readFileSync(exampleUrl);
const governanceBefore = readFileSync(governanceUrl);
execFileSync(process.execPath, ['scripts/regenerate_example.mjs'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
});
const after = readFileSync(exampleUrl);
const governanceAfter = readFileSync(governanceUrl);
assert.deepEqual(after, before, 'committed example must equal deterministic regeneration');
assert.deepEqual(
  governanceAfter,
  governanceBefore,
  'committed governance example must equal deterministic regeneration',
);

const records = after.toString('utf8').split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const portal = records.find((record) => record.type === 'region' && record.id === 'portal');
assert.ok(portal?.mount?.src?.startsWith('/app#smap='));
const decoded = await readSmapHash(portal.mount.src);
assert.equal(decoded.envelope.schema, 'semantic-map-envelope/3');
assert.equal(decoded.envelope.proposal, null);
assert.deepEqual(decoded.envelope.view, {
  pattern: 'seq/1',
  seq: { axis: 'ordinal', groupBy: 'actor' },
});

const governanceRecords = parseSemanticMapRecords(
  governanceAfter,
);
const implementation = governanceRecords.find(
  (record) => record.type === 'region' && record.id === 'implementation',
);
assert.ok(implementation?.mount?.src?.startsWith('/app#smap='));
const governanceChild = await readSmapHash(implementation.mount.src);
assert.equal(governanceChild.envelope.proposal, null);
assert.deepEqual(governanceChild.envelope.view, { pattern: 'graph/1' });
assert.equal(governanceChild.base.mapId, 'semantic-map:proof:all-repos');
assert.equal(
  governanceChild.base.records.filter((record) => record.type === 'region' && record.kind === 'package').length,
  225,
);
assert.deepEqual(
  governanceChild.base.records
    .filter((record) => record.type === 'region' && record.parent === 'implementation-repos')
    .map((record) => record.id),
  ['repo-ops', 'repo-feat-a', 'repo-feat-b'],
);

console.log(JSON.stringify({
  schema: 'semantic-map-example-fixture-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  childHead: decoded.base.head,
  childUrlChars: portal.mount.src.length,
  governancePackages: 225,
  governanceChildUrlChars: implementation.mount.src.length,
  currentOnly: true,
}, null, 2));
