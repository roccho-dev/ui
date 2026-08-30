export const GEO_SPEC_SCHEMA = 'semantic-map-geo-spec/1';
export const GEO_SPEC_CRS = 'OGC:CRS84';
export const GEO_SPEC_GEOMETRIES = Object.freeze(['Point', 'Polygon']);
export const GEO_SPEC_DERIVATIONS = Object.freeze(['source', 'centroid', 'bounds']);

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const MAX_FEATURES = 512;

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-geo-spec: ${message}`);
}

function plainObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
}

function exactKeys(value, required, name) {
  const expected = new Set(required);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(expected.has(key), `${name}.${key} is not allowed`);
}

function text(value, name, { empty = false, max = 500 } = {}) {
  invariant(typeof value === 'string', `${name} must be a string`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  invariant(value.length <= max, `${name} is too long`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${name} contains a control character`);
  return value;
}

function finite(value, name) {
  invariant(typeof value === 'number' && Number.isFinite(value), `${name} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function longitude(value, name) {
  const result = finite(value, name);
  invariant(result >= -180 && result <= 180, `${name} must be between -180 and 180`);
  return result;
}

function latitude(value, name) {
  const result = finite(value, name);
  invariant(result >= -90 && result <= 90, `${name} must be between -90 and 90`);
  return result;
}

function position(value, name) {
  invariant(Array.isArray(value) && value.length === 2, `${name} must be [longitude,latitude]`);
  return Object.freeze([
    longitude(value[0], `${name}[0]`),
    latitude(value[1], `${name}[1]`),
  ]);
}

function normalizeBbox(value) {
  invariant(Array.isArray(value) && value.length === 4, 'GeoSpec.bbox must be [west,south,east,north]');
  const result = Object.freeze([
    longitude(value[0], 'GeoSpec.bbox[0]'),
    latitude(value[1], 'GeoSpec.bbox[1]'),
    longitude(value[2], 'GeoSpec.bbox[2]'),
    latitude(value[3], 'GeoSpec.bbox[3]'),
  ]);
  invariant(result[0] <= result[2], 'GeoSpec.bbox west must not exceed east');
  invariant(result[1] <= result[3], 'GeoSpec.bbox south must not exceed north');
  return result;
}

function withinBbox([lon, lat], bbox) {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function normalizeSource(value) {
  plainObject(value, 'GeoSpec.source');
  exactKeys(value, ['name', 'sha256', 'license', 'attribution'], 'GeoSpec.source');
  const sha256 = text(value.sha256, 'GeoSpec.source.sha256', { max: 71 });
  invariant(SHA256.test(sha256), 'GeoSpec.source.sha256 must be sha256:<64 lowercase hex>');
  return Object.freeze({
    name: text(value.name, 'GeoSpec.source.name', { max: 240 }),
    sha256,
    license: text(value.license, 'GeoSpec.source.license', { empty: true, max: 120 }),
    attribution: text(value.attribution, 'GeoSpec.source.attribution', { empty: true, max: 500 }),
  });
}

function normalizeProperties(value, name) {
  plainObject(value, `${name}.properties`);
  exactKeys(value, ['sourceFeatureId', 'derivation', 'accuracyMeters'], `${name}.properties`);
  const derivation = text(value.derivation, `${name}.properties.derivation`, { max: 40 });
  invariant(GEO_SPEC_DERIVATIONS.includes(derivation), `${name}.properties.derivation is unsupported`);
  const accuracyMeters = value.accuracyMeters;
  invariant(
    accuracyMeters === null || (typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0),
    `${name}.properties.accuracyMeters must be null or a non-negative finite number`,
  );
  return Object.freeze({
    sourceFeatureId: text(value.sourceFeatureId, `${name}.properties.sourceFeatureId`, { max: 240 }),
    derivation,
    accuracyMeters: accuracyMeters === null ? null : (Object.is(accuracyMeters, -0) ? 0 : accuracyMeters),
  });
}

function normalizeGeometry(value, name, bbox) {
  plainObject(value, `${name}.geometry`);
  exactKeys(value, ['type', 'coordinates'], `${name}.geometry`);
  invariant(GEO_SPEC_GEOMETRIES.includes(value.type), `${name}.geometry.type is unsupported`);
  if (value.type === 'Point') {
    const coordinates = position(value.coordinates, `${name}.geometry.coordinates`);
    invariant(withinBbox(coordinates, bbox), `${name}.geometry lies outside GeoSpec.bbox`);
    return Object.freeze({ type: 'Point', coordinates });
  }

  invariant(
    Array.isArray(value.coordinates) && value.coordinates.length === 1,
    `${name}.geometry.coordinates must contain exactly one Polygon ring`,
  );
  const inputRing = value.coordinates[0];
  invariant(Array.isArray(inputRing) && inputRing.length >= 4, `${name}.geometry Polygon ring is too short`);
  const ring = Object.freeze(inputRing.map((item, index) => position(item, `${name}.geometry.coordinates[0][${index}]`)));
  const first = ring[0];
  const last = ring[ring.length - 1];
  invariant(first[0] === last[0] && first[1] === last[1], `${name}.geometry Polygon ring must be closed`);
  invariant(ring.every((item) => withinBbox(item, bbox)), `${name}.geometry lies outside GeoSpec.bbox`);
  return Object.freeze({ type: 'Polygon', coordinates: Object.freeze([ring]) });
}

function normalizeFeature(value, index, bbox) {
  const name = `GeoSpec.features[${index}]`;
  plainObject(value, name);
  exactKeys(value, ['type', 'id', 'geometry', 'properties'], name);
  invariant(value.type === 'Feature', `${name}.type must be Feature`);
  const id = text(value.id, `${name}.id`, { max: 240 });
  invariant(!id.startsWith('@mount/'), `${name}.id uses reserved @mount/ namespace`);
  return Object.freeze({
    type: 'Feature',
    id,
    geometry: normalizeGeometry(value.geometry, name, bbox),
    properties: normalizeProperties(value.properties, name),
  });
}

export function normalizeGeoSpec(value) {
  plainObject(value, 'GeoSpec');
  exactKeys(value, ['schema', 'type', 'crs', 'bbox', 'source', 'features'], 'GeoSpec');
  invariant(value.schema === GEO_SPEC_SCHEMA, `GeoSpec.schema ${value.schema} is not ${GEO_SPEC_SCHEMA}`);
  invariant(value.type === 'FeatureCollection', 'GeoSpec.type must be FeatureCollection');
  invariant(value.crs === GEO_SPEC_CRS, `GeoSpec.crs ${value.crs} is not ${GEO_SPEC_CRS}`);
  const bbox = normalizeBbox(value.bbox);
  invariant(Array.isArray(value.features), 'GeoSpec.features must be an array');
  invariant(value.features.length <= MAX_FEATURES, `GeoSpec.features exceed ${MAX_FEATURES}`);
  const features = Object.freeze(value.features.map((feature, index) => normalizeFeature(feature, index, bbox)));
  const ids = new Set();
  for (const feature of features) {
    invariant(!ids.has(feature.id), `duplicate GeoSpec feature id: ${feature.id}`);
    ids.add(feature.id);
  }
  return Object.freeze({
    schema: GEO_SPEC_SCHEMA,
    type: 'FeatureCollection',
    crs: GEO_SPEC_CRS,
    bbox,
    source: normalizeSource(value.source),
    features,
  });
}
