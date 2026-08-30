import { QUANTITATIVE_SPACE } from '../../../domain/index.js';
import { exactKeys, invariant, plainObject } from '../contract-helpers.js';

export const CHART_PATTERN = 'chart/1';
export const BAR_HORIZONTAL_CHART = 'bar-horizontal/1';
export const BAR_VERTICAL_CHART = 'bar-vertical/1';
export const LINE_CHART = 'line/1';
export const PIE_CHART = 'pie/1';
export const DONUT_CHART = 'donut/1';
export const SCATTER_CHART = 'scatter/1';
export const HEATMAP_CHART = 'heatmap/1';
export const SUNBURST_CHART = 'sunburst/1';

export const OVERLAY_CHART_TYPES = Object.freeze([
  BAR_HORIZONTAL_CHART,
  BAR_VERTICAL_CHART,
  LINE_CHART,
  PIE_CHART,
  DONUT_CHART,
  SCATTER_CHART,
]);
export const EXCLUSIVE_CHART_TYPES = Object.freeze([HEATMAP_CHART, SUNBURST_CHART]);
export const CHART_TYPES = Object.freeze([...OVERLAY_CHART_TYPES, ...EXCLUSIVE_CHART_TYPES]);
export const CHART_COMBINATION_COUNT = ((2 ** OVERLAY_CHART_TYPES.length) - 1) + EXCLUSIVE_CHART_TYPES.length;
export const MAX_CHART_ITEMS = 24;
export const MAX_CHART_LAYERS = OVERLAY_CHART_TYPES.length;
export const MAX_HEATMAP_ROWS = 8;
export const MAX_HEATMAP_COLUMNS = 12;
export const MAX_HEATMAP_CELLS = 96;
export const MAX_SUNBURST_DEPTH = 6;
export const MAX_SUNBURST_NODES = 96;
export const MAX_SUNBURST_CHILDREN = 16;

const TYPE_SET = new Set(CHART_TYPES);
const OVERLAY_TYPE_SET = new Set(OVERLAY_CHART_TYPES);
const TYPE_ORDER = new Map(CHART_TYPES.map((type, index) => [type, index]));
const RADIAL_TYPES = new Set([PIE_CHART, DONUT_CHART]);

function chartType(value, name) {
  invariant(TYPE_SET.has(value), `${name} must be one of ${CHART_TYPES.join(', ')}`);
  return value;
}

function overlayChartType(value, name) {
  chartType(value, name);
  invariant(OVERLAY_TYPE_SET.has(value), `${name} ${value} is standalone and cannot be layered`);
  return value;
}

export function normalizeChartView(input) {
  const value = plainObject(input, 'View.chart');
  exactKeys(value, [], 'View.chart', ['type', 'layers', 'focus']);
  const hasType = Object.hasOwn(value, 'type');
  const hasLayers = Object.hasOwn(value, 'layers');
  invariant(hasType !== hasLayers, 'View.chart must specify exactly one of type or layers');

  if (hasType) {
    const type = chartType(value.type, 'View.chart.type');
    if (!Object.hasOwn(value, 'focus')) return Object.freeze({ type });
    invariant(type === SUNBURST_CHART, 'View.chart.focus is only valid for sunburst/1');
    invariant(typeof value.focus === 'string' && value.focus.length > 0, 'View.chart.focus must be a non-empty string');
    return Object.freeze({ type, focus: value.focus });
  }

  invariant(!Object.hasOwn(value, 'focus'), 'View.chart.focus is not allowed with View.chart.layers');

  invariant(Array.isArray(value.layers), 'View.chart.layers must be an array');
  invariant(value.layers.length > 0, 'View.chart.layers must not be empty');
  invariant(
    value.layers.length <= MAX_CHART_LAYERS,
    `View.chart.layers supports at most ${MAX_CHART_LAYERS} entries`,
  );
  const layers = value.layers.map((layer, index) => overlayChartType(layer, `View.chart.layers[${index}]`));
  invariant(new Set(layers).size === layers.length, 'View.chart.layers contains duplicates');
  layers.sort((left, right) => TYPE_ORDER.get(left) - TYPE_ORDER.get(right));
  return Object.freeze({ layers: Object.freeze(layers) });
}

