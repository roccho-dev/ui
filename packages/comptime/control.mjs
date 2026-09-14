export const compileControl = jsonl => {
  if (typeof jsonl !== "string" || !jsonl.trim()) throw new Error("comptime.control: non-empty JSONL required");
  const records = jsonl.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`comptime.control: L${index + 1}: ${error.message}`); }
  });
  const root = records.find(record => record.rel === null);
  if (!root || typeof root.id !== "string") throw new Error("comptime.control: root record required");
  const dataModel = { title: root.title ?? root.id };
  const children = ["title"];
  const components = [{ id: "root", component: "Column", props: { gap: 10 }, children }, { id: "title", component: "Text", props: { text: { path: "title" }, variant: "title" } }];
  records.filter(record => record !== root).forEach((record, index) => {
    const key = `record${index}`;
    const id = `record-${index}`;
    dataModel[key] = `${record.title ?? record.id} · ${record.state ?? ""}`.trim();
    children.push(id);
    components.push({ id, component: "Text", props: { text: { path: key } } });
  });
  const surface = Object.freeze({ schema: "a2ui-surface/1", catalogId: "roccho.a2ui.rich.v1", surfaceId: "main", rootId: "root", dataModel, components });
  return Object.freeze({
    schema: "artifact-invocation/2",
    id: "request.example.control",
    intent: "render",
    inputs: [Object.freeze({ id: "surface", mediaType: "application/vnd.roccho.a2ui-surface+json", schema: "a2ui-surface/1", source: Object.freeze({ kind: "inline", value: surface }) })],
    constraints: Object.freeze({ allowedRuntimes: ["browser"], noUpload: true }),
    expects: ["a2ui-render-receipt/1"],
  });
};
