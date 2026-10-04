const EPSILON = 1e-9;

function rectanglePolygon(bounds) {
  return [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ];
}

function center(bounds) {
  return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
}

function clipHalfPlane(polygon, a, b, c) {
  if (polygon.length === 0) return polygon;
  const inside = ([x, y]) => a * x + b * y <= c + EPSILON;
  const intersection = (start, end) => {
    const startValue = a * start[0] + b * start[1] - c;
    const endValue = a * end[0] + b * end[1] - c;
    const denominator = startValue - endValue;
    if (Math.abs(denominator) < EPSILON) return end;
    const t = startValue / denominator;
    return [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ];
  };

  const output = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = inside(previous);
  for (const current of polygon) {
    const currentInside = inside(current);
    if (currentInside !== previousInside) output.push(intersection(previous, current));
    if (currentInside) output.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return output;
}

function distinctSites(parentBounds, items) {
  const groups = new Map();
  for (const item of items) {
    const site = center(item.bounds);
    const key = `${site[0]}\u0000${site[1]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...item, site });
  }
  const radius = Math.max(1e-5, Math.min(parentBounds.width, parentBounds.height) * 1e-6);
  const result = [];
  for (const group of groups.values()) {
    group.sort((left, right) => String(left.id).localeCompare(String(right.id)));
    if (group.length === 1) { result.push(group[0]); continue; }
    for (let index = 0; index < group.length; index += 1) {
      const angle = (Math.PI * 2 * index) / group.length;
      result.push({
        ...group[index],
        site: [
          group[index].site[0] + Math.cos(angle) * radius,
          group[index].site[1] + Math.sin(angle) * radius,
        ],
      });
    }
  }
  return result;
}

export function voronoiCells(parentBounds, items) {
  if (!Array.isArray(items) || items.length === 0) return Object.freeze([]);
  const sites = distinctSites(parentBounds, items);
  return Object.freeze(sites.map((item) => {
    let polygon = rectanglePolygon(parentBounds);
    const [px, py] = item.site;
    for (const other of sites) {
      if (other.id === item.id) continue;
      const [qx, qy] = other.site;
      const a = 2 * (qx - px);
      const b = 2 * (qy - py);
      const c = qx * qx + qy * qy - px * px - py * py;
      polygon = clipHalfPlane(polygon, a, b, c);
      if (polygon.length === 0) break;
    }
    return Object.freeze({
      id: item.id,
      points: Object.freeze(polygon.map(([x, y]) => Object.freeze([x, y]))),
    });
  }));
}
