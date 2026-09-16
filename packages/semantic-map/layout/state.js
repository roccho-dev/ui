const LAYOUT_RECORD_TYPE = 'layout';
const PIN_MODES = new Set(['hard']);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-layout: ${message}`);
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

function regionId(value, name) {
  invariant(typeof value === 'string' && value.length > 0, `${name} must be a non-empty string`);
  invariant(value.length <= 240, `${name} is too long`);
  invariant(!value.startsWith('@mount/'), `${name} uses reserved @mount/ namespace`);
  return value;
}

function bounds(value, name) {
  invariant(Array.isArray(value) && value.length === 4, `${name} must be [x,y,w,h]`);
  const normalized = value.map((item, index) => {
    invariant(typeof item === 'number' && Number.isFinite(item), `${name}[${index}] must be finite`);
    return Object.is(item, -0) ? 0 : item;
  });
  invariant(normalized[2] >= 24 && normalized[3] >= 18, `${name} is too small`);
  return Object.freeze(normalized);
}

export function normalizeLayoutRecord(input, domain = null) {
  const value = plainObject(input, 'layout');
  exactKeys(value, ['type', 'regionId', 'pin', 'bounds'], 'layout');
  invariant(value.type === LAYOUT_RECORD_TYPE, `layout.type must be ${LAYOUT_RECORD_TYPE}`);
  invariant(PIN_MODES.has(value.pin), `layout.pin must be ${[...PIN_MODES].join(' or ')}`);
  const id = regionId(value.regionId, 'layout.regionId');
  if (domain) {
    invariant(domain.regions.has(id), `layout region not found: ${id}`);
    invariant(id !== domain.meta.root, 'root region cannot be pinned');
  }
  return Object.freeze({
    type: LAYOUT_RECORD_TYPE,
    regionId: id,
    pin: value.pin,
    bounds: bounds(value.bounds, 'layout.bounds'),
  });
}

export function normalizeLayoutRecords(records, domain = null) {
  invariant(Array.isArray(records), 'layout records must be an array');
  const seen = new Set();
  const normalized = records.map((record) => {
    const value = normalizeLayoutRecord(record, domain);
    invariant(!seen.has(value.regionId), `duplicate layout region: ${value.regionId}`);
    seen.add(value.regionId);
    return value;
  });
  normalized.sort((left, right) => left.regionId.localeCompare(right.regionId));
  return Object.freeze(normalized);
}

export function splitStateRecords(records) {
  invariant(Array.isArray(records) && records.length > 0, 'state records must be a non-empty array');
  const semanticRecords = [];
  const layoutRecords = [];
  for (const record of records) {
    if (record?.type === LAYOUT_RECORD_TYPE) layoutRecords.push(record);
    else semanticRecords.push(record);
  }
  invariant(semanticRecords.length > 0, 'semantic records are required');
  return Object.freeze({
    semanticRecords: Object.freeze(semanticRecords),
    layoutRecords: Object.freeze(layoutRecords),
  });
}

export function layoutMap(records, domain = null) {
  return new Map(normalizeLayoutRecords(records, domain).map((record) => [record.regionId, record]));
}

export function layoutRecordsFromMap(input) {
  invariant(input instanceof Map, 'layout state must be a Map');
  return normalizeLayoutRecords([...input.values()]);
}

export const layoutContract = Object.freeze({
  recordType: LAYOUT_RECORD_TYPE,
  pinModes: Object.freeze([...PIN_MODES]),
});
