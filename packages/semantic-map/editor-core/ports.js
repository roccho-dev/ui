const pendingCores = [];

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

export function registerPendingEditorCore(core) {
  invariant(core && typeof core.bindSurface === 'function', 'core is invalid');
  invariant(!pendingCores.includes(core), 'core is already pending');
  pendingCores.push(core);
  return () => {
    const index = pendingCores.indexOf(core);
    if (index >= 0) pendingCores.splice(index, 1);
  };
}

export function claimPendingEditorCore() {
  invariant(pendingCores.length === 1, `expected exactly one pending core, found ${pendingCores.length}`);
  return pendingCores.shift();
}

export function pendingEditorCoreCount() {
  return pendingCores.length;
}

export function assertSurfacePort(surface) {
  invariant(surface && typeof surface === 'object', 'SurfacePort is required');
  invariant(typeof surface.mirrorSelection === 'function', 'SurfacePort.mirrorSelection is required');
  invariant(typeof surface.snapshot === 'function', 'SurfacePort.snapshot is required');
  return surface;
}
