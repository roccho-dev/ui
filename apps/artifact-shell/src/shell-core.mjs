import { createArtifactInvocationRuntime } from "../../../packages/artifact-invocation/src/index.mjs";
import { readUrlModule } from "../../../packages/url-module/src/index.mjs";
import { ARTIFACT_INPUT_ACTION, ARTIFACT_INVOCATION_OPEN_ACTION, ARTIFACT_STATE_ACTION, applyArtifactAction, createArtifactInvocationUrl } from "./invocation-action.mjs";
import { createArtifactShellServices } from "./services.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-shell: ${message}`); };

export const detectBrowserEnvironment = scope => Object.freeze({
  runtime: "browser",
  features: Object.freeze([
    ...(scope?.document?.createElement ? ["dom"] : []),
    ...(scope?.crypto?.subtle ? ["crypto.subtle"] : []),
    ...(typeof scope?.fetch === "function" ? ["fetch"] : []),
    ...(typeof scope?.File === "function" ? ["file"] : []),
    ...(typeof scope?.Worker === "function" ? ["worker"] : []),
    ...(typeof scope?.WebAssembly === "object" ? ["wasm"] : []),
  ].sort()),
});

const safeEngineFetch = scope => async href => {
  const url = new URL(href, scope.location.href);
  invariant(url.origin === scope.location.origin, "engine URL must be same-origin");
  return scope.fetch(url.href, { cache: "force-cache", credentials: "omit", method: "GET", redirect: "error", referrerPolicy: "no-referrer" });
};

const safeInputFetch = scope => async (href, options = {}) => {
  const url = new URL(href, scope.location.href);
  invariant(url.protocol === "https:" || url.origin === scope.location.origin, "input URL must be same-origin or https");
  return scope.fetch(url.href, { cache: "no-store", credentials: "omit", method: "GET", redirect: "error", referrerPolicy: "no-referrer", ...options });
};

const localSources = request => request.inputs.filter(input => input.source.kind === "file" || input.source.kind === "directory");

export const renderLocalBindingInputs = ({ container, document, request }) => {
  container.replaceChildren();
  const controls = new Map();
  for (const input of localSources(request)) {
    const binding = input.source.binding;
    invariant(!controls.has(binding), `local binding is duplicated: ${binding}`);
    const wrapper = document.createElement("label");
    wrapper.textContent = `${input.id} · ${input.source.kind}`;
    const control = document.createElement("input");
    control.type = "file";
    control.dataset.binding = binding;
    control.dataset.kind = input.source.kind;
    if (input.source.kind === "directory") {
      control.multiple = true;
      control.setAttribute("webkitdirectory", "");
    }
    wrapper.append(control);
    container.append(wrapper);
    controls.set(binding, control);
  }
  container.hidden = controls.size === 0;
  return controls;
};

export const collectLocalBindings = controls => Object.freeze(Object.fromEntries([...controls.entries()].map(([binding, control]) => [
  binding,
  control.dataset.kind === "directory" ? Object.freeze(Array.from(control.files ?? [])) : (control.files?.[0] ?? null),
])));

const missingLocalBindings = (request, bindings) => localSources(request)
  .filter(input => {
    const value = bindings[input.source.binding];
    return input.source.kind === "directory" ? !Array.isArray(value) || value.length === 0 : !value;
  })
  .map(input => input.source.binding);

export const artifactShellElements = document => Object.freeze({
  form: document.querySelector("#request-form"),
  localInputs: document.querySelector("#local-inputs"),
  progress: document.querySelector("#progress"),
  receipt: document.querySelector("#receipt"),
  request: document.querySelector("#request"),
  result: document.querySelector("#result"),
  run: document.querySelector("#run"),
  status: document.querySelector("#status"),
  surface: document.querySelector("#surface"),
});

const normalizeRegistry = registry => {
  invariant(registry && typeof registry === "object", "registry is required");
  invariant(typeof registry.baseUrl === "string" && registry.baseUrl.length > 0, "registry.baseUrl is required");
  invariant(Array.isArray(registry.manifests) && registry.manifests.length > 0, "registry.manifests is required");
  invariant(registry.runtimeBuild && typeof registry.runtimeBuild === "object", "registry.runtimeBuild is required");
  return Object.freeze({
    baseUrl: registry.baseUrl,
    manifests: registry.manifests,
    runtimeBuild: Object.freeze({
      digest: registry.runtimeBuild.digest,
      id: registry.runtimeBuild.id,
      version: registry.runtimeBuild.version,
    }),
  });
};