export function chartLayers(input) {
  const normalized = normalizeChartView(input);
  return Object.hasOwn(normalized, 'type') ? Object.freeze([normalized.type]) : normalized.layers;
}

function requireOrders(items, label) {
  const orders = new Set();
  for (const item of items) {
    invariant(Object.hasOwn(item, 'order'), `${item.id}.order is required for ${label}`);
    invariant(!orders.has(item.order), `${label} order ${item.order} is duplicated`);
    orders.add(item.order);
  }
  return orders;
}

function validateFlatChart(domain, layers) {
  const rootId = domain.meta.root;
  const itemIds = domain.children.get(rootId) ?? [];
  invariant(itemIds.length > 0, 'chart/1 requires at least one root child');
  invariant(itemIds.length <= MAX_CHART_ITEMS, `chart/1 supports at most ${MAX_CHART_ITEMS} items`);
  const items = itemIds.map(id => domain.regions.get(id));
  let total = 0;
  for (const region of domain.regions.values()) {
    if (region.id === rootId) continue;
    invariant(region.parent === rootId, `${region.id} must be a direct root child for layered chart/1`);
    invariant(Object.hasOwn(region, 'value'), `${region.id}.value is required for chart/1`);
    total += region.value;
  }
  if (layers.includes(SCATTER_CHART)) requireOrders(items, SCATTER_CHART);
  if (layers.some(layer => RADIAL_TYPES.has(layer))) {
    invariant(total > 0, 'pie/1 and donut/1 require a positive total');
  }
}

function validateHeatmapChart(domain) {
  const rootId = domain.meta.root;
  const rowIds = domain.children.get(rootId) ?? [];
  invariant(rowIds.length > 0, 'heatmap/1 requires at least one row');
  invariant(rowIds.length <= MAX_HEATMAP_ROWS, `heatmap/1 supports at most ${MAX_HEATMAP_ROWS} rows`);
  const rows = rowIds.map(id => domain.regions.get(id));
  requireOrders(rows, 'heatmap/1 rows');

  let expectedColumns = null;
  let cellCount = 0;
  for (const row of rows) {
    invariant(row.kind === 'chart-row', `${row.id}.kind must be chart-row for heatmap/1`);
    invariant(!Object.hasOwn(row, 'value'), `${row.id}.value is not allowed on a heatmap/1 row`);
    const cellIds = domain.children.get(row.id) ?? [];
    invariant(cellIds.length > 0, `${row.id} requires at least one heatmap cell`);
    invariant(
      cellIds.length <= MAX_HEATMAP_COLUMNS,
      `${row.id} supports at most ${MAX_HEATMAP_COLUMNS} heatmap columns`,
    );
    const cells = cellIds.map(id => domain.regions.get(id));
    const orders = [...requireOrders(cells, `${row.id} cells`)].sort((left, right) => left - right);
    const signature = orders.join(',');
    if (expectedColumns === null) expectedColumns = signature;
    invariant(signature === expectedColumns, `${row.id} heatmap column orders differ`);

    for (const cell of cells) {
      invariant(cell.kind === 'chart-cell', `${cell.id}.kind must be chart-cell for heatmap/1`);
      invariant(Object.hasOwn(cell, 'value'), `${cell.id}.value is required for heatmap/1`);
      invariant((domain.children.get(cell.id) ?? []).length === 0, `${cell.id} must be a heatmap leaf cell`);
      cellCount += 1;
    }
  }
  invariant(cellCount <= MAX_HEATMAP_CELLS, `heatmap/1 supports at most ${MAX_HEATMAP_CELLS} cells`);
  invariant(domain.regions.size === 1 + rows.length + cellCount, 'heatmap/1 only accepts root, row, and cell regions');
}

function depthFromRoot(domain, regionId) {
  let depth = 0;
  let current = domain.regions.get(regionId);
  while (current?.parent !== null) {
    depth += 1;
    current = domain.regions.get(current.parent);
  }
  return depth;
}

