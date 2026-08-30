import { deriveSetSemantics } from '../domain/index.js';
import { MAP_PATTERN } from '../pattern/index.js';

export function projectSetOverlay(contexts, representationsById, projectRegionId) {
  const sets = [];
  const pairs = [];
  for (const context of contexts) {
    if (context.layout.pattern !== MAP_PATTERN) continue;
    const semantics = deriveSetSemantics(context.domain);
    for (const set of semantics.sets) {
      const projectedId = projectRegionId(context.node, set.id);
      const representation = representationsById.get(projectedId);
      if (!representation) continue;
      sets.push(Object.freeze({
        sceneId: representation.sceneId,
        regionId: projectedId,
        complete: set.complete,
        members: Object.freeze(set.members.map((id) => projectRegionId(context.node, id))),
        bounds: representation.bounds,
      }));
    }
    for (const pair of semantics.pairs) {
      pairs.push(Object.freeze({
        sceneId: context.node.namespace || 'root',
        left: projectRegionId(context.node, pair.left),
        right: projectRegionId(context.node, pair.right),
        topology: pair.topology,
        overlapKnown: pair.overlapKnown,
        intersection: Object.freeze(pair.intersection.map((id) => projectRegionId(context.node, id))),
      }));
    }
  }
  return Object.freeze({ sets: Object.freeze(sets), pairs: Object.freeze(pairs) });
}
