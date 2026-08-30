import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SemanticDomainStore,
  createSemanticMap,
  parseSemanticMapRecords,
} from '../domain/index.js';
import {
  BAR_HORIZONTAL_CHART,
  BAR_VERTICAL_CHART,
  CHART_COMBINATION_COUNT,
  CHART_PATTERN,
  CHART_TYPES,
  DONUT_CHART,
  LINE_CHART,
  PIE_CHART,
  chartLayers,
  coordinateSpaceForPattern,
  normalizeChartView,
  validatePatternDomain,
} from '../pattern/index.js';
import {
  HEATMAP_CHART,
  EXCLUSIVE_CHART_TYPES,
  OVERLAY_CHART_TYPES,
  SCATTER_CHART,
  SUNBURST_CHART,
} from '../pattern/view-types/chart/contract.js';
import { SemanticProjector, createPatternLayout } from '../projection/index.js';
import { createDecisionLog, createEnvelope, normalizeView } from '../protocol/index.js';
import { createSmapUrl, readSmapHash } from '../transport/index.js';

function fixture(path) {
  const text = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const records = parseSemanticMapRecords(text);
  return Object.freeze({ records, domain: createSemanticMap(records) });
}

const flat = fixture('../examples/chart.jsonl');
const records = flat.records;
const domain = flat.domain;
const itemCount = domain.children.get(domain.meta.root).length;
const viewport = { x: -100, y: -100, width: 1_600, height: 900 };
const legacyChart = { type: BAR_HORIZONTAL_CHART };
const legacyView = { pattern: CHART_PATTERN, chart: legacyChart };

assert.deepEqual(normalizeChartView(legacyChart), legacyChart);
assert.deepEqual(normalizeView(legacyView), legacyView);
assert.deepEqual(
  normalizeChartView({ layers: [DONUT_CHART, SCATTER_CHART, BAR_HORIZONTAL_CHART, PIE_CHART] }),
  { layers: [BAR_HORIZONTAL_CHART, PIE_CHART, DONUT_CHART, SCATTER_CHART] },
);
assert.deepEqual(chartLayers({ type: LINE_CHART }), [LINE_CHART]);
assert.deepEqual(chartLayers({ type: HEATMAP_CHART }), [HEATMAP_CHART]);
assert.deepEqual(chartLayers({ type: SUNBURST_CHART, focus: 'product' }), [SUNBURST_CHART]);
assert.equal(coordinateSpaceForPattern(CHART_PATTERN, legacyChart), 'quantitative/1');
assert.equal(validatePatternDomain(domain, CHART_PATTERN, legacyChart), CHART_PATTERN);
assert.equal(CHART_TYPES.length, 8);
assert.equal(OVERLAY_CHART_TYPES.length, 6);
assert.equal(EXCLUSIVE_CHART_TYPES.length, 2);
assert.equal(CHART_COMBINATION_COUNT, 65);

assert.throws(() => normalizeChartView({}), /exactly one/u);
assert.throws(() => normalizeChartView({ type: PIE_CHART, layers: [PIE_CHART] }), /exactly one/u);
assert.throws(() => normalizeChartView({ layers: [] }), /must not be empty/u);
assert.throws(() => normalizeChartView({ layers: [LINE_CHART, LINE_CHART] }), /duplicates/u);
assert.throws(() => normalizeChartView({ type: 'area/1' }), /must be one of/u);
assert.deepEqual(normalizeChartView({ type: SUNBURST_CHART, focus: 'product' }), {
  type: SUNBURST_CHART,
  focus: 'product',
});
assert.throws(() => normalizeChartView({ type: DONUT_CHART, focus: 'product' }), /only valid for sunburst/u);
assert.throws(() => normalizeChartView({ layers: [DONUT_CHART], focus: 'product' }), /not allowed with/u);
assert.throws(
  () => normalizeChartView({ layers: [HEATMAP_CHART] }),
  /standalone and cannot be layered/u,
  'MUTATION:heatmap-standalone',
);

