import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const load = name => readFileSync(new URL(`../requirements/${name}`, import.meta.url), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const text = load('test-list.md');
const plan = JSON.parse(load('coverage-map.json'));
const baseline = JSON.parse(load('baseline.json'));
const readme = load('README.md');
const first = load('first-red.md');
const fixture = JSON.parse(load('fixtures/rc01.json'));

// Structural contract checks only. This does not execute the product scenarios.
export function checkPlan(source, mapping) {
  const rows = [...source.matchAll(/^\| ([A-Z]{2}-\d{2}) \|.*$/gm)];
  const ids = rows.map(row => row[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate scenario');
  assert.ok(ids.length > 0, 'no scenarios');
  for (const row of rows) {
    assert.equal(row[0].split('|').length, 7, `malformed scenario ${row[1]}`);
    assert.ok(row[0].split('|').slice(1, -1).every(cell => cell.trim()), 'empty field');
  }
  const counts = {};
  for (const id of ids) counts[id.split('-')[0]] = (counts[id.split('-')[0]] ?? 0) + 1;
  assert.deepEqual(counts, mapping.domains, 'domain denominator changed');
  const required = [...Array.from({ length: 11 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 9 }, (_, i) => `N${String(i + 1).padStart(2, '0')}`)];
  assert.deepEqual(Object.keys(mapping.requirements).sort(), required.sort(), 'missing DoD');
  for (const [id, requirement] of Object.entries(mapping.requirements)) {
    assert.ok(requirement.meaning && requirement.domains.length, `empty mapping ${id}`);
    for (const group of requirement.domains) assert.ok(counts[group], `unknown domain ${group}`);
  }
  assert.deepEqual(Object.keys(mapping.phases), Array.from({ length: 9 }, (_, i) => `P${i}`));
  const assigned = [];
  for (const [phase, entry] of Object.entries(mapping.phases)) {
    assert.ok(entry.owner && entry.scenarios.length, `empty phase ${phase}`);
    for (const dep of entry.dependsOn) {
      assert.ok(mapping.phases[dep] && Number(dep.slice(1)) < Number(phase.slice(1)), 'invalid phase dependency');
    }
    assigned.push(...entry.scenarios);
  }
  assert.equal(new Set(assigned).size, assigned.length, 'multiple primary owners');
  assert.deepEqual([...assigned].sort(), [...ids].sort(), 'unassigned or unknown scenario');
  assert.ok(mapping.phases.P1.scenarios.includes('RC-01'));
  return { scenarios: ids.length, domains: Object.keys(counts).length, requirements: required.length };
}

const result = checkPlan(text, plan);
assert.equal(hash(text), plan.testListSha256, 'unreviewed Test List change or copy error');
assert.match(baseline.sourceCommit, /^[0-9a-f]{40}$/);
assert.match(baseline.sourceTree, /^[0-9a-f]{40}$/);
assert.equal(baseline.sourceDocument.sha256, 'f94449ce041f78e821d8009bf5a1b91b6f026a00557afaae3b9f04d9d2ec5084');
for (let i = 1; i <= 8; i++) assert.ok(readme.includes(`Q0${i}`), `unowned Q0${i}`);
for (const phase of Object.keys(plan.phases)) assert.ok(readme.includes(phase), `no phase instructions ${phase}`);
for (const file of ['baseline.json', 'coverage-map.json', 'first-red.md', 'test-list.md']) assert.ok(readme.includes(file));
assert.ok(first.includes('reduceUiEvents') && first.includes('node --test tests/ui-207/rc01.test.mjs'));
assert.equal(fixture.events.length, 1);
assert.equal(fixture.events[0].definition.a2uiMessages[1].updateComponents.components[1].text, '案件A');
assert.equal(fixture.sources[0].value.title, '案件A');

// Negative controls prove that this checker rejects selected structural faults.
const broken = change => { const copy = structuredClone(plan); change(copy); return copy; };
assert.throws(() => checkPlan(text, broken(p => p.phases.P1.scenarios.pop())), /unassigned/);
assert.throws(() => checkPlan(text, broken(p => p.phases.P2.scenarios.push('RC-01'))), /multiple/);
assert.throws(() => checkPlan(text, broken(p => delete p.requirements.N09)), /missing DoD/);
assert.throws(() => checkPlan(text, broken(p => p.phases.P1.dependsOn.push('P8'))), /dependency/);
assert.throws(() => checkPlan(text.replace(/^\| RC-01 \|.*\n/m, ''), plan), /denominator/);
assert.throws(() => checkPlan(`${text}\n${text.match(/^\| RC-01 \|.*$/m)[0]}\n`, plan), /duplicate/);
console.log(JSON.stringify({ schema: 'ui-207-contract-structure/1', status: 'PASS', ...result,
  negativeControls: 6, productTestsExecuted: 0, semanticCoverage: 'REVIEW_REQUIRED', productDone: false }));
