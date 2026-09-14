export const compileSemanticMap = example => {
  if (!example || typeof example !== "object" || Array.isArray(example)) throw new Error("comptime.semantic-map: object required");
  const request = example.schema === "artifact-capability-fixture/2" ? example.request : example;
  if (request?.schema !== "artifact-invocation/2") throw new Error("comptime.semantic-map: artifact-invocation/2 required");
  if (request.intent !== "render" || !Array.isArray(request.inputs) || request.inputs.length !== 1) throw new Error("comptime.semantic-map: one render input required");
  const input = request.inputs[0];
  if (input.schema !== "semantic-map-envelope/3" || input.mediaType !== "application/vnd.roccho.semantic-map-envelope+json") throw new Error("comptime.semantic-map: semantic-map-envelope/3 required");
  return structuredClone(request);
};
