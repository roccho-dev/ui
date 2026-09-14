import { renderResourceTarget } from '../renderer-resource-dom/index.js';
import { displayedRegionLabel, displayedRelationLabel } from './labels.js';
import { appendReviewOverlay, assertReviewOverlay } from './review-overlay.js';
import { edgeStyle, vertexStyle } from './styles.js';
import { paletteFor, styleScaleFor } from './theme.js';

function geometryEquals(geometry, bounds) {
  return geometry
    && geometry.x === bounds.x
    && geometry.y === bounds.y
    && geometry.width === bounds.width
    && geometry.height === bounds.height;
}

function relationProjectionKey(relation) {
  return `${relation.relationIds.join(',')}@${relation.from}->${relation.to}:${relation.kind}`;
}

function renderOverlays(scene = this.lastScene) {
  const svg = this.overlaySvg;
  const root = this.overlayRoot;
  if (!svg || !root) return;
  root.replaceChildren();
  const width = Math.max(1, this.container.clientWidth);
  const height = Math.max(1, this.container.clientHeight);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (!scene) return;
  const camera = this.camera();
  const screenPoint = ([x, y]) => [
    (x + camera.translateX) * camera.scale,
    (y + camera.translateY) * camera.scale,
  ];

  const terrainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  terrainGroup.setAttribute('data-layer', 'terrain');
  for (const cell of scene.terrain ?? []) {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', cell.points.map((point) => screenPoint(point).join(',')).join(' '));
    const [fill, stroke] = paletteFor(this.theme, `terrain:${cell.regionId}`);
    polygon.setAttribute('fill', fill);
    polygon.setAttribute('fill-opacity', String(this.theme.terrain.fillOpacity));
    polygon.setAttribute('stroke', stroke);
    polygon.setAttribute('stroke-opacity', String(this.theme.terrain.strokeOpacity));
    polygon.setAttribute('stroke-width', String(this.theme.terrain.strokeWidth));
    polygon.setAttribute('data-region-id', cell.regionId);
    terrainGroup.append(polygon);
  }
  root.append(terrainGroup);

  const setGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  setGroup.setAttribute('data-layer', 'sets');
  for (const set of scene.setOverlay?.sets ?? []) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const x = (set.bounds.x + camera.translateX) * camera.scale;
    const y = (set.bounds.y + camera.translateY) * camera.scale;
    const w = set.bounds.width * camera.scale;
    const h = set.bounds.height * camera.scale;
    const [, stroke] = paletteFor(this.theme, `set:${set.regionId}`);
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', String(Math.min(
      this.theme.set.cornerMax,
      Math.max(this.theme.set.cornerMin, Math.min(w, h) * this.theme.set.cornerFactor),
    )));
    rect.setAttribute('fill', this.theme.set.fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', String(set.complete
      ? this.theme.set.completeStrokeWidth
      : this.theme.set.incompleteStrokeWidth));
    rect.setAttribute('stroke-dasharray', set.complete
      ? this.theme.set.completeDash
      : this.theme.set.incompleteDash);
    rect.setAttribute('stroke-opacity', String(this.theme.set.strokeOpacity));
    rect.setAttribute('data-set-id', set.regionId);
    rect.setAttribute('data-complete', String(set.complete));
    setGroup.append(rect);
  }
  root.append(setGroup);

  const requestedFocus = this.focusMarkerRegionId;
  if (requestedFocus) {
    const visibleFocus = scene.selectionProxies?.[requestedFocus] ?? requestedFocus;
    const representation = scene.representations.find((item) => item.regionId === visibleFocus);
    if (representation) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('data-layer', 'current-focus');
      group.setAttribute('data-focus-ref', requestedFocus);
      const x = (representation.bounds.x + camera.translateX) * camera.scale;
      const y = (representation.bounds.y + camera.translateY) * camera.scale;
      const w = representation.bounds.width * camera.scale;
      const h = representation.bounds.height * camera.scale;
      const region = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      region.setAttribute('x', String(x));
      region.setAttribute('y', String(y));
      region.setAttribute('width', String(w));
      region.setAttribute('height', String(h));
      region.setAttribute('rx', String(Math.min(10, Math.max(2, Math.min(w, h) * 0.08))));
      region.setAttribute('fill', this.theme.focusMarker.regionFill);
      region.setAttribute('fill-opacity', String(this.theme.focusMarker.regionFillOpacity));
      region.setAttribute('stroke', this.theme.focusMarker.regionStroke);
      region.setAttribute('stroke-width', String(this.theme.focusMarker.regionStrokeWidth));
      region.setAttribute('vector-effect', 'non-scaling-stroke');
      region.setAttribute('data-semantic-focus-region', requestedFocus);
      group.append(region);

      const size = this.theme.focusMarker.size;
      const markerX = Math.max(2, Math.min(width - size - 2, x + w - size / 2));
      const markerY = Math.max(2, Math.min(height - size - 2, y - size / 2));
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      marker.setAttribute('x', String(markerX));
      marker.setAttribute('y', String(markerY));
      marker.setAttribute('width', String(size));
      marker.setAttribute('height', String(size));
      marker.setAttribute('rx', String(this.theme.focusMarker.radius));
      marker.setAttribute('fill', this.theme.focusMarker.fill);
      marker.setAttribute('stroke', this.theme.focusMarker.outline);
      marker.setAttribute('stroke-width', String(this.theme.focusMarker.outlineWidth));
      marker.setAttribute('vector-effect', 'non-scaling-stroke');
      marker.setAttribute('data-semantic-focus-marker', requestedFocus);
      group.append(marker);
      root.append(group);
    }
  }
  appendReviewOverlay(root, this.reviewOverlay, camera);
}