const layoutA = createPatternLayout(domain, CHART_PATTERN, legacyChart);
const layoutB = createPatternLayout(domain, CHART_PATTERN, legacyChart);
assert.deepEqual([...layoutA.bounds], [...layoutB.bounds], 'chart layout must be deterministic');
assert.equal(layoutA.axis.maximum, 42);
assert.equal(layoutA.axis.total, 100);
assert.equal(layoutA.items.length, 4);
assert.equal(layoutA.bounds.get('product').width, 580);
assert.ok(Math.abs(layoutA.bounds.get('other').width - 580 * 9 / 42) < 1e-9);

const legacyScene = new SemanticProjector(domain, null, legacyView).project({ scale: 1, viewport });
const legacyBars = legacyScene.representations.filter(item => item.mode === 'bar');
assert.equal(legacyScene.pattern, CHART_PATTERN);
assert.equal(legacyScene.scenes[0].space, 'quantitative/1');
assert.equal(legacyScene.scenes[0].axis.type, BAR_HORIZONTAL_CHART);
assert.equal(legacyScene.relations.length, 0);
assert.equal(legacyBars.length, 4);
assert.ok(
  legacyBars.every(item => item.shape === 'graph-node' && item.readOnly && item.label === ''),
  'MUTATION:chart-read-only',
);
for (const label of ['製品質問', '導入相談', '不具合', 'その他', '42', '31', '18', '9']) {
  assert.ok(legacyScene.guides.some(item => item.label === label), `chart guide missing: ${label}`);
}

const combinations = [];
for (let mask = 1; mask < 2 ** OVERLAY_CHART_TYPES.length; mask += 1) {
  const requested = OVERLAY_CHART_TYPES.filter((_type, index) => (mask & (1 << index)) !== 0);
  const chart = { layers: [...requested].reverse() };
  const normalized = normalizeChartView(chart);
  assert.deepEqual(normalized.layers, requested, `combination ${mask} must canonicalize layer order`);
  assert.equal(validatePatternDomain(domain, CHART_PATTERN, normalized), CHART_PATTERN);

  const layout = createPatternLayout(domain, CHART_PATTERN, normalized);
  const scene = new SemanticProjector(domain, null, { pattern: CHART_PATTERN, chart: normalized })
    .project({ scale: 1, viewport });
  const marks = scene.representations.filter(item => item.visual?.chartType);
  assert.equal(marks.length, itemCount * requested.length, `combination ${mask} mark count`);
  assert.ok(marks.every(item => item.readOnly && item.label === ''), 'MUTATION:chart-read-only');
  assert.deepEqual(scene.scenes[0].axis.layers, requested);
  assert.equal(scene.scenes[0].axis.supportedCombinations, CHART_COMBINATION_COUNT);
  assert.equal(scene.scenes[0].axis.type, requested.length === 1 ? requested[0] : 'overlay/1');
  assert.equal(layout.axis.maximum, 42);
  assert.equal(layout.axis.total, 100);
  if (requested.includes(SCATTER_CHART)) {
    assert.equal(layout.axis.xMinimum, 0);
    assert.equal(layout.axis.xMaximum, 3);
  }

  for (const type of requested) {
    const layerMarks = marks.filter(item => item.visual.chartType === type);
    assert.equal(layerMarks.length, itemCount, `combination ${mask} ${type} mark count`);
    const expectedShape = type === LINE_CHART || type === SCATTER_CHART
      ? 'graph-terminal'
      : type === PIE_CHART || type === DONUT_CHART
        ? 'vector-sector'
        : 'graph-node';
    assert.ok(layerMarks.every(item => item.shape === expectedShape));
    if (type === PIE_CHART || type === DONUT_CHART) {
      assert.ok(layerMarks.every(item => Number.isFinite(item.visual.sector.startAngle)));
      assert.ok(layerMarks.every(item => item.visual.sector.endAngle >= item.visual.sector.startAngle));
      assert.ok(layerMarks.every(item => type === PIE_CHART
        ? item.visual.sector.innerRatio === 0
        : item.visual.sector.innerRatio > 0));
    }
  }

  const expectedLineRelations = requested.includes(LINE_CHART) ? itemCount - 1 : 0;
  assert.equal(scene.relations.length, expectedLineRelations, `combination ${mask} line relations`);
  assert.ok(scene.relations.every(item => (
    item.kind === 'chart-line' && item.foreground && item.zIndex === 55 && item.readOnly === true
  )));
  combinations.push({ mask, layers: requested, marks: marks.length, relations: scene.relations.length });
}
assert.equal(combinations.length, 63);
assert.equal(combinations.length + EXCLUSIVE_CHART_TYPES.length, CHART_COMBINATION_COUNT);

