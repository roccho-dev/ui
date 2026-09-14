export const compileControl = jsonl => {
  if (typeof jsonl !== "string" || !jsonl.trim()) throw new Error("comptime.control: non-empty JSONL required");
  const records = jsonl.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`comptime.control: L${index + 1}: ${error.message}`); }
  });
  const root = records.find(record => record.rel === null);
  if (!root || typeof root.id !== "string") throw new Error("comptime.control: root record required");
  const children = ["title"];
  const components = [{ id: "root", component: "Column", children }, { id: "title", component: "Text", text: root.title ?? root.id, variant: "h1" }];
  records.filter(record => record !== root).forEach((record, index) => {
    const id = `record-${index}`;
    children.push(id);
    components.push({ id, component: "Text", text: `${record.title ?? record.id}${record.state ? ` · ${record.state}` : ""}` });
  });
  const surface = Object.freeze({ rootId: "root", surfaceId: "control-example", dataModel: {}, components });
  return Object.freeze({
    schema: "artifact-invocation/2",
    id: "request.example.control",
    intent: "render",
    inputs: [Object.freeze({ id: "surface", mediaType: "application/vnd.roccho.a2ui-surface+json", schema: "a2ui-surface/1", source: Object.freeze({ kind: "inline", value: surface }) })],
    constraints: Object.freeze({ allowedRuntimes: ["browser"], noUpload: true }),
    expects: ["a2ui-render-receipt/1"],
  });
};
