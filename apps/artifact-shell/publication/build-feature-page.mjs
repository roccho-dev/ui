import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../../../packages/url-module/src/index.mjs";

const scriptJson = value => JSON.stringify(value).replaceAll("<", "\\u003c");
const copy = async (source, target) => { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target); };

export const buildFeaturePage = async ({ adapter, compiled, outputRoot, repoRoot }) => {
  const root = path.join(outputRoot, "features", adapter.id);
  await fs.mkdir(root, { recursive: true });
  const localStore = path.join(repoRoot, "apps", "artifact-shell", "publication", "local-store.mjs");

  if (adapter.id === "control") {
    const sourceRoot = path.join(repoRoot, "packages", "control", "ui");
    const template = await fs.readFile(path.join(sourceRoot, "control.html"), "utf8");
    const config = { view: "control", labels: { title: "Control", saved: "saved", stale: "stale", delete: "delete" }, endpoints: { control: "./control.jsonl" } };
    const bootstrap = `<script id="policy-app-config" type="application/json">${scriptJson(config)}</script><script type="module" src="./boot.mjs"></script>`;
    if (!template.includes("<!--POLICY_APP_BOOTSTRAP-->")) throw new Error("feature-page: control bootstrap slot missing");
    await fs.writeFile(path.join(root, "index.html"), template.replace("<!--POLICY_APP_BOOTSTRAP-->", bootstrap));
    await fs.writeFile(path.join(root, "control.jsonl"), compiled.text);
    await copy(path.join(sourceRoot, "control.mjs"), path.join(root, "control.mjs"));
    await copy(localStore, path.join(root, "local-store.mjs"));
    await fs.writeFile(path.join(root, "boot.mjs"), `import { installLocalStore } from "./local-store.mjs";\nawait installLocalStore({ href: "./control.jsonl", contentType: "application/x-ndjson; charset=utf-8" });\nawait import("./control.mjs");\n`);
    return Object.freeze({ href: `../../features/${adapter.id}/`, proof: Object.freeze({ selectors: ["#tree .node"] }) });
  }

  if (adapter.id === "graph-editor") {
    const sourceRoot = path.join(repoRoot, "packages", "graph-editor", "ui");
    const template = await fs.readFile(path.join(sourceRoot, "graph.html"), "utf8");
    const config = {
      labels: {
        title: "Graph editor",
        documentName: "document",
        stale: "stale",
        editor: { heading: "Graph editor", scope: "UI example", canvasLabel: "Editable graph canvas", activeCells: "Active frame cells" },
      },
      endpoints: { document: "./document.json" },
    };
    const bootstrap = `<script id="policy-app-config" type="application/json">${scriptJson(config)}</script><script type="module" src="./boot.mjs"></script>`;
    if (!template.includes("<!--POLICY_APP_BOOTSTRAP-->") || !template.includes("<!--POLICY_APP_STYLE-->")) throw new Error("feature-page: graph slots missing");
    const html = template.replace("<!--POLICY_APP_STYLE-->", '<link rel="stylesheet" href="./graph.css">').replace("<!--POLICY_APP_BOOTSTRAP-->", bootstrap);
    await fs.writeFile(path.join(root, "index.html"), html);
    await fs.writeFile(path.join(root, "document.json"), compiled.text);
    await copy(path.join(sourceRoot, "graph.mjs"), path.join(root, "graph.mjs"));
    await copy(path.join(sourceRoot, "graph.css"), path.join(root, "graph.css"));
    await copy(localStore, path.join(root, "local-store.mjs"));
    await fs.writeFile(path.join(root, "boot.mjs"), `import { installLocalStore } from "./local-store.mjs";\nawait installLocalStore({ href: "./document.json", contentType: "application/json; charset=utf-8" });\nawait import("./graph.mjs");\n`);
    return Object.freeze({ href: `../../features/${adapter.id}/`, proof: Object.freeze({ selectors: [".roccho-graph-editor", ".roccho-graph-editor__canvas svg", ".roccho-graph-editor__projection li"] }) });
  }

  if (adapter.id === "presentation") {
    const kernels = (await fs.readdir(path.join(outputRoot, "kernel"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
    if (kernels.length !== 1) throw new Error(`feature-page: expected one kernel, found ${kernels.length}`);
    const kernel = kernels[0];
    const sourceRoot = path.join(repoRoot, "packages", "presentation");
    const compilerSource = path.join(sourceRoot, "compiler");
    const compilerTarget = path.join(root, "compiler");
    await fs.mkdir(compilerTarget, { recursive: true });
    for (const entry of (await fs.readdir(compilerSource, { withFileTypes: true })).filter(item => item.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
      let source = await fs.readFile(path.join(compilerSource, entry.name), "utf8");
      if (entry.name === "catalog.mjs" || entry.name === "projectors.mjs") source = source.replaceAll("../../a2ui-browser/src/index.mjs", `../../../kernel/${kernel}/packages/a2ui-browser/src/index.mjs`);
      await fs.writeFile(path.join(compilerTarget, entry.name), source);
    }
    let main = await fs.readFile(path.join(sourceRoot, "ui", "main.mjs"), "utf8");
    main = main.replace("../../a2ui-browser/src/incremental-surface.mjs", `../../kernel/${kernel}/packages/a2ui-browser/src/incremental-surface.mjs`).replace("../compiler/index.mjs", "./compiler/index.mjs");
    await fs.writeFile(path.join(root, "main.mjs"), main);
    await copy(path.join(sourceRoot, "ui", "styles.css"), path.join(root, "styles.css"));
    const html = `<!doctype html>\n<html lang="ja" data-status="boot">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<link rel="icon" href="data:,">\n<title>${String(compiled.label).replaceAll("<", "&lt;")}</title>\n<link rel="stylesheet" href="./styles.css">\n</head>\n<body>\n<main id="surface" aria-label="A2UI Slides"></main>\n<div class="seq-backdrop" id="seq-backdrop" data-open="false" aria-hidden="true"></div>\n<aside class="seq-shell" id="seq-shell" data-preview="false" data-expanded="false" aria-label="主体別Seq" role="complementary">\n  <div class="seq-toolbar"><div class="seq-identity"><span class="seq-marker" aria-hidden="true"></span><div class="seq-labels"><span class="seq-kind">Actor Seq</span><strong class="seq-current" id="seq-current"></strong></div></div><button class="seq-close" id="seq-close" type="button" aria-label="Seqを閉じる" hidden>×</button></div>\n  <div class="seq-mount" id="seq-mount"></div>\n  <button class="seq-open" id="seq-open" type="button" aria-expanded="false" aria-label="主体別Seqを開く"><span>Open Seq ↗</span></button>\n</aside>\n<p id="fatal" hidden role="alert"></p>\n<script type="module" src="./main.mjs"></script>\n</body>\n</html>\n`;
    await fs.writeFile(path.join(root, "index.html"), html);
    await fs.writeFile(path.join(root, "payload.json"), `${canonicalJson(compiled)}\n`);
    return Object.freeze({ href: `../../features/${adapter.id}/`, proof: Object.freeze({ rootStatus: "pass", selectors: ["#surface .profiled-app", "#seq-shell", ".seq-svg"] }) });
  }

  throw new Error(`feature-page: unsupported ${adapter.id}`);
};
