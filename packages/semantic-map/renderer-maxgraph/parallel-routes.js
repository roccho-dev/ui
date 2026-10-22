// Render-owned bends leave canonical endpoints, relation IDs and saved layout
// pins untouched. Shared endpoints are allowed; distinct graph relations get
// separate middle segments and annotation positions at every camera scale.
export function parallelRoutePoints(scene, gap = 32) {
  if (!(Number.isFinite(scene.scale) && scene.scale > 0 && Number.isFinite(gap) && gap > 0)) {
    throw new Error('parallel routes require a positive scale and gap');
  }
  const nodes = new Map(scene.representations.map(item => [item.regionId, item]));
  const groups = new Map(), result = new Map();
  for (const relation of scene.relations) {
    if (!['graph', 'graph-metrics', 'graph-control'].includes(relation.line) || relation.from === relation.to) continue;
    const ends = [relation.from, relation.to].sort();
    const key = JSON.stringify(ends);
    if (!groups.has(key)) groups.set(key, { ends, relations: [] });
    groups.get(key).relations.push(relation);
    result.set(relation.id, []);
  }
  for (const { ends, relations } of groups.values()) {
    if (relations.length < 2) continue;
    const bounds = ends.map(id => nodes.get(id)?.bounds);
    if (bounds.some(box => !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite))) continue;
    const centers = bounds.map(box => [box.x + box.width / 2, box.y + box.height / 2]);
    const dx = centers[1][0] - centers[0][0], dy = centers[1][1] - centers[0][1];
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const middle = [(centers[0][0] + centers[1][0]) / 2, (centers[0][1] + centers[1][1]) / 2];
    const ordered = [...relations].sort((left, right) => String(left.id).localeCompare(String(right.id)));
    ordered.forEach((relation, index) => {
      const offset = (index - (ordered.length - 1) / 2) * gap / scene.scale;
      result.set(relation.id, [[middle[0] - dy * offset / length, middle[1] + dx * offset / length]]);
    });
  }
  return result;
}
