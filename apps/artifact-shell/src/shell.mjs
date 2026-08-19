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

export const createArtifactShell = options => createArtifactShellCore({ ...options, registry: SOURCE_REGISTRY });
