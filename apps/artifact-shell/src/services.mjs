const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-shell-service: ${message}`); };
let trustedRenderer = null;
const loadTrustedRenderer = async () => {
  if (!trustedRenderer) trustedRenderer = import("../../../packages/a2ui-browser/src/index.mjs").then(module => module.renderTrustedSurface);
  return trustedRenderer;
};

export const createArtifactShellServices = ({ document, eventTarget, onAction = () => {}, surfaceMount }) => {
  invariant(document?.createElement, "document is required");
  invariant(surfaceMount?.replaceChildren, "surfaceMount is required");
  invariant(typeof onAction === "function", "onAction must be a function");
  return Object.freeze({
    "a2ui.render": async ({ surface }) => {
      invariant(surface && typeof surface === "object" && !Array.isArray(surface), "surface must be an object");
      const renderTrustedSurface = await loadTrustedRenderer();
      surfaceMount.replaceChildren();
      const rendered = renderTrustedSurface({
        components: surface.components,
        dataModel: surface.dataModel ?? {},
        document,
        eventTarget,
        mount: surfaceMount,
        onAction,
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
