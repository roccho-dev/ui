import {
  ARTIFACT_CAPABILITY_REGISTRY_BASE_URL,
  ARTIFACT_SHELL_BUILD,
  TRUSTED_ARTIFACT_CAPABILITIES,
} from "../generated/capability-registry.mjs";
import { createArtifactShell as createArtifactShellCore } from "./shell-core.mjs";

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

const copyJson = value => value === null ? null : JSON.parse(JSON.stringify(value));

const observeRequestElement = element => {
  let reflectedRequest = null;
  const port = Object.freeze({
    get value() { return element.value; },
    set value(value) {
      element.value = value;
      reflectedRequest = JSON.parse(value);
    },
  });
  return Object.freeze({
    port,
    query: () => copyJson(reflectedRequest),
  });
};

export const createArtifactShell = async options => {
  const observed = observeRequestElement(options.elements.request);
  const shell = await createArtifactShellCore({
    ...options,
    elements: Object.freeze({ ...options.elements, request: observed.port }),
    registry: SOURCE_REGISTRY,
  });
  return Object.freeze({ ...shell, query: observed.query });
};
