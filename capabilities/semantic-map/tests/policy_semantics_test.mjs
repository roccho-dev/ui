import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';

function load(name) {
  return parseSemanticMapRecords(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
}

const concepts = load('policy-concepts.jsonl');
const purchase = load('policy-purchase-approval.jsonl');
const conceptDomain = createSemanticMap(concepts);
const purchaseDomain = createSemanticMap(purchase);
assert.equal(conceptDomain.regions.get(conceptDomain.meta.root).kind, 'policy-model/1');
assert.equal(purchaseDomain.regions.get(purchaseDomain.meta.root).kind, 'policy-model/1');
assert.equal(conceptDomain.relations.length, 5);
assert.equal(purchaseDomain.relations.length, 13);

function mutated(records, mutate) {
  const result = structuredClone(records);
  mutate(result);
  return result;
}

assert.throws(
  () => createSemanticMap(mutated(concepts, (records) => {
    records.find((record) => record.id === 'rule').parent = 'policy-model';
  })),
  /rule must be contained by policy/u,
  'MUTATION:bypass-policy-validation',
);
assert.throws(
  () => createSemanticMap(mutated(concepts, (records) => {
    records.find((record) => record.id === 'condition').kind = 'unknown-policy-kind';
  })),
  /is not a policy-model node kind/u,
);
assert.throws(
  () => createSemanticMap(mutated(concepts, (records) => {
    const relation = records.find((record) => record.id === 'subject-holds-role');
    relation.from = 'role';
    relation.to = 'subject';
  })),
  /must connect subject -> role/u,
);
assert.throws(
  () => createSemanticMap(mutated(concepts, (records) => {
    records.find((record) => record.id === 'effect-requires-role').kind = 'unknownRelation';
  })),
  /is not a policy-model relation kind/u,
);

const ordinary = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Ordinary map' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'region', id: 'node', parent: 'root', label: 'Node', kind: 'unknown-policy-kind', bounds: [10, 10, 24, 18], summary: '' },
];
assert.equal(createSemanticMap(ordinary).regions.get('node').kind, 'unknown-policy-kind', 'policy rules must activate only by root kind');

console.log(JSON.stringify({
  schema: 'semantic-map-policy-semantics-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  examples: { concepts: conceptDomain.regions.size, purchase: purchaseDomain.regions.size },
  activation: 'root-kind:policy-model/1',
  negativeCases: 4,
}, null, 2));
