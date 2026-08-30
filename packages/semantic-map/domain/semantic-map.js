import { canonicalJson } from './canonical-json.js';
import { deriveSetSemantics } from './set-semantics.js';
import { validatePolicyModel } from './policy-semantics.js';
import { normalizeGeoSpec } from './geo-spec.js';

export const STATE_SCHEMA = 'semantic-map-state/1';
export const SEMANTIC_MAP_SCHEMA = STATE_SCHEMA;
export const TEMPORAL_AXES = Object.freeze(['ordinal', 'calendar']);

const RECORD_TYPES = new Set(['meta', 'region', 'relation']);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_MS = 86_400_000;

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-map: ${message}`);
}

function plainObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
}

function exactKeys(value, required, name, optional = []) {
  const expected = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(expected.has(key), `${name}.${key} is not allowed`);
}

function requiredText(value, name, { empty = false, max = 2_000 } = {}) {
  invariant(typeof value === 'string', `${name} must be a string`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  invariant(value.length <= max, `${name} is too long`);
  return value;
}

function semanticId(value, name) {
  const result = requiredText(value, name, { max: 240 });
  invariant(!/[\u0000-\u001f\u007f]/u.test(result), `${name} contains a control character`);
  invariant(!result.startsWith('@mount/'), `${name} uses reserved @mount/ namespace`);
  return result;
}

function normalizeOrder(value, name) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${name} must be a non-negative safe integer`);
  return value;
}

export function normalizeValue(value, name = 'value') {
  invariant(typeof value === 'number' && Number.isFinite(value), `${name} must be a finite number`);
  invariant(value >= 0, `${name} must be non-negative`);
  invariant(value <= 1_000_000_000_000, `${name} is too large`);
  return Object.is(value, -0) ? 0 : value;
}

export function temporalDay(value, name = 'date') {
  const text = requiredText(value, name, { max: 10 });
  const match = ISO_DATE.exec(text);
  invariant(match, `${name} must be an ISO calendar date YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const millis = Date.UTC(year, month - 1, day);
  const date = new Date(millis);
  invariant(
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day,
    `${name} is not a valid calendar date`,
  );
  return millis / DAY_MS;
}

function ordinalValue(value, name) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${name} must be a non-negative safe integer`);
  return value;
}

function calendarValue(value, name) {
  temporalDay(value, name);
  return value;
}

function normalizeInterval(value, name, normalizeValue) {
  plainObject(value, name);
  exactKeys(value, ['start', 'end'], name);
  const start = normalizeValue(value.start, `${name}.start`);
  const end = normalizeValue(value.end, `${name}.end`);
  invariant(start <= end, `${name}.start must not exceed end`);
  return Object.freeze({ start, end });
}

export function normalizeTemporal(value, id = 'region') {
  plainObject(value, `${id}.temporal`);
  exactKeys(value, ['actor'], `${id}.temporal`, ['ordinal', 'calendar']);
  invariant(value.actor === null || typeof value.actor === 'string', `${id}.temporal.actor must be a string or null`);
  const result = {
    actor: value.actor === null ? null : semanticId(value.actor, `${id}.temporal.actor`),
  };
  if (Object.hasOwn(value, 'ordinal')) {
    result.ordinal = normalizeInterval(value.ordinal, `${id}.temporal.ordinal`, ordinalValue);
  }
  if (Object.hasOwn(value, 'calendar')) {
    result.calendar = normalizeInterval(value.calendar, `${id}.temporal.calendar`, calendarValue);
  }
  invariant(result.ordinal || result.calendar, `${id}.temporal requires ordinal or calendar`);
  return Object.freeze(result);
}


export function normalizeHrefValue(value, name = 'href') {
  const href = requiredText(value, name, { max: 8_192 });
  invariant(!/[\u0000-\u001f\u007f]/u.test(href), `${name} contains control characters`);
  let parsed;
  try {
    parsed = new URL(href, 'https://semantic-map.invalid/app');
  } catch (_) {
    throw new Error(`semantic-map: ${name} must be a valid URL`);
  }
  invariant(parsed.protocol === 'http:' || parsed.protocol === 'https:', `${name} must use http or https`);
  invariant(!parsed.username && !parsed.password, `${name} must not contain userinfo`);
  return href;
}