function setReviewOverlay(overlay) {
  if (overlay === null) return this.clearReviewOverlay();
  assertReviewOverlay(overlay);
  this.reviewOverlay = overlay;
  this.renderOverlays();
  return this.reviewOverlaySnapshot();
}

function clearReviewOverlay() {
  this.reviewOverlay = null;
  this.renderOverlays();
  return this.reviewOverlaySnapshot();
}

function reviewOverlaySnapshot() {
  if (!this.reviewOverlay) return Object.freeze({ active: false, overlay: null });
  return Object.freeze({
    active: true,
    overlay: structuredClone(this.reviewOverlay),
  });
}

function labelContext(scene) {
  const representationsById = new Map(scene.representations.map((item) => [item.regionId, item]));
  const selectedRegionIds = new Set();
  for (const regionId of this.selectionRegionIds) {
    selectedRegionIds.add(scene.selectionProxies[regionId] ?? regionId);
  }
  return Object.freeze({
    representationsById,
    selectedRegionIds,
    selectedRelationIds: new Set(this.selectionRelationIds),
  });
}

function regionDisplayLabel(representation, scene, context) {
  return displayedRegionLabel(
    representation,
    scene.scale,
    this.theme,
    context.selectedRegionIds.has(representation.regionId),
  );
}

function relationDisplayLabel(relation, scene, context) {
  const selected = relation.relationIds.some((id) => context.selectedRelationIds.has(id));
  return displayedRelationLabel(
    relation,
    scene.scale,
    this.theme,
    context.representationsById,
    selected,
  );
}

function refreshRenderedLabels() {
  const scene = this.lastScene;
  if (!scene) return;
  const context = this.labelContext(scene);
  const model = this.graph.getDataModel();
  const previousProjecting = this.projecting;
  this.projecting = true;
  try {
    this.graph.batchUpdate(() => {
      for (const cell of this.cellsByRegionId.values()) {
        const representation = cell.semantic;
        if (representation?.type !== 'region') continue;
        const label = this.regionDisplayLabel(representation, scene, context);
        if (cell.value !== label) model.setValue(cell, label);
      }
      for (const edge of this.edgesByProjectionKey.values()) {
        const relation = edge.semantic;
        if (relation?.type !== 'relation') continue;
        const label = this.relationDisplayLabel(relation, scene, context);
        if (edge.value !== label) model.setValue(edge, label);
      }
    });
  } finally {
    this.projecting = previousProjecting;
  }
}

