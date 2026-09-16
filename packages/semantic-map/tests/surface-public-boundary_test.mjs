import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSurfacePort } from '../editor-core/index.js';

const rendererPackage = JSON.parse(fs.readFileSync(new URL('../renderer-maxgraph/package.json', import.meta.url), 'utf8'));
assert.equal(rendererPackage.private, true);
assert.deepEqual(rendererPackage.exports, {});

const liveGraph = new Map([['raw', { mutable: true }]]);
let aliasReads = 0;
const hostilePrototype = Object.create(null, {
  graphAlias: { get() { aliasReads += 1; return liveGraph; } },
  selectionSnapshot: { value() { return { regionIds: ['raw'], relationIds: [] }; } },
});
const hostile = Object.assign(Object.create(hostilePrototype), {
  cellsByRegionId: liveGraph,
  render(value) { return value; },
  onGesture() { return () => {}; },
  destroy() { return true; },
});
const surface = assertSurfacePort(hostile);
assert.deepEqual(Reflect.ownKeys(surface).sort(), ['destroy', 'onGesture', 'render']);
assert.equal(Object.isFrozen(surface), true);
for (const name of ['cellsByRegionId', 'graphAlias', 'selectionSnapshot']) {
  assert.equal(surface[name], undefined, `E_SURFACE_PUBLIC_ALIAS:${name}`);
}
assert.equal(aliasReads, 0, 'public facade must not inspect or expose hostile prototype aliases');
assert.equal(surface.render('scene'), 'scene');
assert.equal(typeof surface.onGesture(() => {}), 'function');
assert.equal(surface.destroy(), true);

console.log(JSON.stringify({
  schema: 'semantic-map-surface-public-boundary/2',
  status: 'PASS',
  rendererPackagePrivate: true,
  packageExports: 0,
  surfacePort: Reflect.ownKeys(surface).sort(),
  hostileOwnAliasesEscaped: 0,
  hostilePrototypeAliasesEscaped: 0,
  liveInnerCollectionsEscaped: 0,
}));