const allChart = { layers: [...OVERLAY_CHART_TYPES] };
const allView = { pattern: CHART_PATTERN, chart: allChart };
const allScene = new SemanticProjector(domain, null, allView).project({ scale: 1, viewport });
assert.deepEqual(allScene.scenes[0].axis.coordinateSystems, ['cartesian/1', 'polar/1']);
assert.equal(allScene.representations.filter(item => item.visual?.chartType).length, itemCount * 6);
assert.equal(allScene.relations.length, itemCount - 1);
assert.ok(allScene.representations.some(item => item.visual?.chartType === PIE_CHART && item.zIndex === 10));
assert.ok(allScene.representations.some(item => item.visual?.chartType === DONUT_CHART && item.zIndex === 20));
assert.ok(allScene.representations.some(item => item.visual?.chartType === LINE_CHART && item.zIndex === 60));
assert.ok(allScene.representations.some(item => item.visual?.chartType === SCATTER_CHART && item.zIndex === 70));

const store = new SemanticDomainStore(domain);
store.perform({ type: 'SetRegionValue', regionId: 'other', value: 50 });
const streamedLegacy = new SemanticProjector(store.domain, null, legacyView).project({ scale: 1, viewport });
assert.equal(streamedLegacy.scenes[0].axis.maximum, 50);
assert.equal(streamedLegacy.representations.find(item => item.regionId === 'other').bounds.width, 580);
assert.ok(streamedLegacy.representations.find(item => item.regionId === 'product').bounds.width < 580);
const streamedAll = new SemanticProjector(store.domain, null, allView).project({ scale: 1, viewport });
assert.equal(streamedAll.scenes[0].axis.maximum, 50);
assert.equal(streamedAll.scenes[0].axis.total, 141);
assert.equal(streamedAll.representations.filter(item => item.visual?.chartType).length, itemCount * 6);

const log = await createDecisionLog(records, 'semantic-map:example:chart-test');
const envelope = await createEnvelope(log.log, null, allView);
const url = await createSmapUrl(envelope, 'https://example.test/app');
const opened = await readSmapHash(url);
assert.deepEqual(opened.envelope.view, allView);

const scatter = fixture('../examples/chart-scatter.jsonl');
const scatterChart = { type: SCATTER_CHART };
assert.equal(validatePatternDomain(scatter.domain, CHART_PATTERN, scatterChart), CHART_PATTERN);
const scatterLayout = createPatternLayout(scatter.domain, CHART_PATTERN, scatterChart);
assert.equal(scatterLayout.axis.xMinimum, 0);
assert.equal(scatterLayout.axis.xMaximum, 9);
assert.equal(scatterLayout.axis.maximum, 44);
const scatterMarks = scatterLayout.marks.filter(item => item.chartType === SCATTER_CHART);
assert.equal(scatterMarks.length, 4);
const scatterCenters = scatterMarks.map(item => item.bounds.x + item.bounds.width / 2);
assert.ok(scatterCenters[0] < scatterCenters[1] && scatterCenters[1] < scatterCenters[2] && scatterCenters[2] < scatterCenters[3]);
assert.ok(
  (scatterCenters[2] - scatterCenters[1]) > (scatterCenters[1] - scatterCenters[0]),
  'MUTATION:scatter-quantitative-x',
);
const scatterScene = new SemanticProjector(
  scatter.domain,
  null,
  { pattern: CHART_PATTERN, chart: scatterChart },
).project({ scale: 1, viewport });
assert.equal(scatterScene.representations.filter(item => item.visual?.chartType === SCATTER_CHART).length, 4);
assert.ok(scatterScene.representations
  .filter(item => item.visual?.chartType === SCATTER_CHART)
  .every(item => item.shape === 'graph-terminal'));

