import { createSemanticMap, normalizeHrefValue, normalizeValue, normalizeTemporal, TEMPORAL_AXES } from './semantic-map.js';

export const MAX_DECISION_OPERATIONS = 32;
export const OPERATION_TYPES = Object.freeze([
  'CreateMap',
  'MoveRegions',
  'ResizeRegions',
  'PlaceTemporalRegions',
  'RenameRegion',
  'SetRegionOrder',
  'SetRegionValue',
  'SetRegionLink',
  'SetSetCompleteness',
  'AddRegion',
  'ConnectRegions',
  'MountRegionModule',
  'UnmountRegionModule',
  'RemoveSelection',
]);


const OPERATION_TYPE_SET = new Set(OPERATION_TYPES);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-operation: ${message}`);
}

function plainObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
}

function exactKeys(value, required, name, optional = []) {
  const expected = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of actual) invariant(expected.has(key), `${name}.${key} is not allowed`);
}

function text(value, name, { empty = false, max = 2_000 } = {}) {
  invariant(typeof value === 'string', `${name} must be a string`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  invariant(value.length <= max, `${name} is too long`);
  return value;
}

function identifier(value, name) {
  return text(value, name, { max: 240 });
}

function semanticId(value, name) {
  const result = identifier(value, name);
  invariant(!result.startsWith('@mount/'), `${name} uses reserved @mount/ namespace`);
  return result;
}

function order(value, name) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${name} must be a non-negative safe integer`);
  return value;
}

