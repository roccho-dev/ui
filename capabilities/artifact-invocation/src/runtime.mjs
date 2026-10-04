import { canonicalJson, sha256Hex } from "../../url-module/src/index.mjs";
import {
  ARTIFACT_INVOCATION_RECEIPT_SCHEMA,
  ARTIFACT_INVOCATION_RESULT_SCHEMA,
  ARTIFACT_INVOCATION_RUNTIME_CONTRACT,
  artifactCapabilityKey,
  artifactToken,
  validateArtifactCapabilityResult,
  validateArtifactInvocation,
  validateArtifactRuntimeEnvironment,
  validateSha256,
} from "./contract.mjs";
import { loadArtifactCapabilityEngine } from "./engine.mjs";
import { requiredInputFeatures, resolveArtifactInputs } from "./input.mjs";
import { createArtifactCapabilityRegistry } from "./registry.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-invocation-runtime: ${message}`); };
const digestValue = async value => `sha256:${await sha256Hex(canonicalJson(value))}`;
const diagnostic = (code, message, severity = "error") => Object.freeze({ code, message, severity });
const noCapabilityResult = ({ code, message, severity = "error", status }) => Object.freeze({
  diagnostics: Object.freeze([diagnostic(code, message, severity)]),
  outputs: Object.freeze([]),
  status,
});

const normalizeRuntimeBuild = value => {
  invariant(value && typeof value === "object" && !Array.isArray(value), "runtimeBuild must be an object");
  const keys = Object.keys(value).sort();
  invariant(keys.length === 3 && keys[0] === "digest" && keys[1] === "id" && keys[2] === "version", "runtimeBuild must contain digest, id, and version");
  return Object.freeze({
    digest: validateSha256(value.digest, "runtimeBuild.digest"),
    id: artifactToken(value.id, "runtimeBuild.id"),
    version: artifactToken(value.version, "runtimeBuild.version"),
  });
};

const normalizeServices = value => {
  invariant(value && typeof value === "object" && !Array.isArray(value), "services must be an object");
  const result = Object.create(null);
  for (const [name, service] of Object.entries(value)) {
    invariant(typeof service === "function", `service ${name} must be a function`);
    result[name] = service;
  }
  return Object.freeze(result);
};

const selectedServices = (manifest, services) => Object.freeze(Object.fromEntries(
  manifest.requires.services.map(name => [name, services[name]]),
));

const freezeResult = ({ request, value }) => Object.freeze({
  diagnostics: value.diagnostics,
  outputs: value.outputs,
  requestId: request.id,
  schema: ARTIFACT_INVOCATION_RESULT_SCHEMA,
  status: value.status,
});

const buildReceipt = async ({ engineEvidence, environment, inputEvidence, manifest, registryDigest, request, result, runtimeContract }) => {
  const capability = manifest ? Object.freeze({
    engine: engineEvidence ?? null,
    id: manifest.id,
    manifestDigest: await digestValue(manifest),
    version: manifest.version,
  }) : null;
  const environmentDigest = await digestValue(environment);
  return Object.freeze({
    authority: false,
    capability,
    constraints: request.constraints,
    environment: Object.freeze({ ...environment, digest: environmentDigest }),
    inputs: inputEvidence,
    registryDigest,
    request: Object.freeze({ digest: await digestValue(request), id: request.id }),
    runtime: runtimeContract,
    result: Object.freeze({ digest: await digestValue(result), status: result.status }),
    schema: ARTIFACT_INVOCATION_RECEIPT_SCHEMA,
  });
};

