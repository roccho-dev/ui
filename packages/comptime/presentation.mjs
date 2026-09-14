export const compilePresentation = semanticText => {
  if (typeof semanticText !== "string" || !semanticText.trim()) throw new Error("comptime.presentation: non-empty JSONL required");
  const records = semanticText.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`comptime.presentation: L${index + 1}: ${error.message}`); }
  });
  const meta = records.find(record => record.type === "meta");
  const stages = records.filter(record => record.type === "stage").sort((a, b) => a.order - b.order);
  if (meta?.schema !== "business-model-semantic-jsonl/2" || typeof meta.title !== "string") throw new Error("comptime.presentation: business-model semantic meta required");
  if (stages.length === 0) throw new Error("comptime.presentation: stage required");
  const dataModel = { title: meta.title };
  const children = ["title"];
  const components = [{ id: "root", component: "Column", props: { gap: 12 }, children }, { id: "title", component: "Text", props: { text: { path: "title" }, variant: "title" } }];
  stages.forEach((stage, index) => {
    const headingKey = `stage${index}Heading`;
    const detailKey = `stage${index}Detail`;
    dataModel[headingKey] = stage.name;
    dataModel[detailKey] = [stage.goal, stage.evidence, stage.gate].filter(Boolean).join(" · ");
    const headingId = `stage-${index}-heading`;
    const detailId = `stage-${index}-detail`;
    children.push(headingId, detailId);
    components.push({ id: headingId, component: "Text", props: { text: { path: headingKey } } }, { id: detailId, component: "Text", props: { text: { path: detailKey } } });
  });
  const surface = Object.freeze({ schema: "a2ui-surface/1", catalogId: "roccho.a2ui.rich.v1", surfaceId: "main", rootId: "root", dataModel, components });
  return Object.freeze({
    schema: "artifact-invocation/2",
    id: `request.example.presentation.${meta.id}`,
    intent: "render",
    inputs: [Object.freeze({ id: "surface", mediaType: "application/vnd.roccho.a2ui-surface+json", schema: "a2ui-surface/1", source: Object.freeze({ kind: "inline", value: surface }) })],
    constraints: Object.freeze({ allowedRuntimes: ["browser"], noUpload: true }),
    expects: ["a2ui-render-receipt/1"],
  });
};