function finite(value, name) {
  invariant(typeof value === 'number' && Number.isFinite(value), `${name} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}

function bounds(value, name) {
  invariant(Array.isArray(value) && value.length === 4, `${name} must be [x,y,w,h]`);
  const result = value.map((item, index) => finite(item, `${name}[${index}]`));
  invariant(result[2] >= 24 && result[3] >= 18, `${name} is too small`);
  return Object.freeze(result);
}

function setValue(value, name, kind) {
  plainObject(value, name);
  exactKeys(value, ['complete'], name);
  invariant(kind === 'set', `${name} is only valid when kind is set`);
  invariant(typeof value.complete === 'boolean', `${name}.complete must be boolean`);
  return Object.freeze({ complete: value.complete });
}

function ids(value, name, { empty = false } = {}) {
  invariant(Array.isArray(value), `${name} must be an array`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  const result = value.map((item, index) => semanticId(item, `${name}[${index}]`));
  invariant(new Set(result).size === result.length, `${name} contains duplicates`);
  return Object.freeze(result);
}

function records(value) {
  invariant(Array.isArray(value) && value.length > 0, 'CreateMap.records must be a non-empty array');
  const cloned = value.map((record) => structuredClone(record));
  createSemanticMap(cloned);
  return Object.freeze(cloned.map(Object.freeze));
}

export function isOperationType(value) {
  return OPERATION_TYPE_SET.has(value);
}

export function normalizeOperation(input) {
  const value = plainObject(input, 'operation');
  invariant(isOperationType(value.type), `unsupported type ${value.type}`);

  switch (value.type) {
    case 'CreateMap':
      exactKeys(value, ['type', 'mapId', 'records'], 'CreateMap');
      return Object.freeze({ type: value.type, mapId: identifier(value.mapId, 'CreateMap.mapId'), records: records(value.records) });

    case 'MoveRegions':
      exactKeys(value, ['type', 'regionIds', 'dx', 'dy'], 'MoveRegions');
      return Object.freeze({ type: value.type, regionIds: ids(value.regionIds, 'MoveRegions.regionIds'), dx: finite(value.dx, 'MoveRegions.dx'), dy: finite(value.dy, 'MoveRegions.dy') });

    case 'ResizeRegions': {
      exactKeys(value, ['type', 'items'], 'ResizeRegions');
      invariant(Array.isArray(value.items) && value.items.length > 0, 'ResizeRegions.items must be a non-empty array');
      const seen = new Set();
      const items = value.items.map((item, index) => {
        plainObject(item, `ResizeRegions.items[${index}]`);
        exactKeys(item, ['regionId', 'bounds'], `ResizeRegions.items[${index}]`);
        const regionId = semanticId(item.regionId, `ResizeRegions.items[${index}].regionId`);
        invariant(!seen.has(regionId), `ResizeRegions.items contains duplicate ${regionId}`);
        seen.add(regionId);
        return Object.freeze({ regionId, bounds: bounds(item.bounds, `ResizeRegions.items[${index}].bounds`) });
      });
      return Object.freeze({ type: value.type, items: Object.freeze(items) });
    }

    case 'PlaceTemporalRegions': {
      exactKeys(value, ['type', 'axis', 'items'], 'PlaceTemporalRegions');
      invariant(TEMPORAL_AXES.includes(value.axis), `PlaceTemporalRegions.axis must be one of ${TEMPORAL_AXES.join(', ')}`);
      invariant(Array.isArray(value.items) && value.items.length > 0, 'PlaceTemporalRegions.items must be a non-empty array');
      const seen = new Set();
      const items = value.items.map((item, index) => {
        plainObject(item, `PlaceTemporalRegions.items[${index}]`);
        exactKeys(item, ['regionId', 'actor', 'start', 'end'], `PlaceTemporalRegions.items[${index}]`);
        const regionId = semanticId(item.regionId, `PlaceTemporalRegions.items[${index}].regionId`);
        invariant(!seen.has(regionId), `PlaceTemporalRegions.items contains duplicate ${regionId}`);
        seen.add(regionId);
        const temporal = normalizeTemporal(
          { actor: item.actor, [value.axis]: { start: item.start, end: item.end } },
          `PlaceTemporalRegions.items[${index}]`,
        );
        const interval = temporal[value.axis];
        return Object.freeze({ regionId, actor: temporal.actor, start: interval.start, end: interval.end });
      });
      return Object.freeze({ type: value.type, axis: value.axis, items: Object.freeze(items) });
    }

    case 'RenameRegion':
      exactKeys(value, ['type', 'regionId', 'label'], 'RenameRegion');
      return Object.freeze({ type: value.type, regionId: semanticId(value.regionId, 'RenameRegion.regionId'), label: text(value.label, 'RenameRegion.label', { max: 120 }) });

    case 'SetRegionOrder':
      exactKeys(value, ['type', 'regionId', 'order'], 'SetRegionOrder');
      return Object.freeze({
        type: value.type,
        regionId: semanticId(value.regionId, 'SetRegionOrder.regionId'),
        order: order(value.order, 'SetRegionOrder.order'),
      });

    case 'SetRegionValue':
      exactKeys(value, ['type', 'regionId', 'value'], 'SetRegionValue');
      return Object.freeze({
        type: value.type,
        regionId: semanticId(value.regionId, 'SetRegionValue.regionId'),
        value: normalizeValue(value.value, 'SetRegionValue.value'),
      });

    case 'SetRegionLink':
      exactKeys(value, ['type', 'regionId', 'href'], 'SetRegionLink');
      return Object.freeze({
        type: value.type,
        regionId: semanticId(value.regionId, 'SetRegionLink.regionId'),
        href: value.href === null ? null : normalizeHrefValue(value.href, 'SetRegionLink.href'),
      });

    case 'SetSetCompleteness':
      exactKeys(value, ['type', 'regionId', 'complete'], 'SetSetCompleteness');
      invariant(typeof value.complete === 'boolean', 'SetSetCompleteness.complete must be boolean');
      return Object.freeze({
        type: value.type,
        regionId: semanticId(value.regionId, 'SetSetCompleteness.regionId'),
        complete: value.complete,
      });

    case 'AddRegion': {
      exactKeys(value, ['type', 'regionId', 'parentId', 'label', 'kind', 'summary', 'bounds'], 'AddRegion', ['order', 'value', 'temporal', 'href', 'set']);
      const operation = {
        type: value.type,
        regionId: semanticId(value.regionId, 'AddRegion.regionId'),
        parentId: semanticId(value.parentId, 'AddRegion.parentId'),
        label: text(value.label, 'AddRegion.label', { max: 120 }),
        kind: text(value.kind, 'AddRegion.kind', { max: 80 }),
        summary: text(value.summary, 'AddRegion.summary', { empty: true, max: 2_000 }),
        bounds: bounds(value.bounds, 'AddRegion.bounds'),
      };
      if (Object.hasOwn(value, 'order')) operation.order = order(value.order, 'AddRegion.order');
      if (Object.hasOwn(value, 'value')) operation.value = normalizeValue(value.value, 'AddRegion.value');
      if (Object.hasOwn(value, 'temporal')) operation.temporal = normalizeTemporal(value.temporal, 'AddRegion');
      if (Object.hasOwn(value, 'href')) operation.href = normalizeHrefValue(value.href, 'AddRegion.href');
      const hasSet = Object.hasOwn(value, 'set');
      invariant(operation.kind !== 'set' || hasSet, 'AddRegion.set is required when kind is set');
      if (hasSet) operation.set = setValue(value.set, 'AddRegion.set', operation.kind);
      return Object.freeze(operation);
    }

    case 'ConnectRegions':
      exactKeys(value, ['type', 'relationId', 'from', 'to', 'kind', 'label'], 'ConnectRegions');
      return Object.freeze({
        type: value.type,
        relationId: semanticId(value.relationId, 'ConnectRegions.relationId'),
        from: semanticId(value.from, 'ConnectRegions.from'),
        to: semanticId(value.to, 'ConnectRegions.to'),
        kind: text(value.kind, 'ConnectRegions.kind', { max: 80 }),
        label: text(value.label, 'ConnectRegions.label', { empty: true, max: 120 }),
      });

    case 'MountRegionModule':
      exactKeys(value, ['type', 'regionId', 'src'], 'MountRegionModule');
      return Object.freeze({
        type: value.type,
        regionId: semanticId(value.regionId, 'MountRegionModule.regionId'),
        src: text(value.src, 'MountRegionModule.src', { max: 8_192 }),
      });

    case 'UnmountRegionModule':
      exactKeys(value, ['type', 'regionId'], 'UnmountRegionModule');
      return Object.freeze({
        type: value.type,
        regionId: semanticId(value.regionId, 'UnmountRegionModule.regionId'),
      });

    case 'RemoveSelection': {
      exactKeys(value, ['type', 'regionIds', 'relationIds'], 'RemoveSelection');
      const regionIds = ids(value.regionIds, 'RemoveSelection.regionIds', { empty: true });
      const relationIds = ids(value.relationIds, 'RemoveSelection.relationIds', { empty: true });
      invariant(regionIds.length + relationIds.length > 0, 'RemoveSelection must select something');
      return Object.freeze({ type: value.type, regionIds, relationIds });
    }

    default:
      throw new Error(`semantic-operation: unsupported type ${value.type}`);
  }
}

export function normalizeOperations(input) {
  invariant(Array.isArray(input) && input.length > 0, 'operations must be a non-empty array');
  invariant(input.length <= MAX_DECISION_OPERATIONS, `operations exceed ${MAX_DECISION_OPERATIONS}`);
  return Object.freeze(input.map((operation) => normalizeOperation(operation)));
}
