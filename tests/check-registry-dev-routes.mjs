import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { defaultRegistry } from "../packages/core-port/src/catalog.mjs";
import { componentEndpointInventory, createRegistryRequestHandler, packageEndpointInventory } from "../scripts/registry-dev-routes.mjs";
import { createStaticServer } from "../scripts/serve-static.mjs";

const packages = packageEndpointInventory();
assert.deepEqual(packages.map(({ key, renderable, componentRegistry }) => ({ key, renderable, componentRegistry })), [
  { key: "ui", renderable: false, componentRegistry: null },
  { key: "ui-modeling-corr-port", renderable: false, componentRegistry: "default" },
]);
const components = componentEndpointInventory();
assert.deepEqual(components.map(({ key }) => key), defaultRegistry().list().map(({ id }) => id));
assert.ok(components.length > 0);

const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
async function request(url) {
  const response = await fetch(`${base}${url}`, { redirect: "manual" });
  return { response, body: await response.text() };
}
try {
  const root = await request("/");
  assert.equal(root.response.status, 200, "existing root host behavior must remain available");
  assert.match(root.body, /Purpose Decision Atlas/);

  const aggregate = await request("/registry/");
  assert.equal(aggregate.response.status, 200);
  assert.match(aggregate.body, /data-registry-aggregate="packages"/);
  for (const item of packages) assert.match(aggregate.body, new RegExp(`data-package-key="${item.key}"`));
  for (const item of components) assert.match(aggregate.body, new RegExp(`href="${item.url.replaceAll(".", "\\.")}"`));

  for (const item of components) {
    const result = await request(item.url);
    assert.equal(result.response.status, 200, item.url);
    assert.equal(result.response.headers.get("x-package-key"), item.packageKey);
    assert.equal(result.response.headers.get("x-registry-key"), item.key);
    assert.match(result.body, new RegExp(`data-registry-key="${item.key.replaceAll(".", "\\.")}"`));
  }

  for (const url of ["/registry", "/registry/packages/ui/", "/registry/packages/ui-modeling-corr-port/", "/registry/components/not-a-key/", "/registry/components/App/extra/", "/registry/packages/ui-modeling-corr-port/components/App/"]) {
    const result = await request(url);
    assert.equal(result.response.status, 404, url);
    assert.equal(result.response.headers.get("location"), null, url);
    assert.equal(result.body, "Not Found", url);
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "ui-registry-foundation-"));
try {
  fs.mkdirSync(path.join(fixture, "packages", "browser", "src"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "fixture-root", uiRegistry: { packages: ["packages/browser"], browserEntry: null, componentRegistry: "default" } }));
  fs.writeFileSync(path.join(fixture, "packages", "browser", "package.json"), JSON.stringify({ name: "browser-package", uiRegistry: { browserEntry: "index.html", componentRegistry: null, browserEndpoints: [{ kind: "graph", id: "1", entry: "graph.html" }] } }));
  fs.writeFileSync(path.join(fixture, "packages", "browser", "index.html"), '<script type="module" src="src/main.js"></script>');
  fs.writeFileSync(path.join(fixture, "packages", "browser", "graph.html"), '<script type="module" src="src/graph.js"></script>');
  fs.writeFileSync(path.join(fixture, "packages", "browser", "src", "main.js"), "export const ready = true;\n");
  fs.writeFileSync(path.join(fixture, "packages", "browser", "src", "graph.js"), "export const graph = 1;\n");
  const fixturePackages = packageEndpointInventory({ repoRoot: fixture });
  assert.equal(fixturePackages[1].url, "/registry/packages/browser-package/");
  assert.equal(fixturePackages[1].browserEndpoints[0].url, "/registry/packages/browser-package/graph/1/");
  const fixtureHandler = createRegistryRequestHandler({ repoRoot: fixture });
  const fixtureServer = http.createServer((request, response) => {
    if (!fixtureHandler(request, response)) {
      response.writeHead(404);
      response.end("outside");
    }
  });
  fixtureServer.listen(0, "127.0.0.1");
  await once(fixtureServer, "listening");
  const fixtureBase = `http://127.0.0.1:${fixtureServer.address().port}`;
  const rawFixtureRequest = (requestPath) => new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port: fixtureServer.address().port, path: requestPath }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ response, body }));
    });
    request.on("error", reject);
    request.end();
  });
  try {
    const index = await fetch(`${fixtureBase}/registry/packages/browser-package/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /src="\/registry\/packages\/browser-package\/src\/main\.js"/);
    const endpoint = await fetch(`${fixtureBase}/registry/packages/browser-package/graph/1/`);
    assert.equal(endpoint.status, 200);
    assert.equal(endpoint.headers.get("x-package-endpoint"), "graph/1");
    assert.match(await endpoint.text(), /src="\/registry\/packages\/browser-package\/src\/graph\.js"/);
    const resource = await fetch(`${fixtureBase}/registry/packages/browser-package/src/graph.js`);
    assert.equal(resource.status, 200);
    assert.equal(resource.headers.get("x-package-key"), "browser-package");
    assert.match(await resource.text(), /graph = 1/);
    for (const bad of ["graph/2/", "src/missing.js"]) {
      const response = await fetch(`${fixtureBase}/registry/packages/browser-package/${bad}`, { redirect: "manual" });
      assert.equal(response.status, 404, bad);
      assert.equal(await response.text(), "Not Found", bad);
    }
    for (const rawPath of [
      "/registry/../",
      "/registry/components/../",
      "/registry/packages/browser-package/src/%2e%2e/package.json",
      "/registry/packages/browser-package/src/../../../package.json",
      "/registry/packages/browser-package/src\\..\\package.json",
    ]) {
      const escape = await rawFixtureRequest(rawPath);
      assert.equal(escape.response.statusCode, 404, rawPath);
      assert.equal(escape.body, "Not Found", rawPath);
    }
  } finally {
    await new Promise((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
  }
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: "registry-dev-routes-pass", packageCount: packages.length, componentCount: components.length }));
