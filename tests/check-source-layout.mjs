import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = relative => path.join(root, relative);
const read = relative => fs.readFileSync(at(relative), 'utf8');
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
check('retired-source-root-absent', () => assert.equal(fs.existsSync(at('packages')), false));
check('separate-source-roots', () => {
  for (const name of ['capabilities', 'adapters', 'apps', 'governance']) {
    assert.equal(fs.statSync(at(name)).isDirectory(), true);
    assert.ok(fs.readdirSync(at(name)).length > 0);
  }
});
check('nineteen-existing-ownership-units', () => {
  const owners = {
    capabilities: ['artifact-invocation', 'artifact-reference', 'business-model', 'connectability', 'control', 'core-port', 'data-pin', 'decision-packet', 'presentation', 'semantic-map', 'semantic-map-profiles', 'source-compiler', 'ui-ir', 'url-module'],
    adapters: ['a2ui-browser', 'a2ui-adapter-artifacts'],
    governance: ['ui-claims', 'ui-projection-evidence', 'ui-receipts'],
  };
  const units = Object.values(owners).flat();
  assert.equal(units.length, 19);
  assert.equal(new Set(units).size, 19);
  for (const [owner, names] of Object.entries(owners)) for (const name of names) {
    assert.equal(fs.statSync(at(owner + '/' + name)).isDirectory(), true);
    assert.ok(fs.readdirSync(at(owner + '/' + name)).length > 0);
  }
});
const pkg = JSON.parse(read('package.json'));
check('public-export-names-preserved', () => assert.deepEqual(Object.keys(pkg.exports).sort(), [
  '.', './adapters', './registry', './catalog', './project', './log',
  './a2ui-shell-builder', './markdown-document-renderer',
].sort()));
for (const [name, target] of Object.entries(pkg.exports)) {
  assert.ok(target.startsWith('./capabilities/') || target.startsWith('./adapters/'), name);
  const module = await import(pathToFileURL(at(target)).href);
  assert.ok(Object.keys(module).length > 0, `${name}: empty API`);
}
checks.push('public-exports-load-from-current-source');
check('semantic-core-not-a-browser-adapter', () => {
  for (const file of ['domain/index.js', 'projection/index.js', 'runtime.js', 'renderer-maxgraph/adapter.js']) {
    assert.ok(fs.statSync(at(`capabilities/semantic-map/${file}`)).isFile());
  }
  assert.equal(fs.existsSync(at('adapters/semantic-map')), false);
});
check('current-capability-declarations-preserved', () => {
  const directory = 'apps/artifact-shell/capabilities';
  const manifests = fs.readdirSync(at(directory)).filter(name => fs.statSync(at(`${directory}/${name}`)).isDirectory())
    .map(name => JSON.parse(read(`${directory}/${name}/manifest.json`)));
  const ids = manifests.map(value => `${value.id}@${value.version}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['inspect.json@1', 'render.a2ui@1', 'render.a2ui.app@1', 'render.semantic-map@1', 'render.decision-packet@1']) {
    assert.ok(ids.includes(id), `missing capability: ${id}`);
  }
});
check('source-and-distribution-are-separate', () => {
  const flake = read('flake.nix');
  assert.doesNotMatch(flake, /\$\{self\}\/packages\//);
  for (const name of ['ui-ir', 'a2ui-browser', 'semantic-map', 'control']) {
    assert.ok(flake.includes(`$out/packages/${name}`), `missing distribution path: ${name}`);
  }
});
check('cli-does-not-require-browser-shell', () => {
  const cli = read('apps/document-cli/main.mjs');
  assert.ok(cli.includes('../../capabilities/core-port/src/markdown-document-renderer.mjs'));
  assert.doesNotMatch(cli, /artifact-shell|a2ui-browser|semantic-map/);
});
check('no-placeholder-interfaces', () => {
  // New interfaces need real implementations and their own requirements, not empty shelves.
  for (const name of ['tui', 'tty']) if (fs.existsSync(at(`apps/${name}`))) {
    assert.ok(fs.readdirSync(at(`apps/${name}`)).some(file => !file.startsWith('.')));
  }
});
console.log(JSON.stringify({ status: 'ui-source-layout-pass', count: checks.length, checks }));
