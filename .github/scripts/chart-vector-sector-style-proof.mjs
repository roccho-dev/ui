import assert from 'node:assert/strict';
import { vertexStyle } from '../../packages/semantic-map/renderer-maxgraph/styles.js';
import { DEFAULT_THEME } from '../../packages/semantic-map/renderer-maxgraph/theme.js';

const style = vertexStyle({
  shape: 'vector-sector',
  kind: 'chart-slice',
  depth: 1,
  readOnly: false,
  labelEditable: true,
  geometryEditable: false,
  temporalEdit: null,
  href: null,
  visual: {
    paletteKey: 'chart:pie',
    sector: { startAngle: 0, endAngle: 90, innerRatio: 0, outerRatio: 1 },
  },
}, 1, DEFAULT_THEME);

assert.equal(style.selectable, true);
assert.equal(style.editable, true);
assert.equal(style.connectable, true);
assert.equal(style.deletable, true);
assert.equal(style.movable, false);
assert.equal(style.resizable, false);
assert.ok(style.fontSize > 0);
console.log(JSON.stringify({ status: 'PASS', shape: 'vector-sector', style }));
