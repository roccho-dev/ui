export const RESOURCE_COMPOSITION_SCHEMA = 'typed-resource-composition/1';
export const RESOURCE_SOURCE_TYPES = Object.freeze(['url']);
export const RESOURCE_SLOTS = Object.freeze(['background', 'content']);
export const RESOURCE_ACTIONS = Object.freeze(['navigate']);
export const MAX_RESOURCES = 32;
export const MAX_PLACEMENTS = 64;

export const invariant = (condition, message) => {
  if (!condition) throw new Error(`resource-composition: ${message}`);
};

export const plainObject = (value, name) => {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
};

export const exactKeys = (value, required, optional, name) => {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};

export const text = (value, name, { empty = false, max = 2_000 } = {}) => {
  invariant(typeof value === 'string', `${name} must be a string`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  invariant(value.length <= max, `${name} is too long`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${name} contains control characters`);
  return value;
};

export const identifier = (value, name) => {
  const result = text(value, name, { max: 160 });
  invariant(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(result), `${name} contains unsupported characters`);
  return result;
};

export const normalizeResourceUrl = (value, name = 'url') => {
  const source = text(value, name, { max: 8_192 });
  invariant(source.trim() === source, `${name} must not contain surrounding whitespace`);
  let parsed;
  try {
    parsed = new URL(source, 'https://semantic-map.invalid/app');
  } catch (_) {
    throw new Error(`resource-composition: ${name} must be a valid URL`);
  }
  invariant(parsed.protocol === 'http:' || parsed.protocol === 'https:', `${name} must use http or https`);
  invariant(!parsed.username && !parsed.password, `${name} must not contain userinfo`);
  invariant(!source.startsWith('//'), `${name} must not be protocol-relative`);
  return source;
};

export const normalizeSource = (value, name) => {
  plainObject(value, name);
  exactKeys(value, ['type', 'href'], [], name);
  const type = text(value.type, `${name}.type`, { max: 32 });
  invariant(RESOURCE_SOURCE_TYPES.includes(type), `${name}.type is unsupported`);
  return Object.freeze({
    type,
    href: normalizeResourceUrl(value.href, `${name}.href`),
  });
};

export const parseTargetRef = (value, name = 'targetRef') => {
  const targetRef = identifier(value, name);
  const separator = targetRef.indexOf(':');
  invariant(separator > 0 && separator < targetRef.length - 1, `${name} must be <catalog>:<id>`);
  return Object.freeze({
    ref: targetRef,
    catalog: targetRef.slice(0, separator),
    id: targetRef.slice(separator + 1),
  });
};

export const createTargetRef = (catalog, id) => {
  const normalizedCatalog = identifier(catalog, 'target catalog');
  invariant(!normalizedCatalog.includes(':'), 'target catalog must not contain a colon');
  return parseTargetRef(`${normalizedCatalog}:${identifier(id, 'target id')}`).ref;
};

export const normalizeAction = (value, name) => {
  plainObject(value, name);
  exactKeys(value, ['kind', 'href'], [], name);
  const kind = text(value.kind, `${name}.kind`, { max: 40 });
  invariant(RESOURCE_ACTIONS.includes(kind), `${name}.kind is unsupported`);
  return Object.freeze({
    kind,
    href: normalizeResourceUrl(value.href, `${name}.href`),
  });
};

export const normalizeResourceShape = (value, index) => {
  const name = `resourceComposition.resources[${index}]`;
  plainObject(value, name);
  exactKeys(value, ['id', 'contract', 'source'], ['provenanceRef'], name);
  const result = {
    id: identifier(value.id, `${name}.id`),
    contract: text(value.contract, `${name}.contract`, { max: 80 }),
    source: normalizeSource(value.source, `${name}.source`),
  };
  if (Object.hasOwn(value, 'provenanceRef')) {
    result.provenanceRef = identifier(value.provenanceRef, `${name}.provenanceRef`);
  }
  return Object.freeze(result);
};

export const normalizePlacementShape = (value, index) => {
  const name = `resourceComposition.placements[${index}]`;
  plainObject(value, name);
  exactKeys(value, ['id', 'resourceRef', 'targetRef', 'slot', 'view'], ['action'], name);
  const slot = text(value.slot, `${name}.slot`, { max: 24 });
  invariant(RESOURCE_SLOTS.includes(slot), `${name}.slot is unsupported`);
  const placement = {
    id: identifier(value.id, `${name}.id`),
    resourceRef: identifier(value.resourceRef, `${name}.resourceRef`),
    targetRef: parseTargetRef(value.targetRef, `${name}.targetRef`).ref,
    slot,
    view: plainObject(value.view, `${name}.view`),
  };
  if (Object.hasOwn(value, 'action')) {
    placement.action = normalizeAction(value.action, `${name}.action`);
  }
  return Object.freeze(placement);
};

export const uniqueBy = (values, selector, message) => {
  const seen = new Set();
  for (const value of values) {
    const key = selector(value);
    invariant(!seen.has(key), `${message}: ${key}`);
    seen.add(key);
  }
};
