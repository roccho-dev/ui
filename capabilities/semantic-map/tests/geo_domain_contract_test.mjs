import assert from 'node:assert/strict';
import { createSemanticMap } from '../domain/index.js';

const geoSpec = Object.freeze({
  schema: 'semantic-map-geo-spec/1',
  type: 'FeatureCollection',
  crs: 'OGC:CRS84',
  bbox: [138.0, 34.0, 139.0, 35.0],
  features: Object.freeze([Object.freeze({
    type: 'Feature',
    id: 'root',
    geometry: Object.freeze({ type: 'Point', coordinates: Object.freeze([138.5, 34.5]) }),
    properties: Object.freeze({ accuracyMeters: 10, sourceFeatureId: 'feature/root', derivation: 'source' }),
  })]),
  source: Object.freeze({ name: 'fixture', sha256: `sha256:${'0'.repeat(64)}`, license: '', attribution: '' }),
});
const domain = createSemanticMap([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Geo domain', geoSpec },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 100, 100], summary: '' },
]);
assert.deepEqual(domain.meta.geoSpec, geoSpec, 'MUTATION:drop-geospec-from-domain');

console.log(JSON.stringify({
  schema: 'semantic-map-geo-domain-contract-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  geoSpecPreserved: true,
}, null, 2));