function normalizeImage(value, id, kind) {
  plainObject(value, `${id}.image`);
  exactKeys(value, ['src', 'alt'], `${id}.image`);
  invariant(kind === 'map-background', `${id}.image is only valid when kind is map-background`);
  const src = requiredText(value.src, `${id}.image.src`, { max: 512 });
  invariant(src.startsWith('/assets/'), `${id}.image.src must be a root-relative /assets/ URL`);
  invariant(!src.includes('\\') && !src.includes('..'), `${id}.image.src must not traverse paths`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(src), `${id}.image.src contains control characters`);
  return Object.freeze({
    src,
    alt: requiredText(value.alt, `${id}.image.alt`, { empty: true, max: 160 }),
  });
}

function normalizeMount(value, id) {
  plainObject(value, `${id}.mount`);
  exactKeys(value, ['src'], `${id}.mount`);
  return Object.freeze({
    src: requiredText(value.src, `${id}.mount.src`, { max: 8_192 }),
  });
}

function normalizeSetValue(value, id, kind) {
  plainObject(value, `${id}.set`);
  exactKeys(value, ['complete'], `${id}.set`);
  invariant(kind === 'set', `${id}.set is only valid when kind is set`);
  invariant(typeof value.complete === 'boolean', `${id}.set.complete must be boolean`);
  return Object.freeze({ complete: value.complete });
}

function parseBounds(value, id, { minWidth = 24, minHeight = 18 } = {}) {
  invariant(Array.isArray(value) && value.length === 4, `${id}.bounds must be [x,y,w,h]`);
  const bounds = value.map((item, index) => {
    invariant(typeof item === 'number' && Number.isFinite(item), `${id}.bounds[${index}] must be finite`);
    return Object.is(item, -0) ? 0 : item;
  });
  invariant(bounds[2] >= minWidth && bounds[3] >= minHeight, `${id}.bounds is too small`);
  return Object.freeze({ x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] });
}

function normalizeMeta(record) {
  plainObject(record, 'meta');
  exactKeys(record, ['type', 'schema', 'root', 'title'], 'meta', ['geoSpec']);
  invariant(record.type === 'meta', 'meta.type must be meta');
  invariant(record.schema === STATE_SCHEMA, `meta.schema ${record.schema} is not ${STATE_SCHEMA}`);
  const meta = {
    type: 'meta',
    schema: requiredText(record.schema, 'meta.schema', { max: 120 }),
    root: semanticId(record.root, 'meta.root'),
    title: requiredText(record.title, 'meta.title', { max: 240 }),
  };
  if (Object.hasOwn(record, 'geoSpec')) meta.geoSpec = normalizeGeoSpec(record.geoSpec);
  return Object.freeze(meta);
}

function normalizeRegion(record) {
  plainObject(record, 'region');
  const optional = ['mount', 'order', 'temporal', 'href', 'set', 'image', 'value'];
  exactKeys(
    record,
    ['type', 'id', 'parent', 'label', 'kind', 'bounds', 'summary'],
    `region ${record.id ?? '?'}`,
    optional,
  );
  invariant(record.type === 'region', 'region.type must be region');
  invariant(record.parent === null || typeof record.parent === 'string', `${record.id}.parent must be a string or null`);
  const region = {
    type: 'region',
    id: semanticId(record.id, 'region.id'),
    parent: record.parent === null ? null : semanticId(record.parent, `${record.id}.parent`),
    label: requiredText(record.label, `${record.id}.label`, { max: 120 }),
    kind: requiredText(record.kind, `${record.id}.kind`, { max: 80 }),
    bounds: parseBounds(
      record.bounds,
      record.id,
      record.kind === 'map-control-point' ? { minWidth: 1, minHeight: 1 } : undefined,
    ),
    summary: requiredText(record.summary, `${record.id}.summary`, { empty: true, max: 2_000 }),
  };
  if (Object.hasOwn(record, 'order')) region.order = normalizeOrder(record.order, `${record.id}.order`);
  if (Object.hasOwn(record, 'value')) region.value = normalizeValue(record.value, `${record.id}.value`);
  if (Object.hasOwn(record, 'temporal')) region.temporal = normalizeTemporal(record.temporal, record.id);
  if (Object.hasOwn(record, 'href')) region.href = normalizeHrefValue(record.href, `${record.id}.href`);
  if (Object.hasOwn(record, 'mount')) region.mount = normalizeMount(record.mount, record.id);
  const hasSet = Object.hasOwn(record, 'set');
  invariant(region.kind !== 'set' || hasSet, `${record.id}.set is required when kind is set`);
  if (hasSet) region.set = normalizeSetValue(record.set, record.id, region.kind);
  if (Object.hasOwn(record, 'image')) region.image = normalizeImage(record.image, record.id, region.kind);
  return Object.freeze(region);
}

