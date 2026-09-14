import { compileSemanticMap } from "./semantic-map.mjs";

export const compileGraphEditor = example => {
  const request = compileSemanticMap(example);
  return Object.freeze({ ...request, id: "request.example.graph-editor" });
};
