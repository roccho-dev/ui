const invariant = (condition, message) => { if (!condition) throw new Error(`webmcp-adapter: ${message}`); };

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

const validatePort = port => {
  invariant(port && typeof port === "object", "port is required");
  invariant(typeof port.query === "function", "port.query is required");
  invariant(typeof port.render === "function", "port.render is required");
  invariant(typeof port.applyAction === "function", "port.applyAction is required");
  return port;
};

export const createArtifactWebMcpTools = portInput => {
  const port = validatePort(portInput);
  return Object.freeze([
    Object.freeze({
      name: "artifact_query",
      title: "Query current artifact",
      description: "Return the semantic artifact currently represented by this UI.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      annotations: Object.freeze({ readOnlyHint: true }),
      execute: async () => port.query(),
    }),
    Object.freeze({
      name: "artifact_render",
      title: "Render artifact",
      description: "Render an artifact invocation in the current host through the existing artifact runtime.",
      inputSchema: RENDER_INPUT_SCHEMA,
      execute: async ({ request }) => port.render(request),
    }),
    Object.freeze({
      name: "artifact_apply_action",
      title: "Apply artifact action",
      description: "Apply an existing semantic artifact action to the current artifact state.",
      inputSchema: ACTION_INPUT_SCHEMA,
      execute: async ({ detail }) => port.applyAction(detail),
    }),
  ]);
};

export const registerArtifactWebMcp = async ({ document, port }) => {
  const modelContext = document?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return Object.freeze({ available: false, dispose() {} });
  }

  const controller = new AbortController();
  const tools = createArtifactWebMcpTools(port);
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
