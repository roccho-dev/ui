function invariant(condition, message) {
  if (!condition) throw new Error(`editor-core-port: ${message}`);
}

function strings(values, name) {
  invariant(Array.isArray(values), `${name} must be an array`);
  const result = values.map((value, index) => {
    invariant(typeof value === 'string' && value.length > 0, `${name}[${index}] must be a non-empty string`);
    return value;
  });
  invariant(new Set(result).size === result.length, `${name} contains duplicates`);
  return Object.freeze(result);
}

function method(port, name, owner) {
  invariant(port && typeof port === 'object', `${owner} is required`);
  invariant(typeof port[name] === 'function', `${owner}.${name} is required`);
}

export function normalizeSelection(input = {}) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'selection must be an object');
  return Object.freeze({
    regionIds: strings(input.regionIds ?? [], 'selection.regionIds'),
    relationIds: strings(input.relationIds ?? [], 'selection.relationIds'),
  });
}

export function sameSelection(left, right) {
  return left.regionIds.length === right.regionIds.length
    && left.relationIds.length === right.relationIds.length
    && left.regionIds.every((value, index) => value === right.regionIds[index])
    && left.relationIds.every((value, index) => value === right.relationIds[index]);
}

export function assertSurfacePort(surface) {
  for (const name of ['render', 'onGesture', 'snapshot', 'destroy']) {
    method(surface, name, 'SurfacePort');
  }
  return surface;
}

export function assertDocumentPort(documentPort) {
  for (const name of ['requestEdit', 'commit', 'reload', 'renderChrome']) {
    method(documentPort, name, 'DocumentPort');
  }
  return documentPort;
}

export function assertAuthorityPort(authority) {
  method(authority, 'authorize', 'AuthorityPort');
  return authority;
}