function normalizeRelation(record) {
  plainObject(record, 'relation');
  exactKeys(record, ['type', 'id', 'from', 'to', 'kind', 'label'], `relation ${record.id ?? '?'}`);
  invariant(record.type === 'relation', 'relation.type must be relation');
  return Object.freeze({
    type: 'relation',
    id: semanticId(record.id, 'relation.id'),
    from: semanticId(record.from, `${record.id}.from`),
    to: semanticId(record.to, `${record.id}.to`),
    kind: requiredText(record.kind, `${record.id}.kind`, { max: 80 }),
    label: requiredText(record.label, `${record.id}.label`, { empty: true, max: 120 }),
  });
}

export function parseSemanticMapRecords(text) {
  return String(text ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        const record = JSON.parse(line);
        invariant(RECORD_TYPES.has(record?.type), `line ${index + 1}: unknown type`);
        return record;
      } catch (error) {
        throw new Error(`semantic-map: invalid JSONL line ${index + 1}: ${error.message}`);
      }
    });
}

export function recordsToJSONL(records) {
  invariant(Array.isArray(records) && records.length > 0, 'records must be a non-empty array');
  const domain = createSemanticMap(records);
  const meta = { type: 'meta', schema: domain.meta.schema, root: domain.meta.root, title: domain.meta.title };
  if (domain.meta.geoSpec) meta.geoSpec = domain.meta.geoSpec;
  const normalized = [meta];
  for (const region of domain.regions.values()) {
    const record = {
      type: 'region',
      id: region.id,
      parent: region.parent,
      label: region.label,
      kind: region.kind,
      bounds: [region.bounds.x, region.bounds.y, region.bounds.width, region.bounds.height],
      summary: region.summary,
    };
    if (Object.hasOwn(region, 'order')) record.order = region.order;
    if (Object.hasOwn(region, 'value')) record.value = region.value;
    if (region.temporal) record.temporal = region.temporal;
    if (region.href) record.href = region.href;
    if (region.mount) record.mount = region.mount;
    if (region.set) record.set = region.set;
    if (region.image) record.image = region.image;
    normalized.push(record);
  }
  for (const relation of domain.relations) normalized.push({ type: 'relation', ...relation });
  return `${normalized.map((record) => canonicalJson(record)).join('\n')}\n`;
}

export function parseSemanticMapJSONL(text) {
  return createSemanticMap(parseSemanticMapRecords(text));
}

