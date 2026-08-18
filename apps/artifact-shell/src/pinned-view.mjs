import { createArtifactInvocationRuntime } from "../../../packages/artifact-invocation/src/index.mjs";
import { createArtifactShellServices } from "./services.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-pinned-view: ${message}`); };
const safeFetch = scope => async (href, options = {}) => {
  const url = new URL(href, scope.location.href);
  invariant(url.protocol === "https:" || url.origin === scope.location.origin, "URL must be same-origin or https");
  return scope.fetch(url.href, { cache: "no-store", credentials: "omit", method: "GET", redirect: "error", referrerPolicy: "no-referrer", ...options });
};
const environment = scope => Object.freeze({
  runtime: "browser",
  features: Object.freeze([
    ...(scope?.document?.createElement ? ["dom"] : []),
    ...(scope?.crypto?.subtle ? ["crypto.subtle"] : []),
    ...(typeof scope?.fetch === "function" ? ["fetch"] : []),
    ...(typeof scope?.File === "function" ? ["file"] : []),
    ...(typeof scope?.WebAssembly === "object" ? ["wasm"] : []),
    ...(typeof scope?.Worker === "function" ? ["worker"] : []),
  ].sort()),
});
export const bootPublishedCapabilityView = async ({ publicationUrl = "./manifest.json", scope = globalThis } = {}) => {
  const elements = Object.fromEntries(["receipt", "result", "status", "surface"].map(id => [id, scope.document.getElementById(id)]));
  for (const [id, element] of Object.entries(elements)) invariant(element, `#${id} is required`);
  const publicationHref = new URL(publicationUrl, scope.location.href).href;
  const publication = await (await safeFetch(scope)(publicationHref)).json();
  invariant(publication.schema === "artifact-capability-publication/2", "publication schema is unsupported");
  const fixtureHref = new URL(publication.fixtures.pass[0].href, publicationHref).href;
  const fixture = await (await safeFetch(scope)(fixtureHref)).json();
  const runtime = await createArtifactInvocationRuntime({
    engineBaseUrl: publicationHref,
    environment: environment(scope),
    fetchEngine: safeFetch(scope),
    fetchInput: safeFetch(scope),
    manifests: [publication.capability],
    runtimeBuild: publication.kernel,
    services: createArtifactShellServices({ document: scope.document, eventTarget: scope, surfaceMount: elements.surface }),
  });
  const outcome = await runtime.execute({ request: fixture.request });
  elements.result.textContent = JSON.stringify(outcome.result, null, 2);
  elements.receipt.textContent = JSON.stringify(outcome.receipt, null, 2);
  elements.status.dataset.state = outcome.result.status.toLowerCase();
  elements.status.textContent = outcome.result.status;
  scope.artifactPinnedViewProof = Object.freeze({ fixture, outcome, publication });
  return scope.artifactPinnedViewProof;
};
