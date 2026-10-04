import { BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA } from './model.mjs';

const fail = message => { throw new Error(`business-model-semantic-map: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };
const depthOf = (node, byId) => {
  let depth = 0;
  let current = node;
  while (current.parent) {
    depth += 1;
    current = byId.get(current.parent);
    invariant(current, `missing parent for ${node.id}`);
  }
  return depth;
};

export const projectBusinessModelSemanticMapRecords = model => {
  invariant(model?.schema === BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA, `model.schema must be ${BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA}`);
  const rootId = 'business-model-root';
  const occupied = new Set([rootId]);
  for (const group of [model.actors, model.nodes, model.activities]) {
    for (const item of group) {
      invariant(!occupied.has(item.id), `region id is duplicated: ${item.id}`);
      occupied.add(item.id);
    }
  }
  const stageOrder = new Map(model.stages.map(stage => [stage.id, stage.order]));
  const actorOrder = new Map(model.actors.map((actor, index) => [actor.id, index]));
  const nodeById = new Map(model.nodes.map(node => [node.id, node]));
  const width = Math.max(1_200, 260 + model.stages.length * 210);
  const height = Math.max(720, 160 + model.actors.length * 180 + model.nodes.length * 36);
  const records = [
    { type: 'meta', schema: 'semantic-map-state/1', root: rootId, title: model.title },
    { type: 'region', id: rootId, parent: null, label: model.title, kind: 'root', bounds: [0, 0, width, height], summary: model.kicker },
  ];
  model.actors.forEach((actor, index) => records.push({
    type: 'region', id: actor.id, parent: rootId, label: actor.label, kind: 'actor',
    bounds: [40, 90 + index * 160, 170, 92], summary: actor.detail,
  }));
  const nodeOffsets = new Map(model.actors.map(actor => [actor.id, 0]));
  for (const node of model.nodes) {
    const actorIndex = actorOrder.get(node.owner);
    invariant(Number.isSafeInteger(actorIndex), `node ${node.id} actor is missing`);
    const offset = nodeOffsets.get(node.owner) ?? 0;
    nodeOffsets.set(node.owner, offset + 1);
    const depth = depthOf(node, nodeById);
    records.push({
      type: 'region', id: node.id, parent: node.parent ?? node.owner, label: node.label, kind: node.kind,
      bounds: [250 + depth * 26, 80 + actorIndex * 160 + offset * 72, 190, 56],
      summary: node.detail ?? node.role ?? node.label,
    });
  }
  for (const activity of model.activities) {
    const stage = stageOrder.get(activity.stage);
    const actor = actorOrder.get(activity.actor);
    invariant(Number.isSafeInteger(stage) && Number.isSafeInteger(actor), `activity ${activity.id} stage/actor is missing`);
    records.push({
      type: 'region', id: activity.id, parent: rootId, label: activity.label, kind: 'task',
      bounds: [260 + stage * 190, 390 + actor * 110, 160, 64], summary: activity.summary,
      temporal: { actor: activity.actor, ordinal: { start: stage, end: stage } },
    });
  }
  for (const transition of model.transitions) records.push({
    type: 'relation', id: transition.id, from: transition.from, to: transition.to, kind: transition.kind, label: transition.label,
  });
  for (const exchange of model.exchanges) records.push({
    type: 'relation', id: exchange.id, from: exchange.from, to: exchange.to, kind: exchange.kind, label: exchange.label,
  });
  return Object.freeze(records.map(record => Object.freeze(record)));
};
