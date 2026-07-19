import crypto from "node:crypto";
import { watch as watchDirectory } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dev = process.argv.includes("--dev");
const watchMode = process.argv.includes("--watch");
const root = process.cwd();
const out = path.resolve(root, argumentValue("--out") || "dist");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureSource = path.join(root, "content", "scene.json");
const compilerSource = path.join(root, "src", "compile-scene.mjs");

if (watchMode && !dev) throw new Error("--watch requires --dev");

await buildOnce();
if (watchMode) await watchSources();

async function buildOnce() {
  const source = JSON.parse(await readFile(fixtureSource, "utf8"));
  const compilerUrl = `${pathToFileURL(compilerSource).href}?source=${Date.now()}`;
  const { compileScene } = await import(compilerUrl);
  const output = compileScene(source);
  const sceneText = `${JSON.stringify(output, null, 2)}\n`;
  const revision = crypto.createHash("sha256").update(sceneText).digest("hex");

  if (!dev) await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, "generated"), { recursive: true });

  for (const file of ["index.html", "styles.css", "viewer.js"]) {
    await copyFile(path.join(root, "static", file), path.join(out, file));
  }

  await atomicWrite(path.join(out, "generated", "scene.json"), sceneText);
  await atomicWrite(
    path.join(out, "entry.js"),
    dev ? devEntry() : productionEntry(),
  );

  const pollingClient = path.join(out, "ssg-output-refresh.js");
  const revisionFile = path.join(out, "__dev_revision.txt");
  if (dev) {
    await copyFile(
      path.resolve(scriptDir, "..", "dev", "ssg-output-refresh.js"),
      pollingClient,
    );
    // Deliberately last: the living page observes only a complete successful build.
    await atomicWrite(revisionFile, `${revision}\n`);
  } else {
    await rm(pollingClient, { force: true });
    await rm(revisionFile, { force: true });
  }

  console.log(JSON.stringify({
    status: "ssg-hot-refresh-proof-build-ready",
    mode: dev ? "dev" : "production",
    revision: dev ? revision : null,
    out,
  }));
}

async function watchSources() {
  const targets = [
    [path.dirname(fixtureSource), path.basename(fixtureSource)],
    [path.dirname(compilerSource), path.basename(compilerSource)],
  ];
  let debounceTimer = null;
  let running = false;
  let queued = false;
  let closed = false;

  const schedule = (expected, filename) => {
    if (filename && String(filename) !== expected) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      queued = true;
      void drain();
    }, 75);
  };

  const watchers = targets.map(([directory, expected]) =>
    watchDirectory(directory, (_event, filename) => schedule(expected, filename)),
  );

  async function drain() {
    if (running || closed) return;
    running = true;
    try {
      while (queued && !closed) {
        queued = false;
        try {
          await buildOnce();
        } catch (error) {
          console.error(JSON.stringify({
            status: "ssg-hot-refresh-proof-build-failed",
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    } finally {
      running = false;
    }
  }

  console.log(JSON.stringify({
    status: "ssg-hot-refresh-proof-watch-ready",
    watcher: "node-builtins",
    paths: ["content/scene.json", "src/compile-scene.mjs"],
  }));

  await new Promise((resolve) => {
    const stop = () => {
      if (closed) return;
      closed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const watcher of watchers) watcher.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function atomicWrite(file, text) {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

function productionEntry() {
  return `import { createProofViewer } from "./viewer.js";\nglobalThis.viewer = null;\nawait createProofViewer();\n`;
}

function devEntry() {
  return `import { createProofViewer } from "./viewer.js";\nimport { startSsgOutputRefresh } from "./ssg-output-refresh.js";\nglobalThis.viewer = null;\nconst viewer = await createProofViewer();\nstartSsgOutputRefresh({\n  refresh: viewer.refreshGeneratedOutput,\n  onState: viewer.setRefreshState,\n});\n`;
}
