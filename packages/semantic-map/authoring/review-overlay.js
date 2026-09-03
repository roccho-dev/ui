import { REVIEW_MODEL_SCHEMA } from './review-model.js';

export const REVIEW_OVERLAY_SCHEMA = 'semantic-map-review-overlay/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-review-overlay: ${message}`);
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

function cloneBounds(bounds) {
  if (!bounds) return null;
  return Object.freeze({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}

function representationFor(scene, sourceRegionId) {
  if (!scene) return null;
  const direct = scene.representations.find((item) => (
    item.moduleNamespace === null && item.sourceRegionId === sourceRegionId
  ));
  if (direct) return direct;
  const projectedId = scene.selectionProxies?.[sourceRegionId] ?? sourceRegionId;
  return scene.representations.find((item) => item.regionId === projectedId) ?? null;
}

function relationFor(scene, sourceRelationId) {
  if (!scene) return null;
  return scene.relations.find((item) => (
    item.sceneId === 'root'
    && item.relationIds.includes(sourceRelationId)
  )) ?? null;
}

function segmentFor(scene, sourceRelationId) {
  const relation = relationFor(scene, sourceRelationId);
  if (!relation) return null;
  const from = scene.representations.find((item) => item.regionId === relation.from) ?? null;
  const to = scene.representations.find((item) => item.regionId === relation.to) ?? null;
  if (!from || !to) return null;
  return Object.freeze({
    from: Object.freeze({
      x: from.bounds.x + from.bounds.width / 2,
      y: from.bounds.y + from.bounds.height / 2,
    }),
    to: Object.freeze({
      x: to.bounds.x + to.bounds.width / 2,
      y: to.bounds.y + to.bounds.height / 2,
    }),
  });
}

export function createSemanticReviewOverlay(model, beforeScene, afterScene) {
  invariant(model?.schema === REVIEW_MODEL_SCHEMA, 'review model is required');
  invariant(model.authority === false && model.status === 'proposal', 'review model must remain a non-authority Proposal');
  invariant(beforeScene && afterScene, 'before and after Scenes are required');

  const regions = model.decorations.regions.map((entry) => {
    const before = representationFor(beforeScene, entry.id);
    const after = representationFor(afterScene, entry.id);
    return Object.freeze({
      id: entry.id,
      status: entry.status,
      changedFields: entry.changedFields,
      beforeBounds: cloneBounds(before?.bounds ?? null),
      afterBounds: cloneBounds(after?.bounds ?? null),
      beforeProjectionId: before?.regionId ?? null,
      afterProjectionId: after?.regionId ?? null,
      visible: Boolean(before || after),
    });
  }).sort((left, right) => compareText(left.id, right.id));

  const relations = model.decorations.relations.map((entry) => {
    const before = segmentFor(beforeScene, entry.id);
    const after = segmentFor(afterScene, entry.id);
    return Object.freeze({
      id: entry.id,
      status: entry.status,
      changedFields: entry.changedFields,
      before,
      after,
      visible: Boolean(before || after),
    });
  }).sort((left, right) => compareText(left.id, right.id));

  return Object.freeze({
    schema: REVIEW_OVERLAY_SCHEMA,
    authority: false,
    status: 'proposal',
    proposalId: model.identities.proposalId,
    regions: Object.freeze(regions),
    relations: Object.freeze(relations),
    counts: Object.freeze({
      regions: regions.filter((item) => item.visible).length,
      relations: relations.filter((item) => item.visible).length,
    }),
  });
}