const heatmap = fixture('../examples/chart-heatmap.jsonl');
const heatmapChart = { type: HEATMAP_CHART };
const heatmapView = { pattern: CHART_PATTERN, chart: heatmapChart };
assert.equal(validatePatternDomain(heatmap.domain, CHART_PATTERN, heatmapChart), CHART_PATTERN);
const heatmapLayout = createPatternLayout(heatmap.domain, CHART_PATTERN, heatmapChart);
assert.equal(heatmapLayout.axis.type, HEATMAP_CHART);
assert.deepEqual(heatmapLayout.axis.coordinateSystems, ['matrix/1']);
assert.equal(heatmapLayout.axis.rows, 3);
assert.equal(heatmapLayout.axis.columns, 4);
assert.equal(heatmapLayout.axis.minimum, 12);
assert.equal(heatmapLayout.axis.maximum, 72);
assert.equal(heatmapLayout.axis.total, 469);
assert.equal(heatmapLayout.marks.length, 12);
assert.equal(Math.min(...heatmapLayout.marks.map(item => item.visual.appearance.fillOpacity)), 18);
assert.equal(Math.max(...heatmapLayout.marks.map(item => item.visual.appearance.fillOpacity)), 100);
assert.ok(heatmapLayout.marks.every(item => item.mode === 'bar' && item.visual.paletteKey === 'chart:heatmap'));
const heatmapScene = new SemanticProjector(heatmap.domain, null, heatmapView).project({ scale: 1, viewport });
const heatmapMarks = heatmapScene.representations.filter(item => item.visual?.chartType === HEATMAP_CHART);
assert.equal(heatmapMarks.length, 12);
assert.ok(heatmapMarks.every(item => item.shape === 'graph-node' && item.readOnly));
for (const label of ['東京', '大阪', '名古屋', '午前', '昼', '夕方', '夜']) {
  assert.ok(heatmapScene.guides.some(item => item.label === label), `heatmap guide missing: ${label}`);
}

const heatmapStore = new SemanticDomainStore(heatmap.domain);
heatmapStore.perform({ type: 'SetRegionValue', regionId: 'nagoya-am', value: 90 });
const streamedHeatmap = createPatternLayout(heatmapStore.domain, CHART_PATTERN, heatmapChart);
assert.equal(streamedHeatmap.axis.maximum, 90);
assert.equal(
  streamedHeatmap.marks.find(item => item.sourceId === 'nagoya-am').visual.appearance.fillOpacity,
  100,
);

const heatmapLog = await createDecisionLog(heatmap.records, 'semantic-map:example:heatmap-test');
const heatmapEnvelope = await createEnvelope(heatmapLog.log, null, heatmapView);
const heatmapUrl = await createSmapUrl(heatmapEnvelope, 'https://example.test/app');
const openedHeatmap = await readSmapHash(heatmapUrl);
assert.deepEqual(openedHeatmap.envelope.view, heatmapView);

const sunburst = fixture('../examples/chart-sunburst.jsonl');
const sunburstChart = { type: SUNBURST_CHART };
const sunburstView = { pattern: CHART_PATTERN, chart: sunburstChart };
assert.equal(validatePatternDomain(sunburst.domain, CHART_PATTERN, sunburstChart), CHART_PATTERN);
const sunburstLayout = createPatternLayout(sunburst.domain, CHART_PATTERN, sunburstChart);
assert.equal(sunburstLayout.axis.type, SUNBURST_CHART);
assert.deepEqual(sunburstLayout.axis.coordinateSystems, ['polar-hierarchy/1']);
assert.equal(sunburstLayout.axis.total, 100);
assert.equal(sunburstLayout.axis.focus, 'company');
assert.deepEqual(sunburstLayout.axis.focusPath, ['company']);
assert.equal(sunburstLayout.axis.availableDepth, 4);
assert.equal(sunburstLayout.axis.visibleLevels, 3);
assert.equal(sunburstLayout.marks.filter(item => item.mode === 'slice').length, 14);
assert.equal(sunburstLayout.marks.filter(item => item.mode === 'point').length, 1);
assert.deepEqual(
  sunburstLayout.guides.filter(item => item.id.startsWith('legend-label-')).map(item => item.label),
  ['製品', '販路'],
);
assert.deepEqual(
  sunburstLayout.guides.filter(item => item.id.startsWith('legend-value-')).map(item => item.label),
  ['60', '40'],
);
assert.ok(sunburstLayout.marks
  .filter(item => item.mode === 'slice')
  .every(item => item.visual.sector.outerRatio > item.visual.sector.innerRatio));
