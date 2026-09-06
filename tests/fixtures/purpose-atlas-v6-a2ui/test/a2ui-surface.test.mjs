import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer as createNetServer} from 'node:net';
import {A2uiMessageSchema} from '@a2ui/web_core/v0_9';
import {createServer} from 'vite';
import {validateAtlasMessages} from '../src/a2ui/validate-messages.js';
import {packageEndpointInventory, registryEndpointInventory} from '../src/registry-dev-routes.js';
import * as ui from '../../../../src/index.mjs';

const surfacePath = new URL('../public/a2ui/purpose-atlas.surface.jsonl', import.meta.url);

async function messages() {
  const text = await readFile(surfacePath, 'utf8');
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(JSON.parse);
}

function clone(value) {
  return structuredClone(value);
}

function rootComponent(records) {
  return records.find((item) => item.updateComponents)?.updateComponents?.components
    .find((component) => component.id === 'root');
}

async function osAssignedLoopbackPort() {
  const allocator = createNetServer();
  await new Promise((resolve, reject) => {
    allocator.once('error', reject);
    allocator.listen(0, '127.0.0.1', resolve);
  });
  const address = allocator.address();
  assert.equal(typeof address, 'object');
  await new Promise((resolve, reject) => allocator.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test('every JSONL record conforms to A2UI v0.9 message schema', async () => {
  const records = await messages();
  assert.equal(records.length, 3);
  records.forEach((record) => assert.doesNotThrow(() => A2uiMessageSchema.parse(record)));
});

test('surface passes the strict Atlas catalog and security validator', async () => {
  const records = await messages();
  assert.equal(validateAtlasMessages(records), records);
});

test('latest source UI is declared as one allowlisted A2UI root component', async () => {
  const records = await messages();
  const create = records.find((item) => item.createSurface)?.createSurface;
  const update = records.find((item) => item.updateComponents)?.updateComponents;
  assert.equal(create.surfaceId, 'purpose-atlas');
  assert.equal(create.sendDataModel, true);
  assert.match(create.catalogId, /purpose-atlas\/v6-source-ui$/);
  assert.deepEqual(update.components.map((item) => item.id), ['root']);
  assert.equal(update.components[0].component, 'AtlasSourceSurface');
});

test('all 15 user operations are named A2UI actions with bound context', async () => {
  const records = await messages();
  const root = rootComponent(records);
  const actions = Object.values(root)
    .filter((value) => value?.event?.name)
    .map((value) => value.event.name);
  assert.deepEqual(new Set(actions), new Set([
    'atlas.reset', 'atlas.previous', 'atlas.next', 'atlas.togglePlay',
    'atlas.stepChanged', 'atlas.modeChanged', 'atlas.fit', 'atlas.zoomIn', 'atlas.zoomOut',
    'atlas.select', 'atlas.recordMismatch', 'atlas.requestOwner', 'atlas.holdDecision',
    'atlas.stepForward', 'atlas.clearSelection',
  ]));
  assert.deepEqual(root.onStepChanged.event.context.step, {path: '/ui/step'});
  assert.deepEqual(root.onModeChanged.event.context.mode, {path: '/ui/viewMode'});
  assert.deepEqual(root.onSelect.event.context.selection, {path: '/ui/selection'});
});

test('JSON contains no executable payloads', async () => {
  const text = await readFile(surfacePath, 'utf8');
  assert.equal(text.includes('functionCall'), false);
  assert.equal(text.includes('javascript:'), false);
  assert.equal(text.includes('<script'), false);
});

test('unknown action names are rejected', async () => {
  const records = clone(await messages());
  rootComponent(records).onNext.event.name = 'evil.execute';
  assert.throws(() => validateAtlasMessages(records), /not allowlisted/);
});

test('relative and out-of-scope DataModel paths are rejected', async () => {
  const relative = clone(await messages());
  rootComponent(relative).step.path = 'ui/step';
  assert.throws(() => validateAtlasMessages(relative), /absolute JSON Pointer/);

  const outOfScope = clone(await messages());
  rootComponent(outOfScope).snapshot.path = '/secrets/token';
  assert.throws(() => validateAtlasMessages(outOfScope), /outside Atlas DataModel/);
});

test('undeclared component properties are rejected by strict catalog schemas', async () => {
  const records = clone(await messages());
  rootComponent(records).execute = {functionCall: 'alert'};
  assert.throws(() => validateAtlasMessages(records), /property error/);
});

test('canonical package and component routes are generated and the aggregate stays stable', async () => {
  const temporaryPort = await osAssignedLoopbackPort();
  const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: temporaryPort, strictPort: true},
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.equal(typeof address, 'object');
    assert.equal(address.address, '127.0.0.1');
    assert.equal(address.port, temporaryPort);

    const named = await fetch(`http://127.0.0.1:${address.port}/registry/`, {redirect: 'manual'});
    const namedBody = await named.text();
    assert.equal(named.status, 200);
    assert.match(namedBody, /<title>UI package registry<\/title>/);
    assert.match(namedBody, /data-registry-aggregate="packages"/);
    assert.doesNotMatch(namedBody, /purpose-atlas-app|data-package-surface="selected"|<script/);

    const packages = packageEndpointInventory();
    const rootManifest = JSON.parse(await readFile(new URL('../../../../package.json', import.meta.url), 'utf8'));
    const expectedManifestPaths = ['package.json', ...rootManifest.workspaces.map((path) => `${path}/package.json`)].sort();
    assert.deepEqual(packages.map(({manifestPath}) => manifestPath), expectedManifestPaths);
    for (const item of packages) {
      const manifest = JSON.parse(await readFile(new URL(`../../../../${item.manifestPath}`, import.meta.url), 'utf8'));
      assert.equal(item.key, manifest.name);
      assert.equal(item.renderable, manifest.uiRegistry.browserEntry !== null);
      assert.equal(item.componentRegistry, manifest.uiRegistry.componentRegistry ?? null);
    }
    for (const item of packages) assert.match(namedBody, new RegExp(`data-package-key="${item.key}"`));
    const browserPackage = packages.find(({renderable}) => renderable);
    const packageResponse = await fetch(new URL(browserPackage.url, named.url), {redirect: 'manual'});
    const packageBody = await packageResponse.text();
    assert.equal(packageResponse.status, 200);
    assert.match(packageBody, /data-package-surface="selected"/);
    assert.match(packageBody, /<purpose-atlas-app>/);
    const entryPath = packageBody.match(/<script type="module" src="([^"]*src\/main\.js)"><\/script>/)?.[1];
    assert.equal(new URL(entryPath, packageResponse.url).pathname, '/registry/src/main.js');
    const entry = await fetch(new URL(entryPath, named.url));
    assert.equal(entry.status, 200);
    const entryBody = await entry.text();
    assert.match(entryBody, /\/registry\/src\/app\.js/);
    const appSource = await fetch(new URL('/registry/src/app.js', named.url));
    const appBody = await appSource.text();
    assert.equal(appSource.status, 200);
    assert.match(appBody, /PurposeAtlasApp/);
    const dependencyPaths = [...new Set(
      [appBody].flatMap((source) => [...source.matchAll(/["'](\/registry\/node_modules\/[^"']+)["']/g)]
        .map((match) => match[1])),
    )];
    assert.ok(dependencyPaths.length >= 2);
    for (const path of dependencyPaths) {
      assert.equal((await fetch(new URL(path, named.url))).status, 200, `transformed dependency must resolve at ${path}`);
    }
    const idDependency = await fetch(new URL('/registry/@id/lit', named.url));
    assert.equal(idDependency.status, 200);
    assert.match(await idDependency.text(), /reactive-element|LitElement/);

    const servedSurface = await fetch(new URL('a2ui/purpose-atlas.surface.jsonl', named.url));
    assert.equal(servedSurface.status, 200);
    assert.equal((await servedSurface.text()).trim(), (await readFile(surfacePath, 'utf8')).trim());

    const root = await fetch(`http://127.0.0.1:${address.port}/`, {redirect: 'manual'});
    const rootBody = await root.text();
    assert.equal(root.status, 404);
    assert.equal(root.headers.has('location'), false);
    assert.doesNotMatch(rootBody, /purpose-atlas-app|Purpose Atlas/i);

    const built = await readFile(new URL('../dist/registry/index.html', import.meta.url), 'utf8');
    assert.match(built, /<title>UI package registry<\/title>/);
    assert.doesNotMatch(built, /purpose-atlas-app|data-package-surface="selected"/);
    const builtPackage = await readFile(new URL('../dist/registry/packages/purpose-atlas-registry-dev/index.html', import.meta.url), 'utf8');
    assert.match(builtPackage, /<purpose-atlas-app>/);
    const builtAssets = [...builtPackage.matchAll(/(?:href|src)="(\/registry\/assets\/[^"]+)"/g)]
      .map((match) => match[1]);
    assert.equal(builtAssets.length, 2);
    for (const asset of builtAssets) {
      assert.ok((await readFile(new URL(`../dist/${asset.replace('/registry/', '')}`, import.meta.url))).length > 0);
    }

    const inventory = registryEndpointInventory();
    const canonicalKeys = ui.defaultRegistry().list().map((entry) => entry.id);
    assert.deepEqual(inventory.map(({key}) => key), canonicalKeys);
    assert.equal(new Set(inventory.map(({url}) => url)).size, canonicalKeys.length);
    for (const {key, url} of inventory) {
      assert.match(namedBody, new RegExp(`href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      assert.match(built, new RegExp(`href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      const endpoint = await fetch(new URL(url, named.url), {redirect: 'manual'});
      const endpointBody = await endpoint.text();
      assert.equal(endpoint.status, 200, `${key} endpoint must be reachable`);
      assert.equal(endpoint.headers.get('x-package-key'), 'ui-modeling-corr-port');
      assert.equal(endpoint.headers.get('x-registry-key'), key);
      assert.match(endpointBody, new RegExp(`data-registry-key="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      assert.match(endpointBody, new RegExp(`&quot;id&quot;: &quot;${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}&quot;`));
    }

    const descriptorExports = Object.entries(ui)
      .filter(([, value]) => value?.kind === 'ui.adapter.box.v1')
      .map(([exportName, descriptor]) => ({exportName, key: descriptor.id}))
      .sort((a, b) => a.exportName.localeCompare(b.exportName));
    for (const descriptor of descriptorExports) {
      assert.equal(canonicalKeys.includes(descriptor.key), false);
      const response = await fetch(new URL(`/registry/packages/ui-modeling-corr-port/components/${encodeURIComponent(descriptor.key)}/`, named.url), {redirect: 'manual'});
      assert.equal(response.status, 404);
      assert.equal(response.headers.has('location'), false);
    }

    const unknown = await fetch(new URL('/registry/packages/not-a-package/', named.url), {redirect: 'manual'});
    assert.equal(unknown.status, 404);
    assert.equal(unknown.headers.has('location'), false);
    assert.equal(await unknown.text(), 'Not Found');
    const malformedComponentPaths = [
      '/registry/packages/ui-modeling-corr-port/',
      '/registry/packages/ui-modeling-corr-port/components/App',
      '/registry/packages/ui-modeling-corr-port/components/App/extra/',
      '/registry/packages/ui-modeling-corr-port/components/%41pp/',
      '/registry/App/',
      '/registry/NeedZoom/',
    ];
    for (const path of malformedComponentPaths) {
      const response = await fetch(new URL(path, named.url), {redirect: 'manual'});
      assert.equal(response.status, 404, `${path} must be a real 404`);
      assert.equal(response.headers.has('location'), false);
      assert.equal(await response.text(), 'Not Found');
    }
    const stalePaths = [
      '/purpose-atlas',
      '/purpose-atlas/',
      '/purpose-atlas/components/App/',
      '/purpose-atlas/src/main.js',
      '/purpose-atlas/src/app.js',
      '/purpose-atlas/a2ui/purpose-atlas.surface.jsonl',
    ];
    for (const path of stalePaths) {
      const response = await fetch(new URL(path, named.url), {redirect: 'manual'});
      const body = await response.text();
      assert.equal(response.status, 404, `${path} must not remain a public alias`);
      assert.equal(response.headers.has('location'), false);
      assert.equal(body, 'Not Found');
    }
    console.log(JSON.stringify({
      status: 'canonical-registry-dev-route-pass',
      port: address.port,
      portAllocation: 'os-assigned-loopback',
      namedRoute: {path: '/registry/', status: named.status, title: 'UI package registry', staticWithoutClientMount: true},
      packages,
      boundSources: {
        entryStatus: entry.status,
        appStatus: appSource.status,
        surfaceStatus: servedSurface.status,
        dependencyStatuses: dependencyPaths.map((path) => ({path, status: 200})),
        idDependencyStatus: idDependency.status,
      },
      rootRoute: {path: '/', status: root.status, location: root.headers.get('location')},
      buildOutputs: ['dist/registry/index.html', 'dist/registry/packages/purpose-atlas-registry-dev/index.html'],
      registryEndpoints: inventory.map(({key, url}) => ({key, url})),
      exportedDescriptors: descriptorExports,
      unknownComponentStatus: unknown.status,
      malformedComponentStatuses: malformedComponentPaths.map((path) => ({path, status: 404})),
      staleRouteStatuses: stalePaths.map((path) => ({path, status: 404})),
    }));
  } finally {
    await server.close();
  }
});
