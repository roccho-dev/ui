import { ARTIFACT_INPUT_ACTION, ARTIFACT_INPUT_ACTION_SCHEMA } from "./invocation-action.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-shell-service: ${message}`); };
let trustedRenderer = null;
const packageRuntimes = new Map();
const packageToken = value => {
  const token = String(value ?? "");
  invariant(/^[a-z0-9][a-z0-9-]{0,79}$/u.test(token), "packageId is invalid");
  return token;
};
const loadPackageRuntime = packageId => {
  const token = packageToken(packageId);
  if (!packageRuntimes.has(token)) {
    const href = new URL(`../../../packages/${token}/runtime.js`, import.meta.url).href;
    packageRuntimes.set(token, import(href));
  }
  return packageRuntimes.get(token);
};
const loadTrustedRenderer = async () => {
  if (!trustedRenderer) trustedRenderer = import("../../../packages/a2ui-browser/src/index.mjs").then(module => Object.freeze({
    catalog: module.createAtlasStageCatalog(),
    renderTrustedSurface: module.renderTrustedSurface,
  }));
  return trustedRenderer;
};
const inputActionPort = ({ invocation, onInputAction }) => {
  const subject = Array.isArray(invocation?.inputs) && invocation.inputs.length === 1 ? invocation.inputs[0] : null;
  const enabled = typeof onInputAction === "function" && subject?.mutable === true && subject.sourceKind === "inline";
  return Object.freeze({
    enabled,
    inputId: subject?.id ?? null,
    replace: enabled ? async ({ expectedValue, history = "replace", value }) => {
      const result = await onInputAction(Object.freeze({
        action: ARTIFACT_INPUT_ACTION,
        context: Object.freeze({
          expectedValue: structuredClone(expectedValue),
          history,
          inputId: subject.id,
          schema: ARTIFACT_INPUT_ACTION_SCHEMA,
          value: structuredClone(value),
        }),
      }));
      invariant(result !== null && result !== undefined, "input action was rejected");
      return result;
    } : null,
    schema: "artifact-input-action-port/1",
  });
};

export const createArtifactShellServices = ({ document, eventTarget, onAction = null, onInputAction = null, surfaceMount }) => {
  invariant(document?.createElement, "document is required");
  invariant(surfaceMount?.replaceChildren, "surfaceMount is required");
  invariant(onAction === null || typeof onAction === "function", "onAction must be null or a function");
  invariant(onInputAction === null || typeof onInputAction === "function", "onInputAction must be null or a function");
  return Object.freeze({
    "ui.package.execute": async ({ packageId, input, invocation }) => {
      const module = await loadPackageRuntime(packageId);
      invariant(typeof module.executeArtifactPackage === "function", `package ${packageId} must export executeArtifactPackage`);
      return module.executeArtifactPackage({
        document,
        eventTarget,
        input,
        inputAction: inputActionPort({ invocation, onInputAction }),
        invocation,
        surfaceMount,
      });
    },
    "a2ui.render": async ({ surface }) => {
      invariant(surface && typeof surface === "object" && !Array.isArray(surface), "surface must be an object");
      const { catalog, renderTrustedSurface } = await loadTrustedRenderer();
      surfaceMount.replaceChildren();
      const rendered = renderTrustedSurface({
        catalog,
        components: surface.components,
        dataModel: surface.dataModel ?? {},
        document,
        eventTarget,
        mount: surfaceMount,
        onAction: onAction ?? (() => {}),
        rootId: surface.rootId ?? "root",
        surfaceId: surface.surfaceId ?? "main",
      });
      return Object.freeze({
        componentCount: rendered.componentCount,
        rootId: rendered.rootId,
        schema: "a2ui-render-receipt/1",
        surfaceId: rendered.surfaceId,
      });
    },
  });
};
