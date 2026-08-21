import { parseJsonlLines } from "../../core-port/src/jsonl.mjs";
import { projectA2uiSurface } from "../../core-port/src/project.mjs";
import { defineComponent, makeRegistry } from "../../core-port/src/registry.mjs";
import { createAtlasStageCatalog } from "./catalog/atlas-stage.mjs";
import { isPlainObject } from "./catalog/runtime.mjs";

export const ARTIFACT_RUNTIME_JSONL_SURFACE_SCHEMA = "artifact-runtime-jsonl-surface/1";
export const ARTIFACT_RUNTIME_JSONL_RECEIPT_SCHEMA = "artifact-runtime-jsonl-surface-receipt/1";
export const ARTIFACT_RUNTIME_JSONL_COMPONENTS = Object.freeze([
  "AtlasStage",
  "Button",
  "Card",
  "Column",
  "Divider",
  "Text",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const RESERVED_PROPS = new Set(["children", "component", "id"]);
const CHILDREN = Object.freeze({
  AtlasStage: "none",
  Button: "none",
  Card: "recursive",
  Column: "recursive",
  Divider: "none",
  Text: "none",
});
const invariant = (condition, message) => {
  if (!condition) throw new Error(`artifact-runtime-jsonl: ${message}`);
};
const clone = value => structuredClone(value);
const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

let registry = null;
export const createArtifactRuntimeJsonlRegistry = () => {
  if (!registry) registry = makeRegistry(ARTIFACT_RUNTIME_JSONL_COMPONENTS.map(id => defineComponent({
    id,
    family: id === "AtlasStage" ? "canvas" : id === "Column" || id === "Card" ? "layout" : id === "Button" ? "action" : "primitive",
    stability: "stable",
    childrenPolicy: CHILDREN[id],
    producesOutputKinds: ["a2ui-surface/1"],
  })), { title: "Artifact Runtime JSONL component registry", version: "v1" });
  return registry;
};

const compileNode = ({ catalog, components, ids, node }) => {
  invariant(node?.registered !== false, `unregistered component ${node?.type ?? "unknown"}`);
  invariant(typeof node?.id === "string" && SAFE_ID.test(node.id), `${node?.type ?? "component"}.id is invalid`);
  invariant(!ids.has(node.id), `duplicate component ${node.id}`);
  invariant(isPlainObject(node.props), `${node.id}.props must be a plain object`);
  for (const key of Object.keys(node.props)) invariant(!RESERVED_PROPS.has(key), `${node.id}.props.${key} is reserved`);
  const policy = CHILDREN[node.type];
  invariant(policy, `unsupported component ${node.type}`);
  const childIds = node.children.map(child => compileNode({ catalog, components, ids, node: child }));
  if (policy === "none") invariant(childIds.length === 0, `${node.id} cannot contain children`);
  const raw = {
    component: node.type,
    id: node.id,
    ...clone(node.props),
    ...(policy === "recursive" ? { children: childIds } : {}),
  };
  const validated = catalog.validateComponent(raw);
  ids.add(validated.id);
  components.push(validated);
  return validated.id;
};

export const compileArtifactRuntimeJsonlSurface = ({ jsonl }) => {
  invariant(typeof jsonl === "string" && jsonl.trim().length > 0, "JSONL input is required");
  const rows = parseJsonlLines(jsonl);
  invariant(rows.length > 0, "JSONL must contain at least one row");
  const projected = projectA2uiSurface(rows, createArtifactRuntimeJsonlRegistry());
  invariant(projected.hasTree && projected.tree?.root, "JSONL did not produce a component tree");
  invariant(projected.errors.length === 0, `JSONL projection failed: ${projected.errors.join("; ")}`);
  invariant(projected.tree.unknownTypes.length === 0, `JSONL contains unregistered components: ${projected.tree.unknownTypes.join(", ")}`);
  invariant(isPlainObject(projected.state), "JSONL state must reduce to a plain object");

  const components = [];
  const rootId = compileNode({ catalog: createAtlasStageCatalog(), components, ids: new Set(), node: projected.tree.root });
  const surface = deepFreeze({
    schema: "a2ui-surface/1",
    rootId,
    surfaceId: rootId,
    dataModel: clone(projected.state),
    components,
  });
  const receipt = deepFreeze({
    schema: ARTIFACT_RUNTIME_JSONL_RECEIPT_SCHEMA,
    status: "PASS",
    authority: false,
    inputSchema: ARTIFACT_RUNTIME_JSONL_SURFACE_SCHEMA,
    rowCount: rows.length,
    componentCount: components.length,
    rootId,
    surfaceId: rootId,
    componentTypes: [...new Set(components.map(component => component.component))].sort(),
  });
  return deepFreeze({ surface, receipt });
};