assert.equal(
  sunburstLayout.marks.find(item => item.sourceId === 'product').activation?.focus,
  'product',
  'MUTATION:sunburst-branch-activation',
);
assert.equal(sunburstLayout.marks.find(item => item.sourceId === 'api'), undefined);

const sunburstScene = new SemanticProjector(sunburst.domain, null, sunburstView).project({ scale: 1, viewport });
const sunburstSectors = sunburstScene.representations.filter(item => item.visual?.chartType === SUNBURST_CHART && item.mode === 'slice');
assert.equal(sunburstSectors.length, 14);
assert.ok(sunburstSectors.every(item => item.shape === 'vector-sector' && item.readOnly));
const productSector = sunburstSectors.find(item => item.visual.sourceRegionId === 'product');
assert.equal(productSector.activation.kind, 'set-view');
assert.deepEqual(productSector.activation.view, {
  pattern: CHART_PATTERN,
  chart: { type: SUNBURST_CHART, focus: 'product' },
});
assert.equal(sunburstSectors.find(item => item.visual.sourceRegionId === 'tooling').activation, null);

const focusedSunburstChart = { type: SUNBURST_CHART, focus: 'product' };
assert.equal(validatePatternDomain(sunburst.domain, CHART_PATTERN, focusedSunburstChart), CHART_PATTERN);
const focusedSunburstLayout = createPatternLayout(sunburst.domain, CHART_PATTERN, focusedSunburstChart);
assert.equal(focusedSunburstLayout.axis.total, 60);
assert.equal(focusedSunburstLayout.axis.focus, 'product');
assert.deepEqual(focusedSunburstLayout.axis.focusPath, ['company', 'product']);
assert.equal(focusedSunburstLayout.axis.availableDepth, 3);
assert.equal(focusedSunburstLayout.marks.filter(item => item.mode === 'slice').length, 8);
const focusedSunburstScene = new SemanticProjector(
  sunburst.domain,
  null,
  { pattern: CHART_PATTERN, chart: focusedSunburstChart },
).project({ scale: 1, viewport });
const center = focusedSunburstScene.representations.find(item => item.mode === 'point' && item.visual?.chartType === SUNBURST_CHART);
assert.match(center.label, /製品/u);
assert.equal(center.activation?.kind, 'set-view', 'MUTATION:sunburst-center-back-activation');
assert.deepEqual(center.activation.view, { pattern: CHART_PATTERN, chart: { type: SUNBURST_CHART } });
const focusedFirstRing = focusedSunburstScene.representations.find(
  item => item.visual?.chartType === SUNBURST_CHART && item.mode === 'slice' && item.visual.sector.innerRatio === 0.22,
);
assert.ok(
  center.bounds.width < focusedFirstRing.bounds.width * focusedFirstRing.visual.sector.innerRatio,
  'MUTATION:sunburst-center-inside-hole',
);

const sunburstStore = new SemanticDomainStore(sunburst.domain);
sunburstStore.perform({ type: 'SetRegionValue', regionId: 'api', value: 30 });
const streamedSunburst = createPatternLayout(sunburstStore.domain, CHART_PATTERN, focusedSunburstChart);
assert.equal(streamedSunburst.axis.total, 72);
assert.equal(streamedSunburst.marks.find(item => item.sourceId === 'api').visual.sector.endAngle
  > streamedSunburst.marks.find(item => item.sourceId === 'api').visual.sector.startAngle, true);

const sunburstLog = await createDecisionLog(sunburst.records, 'semantic-map:example:sunburst-test');
const sunburstEnvelope = await createEnvelope(sunburstLog.log, null, {
  pattern: CHART_PATTERN,
  chart: focusedSunburstChart,
});
const sunburstUrl = await createSmapUrl(sunburstEnvelope, 'https://example.test/app');
const openedSunburst = await readSmapHash(sunburstUrl);
assert.deepEqual(openedSunburst.envelope.view, {
  pattern: CHART_PATTERN,
  chart: focusedSunburstChart,
});

