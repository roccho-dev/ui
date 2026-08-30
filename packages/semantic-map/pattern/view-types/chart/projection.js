import { SUNBURST_CHART, chartLayers } from './contract.js';
import { createChartLayout } from './layout.js';

function createPlan(domain, view) {
  return createChartLayout(domain, view.chart);
}

function syntheticRegion(item, mark) {
  if (mark.id === item.id) return item;
  return Object.freeze({
    ...item,
    id: mark.id,
    parent: item.parent,
    kind: `chart-${mark.mode}`,
  });
}

function markActivation(node, mark) {
  if (!mark.activation || node.namespace) return null;
  if (mark.activation.kind !== 'chart-focus') throw new Error(`chart/1 unsupported activation ${mark.activation.kind}`);
  const chart = { ...node.view.chart };
  delete chart.layers;
  chart.type = SUNBURST_CHART;
  if (mark.activation.focus === null) delete chart.focus;
  else chart.focus = mark.activation.focus;
  return Object.freeze({
    kind: 'set-view',
    view: Object.freeze({ ...node.view, chart: Object.freeze(chart) }),
  });
}

function project({ node, plan, transform, depthOffset, clipBounds, api }) {
  const domain = node.domain;
  const {
    addGuide, addRelation, addRepresentation, area, clippedBounds, intersect, selectionProxies,
    transformBounds, visibleViewport,
  } = api;
  const root = domain.regions.get(domain.meta.root);
  const rootBounds = clippedBounds(transformBounds(plan.rootBounds, transform), clipBounds);
  if (area(rootBounds) > 0 && area(intersect(rootBounds, visibleViewport)) > 0) {
    addRepresentation(node, root, rootBounds, 'boundary', depthOffset, {
      detailsVisible: true,
      geometryEditable: false,
      hasChildren: plan.marks.length > 0,
      readOnly: true,
      zIndex: -100,
    });
  }
  for (const guide of plan.guides) {
    if (node.namespace && guide.id === 'sunburst-instruction') continue;
    const guideBounds = clippedBounds(transformBounds(guide.bounds, transform), clipBounds);
    if (area(guideBounds) > 0 && area(intersect(guideBounds, visibleViewport)) > 0) {
      addGuide(node, guide, guideBounds, depthOffset + 1);
    }
  }

  const visibleMarks = new Map();
  const selectedBySource = new Map();
  for (const mark of plan.marks) {
    const item = domain.regions.get(mark.sourceId);
    const markBounds = clippedBounds(transformBounds(mark.bounds, transform), clipBounds);
    if (!item || area(markBounds) === 0 || area(intersect(markBounds, visibleViewport)) === 0) continue;
    const representation = addRepresentation(
      node,
      syntheticRegion(item, mark),
      markBounds,
      mark.mode,
      depthOffset + 2,
      {
        detailsVisible: false,
        geometryEditable: false,
        hasChildren: false,
        label: mark.label ?? '',
        readOnly: true,
        activation: markActivation(node, mark),
        visual: mark.visual,
        zIndex: mark.zIndex,
      },
    );
    visibleMarks.set(mark.id, representation.regionId);
    const previous = selectedBySource.get(mark.sourceId);
    if (!previous || mark.zIndex >= previous.zIndex) {
      selectedBySource.set(mark.sourceId, Object.freeze({ regionId: representation.regionId, zIndex: mark.zIndex }));
    }
  }

  for (const relation of plan.relations) {
    addRelation(node, relation, visibleMarks.get(relation.from), visibleMarks.get(relation.to));
  }
  if (!node.namespace) {
    for (const [sourceId, selected] of selectedBySource) selectionProxies[sourceId] = selected.regionId;
  }
}

export const chartViewTypeProjection = Object.freeze({
  id: 'chart/1',
  createPlan,
  planKey: view => `chart/1\u0000${chartLayers(view.chart).join('\u0000')}\u0000${view.chart.focus ?? ''}`,
  project,
});
