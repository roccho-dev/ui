import { createMapLayout } from '../spatial-layout.js';

const SET_TOPOLOGY_RELATIONS = new Set(['subsetOf', 'disjointWith', 'overlapsWith']);

function createPlan(domain) {
  const layout = createMapLayout(domain);
  return Object.freeze({
    ...layout,
    nodes: Object.freeze([...domain.regions.values()].filter(region => region.id !== domain.meta.root && layout.bounds.has(region.id))),
    relations: domain.relations.filter(relation => layout.bounds.has(relation.from) && layout.bounds.has(relation.to)),
  });
}

function project({ node, transform, depthOffset, clipBounds, api }) {
  const domain = node.domain;
  const localVisible = new Map();
  const {
    addRelation, addRepresentation, area, clippedBounds, detailIds, detailsVisible,
    intersect, mountedChild, nodePlan, projectMounted, selectionProxies, transformBounds,
    visibleViewport,
  } = api;

  const visit = (localId, force = false) => {
    const region = domain.regions.get(localId);
    const projectedBounds = clippedBounds(transformBounds(nodePlan(node).bounds.get(localId) ?? region.bounds, transform), clipBounds);
    if (area(projectedBounds) === 0 || area(intersect(projectedBounds, visibleViewport)) === 0) return;
    const childIds = domain.children.get(localId);
    const mounted = mountedChild(node, region);
    const hasChildren = childIds.length > 0 || Boolean(mounted);
    const showDetails = detailsVisible(node, region, projectedBounds, hasChildren, force);
    const depth = depthOffset + domain.depthById.get(localId);
    const representation = addRepresentation(node, region, projectedBounds, hasChildren || force ? 'boundary' : 'overview', depth, {
      hasChildren,
      detailsVisible: showDetails,
      geometryEditable: Boolean(nodePlan(node).geometryEditable),
    });
    localVisible.set(localId, representation.regionId);
    if (!showDetails || !hasChildren) return;
    detailIds.add(representation.regionId);
    for (const childId of childIds) visit(childId, false);
    if (mounted) projectMounted(node, region, projectedBounds, depth, representation.regionId);
  };

  visit(domain.meta.root, true);
  for (const relation of domain.relations) {
    if (SET_TOPOLOGY_RELATIONS.has(relation.kind)) continue;
    addRelation(node, relation, localVisible.get(relation.from), localVisible.get(relation.to));
  }
  if (!node.namespace) for (const id of domain.regions.keys()) selectionProxies[id] = localVisible.get(id) ?? null;
}

export const mapViewTypeProjection = Object.freeze({
  id: 'map/1',
  createPlan,
  planKey: () => 'map/1',
  project,
});
