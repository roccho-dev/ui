import { validateArtifactInvocation } from "../../../packages/artifact-invocation/src/index.mjs";
import { canonicalJson, canonicalValue, createUrlModuleUrl } from "../../../packages/url-module/src/index.mjs";

export const ARTIFACT_STATE_ACTION_SCHEMA = "artifact-state-action/1";
export const ARTIFACT_STATE_ACTION = "artifact.state.patch";
export const ARTIFACT_INPUT_ACTION_SCHEMA = "artifact-input-action/1";
export const ARTIFACT_INPUT_ACTION = "artifact.input.replace";
export const ARTIFACT_INVOCATION_OPEN_ACTION_SCHEMA = "artifact-invocation-open-action/1";
export const ARTIFACT_INVOCATION_OPEN_ACTION = "artifact.invocation.open";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-shell-action: ${message}`); };
const plain = value => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value, required, optional, name) => {
  invariant(plain(value), `${name} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};
const token = (value, name) => {
  invariant(typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value), `${name} is invalid`);
  return value;
};
const historyMode = (value, name = "context.history") => {
  invariant(value === "push" || value === "replace", `${name} is invalid`);
  return value;
};
const invocationReference = value => {
  invariant(typeof value === "string" && value.length > 0 && value.length <= 65_536, "context.reference is invalid");
  const marker = "#invoke=";
  const markerAt = value.indexOf(marker);
  invariant(value.startsWith("./") && markerAt > 2 && value.indexOf("#", markerAt + 1) < 0, "context.reference must be a Release-root-relative #invoke reference");
  const runtimePath = value.slice(0, markerAt);
  invariant(!runtimePath.includes("?") && !runtimePath.includes("\\"), "context.reference runtime path is unsafe");
  const segments = runtimePath.slice(2).split("/");
  invariant(segments.every(segment => segment.length > 0 && segment !== "." && segment !== ".." && !["current", "head", "latest"].includes(segment.toLowerCase())), "context.reference runtime path is mutable or unsafe");
  invariant(/^[A-Za-z0-9_-]+$/u.test(value.slice(markerAt + marker.length)), "context.reference invoke token is invalid");
  return value;
};
const mutableInlineInput = (request, inputId, actionName) => {
  const inputIndex = request.inputs.findIndex(input => input.id === inputId);
  invariant(inputIndex >= 0, `input does not exist: ${inputId}`);
  const input = request.inputs[inputIndex];
  invariant(input.source.kind === "inline", `${actionName} input must be inline`);
  invariant(!Object.hasOwn(input, "digest"), `${actionName} input must not carry an immutable digest`);
  return Object.freeze({ input, inputIndex });
};

const unsafeSegments = new Set(["__proto__", "constructor", "prototype"]);
const decodePointerSegment = value => {
  invariant(!/~(?:[^01]|$)/u.test(value), "JSON pointer escape is invalid");
  const result = value.replaceAll("~1", "/").replaceAll("~0", "~");
  invariant(result.length > 0 && !unsafeSegments.has(result), "JSON pointer segment is invalid");
  return result;
};
const statePointer = value => {
  invariant(typeof value === "string" && value.startsWith("/state/"), "operation.path must be below /state");
  invariant(value.length <= 512, "operation.path is too long");
  const segments = value.slice(1).split("/").map(decodePointerSegment);
  invariant(segments.length >= 2 && segments.length <= 32, "operation.path depth is invalid");
  return segments;
};
const ownChild = (container, segment, name) => {
  if (Array.isArray(container)) {
    invariant(/^(?:0|[1-9][0-9]*)$/u.test(segment), `${name} array index is invalid`);
    const index = Number(segment);
    invariant(index < container.length && Object.hasOwn(container, index), `${name} does not exist`);
    return Object.freeze({ key: index, value: container[index] });
  }
  invariant(plain(container), `${name} parent must be an object or array`);
  invariant(Object.hasOwn(container, segment), `${name} does not exist`);
  return Object.freeze({ key: segment, value: container[segment] });
};
const locate = (root, segments, name) => {
  let parent = root;
  for (const segment of segments.slice(0, -1)) parent = ownChild(parent, segment, name).value;
  const leaf = ownChild(parent, segments.at(-1), name);
  return Object.freeze({ key: leaf.key, parent, value: leaf.value });
};
const normalizeOperation = (value, index) => {
  const name = `context.operations[${index}]`;
  invariant(plain(value), `${name} must be a plain object`);
  invariant(value.op === "replace" || value.op === "increment", `${name}.op is unsupported`);
  if (value.op === "replace") {
    exactKeys(value, ["op", "path", "value"], [], name);
    return Object.freeze({ op: "replace", path: statePointer(value.path), value: structuredClone(value.value) });
  }
  exactKeys(value, ["by", "op", "path"], [], name);
  invariant(Number.isSafeInteger(value.by) && value.by !== 0, `${name}.by must be a non-zero safe integer`);
  return Object.freeze({ by: value.by, op: "increment", path: statePointer(value.path) });
};
const normalizeStateContext = value => {
  exactKeys(value, ["history", "inputId", "operations", "schema"], [], "context");
  invariant(value.schema === ARTIFACT_STATE_ACTION_SCHEMA, `context.schema must be ${ARTIFACT_STATE_ACTION_SCHEMA}`);
  invariant(Array.isArray(value.operations) && value.operations.length > 0 && value.operations.length <= 16, "context.operations must contain 1..16 items");
  return Object.freeze({
    history: historyMode(value.history),
    inputId: token(value.inputId, "context.inputId"),
    operations: Object.freeze(value.operations.map(normalizeOperation)),
    schema: ARTIFACT_STATE_ACTION_SCHEMA,
  });
};
const normalizeInputContext = value => {
  exactKeys(value, ["expectedValue", "history", "inputId", "schema", "value"], [], "context");
  invariant(value.schema === ARTIFACT_INPUT_ACTION_SCHEMA, `context.schema must be ${ARTIFACT_INPUT_ACTION_SCHEMA}`);
  return Object.freeze({
    expectedValue: canonicalValue(value.expectedValue),
    history: historyMode(value.history),
    inputId: token(value.inputId, "context.inputId"),
    schema: ARTIFACT_INPUT_ACTION_SCHEMA,
    value: canonicalValue(value.value),
  });
};

