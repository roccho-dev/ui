import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSemanticMap } from '../domain/index.js';
import { SemanticProjector } from '../projection/index.js';
import { readSmapHash } from '../transport/index.js';

function load(relative) {
  return JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

function metaFrom(inspection) {
  const meta = inspection.base.records[0];
  assert.equal(meta.type, 'meta');
  assert.equal(meta.geoSpec.schema, 'semantic-map-geo-spec/1');
  assert.equal(meta.geoSpec.type, 'FeatureCollection');
  assert.equal(meta.geoSpec.crs, 'OGC:CRS84');
  return meta;
}

const pointProof = load('../examples/geo-proof.json');
const pointInspection = await readSmapHash(pointProof.childSource);
const pointMeta = metaFrom(pointInspection);
assert.deepEqual(pointMeta.geoSpec.bbox, [138.3682, 34.9631, 138.3944, 34.9792]);
assert.deepEqual(
  Object.fromEntries(pointMeta.geoSpec.features.map((feature) => [feature.id, feature.geometry.coordinates])),
  {
    base: [138.3831, 34.9717],
    'north-east': [138.3944, 34.9792],
    'south-east': [138.3923, 34.9631],
    west: [138.3682, 34.9701],
  },
);
assert.equal(pointMeta.geoSpec.features[0].properties.accuracyMeters, 10);

const basemapProof = load('../examples/geo-basemap/proof.json');
const coarseInspection = await readSmapHash(basemapProof.parentSource);
const coarseMeta = metaFrom(coarseInspection);
assert.deepEqual(coarseMeta.geoSpec.bbox, [-0.2416, 51.76, -0.226, 51.76935]);
assert.deepEqual(coarseMeta.geoSpec.features.map((feature) => feature.id), ['detail-portal']);
assert.equal(coarseMeta.geoSpec.features[0].geometry.type, 'Polygon');
assert.equal(coarseMeta.geoSpec.features[0].properties.derivation, 'bounds');

const detailInspection = await readSmapHash(basemapProof.detailSource);
const detailMeta = metaFrom(detailInspection);
const detailFeatures = Object.fromEntries(detailMeta.geoSpec.features.map((feature) => [feature.id, feature]));
assert.deepEqual(Object.keys(detailFeatures), ['db0x0-label', 'db1x0-label', 'do0', 'do1']);
assert.deepEqual(detailFeatures.do0.geometry.coordinates, [-0.22959, 51.766711]);
assert.equal(detailFeatures.do0.properties.sourceFeatureId, 'node/502552074');
assert.equal(detailFeatures.do0.properties.derivation, 'source');
assert.equal(detailFeatures['db0x0-label'].properties.sourceFeatureId, 'way/53152061');
assert.equal(detailFeatures['db0x0-label'].properties.derivation, 'centroid');
assert.equal(detailFeatures['db0x0-label'].properties.accuracyMeters, null);
assert.equal(
  detailMeta.geoSpec.source.sha256,
  'sha256:40a25059d31a82521dcf49e3f1c9df385f1759b574d9bb1ca4ea37db91416992',
);


const detailDomain = createSemanticMap(detailInspection.base.records);
assert.ok(detailDomain.meta.geoSpec, 'MUTATION:drop-geospec-from-domain');
const detailScene = new SemanticProjector(detailDomain, null, 'map/1').project({
  scale: 1,
  viewport: { x: -100, y: -100, width: 1_400, height: 900 },
});
const geographicIds = new Set(detailMeta.geoSpec.features.map((feature) => feature.id));
const geographicRepresentations = detailScene.representations.filter((item) => geographicIds.has(item.regionId));
assert.equal(geographicRepresentations.length, geographicIds.size);
assert.ok(geographicRepresentations.every((item) => item.readOnly));
assert.ok(geographicRepresentations.every((item) => item.geometryEditable === false));
assert.ok(geographicRepresentations.every((item) => item.labelEditable === false));

console.log(JSON.stringify({
  schema: 'semantic-map-geo-spec-url-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  pointFeatures: pointMeta.geoSpec.features.length,
  coarseFeatures: coarseMeta.geoSpec.features.length,
  detailFeatures: detailMeta.geoSpec.features.length,
  pointUrlChars: pointProof.childSource.length,
  detailUrlChars: basemapProof.detailSource.length,
  parentUrlChars: basemapProof.parentSource.length,
  geographicRepresentationsReadOnly: true,
}, null, 2));