export const createArtifactShell = async ({ elements, registry: registryInput, scope = globalThis }) => {
  const required = ["form", "localInputs", "progress", "receipt", "request", "result", "run", "status", "surface"];
  for (const key of required) invariant(elements?.[key], `elements.${key} is required`);
  const registry = normalizeRegistry(registryInput);
  let dispatchAction = () => undefined;
  const runtime = await createArtifactInvocationRuntime({
    engineBaseUrl: registry.baseUrl,
    environment: detectBrowserEnvironment(scope),
    fetchEngine: safeEngineFetch(scope),
    fetchInput: safeInputFetch(scope),
    manifests: registry.manifests,
    runtimeBuild: registry.runtimeBuild,
    services: createArtifactShellServices({
      document: scope.document,
      eventTarget: scope,
      onAction: detail => detail?.action === ARTIFACT_STATE_ACTION || detail?.action === ARTIFACT_INVOCATION_OPEN_ACTION ? dispatchAction(detail) : undefined,
      onInputAction: detail => detail?.action === ARTIFACT_INPUT_ACTION ? dispatchAction(detail) : undefined,
      surfaceMount: elements.surface,
    }),
  });
  let activeRequest = null;
  let activeRequestSignature = null;
  let localControls = new Map();

  const showStatus = (state, text) => {
    elements.status.dataset.state = state;
    elements.status.textContent = text;
  };
  const reflectRequest = request => {
    activeRequest = request;
    activeRequestSignature = JSON.stringify(request);
    elements.request.value = JSON.stringify(request, null, 2);
    localControls = renderLocalBindingInputs({ container: elements.localInputs, document: scope.document, request });
  };
  const showRequest = request => {
    reflectRequest(request);
    elements.surface.replaceChildren();
    elements.result.textContent = "";
    elements.receipt.textContent = "";
    elements.progress.textContent = "";
  };
  const execute = async request => {
    if (JSON.stringify(request) !== activeRequestSignature) showRequest(request);
    else activeRequest = request;
    const bindings = collectLocalBindings(localControls);
    const missing = missingLocalBindings(request, bindings);
    if (missing.length > 0) {
      showStatus("waiting", `Select local input · ${missing.join(", ")}`);
      return null;
    }
    showStatus("running", "Running");
    const events = [];
    const outcome = await runtime.execute({
      bindings,
      emit: event => {
        events.push(event);
        elements.progress.textContent = events.map(item => `${item.kind}${item.capability ? ` · ${item.capability}` : ""}`).join("\n");
      },
      request,
    });
    elements.result.textContent = JSON.stringify(outcome.result, null, 2);
    elements.receipt.textContent = JSON.stringify(outcome.receipt, null, 2);
    showStatus(outcome.result.status.toLowerCase(), outcome.result.status);
    scope.artifactShellProof = Object.freeze({
      loadedCapabilities: runtime.loadedCapabilities(),
      outcome,
      request,
      runtime: Object.freeze({ registryDigest: runtime.registryDigest, runtimeContract: runtime.runtimeContract }),
    });
    return outcome;
  };

  const applyAction = async detail => {
    invariant(activeRequest, "active request is required for an action");
    const compiled = applyArtifactAction({ detail, request: activeRequest });
    const method = `${compiled.history}State`;
    invariant(scope.history && typeof scope.history[method] === "function", `history.${method} is unavailable`);
    if (compiled.navigate) {
      const target = new URL(compiled.reference, scope.location.href);
      invariant(target.origin === scope.location.origin, "invocation navigation must remain same-origin");
      scope.history[method](null, "", target.href);
      await restoreFromLocation();
      return Object.freeze({
        action: detail.action,
        history: compiled.history,
        href: target.href,
        navigated: true,
        schema: "artifact-shell-action-commit/1",
      });
    }
    const href = await createArtifactInvocationUrl({ base: scope.location.href, request: compiled.request });
    scope.history[method](null, "", href);
    if (compiled.reexecute) return execute(compiled.request);

    reflectRequest(compiled.request);
    const commit = Object.freeze({
      action: detail.action,
      history: compiled.history,
      href,
      reexecuted: false,
      request: compiled.request,
      schema: "artifact-shell-action-commit/1",
    });
    if (scope.artifactShellProof) scope.artifactShellProof = Object.freeze({
      ...scope.artifactShellProof,
      currentRequest: compiled.request,
      lastAction: commit,
    });
    return commit;
  };
  dispatchAction = detail => applyAction(detail).catch(error => {
    showStatus("inconclusive", `INCONCLUSIVE · ${error.message}`);
    return null;
  });

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    execute(JSON.parse(elements.request.value)).catch(error => showStatus("inconclusive", `INCONCLUSIVE · ${error.message}`));
  });
  elements.localInputs.addEventListener("change", () => {
    if (activeRequest) execute(activeRequest).catch(error => showStatus("inconclusive", `INCONCLUSIVE · ${error.message}`));
  });

  const restoreFromLocation = async () => {
    const fromUrl = await readUrlModule({ fragment: "invoke", input: scope.location.href });
    if (fromUrl) {
      showRequest(fromUrl);
      if (localSources(fromUrl).length > 0) showStatus("waiting", "Select local input");
      else await execute(fromUrl);
      return fromUrl;
    }
    showStatus("idle", "Paste an artifact-invocation/2 request");
    return null;
  };
  if (typeof scope.addEventListener === "function") {
    scope.addEventListener("popstate", () => {
      restoreFromLocation().catch(error => showStatus("inconclusive", `INCONCLUSIVE · ${error.message}`));
    });
  }
  await restoreFromLocation();
  return Object.freeze({ applyAction, execute, restoreFromLocation, runtime, showRequest });
};
