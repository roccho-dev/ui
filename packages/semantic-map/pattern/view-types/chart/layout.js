import { QUANTITATIVE_SPACE } from '../../../domain/index.js';
import {
  BAR_HORIZONTAL_CHART,
  BAR_VERTICAL_CHART,
  CHART_COMBINATION_COUNT,
  DONUT_CHART,
  HEATMAP_CHART,
  LINE_CHART,
  PIE_CHART,
  SCATTER_CHART,
  SUNBURST_CHART,
  chartLayers,
  normalizeChartView,
} from './contract.js';

const ROOT_WIDTH = 1_000;
const ROOT_HEIGHT = 680;
const LABEL_X = 26;
const LABEL_WIDTH = 220;
const VALUE_X = 210;
const VALUE_WIDTH = 58;
const PLOT_X = 286;
const PLOT_Y = 88;
const PLOT_WIDTH = 580;
const PLOT_HEIGHT = 500;
const BOTTOM_Y = PLOT_Y + PLOT_HEIGHT;
const POINT_SIZE = 14;
const SCATTER_POINT_SIZE = 18;
const HEATMAP_GAP = 5;
const SUNBURST_DIAMETER = Math.min(PLOT_WIDTH, PLOT_HEIGHT) * 0.92;
const SUNBURST_HOLE_RATIO = 0.22;
const SUNBURST_VISIBLE_LEVELS = 3;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedChildren(domain, parentId) {
  return [...(domain.children.get(parentId) ?? [])]
    .map(id => domain.regions.get(id))
    .sort((left, right) => {
      const leftOrder = Number.isSafeInteger(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isSafeInteger(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || compareText(left.id, right.id);
    });
}

function orderedItems(domain) {
  return orderedChildren(domain, domain.meta.root);
}

function bounds(x, y, width, height) {
  return Object.freeze({ x, y, width, height });
}

function appearance({ fillTone = 'soft', fillOpacity = 100, strokeTone = 'accent', strokeOpacity = 100 } = {}) {
  return Object.freeze({ fillTone, fillOpacity, strokeTone, strokeOpacity });
}

function visual(item, chartType, options = {}) {
  const result = {
    chartType,
    sourceRegionId: item.id,
    paletteKey: options.paletteKey ?? `chart:${item.id}`,
    appearance: appearance(options.appearance),
  };
  if (options.sector) result.sector = Object.freeze({ ...options.sector });
  return Object.freeze(result);
}

function mark({
  id, item, chartType, mode, bounds: markBounds, zIndex, appearance: markAppearance,
  sector = null, paletteKey = null, label = '', activation = null,
}) {
  return Object.freeze({
    id,
    sourceId: item.id,
    chartType,
    mode,
    bounds: markBounds,
    zIndex,
    label,
    activation,
    visual: visual(item, chartType, { appearance: markAppearance, sector, paletteKey, activation }),
  });
}

function guide(id, kind, label, guideBounds) {
  return Object.freeze({ id, kind, label, bounds: guideBounds });
}

function chartMarkId(chartType, sourceId) {
  return `chart:${chartType}:${sourceId}`;
}

function centeredSquare(diameter) {
  return bounds(
    PLOT_X + (PLOT_WIDTH - diameter) / 2,
    PLOT_Y + (PLOT_HEIGHT - diameter) / 2,
    diameter,
    diameter,
  );
}

function legendGuides(items) {
  const step = PLOT_HEIGHT / items.length;
  const height = Math.max(16, Math.min(28, step * 0.82));
  return items.flatMap((item, index) => {
    const y = PLOT_Y + index * step + (step - height) / 2;
    return [
      guide(`legend-label-${item.id}`, 'axis-tick', item.label, bounds(LABEL_X, y, LABEL_WIDTH - 16, height)),
      guide(`legend-value-${item.id}`, 'axis-tick', String(item.value), bounds(VALUE_X, y, VALUE_WIDTH, height)),
    ];
  });
}

function horizontalBars(items, maximum, legacySingle) {
  const step = PLOT_HEIGHT / items.length;
  const height = Math.max(10, Math.min(34, step * 0.64));
  return items.map((item, index) => {
    const ratio = maximum === 0 ? 0 : item.value / maximum;
    const y = PLOT_Y + index * step + (step - height) / 2;
    return mark({
      id: legacySingle ? item.id : chartMarkId(BAR_HORIZONTAL_CHART, item.id),
      item,
      chartType: BAR_HORIZONTAL_CHART,
      mode: 'bar',
      bounds: bounds(PLOT_X, y, Math.max(2, PLOT_WIDTH * ratio), height),
      zIndex: 30,
      appearance: { fillTone: 'soft', fillOpacity: 82, strokeTone: 'accent', strokeOpacity: 92 },
    });
  });
}

function ordinalRange(items) {
  const values = items.map(item => item.order);
  return Object.freeze({ minimum: Math.min(...values), maximum: Math.max(...values) });
}

function categoryX(items, index, orderScale = null) {
  if (orderScale) {
    const item = items[index];
    const span = orderScale.maximum - orderScale.minimum;
    const ratio = span === 0 ? 0.5 : (item.order - orderScale.minimum) / span;
    return PLOT_X + PLOT_WIDTH * ratio;
  }
  const step = PLOT_WIDTH / items.length;
  return PLOT_X + step * index + step / 2;
}

function verticalBars(items, maximum, orderScale) {
  const step = PLOT_WIDTH / items.length;
  const width = Math.max(8, Math.min(56, step * 0.58));
  return items.map((item, index) => {
    const ratio = maximum === 0 ? 0 : item.value / maximum;
    const height = Math.max(2, PLOT_HEIGHT * ratio);
    return mark({
      id: chartMarkId(BAR_VERTICAL_CHART, item.id),
      item,
      chartType: BAR_VERTICAL_CHART,
      mode: 'bar',
      bounds: bounds(categoryX(items, index, orderScale) - width / 2, BOTTOM_Y - height, width, height),
      zIndex: 36,
      appearance: { fillTone: 'soft', fillOpacity: 74, strokeTone: 'accent', strokeOpacity: 96 },
    });
  });
}

function lineMarks(items, maximum, orderScale) {
  return items.map((item, index) => {
    const ratio = maximum === 0 ? 0 : item.value / maximum;
    const centerX = categoryX(items, index, orderScale);
    const centerY = BOTTOM_Y - PLOT_HEIGHT * ratio;
    return mark({
      id: chartMarkId(LINE_CHART, item.id),
      item,
      chartType: LINE_CHART,
      mode: 'point',
      bounds: bounds(centerX - POINT_SIZE / 2, centerY - POINT_SIZE / 2, POINT_SIZE, POINT_SIZE),
      zIndex: 60,
      appearance: { fillTone: 'accent', fillOpacity: 100, strokeTone: 'contrast', strokeOpacity: 100 },
    });
  });
}

function scatterMarks(items, maximum, orderScale) {
  return items.map((item, index) => {
    const ratio = maximum === 0 ? 0 : item.value / maximum;
    const centerX = categoryX(items, index, orderScale);
    const centerY = BOTTOM_Y - PLOT_HEIGHT * ratio;
    return mark({
      id: chartMarkId(SCATTER_CHART, item.id),
      item,
      chartType: SCATTER_CHART,
      mode: 'point',
      bounds: bounds(
        centerX - SCATTER_POINT_SIZE / 2,
        centerY - SCATTER_POINT_SIZE / 2,
        SCATTER_POINT_SIZE,
        SCATTER_POINT_SIZE,
      ),
      zIndex: 70,
      appearance: { fillTone: 'soft', fillOpacity: 100, strokeTone: 'accent', strokeOpacity: 100 },
    });
  });
}

function lineRelations(linePoints) {
  return linePoints.slice(1).map((point, index) => Object.freeze({
    id: `chart-line:${index}`,
    from: linePoints[index].id,
    to: point.id,
    kind: 'chart-line',
    label: '',
    readOnly: true,
  }));
}

function radialMarks(items, layers, hasCartesian) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const hasPie = layers.includes(PIE_CHART);
  const hasDonut = layers.includes(DONUT_CHART);
  const baseDiameter = Math.min(PLOT_WIDTH, PLOT_HEIGHT) * (hasCartesian ? 0.74 : 0.88);
  const pieBounds = centeredSquare(hasPie && hasDonut ? baseDiameter * 0.56 : baseDiameter);
  const donutBounds = centeredSquare(baseDiameter);
  const opacity = hasCartesian ? 40 : 90;
  const marks = [];

  const append = (chartType, sliceBounds, innerRatio, zIndex) => {
    let angle = -90;
    for (const item of items) {
      const sweep = total === 0 ? 0 : (item.value / total) * 360;
      const endAngle = angle + sweep;
      marks.push(mark({
        id: chartMarkId(chartType, item.id),
        item,
        chartType,
        mode: 'slice',
        bounds: sliceBounds,
        zIndex,
        appearance: {
          fillTone: 'accent', fillOpacity: opacity, strokeTone: 'contrast', strokeOpacity: 100,
        },
        sector: { startAngle: angle, endAngle, innerRatio },
      }));
      angle = endAngle;
    }
  };

  if (hasPie) append(PIE_CHART, pieBounds, 0, 10);
  if (hasDonut) append(DONUT_CHART, donutBounds, hasPie ? 0.64 : 0.54, 20);
  return Object.freeze(marks);
}

function axisGuides(items, layers, maximum, total, orderScale) {
  const guides = [...legendGuides(items)];
  const hasHorizontal = layers.includes(BAR_HORIZONTAL_CHART);
  const hasVerticalAxis = (
    layers.includes(BAR_VERTICAL_CHART) || layers.includes(LINE_CHART) || layers.includes(SCATTER_CHART)
  );
  const radialOnly = !hasHorizontal && !hasVerticalAxis;

  if (hasHorizontal) {
    guides.push(guide('axis-horizontal-min', 'axis-tick', '0', bounds(PLOT_X, 54, 60, 18)));
    guides.push(guide('axis-horizontal-max', 'axis-tick', String(maximum), bounds(PLOT_X + PLOT_WIDTH - 72, 54, 72, 18)));
  }
  if (hasVerticalAxis) {
    guides.push(guide('axis-vertical-max', 'axis-tick', String(maximum), bounds(PLOT_X - 64, PLOT_Y - 8, 58, 18)));
    guides.push(guide('axis-vertical-min', 'axis-tick', '0', bounds(PLOT_X - 64, BOTTOM_Y - 10, 58, 18)));
    const step = PLOT_WIDTH / items.length;
    items.forEach((item, index) => {
      const x = orderScale
        ? categoryX(items, index, orderScale) - step / 2
        : PLOT_X + step * index;
      guides.push(guide(
        `axis-category-${item.id}`,
        'axis-tick',
        item.label,
        bounds(x, BOTTOM_Y + 12, step, 44),
      ));
    });
  }
  if (radialOnly && layers.includes(DONUT_CHART)) {
    guides.push(guide(
      'radial-total',
      'axis-title',
      String(total),
      bounds(PLOT_X + PLOT_WIDTH / 2 - 70, PLOT_Y + PLOT_HEIGHT / 2 - 18, 140, 36),
    ));
  }
  return Object.freeze(guides);
}

function createHeatmapLayout(domain) {
  const rows = orderedChildren(domain, domain.meta.root);
  const matrix = rows.map(row => Object.freeze({ row, cells: Object.freeze(orderedChildren(domain, row.id)) }));
  const cells = matrix.flatMap(entry => entry.cells);
  const minimum = Math.min(...cells.map(cell => cell.value));
  const maximum = Math.max(...cells.map(cell => cell.value));
  const total = cells.reduce((sum, cell) => sum + cell.value, 0);
  const columnCount = matrix[0].cells.length;
  const cellWidth = (PLOT_WIDTH - HEATMAP_GAP * (columnCount - 1)) / columnCount;
  const cellHeight = (PLOT_HEIGHT - HEATMAP_GAP * (rows.length - 1)) / rows.length;
  const marks = [];
  const guides = [];

  matrix.forEach((entry, rowIndex) => {
    const y = PLOT_Y + rowIndex * (cellHeight + HEATMAP_GAP);
    guides.push(guide(
      `heatmap-row-${entry.row.id}`,
      'axis-tick',
      entry.row.label,
      bounds(LABEL_X, y, LABEL_WIDTH + VALUE_WIDTH, cellHeight),
    ));
    entry.cells.forEach((cell, columnIndex) => {
      const x = PLOT_X + columnIndex * (cellWidth + HEATMAP_GAP);
      const span = maximum - minimum;
      const ratio = span === 0 ? (maximum === 0 ? 0 : 1) : (cell.value - minimum) / span;
      marks.push(mark({
        id: chartMarkId(HEATMAP_CHART, cell.id),
        item: cell,
        chartType: HEATMAP_CHART,
        mode: 'bar',
        bounds: bounds(x, y, cellWidth, cellHeight),
        zIndex: 35,
        paletteKey: 'chart:heatmap',
        appearance: {
          fillTone: 'accent',
          fillOpacity: Math.round(18 + ratio * 82),
          strokeTone: 'soft',
          strokeOpacity: 100,
        },
      }));
    });
  });

  matrix[0].cells.forEach((cell, columnIndex) => {
    const x = PLOT_X + columnIndex * (cellWidth + HEATMAP_GAP);
    guides.push(guide(
      `heatmap-column-${cell.order}`,
      'axis-tick',
      cell.label,
      bounds(x, BOTTOM_Y + 12, cellWidth, 44),
    ));
  });
  guides.push(guide('heatmap-minimum', 'axis-tick', String(minimum), bounds(PLOT_X, 54, 72, 18)));
  guides.push(guide('heatmap-maximum', 'axis-tick', String(maximum), bounds(PLOT_X + PLOT_WIDTH - 72, 54, 72, 18)));

  return Object.freeze({
    pattern: 'chart/1',
    space: QUANTITATIVE_SPACE,
    rootBounds: bounds(0, 0, ROOT_WIDTH, ROOT_HEIGHT),
    items: Object.freeze(cells),
    bounds: new Map(marks.map(item => [item.sourceId, item.bounds])),
    marks: Object.freeze(marks),
    guides: Object.freeze(guides),
    relations: Object.freeze([]),
    axis: Object.freeze({
      type: HEATMAP_CHART,
      layers: Object.freeze([HEATMAP_CHART]),
      minimum,
      maximum,
      total,
      rows: rows.length,
      columns: columnCount,
      coordinateSystems: Object.freeze(['matrix/1']),
      supportedCombinations: CHART_COMBINATION_COUNT,
    }),
    geometryEditable: false,
  });
}

function aggregateSunburstValues(domain) {
  const values = new Map();
  const visit = (regionId) => {
    const region = domain.regions.get(regionId);
    const children = orderedChildren(domain, regionId);
    const value = children.length
      ? children.reduce((sum, child) => sum + visit(child.id), 0)
      : region.value;
    values.set(regionId, value);
    return value;
  };
  visit(domain.meta.root);
  return values;
}

function sunburstPath(domain, focusId) {
  const path = [];
  let current = domain.regions.get(focusId);
  while (current) {
    path.push(current);
    current = current.parent === null ? null : domain.regions.get(current.parent);
  }
  return path.reverse();
}

function sunburstDepth(domain, regionId) {
  const children = orderedChildren(domain, regionId);
  if (!children.length) return 0;
  return 1 + Math.max(...children.map(child => sunburstDepth(domain, child.id)));
}

function sunburstActivation(focusId) {
  return Object.freeze({ kind: 'chart-focus', focus: focusId ?? null });
}

function createSunburstLayout(domain, config) {
  const rootId = domain.meta.root;
  const focusId = config.focus ?? rootId;
  const focus = domain.regions.get(focusId);
  const values = aggregateSunburstValues(domain);
  const total = values.get(focusId);
  const availableDepth = sunburstDepth(domain, focusId);
  const visibleLevels = Math.max(1, Math.min(SUNBURST_VISIBLE_LEVELS, availableDepth));
  const ringWidth = (1 - SUNBURST_HOLE_RATIO) / visibleLevels;
  const circleBounds = centeredSquare(SUNBURST_DIAMETER);
  const marks = [];
  const visibleItems = [];

  const appendChildren = (parentId, level, startAngle, endAngle) => {
    if (level > visibleLevels) return;
    const children = orderedChildren(domain, parentId);
    const parentTotal = values.get(parentId);
    let cursor = startAngle;
    for (const child of children) {
      const childValue = values.get(child.id);
      const sweep = parentTotal === 0 ? 0 : (childValue / parentTotal) * (endAngle - startAngle);
      const childEnd = cursor + sweep;
      const hasChildren = (domain.children.get(child.id) ?? []).length > 0;
      marks.push(mark({
        id: chartMarkId(SUNBURST_CHART, child.id),
        item: child,
        chartType: SUNBURST_CHART,
        mode: 'slice',
        bounds: circleBounds,
        zIndex: 20 + level,
        appearance: {
          fillTone: level % 2 === 1 ? 'accent' : 'soft',
          fillOpacity: Math.max(44, 96 - (level - 1) * 16),
          strokeTone: 'contrast',
          strokeOpacity: 100,
        },
        sector: {
          startAngle: cursor,
          endAngle: childEnd,
          innerRatio: SUNBURST_HOLE_RATIO + (level - 1) * ringWidth,
          outerRatio: SUNBURST_HOLE_RATIO + level * ringWidth,
        },
        activation: hasChildren ? sunburstActivation(child.id) : null,
      }));
      visibleItems.push(child);
      if (hasChildren) appendChildren(child.id, level + 1, cursor, childEnd);
      cursor = childEnd;
    }
  };
  appendChildren(focusId, 1, -90, 270);

  const parentId = focus.parent;
  const centerDiameter = SUNBURST_DIAMETER * SUNBURST_HOLE_RATIO * 0.86;
  const centerBounds = centeredSquare(centerDiameter);
  marks.push(mark({
    id: `chart:${SUNBURST_CHART}:center:${focusId}`,
    item: focus,
    chartType: SUNBURST_CHART,
    mode: 'point',
    bounds: centerBounds,
    zIndex: 80,
    label: `${focus.label}\n${total}`,
    appearance: { fillTone: 'soft', fillOpacity: 100, strokeTone: 'accent', strokeOpacity: 100 },
    activation: parentId === null ? null : sunburstActivation(parentId === rootId ? null : parentId),
  }));

  const path = sunburstPath(domain, focusId);
  const focusChildren = orderedChildren(domain, focusId).map(child => Object.freeze({
    ...child,
    value: values.get(child.id),
  }));
  const guides = [
    ...legendGuides(focusChildren),
    guide('sunburst-path', 'axis-title', path.map(region => region.label).join(' › '), bounds(PLOT_X, 40, PLOT_WIDTH, 28)),
    guide(
      'sunburst-instruction',
      'axis-tick',
      parentId === null ? '内訳をタップして掘り下げ' : '内訳をタップ／中央をタップして戻る',
      bounds(PLOT_X, BOTTOM_Y + 20, PLOT_WIDTH, 26),
    ),
  ];

  return Object.freeze({
    pattern: 'chart/1',
    space: QUANTITATIVE_SPACE,
    rootBounds: bounds(0, 0, ROOT_WIDTH, ROOT_HEIGHT),
    items: Object.freeze(visibleItems),
    bounds: new Map(marks.map(item => [item.sourceId, item.bounds])),
    marks: Object.freeze(marks),
    guides: Object.freeze(guides),
    relations: Object.freeze([]),
    axis: Object.freeze({
      type: SUNBURST_CHART,
      layers: Object.freeze([SUNBURST_CHART]),
      minimum: 0,
      maximum: total,
      total,
      focus: focusId,
      focusPath: Object.freeze(path.map(region => region.id)),
      availableDepth,
      visibleLevels,
      drillable: availableDepth > 1,
      coordinateSystems: Object.freeze(['polar-hierarchy/1']),
      supportedCombinations: CHART_COMBINATION_COUNT,
    }),
    geometryEditable: false,
  });
}

function createOverlayLayout(domain, config, layers) {
  const items = orderedItems(domain);
  const maximum = Math.max(0, ...items.map(item => item.value));
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const legacySingleHorizontal = Object.hasOwn(config, 'type') && config.type === BAR_HORIZONTAL_CHART;
  const hasScatter = layers.includes(SCATTER_CHART);
  const orderScale = hasScatter ? ordinalRange(items) : null;
  const hasCartesian = layers.some(type => (
    type === BAR_HORIZONTAL_CHART || type === BAR_VERTICAL_CHART || type === LINE_CHART || type === SCATTER_CHART
  ));
  const marks = [];
  let relations = [];

  if (layers.includes(PIE_CHART) || layers.includes(DONUT_CHART)) {
    marks.push(...radialMarks(items, layers, hasCartesian));
  }
  if (layers.includes(BAR_HORIZONTAL_CHART)) {
    marks.push(...horizontalBars(items, maximum, legacySingleHorizontal));
  }
  if (layers.includes(BAR_VERTICAL_CHART)) marks.push(...verticalBars(items, maximum, orderScale));
  if (layers.includes(LINE_CHART)) {
    const points = lineMarks(items, maximum, orderScale);
    marks.push(...points);
    relations = lineRelations(points);
  }
  if (hasScatter) marks.push(...scatterMarks(items, maximum, orderScale));

  const horizontalBounds = new Map(
    marks
      .filter(item => item.chartType === BAR_HORIZONTAL_CHART)
      .map(item => [item.sourceId, item.bounds]),
  );
  const coordinateSystems = [];
  if (hasCartesian) coordinateSystems.push('cartesian/1');
  if (layers.includes(PIE_CHART) || layers.includes(DONUT_CHART)) coordinateSystems.push('polar/1');

  const axis = {
    type: layers.length === 1 ? layers[0] : 'overlay/1',
    layers,
    minimum: 0,
    maximum,
    total,
    coordinateSystems: Object.freeze(coordinateSystems),
    supportedCombinations: CHART_COMBINATION_COUNT,
  };
  if (orderScale) {
    axis.xMinimum = orderScale.minimum;
    axis.xMaximum = orderScale.maximum;
  }

  return Object.freeze({
    pattern: 'chart/1',
    space: QUANTITATIVE_SPACE,
    rootBounds: bounds(0, 0, ROOT_WIDTH, ROOT_HEIGHT),
    items: Object.freeze(items),
    bounds: horizontalBounds,
    marks: Object.freeze(marks),
    guides: axisGuides(items, layers, maximum, total, orderScale),
    relations: Object.freeze(relations),
    axis: Object.freeze(axis),
    geometryEditable: false,
  });
}

export function createChartLayout(domain, inputConfig) {
  const config = normalizeChartView(inputConfig);
  const layers = chartLayers(config);
  if (layers.length === 1 && layers[0] === HEATMAP_CHART) return createHeatmapLayout(domain);
  if (layers.length === 1 && layers[0] === SUNBURST_CHART) return createSunburstLayout(domain, config);
  return createOverlayLayout(domain, config, layers);
}
