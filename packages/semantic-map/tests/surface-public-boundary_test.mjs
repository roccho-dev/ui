import assert from 'node:assert/strict';
import { SurfacePortMaxGraphAdapter } from '../renderer-maxgraph/surface-port.js';

const prototype = SurfacePortMaxGraphAdapter.prototype;
for (const name of ['lastScene', 'cellsByRegionId', 'edgesByProjectionKey', 'setSelection', 'selectRegion', 'clearSelection']) {
  assert.equal(Object.getOwnPropertyDescriptor(prototype, name), undefined, `E_SURFACE_PUBLIC_BYPASS:${name}`);
}
for (const name of ['render', 'onGesture', 'destroy']) {
  assert.equal(typeof prototype[name], 'function', `E_SURFACE_PORT_MISSING:${name}`);
}

console.log(JSON.stringify({
  schema: 'semantic-map-surface-public-boundary/1',
  status: 'PASS',
  surfacePort: ['destroy', 'onGesture', 'render'],
  mutableBypasses: 0,
  liveInnerCollections: 0,
}));
