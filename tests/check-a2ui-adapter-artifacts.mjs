import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/a2ui-adapter-artifacts');

for (const file of ['registry.json','ports.json','requirements/live.json','a2ui/live-surface.json','data/live-input.json','scripts/build.mjs']) {
  assert.equal(fs.existsSync(path.join(pkg, file)), true, file);
}
assert.equal(fs.existsSync(path.join(pkg, 'requirements/purpose.json')), false, 'retired purpose requirement pack must not remain');
for (const generated of ['.generated','dist','preview','ci-artifacts']) assert.equal(fs.existsSync(path.join(pkg, generated)), false, `${generated} must not be tracked`);

const buildText = fs.readFileSync(path.join(pkg, 'scripts/build.mjs'), 'utf8');
assert.doesNotMatch(buildText, /\['live',\s*'purpose'\]/, 'builder must not include the retired purpose adapter in the build list');
assert.doesNotMatch(buildText, /function\s+purposeSource/, 'retired purpose source loader must not remain');
assert.doesNotMatch(buildText, /adapter\s*===\s*['"]purpose['"]/, 'retired purpose adapter branch must not remain');
assert.doesNotMatch(buildText, /purpose-atlas\.surface\.v0\.9\.jsonl/, 'retired purpose artifact source copy must not remain');

console.log(JSON.stringify({status:'a2ui-adapter-artifacts-retirement-static-check-pass'}, null, 2));
