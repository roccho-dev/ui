export const PRESENTATION_PROJECTION_SCHEMA = 'semantic-presentation-projection/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-presentation-projection: ${message}`);
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  invariant(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields must be exactly ${expected.join(', ')}`,
  );
}

function text(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function bounds(value, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  exactKeys(value, ['height', 'width', 'x', 'y'], label);
  for (const key of ['x', 'y', 'width', 'height']) {
    invariant(Number.isFinite(value[key]), `${label}.${key} must be finite`);
  }
  invariant(value.width > 0 && value.height > 0, `${label} dimensions must be positive`);
  return Object.freeze({ x: value.x, y: value.y, width: value.width, height: value.height });
}

function layoutEntry(value, index) {
  const label = `layout[${index}]`;
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  exactKeys(value, ['bounds', 'regionId'], label);
  return Object.freeze({
    regionId: text(value.regionId, `${label}.regionId`),
    bounds: bounds(value.bounds, `${label}.bounds`),
  });
}

function interactionEntry(value, index) {
  const label = `interactions[${index}]`;
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  exactKeys(value, ['bounds', 'editKinds', 'regionId', 'role'], label);
  invariant(Array.isArray(value.editKinds) && value.editKinds.length > 0, `${label}.editKinds must be a non-empty array`);
  const editKinds = value.editKinds.map((item, itemIndex) => text(item, `${label}.editKinds[${itemIndex}]`));
  invariant(new Set(editKinds).size === editKinds.length, `${label}.editKinds must be unique`);
  return Object.freeze({
    regionId: text(value.regionId, `${label}.regionId`),
    role: text(value.role, `${label}.role`),
    bounds: bounds(value.bounds, `${label}.bounds`),
    editKinds: Object.freeze(editKinds),
  });
}

export function normalizePresentationProjection(value) {
  if (value === null || value === undefined) return null;
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'projection must be an object');
  exactKeys(value, ['id', 'interactions', 'layout', 'pattern', 'schema'], 'projection');
  invariant(value.schema === PRESENTATION_PROJECTION_SCHEMA, `schema must be ${PRESENTATION_PROJECTION_SCHEMA}`);
  invariant(Array.isArray(value.layout), 'layout must be an array');
  invariant(Array.isArray(value.interactions), 'interactions must be an array');

  const layout = value.layout.map(layoutEntry);
  const interactions = value.interactions.map(interactionEntry);
  invariant(new Set(layout.map((item) => item.regionId)).size === layout.length, 'layout regionId values must be unique');
  invariant(
    new Set(interactions.map((item) => item.regionId)).size === interactions.length,
    'interaction regionId values must be unique',
  );

  return Object.freeze({
    schema: PRESENTATION_PROJECTION_SCHEMA,
    id: text(value.id, 'projection.id'),
    pattern: text(value.pattern, 'projection.pattern'),
    layout: Object.freeze(layout),
    interactions: Object.freeze(interactions),
  });
}

export function createPresentationProjection({ id, pattern, layout = [], interactions = [] }) {
  return normalizePresentationProjection({
    schema: PRESENTATION_PROJECTION_SCHEMA,
    id,
    pattern,
    layout,
    interactions,
  });
}

export function applyPresentationLayout(plan, domain, projection) {
  if (!projection || projection.pattern !== plan.pattern || projection.layout.length === 0) return plan;
  const projected = new Map(plan.bounds);
  for (const entry of projection.layout) {
    invariant(domain.regions.has(entry.regionId), `layout references unknown region ${entry.regionId}`);
    invariant(projected.has(entry.regionId), `layout references unprojected region ${entry.regionId}`);
    projected.set(entry.regionId, entry.bounds);
  }
  return Object.freeze({
    ...plan,
    bounds: projected,
    rootBounds: projected.get(domain.meta.root) ?? plan.rootBounds,
  });
}

export function interactionTargetFor(projection, regionId, editKind) {
  if (!projection) return null;
  const target = projection.interactions.find((item) => item.regionId === regionId) ?? null;
  if (!target || !target.editKinds.includes(editKind)) return null;
  return target;
}