function validateSunburstChart(domain, config) {
  const rootId = domain.meta.root;
  invariant(domain.regions.size > 1, 'sunburst/1 requires at least one non-root region');
  invariant(domain.regions.size <= MAX_SUNBURST_NODES, `sunburst/1 supports at most ${MAX_SUNBURST_NODES} regions`);

  let leafTotal = 0;
  for (const region of domain.regions.values()) {
    if (region.id === rootId) {
      invariant(!Object.hasOwn(region, 'value'), `${region.id}.value is not allowed on the sunburst root`);
      continue;
    }
    invariant(Object.hasOwn(region, 'order'), `${region.id}.order is required for sunburst/1`);
    invariant(depthFromRoot(domain, region.id) <= MAX_SUNBURST_DEPTH, `sunburst/1 supports depth ${MAX_SUNBURST_DEPTH}`);
    const childIds = domain.children.get(region.id) ?? [];
    invariant(childIds.length <= MAX_SUNBURST_CHILDREN, `${region.id} supports at most ${MAX_SUNBURST_CHILDREN} children`);
    if (childIds.length) {
      invariant(region.kind === 'chart-branch', `${region.id}.kind must be chart-branch for a sunburst branch`);
      invariant(!Object.hasOwn(region, 'value'), `${region.id}.value is derived and not allowed on a sunburst branch`);
    } else {
      invariant(region.kind === 'chart-leaf', `${region.id}.kind must be chart-leaf for a sunburst leaf`);
      invariant(Object.hasOwn(region, 'value'), `${region.id}.value is required for a sunburst leaf`);
      leafTotal += region.value;
    }
  }

  for (const [parentId, childIds] of domain.children) {
    if (parentId === null || childIds.length === 0) continue;
    invariant(childIds.length <= MAX_SUNBURST_CHILDREN, `${parentId} supports at most ${MAX_SUNBURST_CHILDREN} children`);
    const orders = new Set();
    for (const childId of childIds) {
      const child = domain.regions.get(childId);
      invariant(!orders.has(child.order), `${parentId} child order ${child.order} is duplicated`);
      orders.add(child.order);
    }
  }
  invariant(leafTotal > 0, 'sunburst/1 requires a positive leaf total');

  const focusId = config.focus ?? rootId;
  const focus = domain.regions.get(focusId);
  invariant(focus, `View.chart.focus region not found: ${focusId}`);
  invariant(focusId === rootId || (domain.children.get(focusId) ?? []).length > 0, 'View.chart.focus must refer to the root or a branch');
}

function validateChart(domain, config = null) {
  const layers = chartLayers(config);
  invariant(domain.relations.length === 0, 'chart/1 does not accept relations');
  if (layers.length === 1 && layers[0] === HEATMAP_CHART) {
    validateHeatmapChart(domain);
    return;
  }
  if (layers.length === 1 && layers[0] === SUNBURST_CHART) {
    validateSunburstChart(domain, config);
    return;
  }
  validateFlatChart(domain, layers);
}

export const chartViewTypeContract = Object.freeze({
  id: CHART_PATTERN,
  status: 'supported',
  configKey: 'chart',
  capabilities: Object.freeze({ editable: false }),
  normalizeConfig: normalizeChartView,
  coordinateSpace: () => QUANTITATIVE_SPACE,
  validateDomain: validateChart,
  shape: (_region, mode) => {
    if (mode === 'boundary') return 'boundary';
    if (mode === 'bar') return 'graph-node';
    if (mode === 'point') return 'graph-terminal';
    if (mode === 'slice') return 'vector-sector';
    throw new Error(`semantic-pattern: unsupported chart representation mode ${mode}`);
  },
  relationVisual: relation => Object.freeze({
    directed: false,
    line: relation.kind === 'chart-line' ? 'chart-line' : 'chart',
    foreground: relation.kind === 'chart-line',
    zIndex: relation.kind === 'chart-line' ? 55 : null,
  }),
  defaultView: () => Object.freeze({
    pattern: CHART_PATTERN,
    chart: Object.freeze({ type: BAR_HORIZONTAL_CHART }),
  }),
});
