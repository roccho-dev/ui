import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUrlModuleUrl } from "../../../packages/url-module/src/index.mjs";
import { ARTIFACT_SHELL_BUILD } from "../generated/capability-registry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, "../fixtures/requests");
const base = process.argv[2] ?? "http://127.0.0.1:41737/apps/artifact-shell/index.html";
const names = ["inspect-json-inline", "inspect-json-url", "inspect-json-file", "render-a2ui-inline", "unsupported"];
const result = { runtimeBuild: { digest: ARTIFACT_SHELL_BUILD.digest, id: ARTIFACT_SHELL_BUILD.id, version: ARTIFACT_SHELL_BUILD.version } };
for (const name of names) {
  const request = JSON.parse(await fs.readFile(path.join(fixtureRoot, `${name}.json`), "utf8"));
  result[name] = await createUrlModuleUrl({ base, fragment: "invoke", value: request });
}
console.log(JSON.stringify(result));
