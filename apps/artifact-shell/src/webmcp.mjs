const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-shell-webmcp: ${message}`); };

const EMPTY_OBJECT_SCHEMA = Object.freeze({
  type: "object",
  properties: Object.freeze({}),
  additionalProperties: false,
});

const RENDER_INPUT_SCHEMA = Object.freeze({
  type: "object",
  properties: Object.freeze({ request: Object.freeze({ type: "object" }) }),
  required: Object.freeze(["request"]),
  additionalProperties: false,
});

const ACTION_INPUT_SCHEMA = Object.freeze({
  type: "object",
  properties: Object.freeze({ detail: Object.freeze({ type: "object" }) }),
  required: Object.freeze(["detail"]),
  additionalProperties: false,
});

export const createArtifactShellWebMcpTools = shell => {
  invariant(shell && typeof shell === "object", "shell is required");
  invariant(typeof shell.snapshot === "function", "shell.snapshot is required");
  invariant(typeof shell.execute === "function", "shell.execute is required");
  invariant(typeof shell.applyAction === "function", "shell.applyAction is required");

  return Object.freeze([
    Object.freeze({
      name: "artifact_query",
      title: "Query current artifact",
      description: "Return the semantic artifact request currently represented by this UI.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      annotations: Object.freeze({ readOnlyHint: true }),
      execute: async () => shell.snapshot(),
    }),
    Object.freeze({
      name: "artifact_render",
      title: "Render artifact",
      description: "Render an artifact invocation in the current host using the existing artifact runtime.",
      inputSchema: RENDER_INPUT_SCHEMA,
      execute: async ({ request }) => shell.execute(request),
    }),
    Object.freeze({
      name: "artifact_apply_action",
      title: "Apply artifact action",
      description: "Apply an existing semantic artifact action to the current artifact state.",
      inputSchema: ACTION_INPUT_SCHEMA,
      execute: async ({ detail }) => shell.applyAction(detail),
    }),
  ]);
};

export const registerArtifactShellWebMcp = async ({ document, shell }) => {
  const modelContext = document?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return Object.freeze({ available: false, dispose() {} });
  }

  const controller = new AbortController();
  const tools = createArtifactShellWebMcpTools(shell);
  try {
    for (const tool of tools) await modelContext.registerTool(tool, { signal: controller.signal });
  } catch (error) {
    controller.abort();
    throw error;
  }

  return Object.freeze({
    available: true,
    dispose: () => controller.abort(),
    tools: Object.freeze(tools.map(tool => tool.name)),
  });
};
