import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_THEME } from '../renderer-maxgraph/index.js';
import { connectIcon, paletteFor, styleScaleFor } from '../renderer-maxgraph/theme.js';

const rendererFiles = [
  '../renderer-maxgraph/adapter.js',
  '../renderer-maxgraph/styles.js',
  '../renderer-maxgraph/labels.js',
  '../renderer-maxgraph/render-methods.js',
];
const rendererSource = rendererFiles
  .map((relative) => new URL(relative, import.meta.url))
  .filter((url) => existsSync(url))
  .map((url) => readFileSync(url, 'utf8'))
  .join('\n');
assert.equal(/#[0-9a-f]{3,8}/iu.test(rendererSource), false, 'MUTATION:move-theme-literal-into-renderer');
assert.equal(rendererSource.includes('representation.pattern'), false, 'renderer must not infer vertex visuals from Pattern');
assert.equal(rendererSource.includes('relation.pattern'), false, 'renderer must not infer edge visuals from Pattern');
assert.equal(rendererSource.includes('representation.shape'), true);
assert.equal(rendererSource.includes('representation.visual'), true);
assert.equal(rendererSource.includes('a.zIndex'), true);
assert.equal(rendererSource.includes('relation.directed'), true);
assert.equal(rendererSource.includes('relation.line'), true);
assert.equal(rendererSource.includes('relation.foreground'), false, 'foreground is consumed from cell semantic ordering');

assert.equal(Object.isFrozen(DEFAULT_THEME), true);
for (const section of Object.values(DEFAULT_THEME)) assert.equal(Object.isFrozen(section), true);
assert.deepEqual(paletteFor(DEFAULT_THEME, 'decision'), paletteFor(DEFAULT_THEME, 'decision'));
assert.equal(DEFAULT_THEME.palettes.includes(paletteFor(DEFAULT_THEME, 'decision')), true);
assert.equal(styleScaleFor(0.25), 0.25);
assert.equal(styleScaleFor(0.3), 2 ** -1.5, 'MUTATION:restore-continuous-renderer-style-scale');
assert.equal(styleScaleFor(0.4), 2 ** -1.5);
assert.equal(styleScaleFor(0.5), 0.5);
assert.equal(styleScaleFor(0.74), 2 ** -0.5);
assert.equal(styleScaleFor(1), 1);
assert.equal(styleScaleFor(1.4), 2 ** 0.5);
assert.equal(styleScaleFor(1.5), 2 ** 0.5);
assert.equal(styleScaleFor(1.7), 2);
assert.throws(() => styleScaleFor(0), /cameraScale must be positive/u);
assert.throws(() => styleScaleFor(Number.NaN), /cameraScale must be positive/u);
assert.equal(DEFAULT_THEME.vertex.shadow, false);
assert.equal(rendererSource.includes("if (height < minimumHeight) return '';"), true, 'MUTATION:restore-all-renderer-labels');
assert.equal(rendererSource.includes('estimatedLabelWidth(label, fontSize)'), true);
const icon = decodeURIComponent(connectIcon(DEFAULT_THEME));
assert.ok(icon.includes(DEFAULT_THEME.connect.fill));
assert.ok(icon.includes(DEFAULT_THEME.connect.stroke));

for (const relative of [
  '../domain/index.js',
  '../pattern/index.js',
  '../protocol/index.js',
  '../projection/index.js',
]) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  assert.equal(source.includes('DEFAULT_THEME'), false, `${relative} must not depend on renderer appearance`);
}

console.log(JSON.stringify({
  schema: 'semantic-map-theme-contract-test/2',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  adapterColorLiterals: 0,
  rendererConsumesSceneVisuals: ['shape', 'visual', 'zIndex', 'directed', 'line', 'foreground'],
  transported: false,
  styleScaleBuckets: [0.25, 0.3535533905932738, 0.5, 0.7071067811865476, 1, 1.4142135623730951, 2],
  adaptiveLabels: true,
}, null, 2));