const missingValue = records.map(record => record.id === 'other'
  ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'value'))
  : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(missingValue), CHART_PATTERN, legacyChart),
  /other\.value is required/u,
  'MUTATION:chart-value-required',
);
const withRelation = [...records, { type: 'relation', id: 'invalid', from: 'product', to: 'other', kind: 'relates', label: '' }];
assert.throws(
  () => validatePatternDomain(createSemanticMap(withRelation), CHART_PATTERN, legacyChart),
  /does not accept relations/u,
  'MUTATION:chart-relations-forbidden',
);
const zeroTotalRecords = records.map(record => Object.hasOwn(record, 'value') ? { ...record, value: 0 } : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(zeroTotalRecords), CHART_PATTERN, { type: PIE_CHART }),
  /require a positive total/u,
  'MUTATION:chart-radial-positive-total',
);
const scatterMissingOrder = scatter.records.map(record => record.id === 'growth-c'
  ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'order'))
  : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(scatterMissingOrder), CHART_PATTERN, scatterChart),
  /growth-c\.order is required/u,
  'MUTATION:scatter-order-required',
);
const scatterDuplicateOrder = scatter.records.map(record => record.id === 'growth-c' ? { ...record, order: 2 } : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(scatterDuplicateOrder), CHART_PATTERN, scatterChart),
  /order 2 is duplicated/u,
  'MUTATION:scatter-order-unique',
);
const heatmapMissingValue = heatmap.records.map(record => record.id === 'tokyo-am'
  ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'value'))
  : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(heatmapMissingValue), CHART_PATTERN, heatmapChart),
  /tokyo-am\.value is required/u,
  'MUTATION:heatmap-value-required',
);
const heatmapWrongRowKind = heatmap.records.map(record => record.id === 'tokyo' ? { ...record, kind: 'chart-item' } : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(heatmapWrongRowKind), CHART_PATTERN, heatmapChart),
  /tokyo\.kind must be chart-row/u,
  'MUTATION:heatmap-row-kind',
);
const heatmapMismatchedColumns = heatmap.records.map(record => record.id === 'nagoya-night' ? { ...record, order: 4 } : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(heatmapMismatchedColumns), CHART_PATTERN, heatmapChart),
  /nagoya heatmap column orders differ/u,
  'MUTATION:heatmap-columns-aligned',
);
const sunburstBranchValue = sunburst.records.map(record => record.id === 'product' ? { ...record, value: 60 } : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(sunburstBranchValue), CHART_PATTERN, sunburstChart),
  /product\.value is derived and not allowed/u,
  'MUTATION:sunburst-derived-branch-value',
);
const sunburstLeafMissingValue = sunburst.records.map(record => record.id === 'api'
  ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'value'))
  : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(sunburstLeafMissingValue), CHART_PATTERN, sunburstChart),
  /api\.value is required/u,
  'MUTATION:sunburst-leaf-value-required',
);
assert.throws(
  () => validatePatternDomain(sunburst.domain, CHART_PATTERN, { type: SUNBURST_CHART, focus: 'api' }),
  /root or a branch/u,
  'MUTATION:sunburst-focus-branch-only',
);
const sunburstDuplicateOrder = sunburst.records.map(record => record.id === 'service' ? { ...record, order: 0 } : record);
assert.throws(
  () => validatePatternDomain(createSemanticMap(sunburstDuplicateOrder), CHART_PATTERN, sunburstChart),
  /product child order 0 is duplicated/u,
  'MUTATION:sunburst-sibling-order-unique',
);

console.log(JSON.stringify({
  schema: 'semantic-map-chart-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  pattern: CHART_PATTERN,
  types: CHART_TYPES,
  overlayLayers: OVERLAY_CHART_TYPES,
  combinations: CHART_COMBINATION_COUNT,
  overlayCombinations: combinations.length,
  exclusiveTypes: EXCLUSIVE_CHART_TYPES,
  flatItems: itemCount,
  heatmapCells: heatmapLayout.marks.length,
  primitives: ['graph-node', 'graph-terminal', 'vector-sector', 'chart-line'],
  sunburstSectors: sunburstSectors.length,
  coordinateSpaces: ['cartesian/1', 'polar/1', 'matrix/1', 'polar-hierarchy/1'],
  urlChars: { overlay: url.length, heatmap: heatmapUrl.length, sunburst: sunburstUrl.length },
  streamingOperations: ['SetRegionValue:flat', 'SetRegionValue:heatmap', 'SetRegionValue:sunburst'],
}));