export const applyArtifactStateAction = ({ detail, request: requestInput }) => {
  invariant(plain(detail), "detail must be a plain object");
  invariant(detail.action === ARTIFACT_STATE_ACTION, `detail.action must be ${ARTIFACT_STATE_ACTION}`);
  const context = normalizeStateContext(detail.context);
  const request = validateArtifactInvocation(requestInput);
  const { input, inputIndex } = mutableInlineInput(request, context.inputId, "state action");
  invariant(plain(input.source.value) && plain(input.source.value.state), "state action input must contain a plain state object");

  const nextValue = structuredClone(input.source.value);
  for (const [index, operation] of context.operations.entries()) {
    const target = locate(nextValue, operation.path, `context.operations[${index}].path`);
    if (operation.op === "replace") {
      target.parent[target.key] = structuredClone(operation.value);
      continue;
    }
    invariant(Number.isSafeInteger(target.value), `context.operations[${index}] target must be a safe integer`);
    const next = target.value + operation.by;
    invariant(Number.isSafeInteger(next), `context.operations[${index}] result must be a safe integer`);
    target.parent[target.key] = next;
  }

  const nextRequest = structuredClone(request);
  nextRequest.inputs[inputIndex].source.value = nextValue;
  return Object.freeze({ history: context.history, reexecute: true, request: validateArtifactInvocation(nextRequest) });
};

export const applyArtifactInputAction = ({ detail, request: requestInput }) => {
  invariant(plain(detail), "detail must be a plain object");
  invariant(detail.action === ARTIFACT_INPUT_ACTION, `detail.action must be ${ARTIFACT_INPUT_ACTION}`);
  const context = normalizeInputContext(detail.context);
  const request = validateArtifactInvocation(requestInput);
  const { input, inputIndex } = mutableInlineInput(request, context.inputId, "input action");
  invariant(canonicalJson(input.source.value) === canonicalJson(context.expectedValue), "input action base is stale");

  const nextRequest = structuredClone(request);
  nextRequest.inputs[inputIndex].source.value = context.value;
  return Object.freeze({ history: context.history, reexecute: false, request: validateArtifactInvocation(nextRequest) });
};

export const applyArtifactInvocationOpenAction = ({ detail }) => {
  invariant(plain(detail), "detail must be a plain object");
  invariant(detail.action === ARTIFACT_INVOCATION_OPEN_ACTION, `detail.action must be ${ARTIFACT_INVOCATION_OPEN_ACTION}`);
  exactKeys(detail.context, ["history", "reference", "schema"], [], "context");
  invariant(detail.context.schema === ARTIFACT_INVOCATION_OPEN_ACTION_SCHEMA, `context.schema must be ${ARTIFACT_INVOCATION_OPEN_ACTION_SCHEMA}`);
  return Object.freeze({
    history: historyMode(detail.context.history),
    navigate: true,
    reference: invocationReference(detail.context.reference),
  });
};

export const applyArtifactAction = ({ detail, request }) => {
  invariant(plain(detail), "detail must be a plain object");
  if (detail.action === ARTIFACT_STATE_ACTION) return applyArtifactStateAction({ detail, request });
  if (detail.action === ARTIFACT_INPUT_ACTION) return applyArtifactInputAction({ detail, request });
  if (detail.action === ARTIFACT_INVOCATION_OPEN_ACTION) return applyArtifactInvocationOpenAction({ detail });
  throw new Error(`artifact-shell-action: detail.action is unsupported: ${String(detail.action ?? "<missing>")}`);
};

export const createArtifactInvocationUrl = async ({ base, request }) => {
  const url = new URL(String(base));
  url.hash = "";
  return createUrlModuleUrl({ base: url.href, fragment: "invoke", value: validateArtifactInvocation(request) });
};
