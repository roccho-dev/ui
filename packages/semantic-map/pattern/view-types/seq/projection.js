import { createSeqLayout } from './layout.js';

function transformTemporalEdit(edit, transform) {
  if (!edit) return null;
  return Object.freeze({
    ...edit,
    axisStartX: edit.axisStartX * transform.scale + transform.translateX,
    unitWidth: edit.unitWidth * transform.scale,
    laneBands: Object.freeze(edit.laneBands.map(lane => Object.freeze({
      ...lane,
      y: lane.y * transform.scale + transform.translateY,
      height: lane.height * transform.scale,
    }))),
  });
}

function createPlan(domain, view) {
  return Object.freeze({ pattern: 'seq/1', geometryEditable: false, ...createSeqLayout(domain, view.seq) });
}

function project({ node, plan, transform, depthOffset, clipBounds, api }) {
  const domain = node.domain;
  const localVisible = new Map();
  const {
    addGuide, addRelation, addRepresentation, area, clippedBounds, detailIds,
    detailsVisible, intersect, mountedChild, projectMounted, selectionProxies,
    transformBounds, visibleViewport,
  } = api;
  const root = domain.regions.get(domain.meta.root);
  const rootBounds = clippedBounds(transformBounds(plan.rootBounds, transform), clipBounds);
  if (area(rootBounds) > 0 && area(intersect(rootBounds, visibleViewport)) > 0) {
    const rootRepresentation = addRepresentation(node, root, rootBounds, 'boundary', depthOffset, {
      hasChildren: plan.items.length > 0,
      detailsVisible: true,
    });
    localVisible.set(root.id, rootRepresentation.regionId);
  }
  for (const guide of plan.guides) {
    const guideBounds = clippedBounds(transformBounds(guide.bounds, transform), clipBounds);
    if (area(guideBounds) > 0 && area(intersect(guideBounds, visibleViewport)) > 0) addGuide(node, guide, guideBounds, depthOffset + 1);
  }
  for (const actor of plan.actors) {
    const localBounds = plan.actorBounds.get(actor.id);
    if (!localBounds) continue;
    const actorBounds = clippedBounds(transformBounds(localBounds, transform), clipBounds);
    if (area(actorBounds) === 0 || area(intersect(actorBounds, visibleViewport)) === 0) continue;
    const representation = addRepresentation(node, actor, actorBounds, 'lane', depthOffset + 2, { hasChildren: false, detailsVisible: false });
    localVisible.set(actor.id, representation.regionId);
  }
  for (const item of plan.items) {
    const itemBounds = clippedBounds(transformBounds(plan.bounds.get(item.id), transform), clipBounds);
    if (area(itemBounds) === 0 || area(intersect(itemBounds, visibleViewport)) === 0) continue;
    const mounted = mountedChild(node, item);
    const showDetails = detailsVisible(node, item, itemBounds, Boolean(mounted));
    const representation = addRepresentation(node, item, itemBounds, 'item', depthOffset + 3, {
      hasChildren: Boolean(mounted),
      detailsVisible: showDetails,
      temporalEdit: node.namespace ? null : transformTemporalEdit(plan.temporalEdit.get(item.id), transform),
    });
    localVisible.set(item.id, representation.regionId);
    if (showDetails && mounted) {
      detailIds.add(representation.regionId);
      projectMounted(node, item, itemBounds, depthOffset + 3, representation.regionId);
    }
  }
  for (const relation of plan.relations) addRelation(node, relation, localVisible.get(relation.from), localVisible.get(relation.to));
  if (!node.namespace) for (const id of domain.regions.keys()) selectionProxies[id] = localVisible.get(id) ?? null;
}

export const seqViewTypeProjection = Object.freeze({
  id: 'seq/1',
  createPlan,
  planKey: view => `seq/1\u0000${view.seq.axis}\u0000${view.seq.groupBy}`,
  project,
});
