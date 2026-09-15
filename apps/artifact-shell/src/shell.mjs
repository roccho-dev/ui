import {
  ARTIFACT_CAPABILITY_REGISTRY_BASE_URL,
  ARTIFACT_SHELL_BUILD,
  TRUSTED_ARTIFACT_CAPABILITIES,
} from "../generated/capability-registry.mjs";
import { createArtifactShell as createArtifactShellCore } from "./shell-core.mjs";
import { observeArtifactRequestElement } from "./request-port.mjs";

export {
  artifactShellElements,
  collectLocalBindings,
  detectBrowserEnvironment,
  renderLocalBindingInputs,
} from "./shell-core.mjs";

const SOURCE_REGISTRY = Object.freeze({
  baseUrl: ARTIFACT_CAPABILITY_REGISTRY_BASE_URL,
  manifests: TRUSTED_ARTIFACT_CAPABILITIES,
  runtimeBuild: ARTIFACT_SHELL_BUILD,
});

export const createArtifactShell = async options => {
  const observed = observeArtifactRequestElement(options.elements.request);
  const shell = await createArtifactShellCore({
    ...options,
    elements: Object.freeze({ ...options.elements, request: observed.element }),
    registry: SOURCE_REGISTRY,
  });
  return Object.freeze({ ...shell, query: observed.query });
};
