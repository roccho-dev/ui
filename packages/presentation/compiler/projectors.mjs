import { A2UI_MESSAGE_VERSION } from "../../a2ui-browser/src/index.mjs";
import { PROFILED_BUSINESS_MODEL_CATALOG_ID, PROFILED_BUSINESS_MODEL_SURFACE_ID } from "./catalog.mjs";
import { BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA } from "./model.mjs";
import { BUSINESS_MODEL_PRESENTATION_PLAN_SCHEMA } from "./profile.mjs";

export const PROFILED_BUSINESS_MODEL_SEQUENCE_SCHEMA = "business-model-profiled-a2ui-sequence/1";

const fail = message => { throw new Error(`business-model-projector: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };
const deepFreeze = value => {
  if (Array.isArray(value)) { value.forEach(deepFreeze); return Object.freeze(value); }
  if (value !== null && typeof value === "object") { Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
  return value;
};
const byId = items => new Map(items.map(item => [item.id, item]));
const stageOrder = model => new Map(model.stages.map(stage => [stage.id, stage.order]));
const visualState = (model, born, stageId) => {
  const orders = stageOrder(model);
  const bornOrder = orders.get(born);
  const currentOrder = orders.get(stageId);
  invariant(Number.isSafeInteger(bornOrder) && Number.isSafeInteger(currentOrder), `stage order lookup failed for ${born}/${stageId}`);
  return currentOrder === bornOrder ? "new" : currentOrder > bornOrder ? "done" : null;
};
const visible = (model, born, stageId) => visualState(model, born, stageId) !== null;
const objectById = items => Object.freeze(Object.fromEntries(items.map(item => [item.id, Object.freeze({ ...item })])));

const dataModelFor = (model, plan, stage, stageIndex) => {
  const nodes = model.nodes.map(node => {
    const planned = plan.nodesByActor[node.owner].find(item => item.id === node.id);
    invariant(planned, `planned node is missing: ${node.id}`);
    return Object.freeze({ ...node, depth: planned.depth });
  });
  return deepFreeze({
    schema: BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA,
    source: { schema: model.sourceSchema, id: model.id },
    profile: { schema: plan.profile.schema, id: plan.profile.id, label: plan.profile.label },
    currentIndex: stageIndex,
    stage,
    stages: model.stages.map(({ id, short, caption, name, goal, change, evidence, gate, focusRef }) => ({ id, short, caption, name, goal, change, evidence, gate, focusRef })),
    actors: objectById(model.actors),
    nodes: objectById(nodes),
    exchanges: objectById(model.exchanges),
    activities: objectById(model.activities),
  });
};

export const projectProfiledBusinessModelA2uiSequence = (model, plan) => {
  invariant(model?.schema === BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA, `model.schema must be ${BUSINESS_MODEL_SEMANTIC_STATE_SCHEMA}`);
  invariant(plan?.schema === BUSINESS_MODEL_PRESENTATION_PLAN_SCHEMA, `plan.schema must be ${BUSINESS_MODEL_PRESENTATION_PLAN_SCHEMA}`);
  invariant(plan.modelId === model.id, "plan.modelId must match model.id");
  const actorById = byId(model.actors);
  const exchangeById = byId(model.exchanges);
  const stages = model.stages.map((stage, stageIndex) => {
    const children = [];
    const layout = [];
    const components = [
      { id: "root", component: "ProfiledBusinessModelRoot", children: ["header", "timeline", "scene", "status", "legend"] },
      { id: "header", component: "ProfiledBusinessModelHeader", kicker: model.kicker, title: model.title },
      { id: "timeline", component: "ProfiledBusinessModelTimeline", action: "business-model-profiled.select-stage" },
    ];
    for (const column of plan.columns) {
      if (column.kind === "actor") {
        const actor = actorById.get(column.actorRef);
        invariant(actor, `actor is missing: ${column.actorRef}`);
        if (!visible(model, actor.born, stage.id)) continue;
        const nodeStates = plan.nodesByActor[actor.id]
          .filter(node => visible(model, node.born, stage.id))
          .map(node => ({ ref: node.id, state: visualState(model, node.born, stage.id) }));
        const componentId = `actor-${actor.id}`;
        children.push(componentId);
        layout.push("actor");
        components.push({
          id: componentId,
          component: "ProfiledActor",
          actorRef: actor.id,
          state: visualState(model, actor.born, stage.id) ?? "plain",
          nodeStates,
        });
        continue;
      }
      const left = actorById.get(column.leftActorRef);
      const right = actorById.get(column.rightActorRef);
      if (!visible(model, left.born, stage.id) || !visible(model, right.born, stage.id)) continue;
      const exchangeStates = column.exchangeRefs
        .map(ref => exchangeById.get(ref))
        .filter(exchange => visible(model, exchange.born, stage.id))
        .map(exchange => ({ ref: exchange.id, state: visualState(model, exchange.born, stage.id) }));
      if (exchangeStates.length === 0) continue;
      const componentId = column.id;
      children.push(componentId);
      layout.push("exchange");
      components.push({
        id: componentId,
        component: "ProfiledExchangeGroup",
        leftActorRef: column.leftActorRef,
        rightActorRef: column.rightActorRef,
        exchangeStates,
      });
    }
    invariant(children.length > 0, `stage ${stage.id} has no visible scene columns`);
    components.splice(3, 0, { id: "scene", component: "ProfiledBusinessModelScene", children, layout });
    const activityRefs = model.activities
      .filter(activity => activity.stage === stage.id)
      .sort((a, b) => a.recordIndex - b.recordIndex)
      .map(activity => activity.id);
    components.push({ id: "status", component: "ProfiledBusinessModelStatus", activityRefs });
    components.push({ id: "legend", component: "ProfiledBusinessModelLegend" });
    const dataModel = dataModelFor(model, plan, stage, stageIndex);
    return deepFreeze({
      id: stage.id,
      index: stageIndex,
      messages: [
        { version: A2UI_MESSAGE_VERSION, updateDataModel: { surfaceId: PROFILED_BUSINESS_MODEL_SURFACE_ID, path: "/", value: dataModel } },
        { version: A2UI_MESSAGE_VERSION, updateComponents: { surfaceId: PROFILED_BUSINESS_MODEL_SURFACE_ID, components } },
      ],
    });
  });
  const create = deepFreeze({
    version: A2UI_MESSAGE_VERSION,
    createSurface: {
      surfaceId: PROFILED_BUSINESS_MODEL_SURFACE_ID,
      catalogId: PROFILED_BUSINESS_MODEL_CATALOG_ID,
      sendDataModel: true,
    },
  });
  return deepFreeze({
    schema: PROFILED_BUSINESS_MODEL_SEQUENCE_SCHEMA,
    catalogId: PROFILED_BUSINESS_MODEL_CATALOG_ID,
    surfaceId: PROFILED_BUSINESS_MODEL_SURFACE_ID,
    sourceId: model.id,
    profileId: plan.profile.id,
    start: model.start,
    stages: stages.map((stage, index) => ({ ...stage, messages: index === 0 ? [create, ...stage.messages] : stage.messages })),
  });
};
