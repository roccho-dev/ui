import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSemanticMapRecords } from '../domain/index.js';

const example = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8'));
const meta = example.find(record => record.type === 'meta');
const portal = example.find(record => record.type === 'region' && record.id === 'portal');
assert.equal(meta?.schema, 'semantic-map-state/1');
assert.equal(meta?.root, 'map');
assert.equal(example.filter(record => record.type === 'region').length, 11);
assert.equal(example.filter(record => record.type === 'relation').length, 6);
assert.ok(portal);
assert.equal(Object.hasOwn(portal, 'mount'), false, 'default example must not embed a transport-specific child source');
assert.equal(example.find(record => record.id === 'r1')?.label, '#data');

const packages = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/governance-scale-packages.jsonl', import.meta.url), 'utf8'));
assert.equal(
  packages.filter(record => record.type === 'region' && record.kind === 'package').length,
  225,
  'governance scale child keeps the 225-package semantic fixture',
);
assert.deepEqual(
  packages
    .filter(record => record.type === 'region' && record.parent === 'implementation-repos')
    .map(record => record.id),
  ['repo-ops', 'repo-feat-a', 'repo-feat-b'],
);

console.log(JSON.stringify({
  schema: 'semantic-map-example-fixture-test/2',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  defaultRegions: 11,
  defaultRelations: 6,
  defaultTransport: '#data',
  governancePackages: 225,
  generatedTransportFixture: false,
  currentOnly: true,
}, null, 2));
