import { createGraphLayout } from '../spatial-layout.js';

function createPlan(domain) {
  const layout = createGraphLayout(domain);
  return Object.freeze({
    ...layout,
    nodes: Object.freeze([...domain.regions.values()].filter(region => region.id !== domain.meta.root && layout.bounds.has(region.id))),
    relations: domain.relations.filter(relation => layout.bounds.has(relation.from) && layout.bounds.has(relation.to)),
  });
}

function project({ node, plan, transform, depthOffset, rootProxy, clipBounds, api }) {
  const domain = node.domain;
  const localVisible = new Map();
  const proxyCache = new Map();
  const {
    addRelation, addRepresentation, area, clippedBounds, detailIds, detailsVisible,
    intersect, mountedChild, projectMounted, selectionProxies, transformBounds, visibleViewport,
  } = api;

  const visit = (localId, force = false) => {
    const region = domain.regions.get(localId);
    const localBounds = plan.bounds.get(localId);
    if (!region || !localBounds) return;
    const projectedBounds = clippedBounds(transformBounds(localBounds, transform), clipBounds);
    if (area(projectedBounds) === 0 || area(intersect(projectedBounds, visibleViewport)) === 0) return;
    const childIds = (domain.children.get(localId) ?? []).filter(childId => plan.bounds.has(childId));
    const mounted = mountedChild(node, region);
    const hasChildren = childIds.length > 0 || Boolean(mounted);
    const showDetails = detailsVisible(node, region, projectedBounds, hasChildren, force);
    const depth = depthOffset + domain.depthById.get(localId);
    const representation = addRepresentation(node, region, projectedBounds, hasChildren || force ? 'boundary' : 'node', depth, {
      hasChildren,
      detailsVisible: showDetails,
      geometryEditable: Boolean(plan.geometryEditable),
    });
    localVisible.set(localId, representation.regionId);
    if (!showDetails || !hasChildren) return;
    detailIds.add(representation.regionId);
    for (const childId of childIds) visit(childId, false);
    if (mounted) projectMounted(node, region, projectedBounds, depth, representation.regionId);
  };

  const visibleProxy = localId => {
    if (proxyCache.has(localId)) return proxyCache.get(localId);
    let current = localId;
    while (current !== null) {
      const visible = localVisible.get(current);
      if (visible) {
        proxyCache.set(localId, visible);
        return visible;
      }
      current = domain.regions.get(current)?.parent ?? null;
    }
    proxyCache.set(localId, rootProxy ?? null);
    return rootProxy ?? null;
  };

  visit(domain.meta.root, true);
  for (const relation of plan.relations) addRelation(node, relation, visibleProxy(relation.from), visibleProxy(relation.to));
  if (!node.namespace) for (const id of domain.regions.keys()) selectionProxies[id] = visibleProxy(id);
}

export const graphViewTypeProjection = Object.freeze({
  id: 'graph/1',
  createPlan,
  planKey: () => 'graph/1',
  project,
});
