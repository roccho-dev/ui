import { BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA } from "../../business-model/model.mjs";

export const BUSINESS_MODEL_PROJECTION_PROFILE_SCHEMA = "business-model-projection-profile/1";
export const BUSINESS_MODEL_PRESENTATION_PLAN_SCHEMA = "business-model-presentation-plan/1";

const fail = message => { throw new Error(`business-model-profile: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, name) => { invariant(typeof value === "string" && value.trim().length > 0, `${name} is required`); return value.trim(); };
const token = (value, name) => {
  const result = text(value, name);
  invariant(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(result), `${name} is invalid`);
  return result;
};
const exactKeys = (record, required, optional, name) => {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(record, key), `${name}.${key} is required`);
  for (const key of Object.keys(record)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};
const tokenArray = (value, name) => {
  invariant(Array.isArray(value) && value.length > 0, `${name} must be a non-empty array`);
  const result = value.map((item, index) => token(item, `${name}[${index}]`));
  invariant(new Set(result).size === result.length, `${name} contains duplicates`);
  return Object.freeze(result);
};
const deepFreeze = value => {
  if (Array.isArray(value)) { value.forEach(deepFreeze); return Object.freeze(value); }
  if (plain(value)) { Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
  return value;
};
const SEMANTIC_TYPES = Object.freeze(["stages", "actors", "nodes", "exchanges", "activities", "transitions"]);
const exclusionTypes = (value, name) => {
  const result = tokenArray(value, name);
  for (const item of result) invariant(SEMANTIC_TYPES.includes(item), `${name} contains unsupported semantic type ${item}`);
  return result;
};

export const parseBusinessModelProjectionProfile = input => {
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input); } catch (error) { fail(`invalid JSON: ${error.message}`); }
  }
  invariant(plain(value), "profile must be an object");
  exactKeys(value, ["schema", "id", "label", "actors", "placement", "exclude"], [], "profile");
  invariant(value.schema === BUSINESS_MODEL_PROJECTION_PROFILE_SCHEMA, `profile.schema must be ${BUSINESS_MODEL_PROJECTION_PROFILE_SCHEMA}`);
  const actors = value.actors;
  invariant(plain(actors), "profile.actors must be an object");
  exactKeys(actors, ["order"], [], "profile.actors");
  const placement = value.placement;
  invariant(plain(placement), "profile.placement must be an object");
  exactKeys(placement, ["nodes", "exchanges"], [], "profile.placement");
  const nodes = placement.nodes;
  invariant(plain(nodes), "profile.placement.nodes must be an object");
  exactKeys(nodes, ["mode", "maxDepth"], [], "profile.placement.nodes");
  invariant(nodes.mode === "actor-tree", "profile.placement.nodes.mode must be actor-tree");
  invariant(Number.isSafeInteger(nodes.maxDepth) && nodes.maxDepth >= 0 && nodes.maxDepth <= 8, "profile.placement.nodes.maxDepth is invalid");
  const exchanges = placement.exchanges;
  invariant(plain(exchanges), "profile.placement.exchanges must be an object");
  exactKeys(exchanges, ["mode"], [], "profile.placement.exchanges");
  invariant(exchanges.mode === "between-actors", "profile.placement.exchanges.mode must be between-actors");
  const exclude = value.exclude;
  invariant(plain(exclude), "profile.exclude must be an object");
  exactKeys(exclude, ["semanticTypes", "ids"], [], "profile.exclude");
  return deepFreeze({
    schema: BUSINESS_MODEL_PROJECTION_PROFILE_SCHEMA,
    id: token(value.id, "profile.id"),
    label: text(value.label, "profile.label"),
    actors: { order: tokenArray(actors.order, "profile.actors.order") },
    placement: {
      nodes: { mode: nodes.mode, maxDepth: nodes.maxDepth },
      exchanges: { mode: exchanges.mode },
    },
    exclude: {
      semanticTypes: exclusionTypes(exclude.semanticTypes, "profile.exclude.semanticTypes"),
      ids: Object.freeze(Array.isArray(exclude.ids) ? exclude.ids.map((item, index) => token(item, `profile.exclude.ids[${index}]`)) : fail("profile.exclude.ids must be an array")),
    },
  });
};

const validateModel = model => {
  invariant(model?.schema === BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA, `model.schema must be ${BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA}`);
  return model;
};
const byId = items => new Map(items.map(item => [item.id, item]));
const childNodes = model => {
  const result = new Map(model.nodes.map(node => [node.id, []]));
  for (const node of model.nodes) if (node.parent) result.get(node.parent).push(node);
  return result;
};
const depthFor = (node, nodes) => {
  let depth = 0;
  let cursor = node;
  const seen = new Set([node.id]);
  while (cursor.parent) {
    invariant(!seen.has(cursor.parent), `node hierarchy cycle at ${cursor.parent}`);
    seen.add(cursor.parent);
    cursor = nodes.get(cursor.parent);
    invariant(cursor, `node ${node.id} parent ${node.parent} is missing`);
    depth += 1;
  }
  return depth;
};

export const compileBusinessModelPresentationPlan = (inputModel, inputProfile) => {
  const model = validateModel(inputModel);
  const profile = parseBusinessModelProjectionProfile(inputProfile);
  const excludedIds = new Set(profile.exclude.ids);
  const excludedTypes = new Set(profile.exclude.semanticTypes);
  const actorsById = byId(model.actors);
  for (const actorId of profile.actors.order) invariant(actorsById.has(actorId), `profile actor ${actorId} is missing from model`);
  invariant(profile.actors.order.length === model.actors.length, "profile actor order must cover all model actors exactly once");
  const nodesById = byId(model.nodes);
  const nodeChildren = childNodes(model);
  const nodesByActor = Object.fromEntries(profile.actors.order.map(actorId => [actorId, []]));
  if (!excludedTypes.has("nodes")) {
    for (const node of model.nodes) {
      if (excludedIds.has(node.id)) continue;
      invariant(Object.hasOwn(nodesByActor, node.owner), `node ${node.id} owner ${node.owner} is outside profile actor order`);
      const depth = depthFor(node, nodesById);
      invariant(depth <= profile.placement.nodes.maxDepth, `node ${node.id} exceeds profile node maxDepth`);
      nodesByActor[node.owner].push(Object.freeze({ ...node, depth }));
    }
  }
  for (const [actorId, nodes] of Object.entries(nodesByActor)) {
    const roots = nodes.filter(node => !node.parent || excludedIds.has(node.parent));
    invariant(roots.length <= nodes.length, `actor ${actorId} node roots are invalid`);
    for (const node of nodes) if (node.parent && !excludedIds.has(node.parent)) invariant(nodeChildren.has(node.parent), `node ${node.id} parent ${node.parent} is missing`);
  }
  const exchanges = excludedTypes.has("exchanges") ? [] : model.exchanges.filter(item => !excludedIds.has(item.id));
  const actorOrder = new Map(profile.actors.order.map((actorId, index) => [actorId, index]));
  const exchangeGroups = new Map();
  for (const exchange of exchanges) {
    invariant(actorOrder.has(exchange.from) && actorOrder.has(exchange.to), `exchange ${exchange.id} references actor outside profile`);
    const leftIndex = Math.min(actorOrder.get(exchange.from), actorOrder.get(exchange.to));
    const rightIndex = Math.max(actorOrder.get(exchange.from), actorOrder.get(exchange.to));
    invariant(rightIndex - leftIndex === 1, `exchange ${exchange.id} must connect adjacent profile actors`);
    const key = `${leftIndex}:${rightIndex}`;
    if (!exchangeGroups.has(key)) exchangeGroups.set(key, []);
    exchangeGroups.get(key).push(exchange.id);
  }
  const columns = [];
  profile.actors.order.forEach((actorId, index) => {
    columns.push(Object.freeze({ kind: "actor", id: `actor:${actorId}`, actorRef: actorId }));
    if (index === profile.actors.order.length - 1) return;
    const nextActor = profile.actors.order[index + 1];
    const refs = Object.freeze([...(exchangeGroups.get(`${index}:${index + 1}`) ?? [])]);
    columns.push(Object.freeze({ kind: "exchange", id: `exchange:${actorId}:${nextActor}`, leftActorRef: actorId, rightActorRef: nextActor, exchangeRefs: refs }));
  });
  return deepFreeze({
    schema: BUSINESS_MODEL_PRESENTATION_PLAN_SCHEMA,
    profile,
    modelId: model.id,
    stageIds: model.stages.map(stage => stage.id),
    columns,
    nodesByActor,
  });
};
