function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-canonical: ${message}`);
}

function normalize(value, path) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), `${path} must be a finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normalize(item, `${path}[${index}]`));
  invariant(value && typeof value === 'object', `${path} contains an unsupported value`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${path} must be a plain object`);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    invariant(value[key] !== undefined, `${path}.${key} must not be undefined`);
    result[key] = normalize(value[key], `${path}.${key}`);
  }
  return result;
}

export function canonicalValue(value) {
  return normalize(value, '$');
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalClone(value) {
  return JSON.parse(canonicalJson(value));
}
