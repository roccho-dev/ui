function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-set-geometry: ${message}`);
}

function finite(value, name) {
  invariant(typeof value === 'number' && Number.isFinite(value), `${name} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}

export const SET_GEOMETRY_EPSILON = 1e-9;
export const SET_TOPOLOGY_ORDER = Object.freeze([
  'disjoint',
  'partial-overlap',
  'subset',
  'superset',
  'equal',
]);

export function normalizeSetBounds(input, name = 'bounds') {
  invariant(input && typeof input === 'object' && !Array.isArray(input), `${name} must be an object`);
  const bounds = Object.freeze({
    x: finite(input.x, `${name}.x`),
    y: finite(input.y, `${name}.y`),
    width: finite(input.width, `${name}.width`),
    height: finite(input.height, `${name}.height`),
  });
  invariant(bounds.width > 0 && bounds.height > 0, `${name} must have positive size`);
  return bounds;
}

function contains(outer, inner, epsilon) {
  return inner.x >= outer.x - epsilon
    && inner.y >= outer.y - epsilon
    && inner.x + inner.width <= outer.x + outer.width + epsilon
    && inner.y + inner.height <= outer.y + outer.height + epsilon;
}

export function setIntersectionArea(leftInput, rightInput) {
  const left = normalizeSetBounds(leftInput, 'left');
  const right = normalizeSetBounds(rightInput, 'right');
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

export function classifySetBounds(leftInput, rightInput, options = {}) {
  const left = normalizeSetBounds(leftInput, 'left');
  const right = normalizeSetBounds(rightInput, 'right');
  const epsilon = options.epsilon ?? SET_GEOMETRY_EPSILON;
  invariant(typeof epsilon === 'number' && Number.isFinite(epsilon) && epsilon >= 0, 'epsilon must be non-negative');

  const leftContainsRight = contains(left, right, epsilon);
  const rightContainsLeft = contains(right, left, epsilon);
  if (leftContainsRight && rightContainsLeft) return 'equal';
  if (rightContainsLeft) return 'subset';
  if (leftContainsRight) return 'superset';
  return setIntersectionArea(left, right) > epsilon ? 'partial-overlap' : 'disjoint';
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function axisSamples(start, size, otherStart, otherSize, tolerance) {
  const minimum = start - tolerance;
  const maximum = start + tolerance;
  const critical = [
    minimum,
    maximum,
    start,
    otherStart - size,
    otherStart,
    otherStart + otherSize - size,
    otherStart + otherSize,
  ].filter((value) => value >= minimum && value <= maximum);
  const sorted = uniqueSorted(critical);
  const samples = [...sorted];
  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1];
    const right = sorted[index];
    if (right > left) samples.push((left + right) / 2);
  }
  return uniqueSorted(samples);
}

export function classifySetBoundsNeighborhood(leftInput, rightInput, options = {}) {
  const left = normalizeSetBounds(leftInput, 'left');
  const right = normalizeSetBounds(rightInput, 'right');
  const positionTolerance = options.positionTolerance ?? 0;
  const epsilon = options.epsilon ?? 0;
  invariant(
    typeof positionTolerance === 'number' && Number.isFinite(positionTolerance) && positionTolerance >= 0,
    'positionTolerance must be non-negative',
  );
  invariant(typeof epsilon === 'number' && Number.isFinite(epsilon) && epsilon >= 0, 'epsilon must be non-negative');

  const exact = classifySetBounds(left, right, { epsilon });
  const xValues = axisSamples(left.x, left.width, right.x, right.width, positionTolerance);
  const yValues = axisSamples(left.y, left.height, right.y, right.height, positionTolerance);
  const possible = new Set();
  for (const x of xValues) {
    for (const y of yValues) {
      possible.add(classifySetBounds({ ...left, x, y }, right, { epsilon }));
    }
  }
  const ordered = SET_TOPOLOGY_ORDER.filter((topology) => possible.has(topology));
  invariant(ordered.includes(exact), 'exact topology must be present in the neighborhood');
  return Object.freeze({
    exact,
    possible: Object.freeze(ordered),
    stable: ordered.length === 1,
    positionTolerance,
    samples: Object.freeze({ x: xValues.length, y: yValues.length }),
  });
}
