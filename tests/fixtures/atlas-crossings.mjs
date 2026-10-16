// Counts drawn relation crossings in a projected World scene: each relation as
// the straight segment between its endpoint regions' centers, every pair of
// segments that properly cross once. Pairs sharing an endpoint never count.
const center = ({ x, y, width, height }) => [x + width / 2, y + height / 2];
const orientation = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));

export const countRelationCrossings = scene => {
  const bounds = new Map(scene.representations.map(item => [item.regionId, item.bounds]));
  const segments = scene.relations.filter(item => bounds.has(item.from) && bounds.has(item.to) && item.from !== item.to)
    .map(item => ({ ends: [item.from, item.to], a: center(bounds.get(item.from)), b: center(bounds.get(item.to)) }));
  let crossings = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const p = segments[i], q = segments[j];
      if (p.ends.some(end => q.ends.includes(end))) continue;
      const o1 = orientation(p.a, p.b, q.a), o2 = orientation(p.a, p.b, q.b);
      const o3 = orientation(q.a, q.b, p.a), o4 = orientation(q.a, q.b, p.b);
      if (o1 * o2 < 0 && o3 * o4 < 0) crossings += 1;
    }
  }
  return crossings;
};
