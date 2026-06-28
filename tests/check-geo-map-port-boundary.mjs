import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/a2ui-adapter-artifacts');
const registryText = fs.readFileSync(path.join(pkg, 'registry/shared-component-registry.v1.json'), 'utf8');
const portSource = fs.readFileSync(path.join(pkg, 'runtime/geo-map-port.js'), 'utf8');
const surfaceText = fs.readFileSync(path.join(pkg, 'a2ui/property-map.surface.v0.9.jsonl'), 'utf8');
const dataText = fs.readFileSync(path.join(pkg, 'data/property-map.data.clear.v0.9.jsonl'), 'utf8');
const buildSource = fs.readFileSync(path.join(pkg, 'scripts/build.mjs'), 'utf8');

for (const token of ['ui.shared-component-registry.v1', 'geoMap', 'GeoMapPort', 'atlasStage', 'property.select']) assert.ok(registryText.includes(token), token);
for (const token of ['"port":"geoMap"', '"action":"property.select"', '"itemsPath":"/properties"']) assert.ok(surfaceText.includes(token), token);
for (const token of ['"path":"/properties"', 'Kumagaya', 'Takasaki', 'Maebashi']) assert.ok(dataText.includes(token), token);
for (const token of ['this.L.map', 'this.L.tileLayer', 'this.L.marker', 'this.L.circle', 'this.L.polyline']) assert.ok(portSource.includes(token), token);

assert.equal(buildSource.includes('this.L.'), false);
assert.equal(surfaceText.includes('this.L.'), false);
assert.equal(surfaceText.includes('<script'), false);

console.log(JSON.stringify({status:'geo-map-port-boundary-check-pass', registry:'shared', port:'geoMap', mapLibraryBoundary:'runtime/geo-map-port.js'}, null, 2));
