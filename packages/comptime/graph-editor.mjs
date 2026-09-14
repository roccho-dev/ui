import { normalizeDocument, stringifyDocument } from "../graph-editor/src/model.mjs";

export const compileGraphEditor = example => {
  const document = normalizeDocument(example);
  return Object.freeze({ schema: "ui-graph-editor-example/1", document, text: stringifyDocument(document) });
};
