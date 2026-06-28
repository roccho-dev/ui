import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'packages/a2ui-adapter-artifacts');
const registry = JSON.parse(fs.readFileSync(path.join(pkg, 'registry/shared-component-registry.v1.json'), 'utf8'));
const portSource = fs.readFileSync(path.join(pkg, 'runtime/geo-map-port.js'), 'utf8');
const surfaceRows = fs.readFileSync(path.join(pkg, 'a2ui/property-map.surface.v0.9.jsonl'), 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
const dataRows = fs.readFileSync(path.join(pkg, 'data/property-map.data.clear.v0.9.jsonl'), 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
const buildSource = fs.readFileSync(path.join(pkg, 'scripts/build.mjs'), 'utf8');

assert.equal(registry.kind, 'ui.shared-component-registry.v1');
assert.ok(registry.components.some((item) => item.id === 'port'));
assert.ok(registry.ports.some((item) => item.id === 'geoMap' && item.implementation === 'GeoMapPort'));
assert.ok(registry.ports.some((item) => item.id === 'atlasStage'));
assert.ok(registry.actions.includes('property.select'));

const update = surfaceRows.find((row) => row.updateComponents);
const component = update.updateComponents.components.find((item) => item.id === 'root');
const document = component.document;
const ports = collect(document, 'port');
const actions = collect(document, 'action');
assert.ok(ports.includes('geoMap'));
assert.ok(actions.includes('property.select'));
assert.equal(document.tree.children[0].port, 'geoMap');
assert.equal(hasRawHtml(document), false);

const propertiesRow = dataRows.find((row) => row.updateDataModel?.path === '/properties');
assert.ok(Array.isArray(propertiesRow.updateDataModel.value));
assert.ok(propertiesRow.updateDataModel.value.length >= 3);
assert.ok(dataRows.some((row) => row.updateDataModel?.path === '/ui'));

for (const token of ['this.L.map', 'this.L.tileLayer', 'this.L.marker', 'this.L.circle', 'this.L.polyline']) assert.ok(portSource.includes(token), token);
assert.equal(buildSource.includes('GeoMapPort'), false);
assert.equal(buildSource.includes('this.L.'), false);
assert.equal(fs.readFileSync(path.join(pkg, 'a2ui/property-map.surface.v0.9.jsonl'), 'utf8').includes('this.L.'), false);

console.log(JSON.stringify({status:'geo-map-port-boundary-check-pass', ports, actions, propertyCount: propertiesRow.updateDataModel.value.length}, null, 2));

function collect(value, key, out = []) {
  if (Array.isArray(value)) for (const item of value) collect(item, key, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (k === key && typeof v === 'string') out.push(v);
    collect(v, key, out);
  }
  return out;
}
function hasRawHtml(value) {
  if (typeof value === 'string') return /<\/?[a-z][^>]*>/i.test(value);
  if (Array.isArray(value)) return value.some(hasRawHtml);
  if (value && typeof value === 'object') return Object.values(value).some(hasRawHtml);
  return false;
}
