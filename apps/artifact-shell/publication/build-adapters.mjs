import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson, createUrlModuleUrl } from "../../../packages/url-module/src/index.mjs";
import { createAdapter as createControlReferenceAdapter } from "../adapters/control-reference.mjs";
import { createAdapter as createGraphAdapter } from "../adapters/graph.mjs";
import { createAdapter as createGraphReferenceAdapter } from "../adapters/graph-reference.mjs";
import { createAdapter as createMapAdapter } from "../adapters/map.mjs";
import { createAdapter as createPresentationAdapter } from "../adapters/presentation.mjs";
import { createAdapter as createSeqAdapter } from "../adapters/seq.mjs";
import { createAdapter as createShellAdapter } from "../adapters/shell.mjs";

export const buildAdapters = async ({ appRoot, outputRoot }) => {
  const adapters = [
    createShellAdapter(),
    createGraphAdapter(),
    createMapAdapter(),
    createSeqAdapter(),
    createPresentationAdapter(),
    createControlReferenceAdapter(),
    createGraphReferenceAdapter(),
  ];
  if (new Set(adapters.map(adapter => adapter.id)).size !== adapters.length) throw new Error("artifact-adapters: duplicate id");

  const adapterHtml = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob:; style-src 'unsafe-inline'; connect-src 'self' https:; frame-src 'self' https:; img-src 'self' data: https:; base-uri 'none'; object-src 'none'">\n<title>UI adapter</title>\n<style>:root{font-family:ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText}header{height:36px;padding:8px 12px;display:flex;gap:10px;align-items:center;border-bottom:1px solid color-mix(in srgb,CanvasText 16%,transparent)}header a{color:inherit}#label{font-weight:650}#status{margin-left:auto;font:600 10px/1.2 ui-monospace,monospace}#adapter{min-height:calc(100vh - 36px)}#adapter>iframe{display:block;width:100%;height:calc(100vh - 36px);border:0}#adapter>ul{margin:0;padding:24px 40px;display:grid;gap:8px}</style>\n</head>\n<body data-adapter-status="loading"><header><a href="../../">UI</a><span id="label"></span><output id="status">Loading</output></header><main id="adapter"></main><script type="module" src="../../adapter.mjs"></script></body>\n</html>\n`;

  await fs.copyFile(path.join(appRoot, "src", "adapter.mjs"), path.join(outputRoot, "adapter.mjs"));
  await fs.copyFile(path.join(appRoot, "mode.mjs"), path.join(outputRoot, "mode.mjs"));
  const referencesRoot = path.join(outputRoot, "references");
  await fs.mkdir(referencesRoot, { recursive: true });
  await fs.writeFile(path.join(referencesRoot, "control.jsonl"), `${JSON.stringify({ id: "root", op: "document", schema: 3, state: "active", rel: null, title: "Control reference" })}\n`);
  const referenceDocument = {
    schema: 3,
    canvas: { width: 640, height: 360 },
    maps: [{
      id: "reference",
      title: "Graph reference",
      timeline: [{
        id: "current",
        title: "Current",
        cells: [
          { id: "a", type: "rect", label: "input", x: 80, y: 120, width: 160, height: 80 },
          { id: "b", type: "rect", label: "output", x: 400, y: 120, width: 160, height: 80 },
          { id: "edge", type: "edge.arrow", label: "flow", source: "a", target: "b" },
        ],
      }],
    }],
  };
  await fs.writeFile(path.join(referencesRoot, "document.json"), `${JSON.stringify(referenceDocument, null, 2)}\n`);

  const fixtureRoot = path.join(appRoot, "capabilities", "render-semantic-map", "fixtures");
  for (const adapter of adapters) {
    let published = adapter;
    if (adapter.kind === "invocation") {
      const fixture = JSON.parse(await fs.readFile(path.join(fixtureRoot, adapter.fixture), "utf8"));
      const invocation = new URL(await createUrlModuleUrl({
        base: "https://artifact-shell.invalid/index.html",
        fragment: "invoke",
        value: fixture.request,
      }));
      published = Object.freeze({ ...adapter, href: `../../index.html${invocation.hash}` });
    }
    const root = path.join(outputRoot, "adapters", adapter.id);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "adapter.json"), `${canonicalJson(published)}\n`);
    await fs.writeFile(path.join(root, "index.html"), adapterHtml);
  }

  return Object.freeze(adapters.map(adapter => adapter.id));
};
