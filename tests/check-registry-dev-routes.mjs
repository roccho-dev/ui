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
assert.deepEqual(packages.map(({ key, renderable, componentRegistry }) => ({ key, renderable, componentRegistry: componentRegistry?.id ?? null })), [
  { key: "ui", renderable: false, componentRegistry: null },
  { key: "ui-modeling-corr-port", renderable: false, componentRegistry: "default" },
]);
const components = await componentEndpointInventory();
assert.deepEqual(components.map(({ key }) => key), defaultRegistry().list().map(({ id }) => id));
assert.ok(components.length > 0);

const server = await createStaticServer();
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
  fs.mkdirSync(path.join(fixture, "packages", "browser", "public", "src"), { recursive: true });
  const rootManifestPath = path.join(fixture, "package.json");
  const browserManifestPath = path.join(fixture, "packages", "browser", "package.json");
  const rootManifest = { name: "fixture-root", uiRegistry: { packages: ["packages/browser"], browserEntry: null, componentRegistry: { id: "default", module: "registry.mjs", export: "defaultRegistry" } } };
  const browserManifest = { name: "browser-package", uiRegistry: { browserEntry: "index.html", componentRegistry: null, browserEndpoints: [{ kind: "graph", id: "1", entry: "graph.html" }] } };
  fs.writeFileSync(rootManifestPath, JSON.stringify(rootManifest));
  fs.writeFileSync(browserManifestPath, JSON.stringify(browserManifest));
  fs.writeFileSync(path.join(fixture, "registry.mjs"), "export function defaultRegistry() { return { list: () => [{ id: 'FixtureThing' }] }; }\n");
  fs.writeFileSync(path.join(fixture, "packages", "browser", "index.html"), '<script type="module" src="src/main.js"></script>');
  fs.writeFileSync(path.join(fixture, "packages", "browser", "graph.html"), "<link rel=\"stylesheet\" href='/src/graph.css'><object data=\"/src/graph.json\"></object><script type=\"module\" src='/src/graph.js'></script>");
  fs.writeFileSync(path.join(fixture, "packages", "browser", "src", "main.js"), "export const ready = true;\n");
  fs.writeFileSync(path.join(fixture, "packages", "browser", "src", "graph.js"), "export const graph = 1;\n");
  fs.writeFileSync(path.join(fixture, "packages", "browser", "public", "src", "graph.css"), "body { color: green; }\n");
  fs.writeFileSync(path.join(fixture, "packages", "browser", "src", "graph.json"), '{"graph":1}\n');
  const fixturePackages = packageEndpointInventory({ repoRoot: fixture });
  assert.equal(fixturePackages[1].url, "/registry/packages/browser-package/");
  assert.equal(fixturePackages[1].browserEndpoints[0].url, "/registry/packages/browser-package/graph/1/");
  const fixtureComponents = await componentEndpointInventory({ repoRoot: fixture, packages: fixturePackages });
  assert.deepEqual(fixtureComponents.map(({ key, packageKey }) => ({ key, packageKey })), [{ key: "FixtureThing", packageKey: "fixture-root" }]);
  const fixtureHandler = await createRegistryRequestHandler({ repoRoot: fixture });
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
    const endpointBody = await endpoint.text();
    assert.match(endpointBody, /src='\/registry\/packages\/browser-package\/src\/graph\.js'/);
    assert.match(endpointBody, /href='\/registry\/packages\/browser-package\/src\/graph\.css'/);
    assert.match(endpointBody, /data="\/registry\/packages\/browser-package\/src\/graph\.json"/);
    const resource = await fetch(`${fixtureBase}/registry/packages/browser-package/src/graph.js`);
    assert.equal(resource.status, 200);
    assert.equal(resource.headers.get("x-package-key"), "browser-package");
    assert.match(await resource.text(), /graph = 1/);
    const publicStyle = await fetch(`${fixtureBase}/registry/packages/browser-package/src/graph.css`);
    assert.equal(publicStyle.status, 200);
    assert.match(await publicStyle.text(), /color: green/);
    for (const htmlPath of ["index.html", "graph.html"]) {
      const html = await fetch(`${fixtureBase}/registry/packages/browser-package/${htmlPath}`);
      assert.equal(html.status, 404, htmlPath);
      assert.equal(await html.text(), "Not Found", htmlPath);
    }
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ui-registry-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "secret.js"), "export const secret = true;\n");
      fs.symlinkSync(outside, path.join(fixture, "packages", "browser", "linked"), "junction");
      const escapedResource = await fetch(`${fixtureBase}/registry/packages/browser-package/linked/secret.js`);
      assert.equal(escapedResource.status, 404);
      assert.equal(await escapedResource.text(), "Not Found");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
    for (const bad of ["graph/2/", "src/missing.js"]) {
      const response = await fetch(`${fixtureBase}/registry/packages/browser-package/${bad}`, { redirect: "manual" });
      assert.equal(response.status, 404, bad);
      assert.equal(await response.text(), "Not Found", bad);
    }
    for (const rawPath of [
      "/registry/../",
      "/registry/components/../",
      "/registry%2F..%2Fpackage.json",
      "/reg%69stry%2F..%2Fpackage.json",
      "/registry\\..\\package.json",
      "/registry%ZZ",
      "/registry/packages/browser-package/src/%2e%2e/package.json",
      "/registry/packages/browser-package/src/../../../package.json",
      "/registry/packages/browser-package/src\\..\\package.json",
    ]) {
      const escape = await rawFixtureRequest(rawPath);
      assert.equal(escape.response.statusCode, 404, rawPath);
      assert.equal(escape.response.headers.location, undefined, rawPath);
      assert.equal(escape.body, "Not Found", rawPath);
    }
    const survivingRoute = await fetch(`${fixtureBase}/registry/components/FixtureThing/`);
    assert.equal(survivingRoute.status, 200);
    assert.equal(survivingRoute.headers.get("x-registry-key"), "FixtureThing");
  } finally {
    await new Promise((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
  }

  const invalidManifestCases = [
    [{ ...browserManifest, name: "bad/name" }, /package name.*literal URL segment/],
    [{ ...browserManifest, uiRegistry: { ...browserManifest.uiRegistry, browserEntry: null } }, /headless package cannot declare browserEndpoints/],
    [{ ...browserManifest, uiRegistry: { ...browserManifest.uiRegistry, browserEndpoints: [{ kind: "bad/kind", id: "1", entry: "graph.html" }] } }, /endpoint kind.*literal URL segment/],
    [{ ...browserManifest, uiRegistry: { ...browserManifest.uiRegistry, browserEndpoints: [{ kind: "graph", id: "bad/id", entry: "graph.html" }] } }, /endpoint id.*literal URL segment/],
    [{ ...browserManifest, uiRegistry: { ...browserManifest.uiRegistry, browserEndpoints: [{ kind: "graph", id: "1", entry: "src/graph.js" }] } }, /endpoint entry must be HTML/],
    [{ ...browserManifest, uiRegistry: { ...browserManifest.uiRegistry, browserEndpoints: null } }, /browserEndpoints must be an array/],
  ];
  for (const [manifest, pattern] of invalidManifestCases) {
    fs.writeFileSync(browserManifestPath, JSON.stringify(manifest));
    assert.throws(() => packageEndpointInventory({ repoRoot: fixture }), pattern);
  }
  fs.writeFileSync(browserManifestPath, JSON.stringify(browserManifest));
  fs.writeFileSync(rootManifestPath, JSON.stringify({ ...rootManifest, uiRegistry: { ...rootManifest.uiRegistry, componentRegistry: "default" } }));
  assert.throws(() => packageEndpointInventory({ repoRoot: fixture }), /componentRegistry must be null or the declared default registry source/);
  const { componentRegistry: _omitted, ...incompleteRegistry } = rootManifest.uiRegistry;
  fs.writeFileSync(rootManifestPath, JSON.stringify({ ...rootManifest, uiRegistry: incompleteRegistry }));
  assert.throws(() => packageEndpointInventory({ repoRoot: fixture }), /no explicit uiRegistry.componentRegistry/);
  fs.writeFileSync(path.join(fixture, "invalid-registry.mjs"), "export function defaultRegistry() { return { list: () => [{ id: 'bad/id' }] }; }\n");
  fs.writeFileSync(rootManifestPath, JSON.stringify({ ...rootManifest, uiRegistry: { ...rootManifest.uiRegistry, componentRegistry: { id: "default", module: "invalid-registry.mjs", export: "defaultRegistry" } } }));
  await assert.rejects(() => componentEndpointInventory({ repoRoot: fixture }), /component registry id.*literal URL segment/);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: "registry-dev-routes-pass", packageCount: packages.length, componentCount: components.length }));