export const createArtifactInvocationRuntime = async ({
  engineBaseUrl,
  environment: environmentInput,
  fetchEngine,
  fetchInput,
  importModule,
  manifests,
  runtimeBuild: runtimeBuildInput,
  services: serviceInput = {},
}) => {
  const environment = validateArtifactRuntimeEnvironment(environmentInput);
  const runtimeBuild = normalizeRuntimeBuild(runtimeBuildInput);
  const services = normalizeServices(serviceInput);
  const registry = createArtifactCapabilityRegistry(manifests);
  const registryDigest = await digestValue(registry.manifests);
  const runtimeContract = Object.freeze({
    build: runtimeBuild,
    contractDigest: await digestValue(ARTIFACT_INVOCATION_RUNTIME_CONTRACT),
    id: ARTIFACT_INVOCATION_RUNTIME_CONTRACT.id,
    version: ARTIFACT_INVOCATION_RUNTIME_CONTRACT.version,
  });
  const loaded = new Map();
  const loading = new Map();

  const getCapability = manifest => {
    const key = artifactCapabilityKey(manifest);
    if (loaded.has(key)) return Promise.resolve(loaded.get(key));
    if (!loading.has(key)) {
      const pending = loadArtifactCapabilityEngine({ baseUrl: engineBaseUrl, fetchEngine, importModule, manifest })
        .then(value => { loaded.set(key, value); loading.delete(key); return value; })
        .catch(error => { loading.delete(key); throw error; });
      loading.set(key, pending);
    }
    return loading.get(key);
  };

  const execute = async ({ bindings = {}, emit = () => {}, request: requestInput, signal = null }) => {
    invariant(typeof emit === "function", "emit must be a function");
    const request = validateArtifactInvocation(requestInput);
    const resolution = registry.resolve(request);
    const manifest = resolution.manifest;
    emit(Object.freeze({ capability: manifest ? artifactCapabilityKey(manifest) : null, kind: "resolved", requestId: request.id, resolution: resolution.kind }));

    let normalized;
    let engineEvidence = null;
    let inputEvidence = Object.freeze([]);

    if (resolution.kind === "unsupported") {
      normalized = noCapabilityResult({ code: "runtime.capability.unsupported", message: `no registered capability accepts ${request.intent}`, severity: "warning", status: "UNSUPPORTED" });
    } else if (resolution.kind === "ambiguous") {
      normalized = noCapabilityResult({
        code: "runtime.registry.ambiguous",
        message: `multiple capabilities accept ${request.id}: ${resolution.candidates.filter(item => item.score === resolution.candidates[0].score).map(item => artifactCapabilityKey(item.manifest)).join(", ")}`,
        status: "INCONCLUSIVE",
      });
    } else {
      const requiredFeatures = [...new Set(["crypto.subtle", ...manifest.requires.features, ...requiredInputFeatures(request)])].sort();
      const missingFeatures = requiredFeatures.filter(feature => !environment.features.includes(feature));
      const missingServices = manifest.requires.services.filter(name => !Object.hasOwn(services, name));
      const requestAllowsRuntime = request.constraints.allowedRuntimes.includes(environment.runtime);
      const capabilityAllowsRuntime = manifest.requires.runtimes.includes(environment.runtime);
      if (!requestAllowsRuntime) {
        normalized = noCapabilityResult({ code: "runtime.request.disallowed", message: `request does not allow ${environment.runtime}`, status: "INCONCLUSIVE" });
      } else if (!capabilityAllowsRuntime) {
        normalized = noCapabilityResult({ code: "runtime.capability.runtime", message: `${artifactCapabilityKey(manifest)} does not support ${environment.runtime}`, status: "INCONCLUSIVE" });
      } else if (missingFeatures.length > 0) {
        normalized = noCapabilityResult({ code: "runtime.environment.missing", message: `missing ${environment.runtime} features: ${missingFeatures.join(", ")}`, status: "INCONCLUSIVE" });
      } else if (missingServices.length > 0) {
        normalized = noCapabilityResult({ code: "runtime.service.missing", message: `missing runtime services: ${missingServices.join(", ")}`, status: "INCONCLUSIVE" });
      } else if (signal?.aborted) {
        normalized = noCapabilityResult({ code: "runtime.execution.aborted", message: "execution was aborted", severity: "warning", status: "INCONCLUSIVE" });
      } else {
        try {
          emit(Object.freeze({ capability: artifactCapabilityKey(manifest), kind: "resolving-inputs", requestId: request.id }));
          const resolved = await resolveArtifactInputs({ bindings, fetchInput, limits: manifest.limits, request });
          inputEvidence = resolved.evidence;
          emit(Object.freeze({ capability: artifactCapabilityKey(manifest), kind: "loading-engine", requestId: request.id }));
          const loadedEngine = await getCapability(manifest);
          engineEvidence = loadedEngine.evidence;
          emit(Object.freeze({ capability: artifactCapabilityKey(manifest), kind: "running", requestId: request.id }));
          const candidate = await loadedEngine.capability.run(Object.freeze({
            emit,
            input: resolved.input,
            invocation: resolved.input.invocation,
            services: selectedServices(manifest, services),
            signal,
          }));
          normalized = validateArtifactCapabilityResult(candidate, { manifest, request });
        } catch (error) {
          normalized = noCapabilityResult({ code: "runtime.execution.inconclusive", message: String(error?.message ?? error), status: "INCONCLUSIVE" });
        }
      }
    }

    const result = freezeResult({ request, value: normalized });
    const receipt = await buildReceipt({ engineEvidence, environment, inputEvidence, manifest, registryDigest, request, result, runtimeContract });
    emit(Object.freeze({ capability: manifest ? artifactCapabilityKey(manifest) : null, kind: "completed", requestId: request.id, status: result.status }));
    return Object.freeze({ manifest, receipt, request, result });
  };

  return Object.freeze({
    environment,
    execute,
    loadedCapabilities: () => Object.freeze([...loaded.keys()].sort()),
    manifests: registry.manifests,
    registryDigest,
    runtimeContract,
  });
};