export function createSemanticMap(records) {
  invariant(Array.isArray(records) && records.length > 0, 'records must be a non-empty array');
  invariant(records[0]?.type === 'meta', 'meta record must be first');
  const metaRecords = records.filter((record) => record?.type === 'meta');
  invariant(metaRecords.length === 1, 'exactly one meta record is required');
  const meta = normalizeMeta(metaRecords[0]);
  const normalized = records.map((record) => {
    invariant(RECORD_TYPES.has(record?.type), 'unknown record type');
    if (record.type === 'meta') return meta;
    if (record.type === 'region') return normalizeRegion(record);
    return normalizeRelation(record);
  });

  const regions = new Map();
  const children = new Map();
  const relations = [];
  const relationIds = new Set();
  let relationStarted = false;

  for (const record of normalized) {
    if (record.type === 'meta') continue;
    if (record.type === 'relation') {
      relationStarted = true;
      continue;
    }
    invariant(!relationStarted, 'regions must precede relations');
    invariant(!regions.has(record.id), `duplicate region id: ${record.id}`);
    const regionValue = {
      id: record.id,
      parent: record.parent,
      label: record.label,
      kind: record.kind,
      summary: record.summary,
      bounds: record.bounds,
    };
    if (Object.hasOwn(record, 'order')) regionValue.order = record.order;
    if (Object.hasOwn(record, 'value')) regionValue.value = record.value;
    if (record.temporal) regionValue.temporal = record.temporal;
    if (record.href) regionValue.href = record.href;
    if (record.mount) regionValue.mount = record.mount;
    if (record.set) regionValue.set = record.set;
    if (record.image) regionValue.image = record.image;
    const region = Object.freeze(regionValue);
    regions.set(region.id, region);
    children.set(region.id, []);
  }

  invariant(regions.has(meta.root), `meta.root not found: ${meta.root}`);
  const root = regions.get(meta.root);
  invariant(root.parent === null, 'root.parent must be null');
  invariant(!Object.hasOwn(root, 'order'), 'root region must not have an order');
  invariant(!Object.hasOwn(root, 'value'), 'root region must not have a value');
  invariant(!root.temporal, 'root region must not have temporal data');
  invariant(!root.href, 'root region must not have a link');
  invariant(!root.mount, 'root region must not mount another map');
  invariant(!root.image, 'root region must not be an image');

  for (const region of regions.values()) {
    if (region.parent === null) continue;
    invariant(regions.has(region.parent), `${region.id}.parent not found: ${region.parent}`);
    children.get(region.parent).push(region.id);
  }
  if (meta.geoSpec) {
    for (const feature of meta.geoSpec.features) {
      invariant(regions.has(feature.id), `GeoSpec feature id not found: ${feature.id}`);
    }
  }
  for (const region of regions.values()) {
    invariant(!(region.mount && region.href), `${region.id} must not define both href and mount`);
    invariant(!(region.image && (region.mount || region.href)), `${region.id} image must not define href or mount`);
    if (region.mount) invariant(children.get(region.id).length === 0, `${region.id} must be a leaf before mounting`);
    if (region.image) invariant(children.get(region.id).length === 0, `${region.id} image must be a leaf`);
    if (region.kind === 'actor') invariant(!region.temporal, `${region.id} actor must not be temporal`);
    if (region.temporal && region.temporal.actor !== null) {
      const actor = regions.get(region.temporal.actor);
      invariant(actor, `${region.id}.temporal.actor not found: ${region.temporal.actor}`);
      invariant(actor.kind === 'actor', `${region.id}.temporal.actor must reference kind actor`);
      invariant(actor.id !== region.id, `${region.id}.temporal.actor must not reference itself`);
    }
  }

  for (const record of normalized) {
    if (record.type !== 'relation') continue;
    invariant(!relationIds.has(record.id), `duplicate relation id: ${record.id}`);
    invariant(regions.has(record.from), `${record.id}.from not found: ${record.from}`);
    invariant(regions.has(record.to), `${record.id}.to not found: ${record.to}`);
    invariant(record.from !== record.to, `${record.id} must not be a self relation`);
    const fromKind = regions.get(record.from).kind;
    const toKind = regions.get(record.to).kind;
    if (record.kind === 'memberOf') {
      invariant(toKind === 'set', `${record.id}.to must be a set for memberOf`);
      invariant(fromKind !== 'set', `${record.id}.from must not be a set for memberOf`);
    }
    if (record.kind === 'subsetOf' || record.kind === 'disjointWith' || record.kind === 'overlapsWith') {
      invariant(fromKind === 'set' && toKind === 'set', `${record.id} endpoints must be sets for ${record.kind}`);
    }
    relationIds.add(record.id);
    relations.push(Object.freeze({
      id: record.id,
      from: record.from,
      to: record.to,
      kind: record.kind,
      label: record.label,
    }));
  }

  const depthById = new Map();
  function depthOf(id, visiting = new Set()) {
    if (depthById.has(id)) return depthById.get(id);
    invariant(!visiting.has(id), `hierarchy cycle at ${id}`);
    visiting.add(id);
    const parent = regions.get(id).parent;
    const depth = parent === null ? 0 : depthOf(parent, visiting) + 1;
    visiting.delete(id);
    depthById.set(id, depth);
    return depth;
  }
  for (const id of regions.keys()) depthOf(id);
  for (const [id, childIds] of children) children.set(id, Object.freeze([...childIds]));

  const metaValue = { schema: meta.schema, root: meta.root, title: meta.title };
  if (meta.geoSpec) metaValue.geoSpec = meta.geoSpec;
  const domain = Object.freeze({
    meta: Object.freeze(metaValue),
    regions,
    relations: Object.freeze(relations),
    children,
    depthById,
  });
  deriveSetSemantics(domain);
  validatePolicyModel(domain);
  return domain;
}
