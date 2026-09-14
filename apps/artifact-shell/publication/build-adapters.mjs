import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson, createUrlModuleUrl } from "../../../packages/url-module/src/index.mjs";
import { compileControl, compileGraphEditor, compilePresentation, compileSemanticMap } from "../../../packages/comptime/index.mjs";
import { createAdapter as createControlAdapter } from "../adapters/control.mjs";
import { createAdapter as createGraphAdapter } from "../adapters/graph.mjs";
import { createAdapter as createGraphEditorAdapter } from "../adapters/graph-editor.mjs";
import { createAdapter as createMapAdapter } from "../adapters/map.mjs";
import { createAdapter as createPresentationAdapter } from "../adapters/presentation.mjs";
import { createAdapter as createSeqAdapter } from "../adapters/seq.mjs";

export const buildAdapters = async ({ appRoot, outputRoot, repoRoot }) => {
  const adapters = [createGraphAdapter(), createMapAdapter(), createSeqAdapter(), createPresentationAdapter(), createControlAdapter(), createGraphEditorAdapter()];
  if (new Set(adapters.map(adapter => adapter.id)).size !== adapters.length) throw new Error("artifact-adapters: duplicate id");
  const compilers = Object.freeze({ control: compileControl, "graph-editor": compileGraphEditor, presentation: compilePresentation, "semantic-map": compileSemanticMap });
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'">\n<title>UI adapter</title>\n<style>:root{font-family:ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText}header{height:36px;padding:8px 12px;display:flex;gap:10px;align-items:center;border-bottom:1px solid color-mix(in srgb,CanvasText 16%,transparent)}header a{color:inherit}#label{font-weight:650}#status{margin-left:auto;font:600 10px/1.2 ui-monospace,monospace}#adapter{min-height:calc(100vh - 36px)}iframe{display:block;width:100%;height:calc(100vh - 36px);border:0}</style>\n</head>\n<body data-adapter-status="loading"><header><a href="../../">UI</a><span id="label"></span><output id="status">Loading</output></header><main id="adapter"></main><script type="module" src="../../adapter.mjs"></script></body>\n</html>\n`;

  await fs.copyFile(path.join(appRoot, "src", "adapter.mjs"), path.join(outputRoot, "adapter.mjs"));
  for (const adapter of adapters) {
    const compiler = compilers[adapter.comptime];
    if (!compiler) throw new Error(`artifact-adapters: compiler missing: ${adapter.comptime}`);
    const sourcePath = path.join(repoRoot, adapter.source);
    const source = adapter.source.endsWith(".jsonl") ? await fs.readFile(sourcePath, "utf8") : JSON.parse(await fs.readFile(sourcePath, "utf8"));
    const request = await compiler(source);
    if (request?.schema !== "artifact-invocation/2") throw new Error(`artifact-adapters: ${adapter.id} compiler did not return artifact-invocation/2`);
    const encoded = new URL(await createUrlModuleUrl({ base: "https://artifact-shell.invalid/index.html", fragment: "invoke", value: request }));
    const published = Object.freeze({ ...adapter, href: `../../index.html${encoded.hash}`, kind: "invocation", schema: "ui-adapter/1" });
    const root = path.join(outputRoot, "adapters", adapter.id);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "adapter.json"), `${canonicalJson(published)}\n`);
    await fs.writeFile(path.join(root, "index.html"), html);
  }
  return Object.freeze(adapters.map(adapter => adapter.id));
};