function render(scene) {
  const nextCompositionKey = JSON.stringify(scene.resourceComposition ?? null);
  if (this.surfaceCompositionKey !== nextCompositionKey) {
    renderResourceTarget({
      document,
      mount: this.surfaceBackgroundMount,
      composition: scene.resourceComposition,
      targetRef: 'surface:root',
      slot: 'background',
    });
    renderResourceTarget({
      document,
      mount: this.surfaceContentMount,
      composition: scene.resourceComposition,
      targetRef: 'surface:root',
      slot: 'content',
    });
    this.surfaceCompositionKey = nextCompositionKey;
  }
  const graph = this.graph;
  const parent = graph.getDefaultParent();
  const desiredRegionIds = new Set(scene.representations.map((item) => item.regionId));
  const desiredEdgeKeys = new Set(scene.relations.map(relationProjectionKey));
  const cellsByRegionId = new Map(this.cellsByRegionId);
  const edgesByProjectionKey = new Map(this.edgesByProjectionKey);
  const model = graph.getDataModel();
  const styleScale = styleScaleFor(scene.scale);
  const labelContext = this.labelContext(scene);

  this.projecting = true;
  try {
    graph.batchUpdate(() => {
      const staleEdges = [];
      for (const [key, edge] of edgesByProjectionKey) {
        if (!desiredEdgeKeys.has(key) || !model.contains(edge)) {
          if (model.contains(edge)) staleEdges.push(edge);
          edgesByProjectionKey.delete(key);
        }
      }
      if (staleEdges.length) graph.cellsRemoved(staleEdges);

      const staleRegions = [];
      for (const [regionId, cell] of cellsByRegionId) {
        if (!desiredRegionIds.has(regionId) || !model.contains(cell)) {
          if (model.contains(cell)) staleRegions.push(cell);
          cellsByRegionId.delete(regionId);
        }
      }
      if (staleRegions.length) graph.cellsRemoved(staleRegions);

      const ordered = [...scene.representations].sort((a, b) => {
        const leftZ = Number.isFinite(a.zIndex) ? a.zIndex : (a.mode === 'boundary' ? -1_000 : a.depth);
        const rightZ = Number.isFinite(b.zIndex) ? b.zIndex : (b.mode === 'boundary' ? -1_000 : b.depth);
        return leftZ - rightZ || a.depth - b.depth || String(a.regionId).localeCompare(String(b.regionId));
      });

      for (const representation of ordered) {
        const { x, y, width, height } = representation.bounds;
        let cell = cellsByRegionId.get(representation.regionId);
        const style = vertexStyle(representation, styleScale, this.theme);
        const styleKey = JSON.stringify(style);
        const displayLabel = this.regionDisplayLabel(representation, scene, labelContext);
        if (!cell) {
          cell = graph.insertVertex({
            parent,
            id: `region:${representation.regionId}`,
            value: displayLabel,
            position: [x, y],
            size: [width, height],
            style,
          });
          cellsByRegionId.set(representation.regionId, cell);
        } else {
          const geometry = cell.getGeometry();
          if (!geometryEquals(geometry, representation.bounds)) {
            const next = geometry.clone();
            next.x = x;
            next.y = y;
            next.width = width;
            next.height = height;
            model.setGeometry(cell, next);
          }
          if (cell.value !== displayLabel) model.setValue(cell, displayLabel);
          if (cell.semanticStyleKey !== styleKey) model.setStyle(cell, style);
        }
        cell.semanticStyleKey = styleKey;
        cell.semantic = Object.freeze({ type: 'region', ...representation, displayLabel });
      }

      for (const relation of scene.relations) {
        const key = relationProjectionKey(relation);
        const source = cellsByRegionId.get(relation.from);
        const target = cellsByRegionId.get(relation.to);
        if (!source || !target) continue;
        let edge = edgesByProjectionKey.get(key);
        const style = edgeStyle(relation, styleScale, this.theme);
        const styleKey = JSON.stringify(style);
        const displayLabel = this.relationDisplayLabel(relation, scene, labelContext);
        if (!edge) {
          edge = graph.insertEdge({
            parent,
            id: `relation:${key}`,
            value: displayLabel,
            source,
            target,
            style,
          });
          edgesByProjectionKey.set(key, edge);
        } else {
          if (edge.getTerminal(true) !== source) model.setTerminal(edge, source, true);
          if (edge.getTerminal(false) !== target) model.setTerminal(edge, target, false);
          if (edge.value !== displayLabel) model.setValue(edge, displayLabel);
          if (edge.semanticStyleKey !== styleKey) model.setStyle(edge, style);
        }
        edge.semanticStyleKey = styleKey;
        edge.semantic = Object.freeze({ type: 'relation', projectionKey: key, ...relation, displayLabel });
      }

      const managed = new Set([
        ...cellsByRegionId.values(),
        ...edgesByProjectionKey.values(),
      ]);
      const unmanaged = graph.getChildCells(parent, true, true).filter((cell) => !managed.has(cell));
      if (unmanaged.length) graph.cellsRemoved(unmanaged);

      const backgroundEdges = [...edgesByProjectionKey.values()].filter(
        (cell) => model.contains(cell) && cell.semantic?.foreground !== true,
      );
      if (backgroundEdges.length) graph.orderCells(true, backgroundEdges);
      const backgroundCells = [...cellsByRegionId.values()].filter(
        (cell) => model.contains(cell) && cell.semantic?.shape === 'map-background',
      );
      if (backgroundCells.length) graph.orderCells(true, backgroundCells);

      const zOrderedCells = [
        ...cellsByRegionId.values(),
        ...edgesByProjectionKey.values(),
      ].filter((cell) => model.contains(cell) && Number.isFinite(cell.semantic?.zIndex))
        .sort((left, right) => (
          left.semantic.zIndex - right.semantic.zIndex
          || String(left.id).localeCompare(String(right.id))
        ));
      if (zOrderedCells.length) graph.orderCells(false, zOrderedCells);
    });

    this.cellsByRegionId = cellsByRegionId;
    this.edgesByProjectionKey = edgesByProjectionKey;

    // Context boundaries stay visible but never intercept editing gestures.
    // This leaves empty-space lasso/pan available inside the same semantic region.
    for (const cell of cellsByRegionId.values()) {
      const state = graph.getView().getState(cell);
      if (!state) continue;
      const interactive = cell.semantic?.mode !== 'boundary'
        && (!cell.semantic?.readOnly || Boolean(cell.semantic?.activation));
      if (state.shape && state.shape.pointerEvents !== interactive) {
        state.shape.pointerEvents = interactive;
        state.shape.redraw();
      }
      if (state.text && state.text.pointerEvents !== interactive) {
        state.text.pointerEvents = interactive;
        state.text.redraw();
      }
    }

    this.edgeByRelationId = new Map();
    for (const edge of edgesByProjectionKey.values()) {
      if (edge.semantic?.relationIds?.length === 1) {
        this.edgeByRelationId.set(edge.semantic.relationIds[0], edge);
      }
    }
    this.lastScene = scene;
    this.renderOverlays(scene);
    this.restoreSelection(scene);
  } finally {
    this.projecting = false;
  }
}


export const renderMethods = Object.freeze({
  renderOverlays,
  setReviewOverlay,
  clearReviewOverlay,
  reviewOverlaySnapshot,
  labelContext,
  regionDisplayLabel,
  relationDisplayLabel,
  refreshRenderedLabels,
  render,
});
