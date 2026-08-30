import { BaseGraph } from '../vendor/maxgraph/view/BaseGraph.js';
import CellEditorHandler from '../vendor/maxgraph/view/plugin/CellEditorHandler.js';
import ConnectionHandler from '../vendor/maxgraph/view/plugin/ConnectionHandler.js';
import PanningHandler from '../vendor/maxgraph/view/plugin/PanningHandler.js';
import RubberBandHandler from '../vendor/maxgraph/view/plugin/RubberBandHandler.js';
import SelectionCellsHandler from '../vendor/maxgraph/view/plugin/SelectionCellsHandler.js';
import SelectionHandler from '../vendor/maxgraph/view/plugin/SelectionHandler.js';
import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';
import ImageBox from '../vendor/maxgraph/view/image/ImageBox.js';
import EllipseShape from '../vendor/maxgraph/view/shape/node/EllipseShape.js';
import ImageShape from '../vendor/maxgraph/view/shape/node/ImageShape.js';
import { ShapeRegistry } from '../vendor/maxgraph/view/shape/ShapeRegistry.js';
import { EllipsePerimeter } from '../vendor/maxgraph/view/style/perimeter/EllipsePerimeter.js';
import { RectanglePerimeter } from '../vendor/maxgraph/view/style/perimeter/RectanglePerimeter.js';
import { RhombusPerimeter } from '../vendor/maxgraph/view/style/perimeter/RhombusPerimeter.js';
import { PerimeterRegistry } from '../vendor/maxgraph/view/style/perimeter/PerimeterRegistry.js';
import { EdgeHandlerConfig, HandleConfig, VertexHandlerConfig } from '../vendor/maxgraph/view/handler/config.js';
import { DiamondShape, ParallelogramShape, SectorShape } from './shapes.js';
import { DEFAULT_THEME, connectIcon, paletteFor, styleScaleFor } from './theme.js';
import { renderResourceTarget } from '../renderer-resource-dom/index.js';


const DAY_MS = 86_400_000;

function temporalScalar(value, axis) {
  return axis === 'ordinal' ? value : Date.parse(`${value}T00:00:00.000Z`) / DAY_MS;
}

function temporalValue(value, axis) {
  return axis === 'ordinal'
    ? Math.max(0, Math.round(value))
    : new Date(Math.round(value) * DAY_MS).toISOString().slice(0, 10);
}

function nearestLaneActor(edit, centerY) {
  if (edit.groupBy !== 'actor') return edit.actor;
  let nearest = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const lane of edit.laneBands) {
    const candidate = Math.abs(centerY - (lane.y + lane.height / 2));
    if (candidate < distance) {
      nearest = lane.actor;
      distance = candidate;
    }
  }
  return nearest;
}

function defaultRelationKind(pattern) {
  if (pattern === 'seq/1') return 'message';
  return 'relates';
}

function fontSizeForRepresentation(representation, theme) {
  if (representation.isGuide) return theme.edge.fontSize;
  if (representation.shape === 'map-attribution') return theme.geo.attributionFontSize;
  if (representation.shape === 'boundary' || representation.shape === 'seq-lane') {
    return theme.vertex.fontSize;
  }
  return representation.depth >= theme.vertex.deepFontFromDepth
    ? theme.vertex.deepFontSize
    : theme.vertex.fontSize;
}

function estimatedLabelWidth(label, fontSize) {
  let units = 0;
  for (const character of String(label ?? '')) {
    if (/\s/u.test(character)) units += 0.34;
    else if (character.codePointAt(0) > 0xff) units += 1;
    else units += 0.59;
  }
  return units * fontSize;
}

function compactLabel(label) {
  const [head] = String(label ?? '').split(/\s+[·|]\s+/u, 1);
  return head?.trim() || '';
}

function displayedRegionLabel(representation, scale, theme, selected) {
  const label = String(representation.label ?? '');
  if (!label) return '';
  if (selected || representation.isGuide || representation.shape === 'map-attribution') return label;

  const fontSize = fontSizeForRepresentation(representation, theme);
  const width = representation.bounds.width * scale;
  const height = representation.bounds.height * scale;
  const horizontalPadding = representation.shape === 'boundary' || representation.shape === 'seq-lane'
    ? theme.vertex.boundarySpacingLeft * 2
    : fontSize;
  const availableWidth = Math.max(0, width - horizontalPadding);
  const minimumHeight = fontSize * (representation.shape === 'boundary' ? 1.7 : 1.45);
  if (height < minimumHeight) return '';
  if (estimatedLabelWidth(label, fontSize) <= availableWidth) return label;

  const compact = compactLabel(label);
  return compact !== label && estimatedLabelWidth(compact, fontSize) <= availableWidth
    ? compact
    : '';
}

function displayedRelationLabel(relation, scale, theme, representationsById, selected) {
  const label = String(relation.label ?? '');
  if (!label) return '';
  if (selected) return label;
  const source = representationsById.get(relation.from);
  const target = representationsById.get(relation.to);
  if (!source || !target) return '';
  const sourceX = source.bounds.x + source.bounds.width / 2;
  const sourceY = source.bounds.y + source.bounds.height / 2;
  const targetX = target.bounds.x + target.bounds.width / 2;
  const targetY = target.bounds.y + target.bounds.height / 2;
  const length = Math.hypot(targetX - sourceX, targetY - sourceY) * scale;
  return estimatedLabelWidth(label, theme.edge.fontSize) + theme.edge.fontSize * 2 <= length
    ? label
    : '';
}

class SemanticGraph extends BaseGraph {
  registerDefaults() {
    PerimeterRegistry.add('rectanglePerimeter', RectanglePerimeter);
    PerimeterRegistry.add('ellipsePerimeter', EllipsePerimeter);
    PerimeterRegistry.add('rhombusPerimeter', RhombusPerimeter);
    ShapeRegistry.add('ellipse', EllipseShape);
    ShapeRegistry.add('image', ImageShape);
    ShapeRegistry.add('semanticDiamond', DiamondShape);
    ShapeRegistry.add('semanticParallelogram', ParallelogramShape);
    ShapeRegistry.add('semanticSector', SectorShape);
  }

  isToggleEvent(event) {
    return Boolean(event.shiftKey || event.ctrlKey || event.metaKey);
  }

  isCellSelectable(cell) {
    return this.isCellsSelectable() && (this.getCurrentCellStyle(cell).selectable ?? true);
  }

  getCellAt(x, y, parent = null, vertices = true, edges = true, ignoreFn = null) {
    return super.getCellAt(x, y, parent, vertices, edges, (state, px, py) => (
      state.cell?.semantic?.mode === 'boundary'
      || (state.cell?.semantic?.readOnly === true && !state.cell?.semantic?.activation)
      || Boolean(ignoreFn?.(state, px, py))
    ));
  }
}

function vertexStyle(representation, scale, theme) {
  const visual = representation.visual ?? null;
  const [softColor, accentColor] = paletteFor(theme, visual?.paletteKey ?? representation.kind);
  const appearance = visual?.appearance ?? null;
  const fillColor = appearance?.fillTone === 'accent' ? accentColor : softColor;
  const strokeColor = appearance?.strokeTone === 'contrast'
    ? theme.edge.labelBackground
    : appearance?.strokeTone === 'soft'
      ? softColor
      : accentColor;
  if (representation.shape === 'guide') {
    if (representation.kind === 'lane-background') {
      return {
        fillColor, fillOpacity: theme.vertex.laneFillOpacity,
        strokeColor, strokeOpacity: theme.vertex.laneStrokeOpacity,
        strokeWidth: theme.terrain.strokeWidth / scale,
        rounded: true, arcSize: theme.vertex.sequenceArcSize,
        movable: false, resizable: false, selectable: false, editable: false,
        connectable: false, deletable: false,
      };
    }
    return {
      fillColor: 'none', strokeColor: 'none',
      align: representation.kind === 'axis-tick' ? 'left' : 'center',
      verticalAlign: theme.vertex.verticalAlign,
      fontColor: theme.edge.font,
      fontSize: theme.edge.fontSize / scale,
      fontStyle: representation.kind === 'axis-title' ? theme.vertex.fontStyle : 0,
      movable: false, resizable: false, selectable: false, editable: false,
      connectable: false, deletable: false,
    };
  }
  const editableGeometry = !representation.readOnly
    && (representation.geometryEditable || Boolean(representation.temporalEdit));
  const editableLabel = !representation.readOnly && representation.labelEditable;
  const editableScene = !representation.readOnly;
  const activatable = Boolean(representation.activation);
  const common = {
    fillColor,
    fillOpacity: appearance?.fillOpacity ?? 100,
    strokeColor,
    strokeOpacity: appearance?.strokeOpacity ?? 100,
    strokeWidth: theme.vertex.strokeWidth / scale,
    shadow: theme.vertex.shadow,
    align: theme.vertex.align,
    verticalAlign: theme.vertex.verticalAlign,
    fontColor: theme.vertex.font,
    fontSize: (representation.depth >= theme.vertex.deepFontFromDepth
      ? theme.vertex.deepFontSize
      : theme.vertex.fontSize) / scale,
    fontStyle: representation.href ? theme.vertex.linkFontStyle : theme.vertex.fontStyle,
    whiteSpace: theme.vertex.whiteSpace,
    overflow: theme.vertex.overflow,
    movable: editableGeometry,
    resizable: editableGeometry,
    selectable: editableScene,
    editable: editableLabel,
    connectable: editableScene,
    deletable: editableScene,
    ...(activatable ? { cursor: 'pointer' } : {}),
  };

  if (representation.resource?.contract === 'image/1') {
    const selectable = !representation.isRoot && !representation.readOnly;
    return {
      ...common,
      shape: 'image',
      image: representation.resource.src,
      imageAspect: representation.resource.fit === 'fill' ? 0 : 1,
      imageBackground: fillColor,
      imageBorder: strokeColor,
      opacity: Math.round(representation.resource.opacity * 100),
      labelBackgroundColor: theme.edge.labelBackground,
      perimeter: 'rectanglePerimeter',
      shadow: false,
      selectable,
      connectable: selectable,
      deletable: selectable,
    };
  }

  if (representation.shape === 'boundary' || representation.shape === 'seq-lane') {
    const selectable = !representation.isRoot && !representation.readOnly;
    return {
      ...common,
      fillColor: representation.shape === 'seq-lane' ? fillColor : theme.vertex.boundaryFill,
      fillOpacity: representation.shape === 'seq-lane' ? theme.vertex.laneFillOpacity : 100,
      pointerEvents: false,
      strokeColor,
      strokeOpacity: representation.shape === 'seq-lane' ? theme.vertex.laneStrokeOpacity : theme.vertex.boundaryOpacity,
      strokeWidth: theme.vertex.boundaryStrokeWidth / scale,
      dashed: representation.shape === 'boundary',
      rounded: true,
      arcSize: theme.vertex.boundaryArcSize,
      align: 'left',
      verticalAlign: 'top',
      spacingTop: theme.vertex.boundarySpacingTop / scale,
      spacingLeft: theme.vertex.boundarySpacingLeft / scale,
      fontColor: strokeColor,
      fontSize: theme.vertex.fontSize / scale,
      fontStyle: theme.vertex.fontStyle,
      whiteSpace: theme.vertex.whiteSpace,
      overflow: theme.vertex.overflow,
      perimeter: 'rectanglePerimeter',
      shadow: theme.vertex.boundaryShadow,
      movable: false,
      resizable: false,
      selectable,
      editable: editableLabel,
      connectable: false,
      deletable: false,
    };
  }

  switch (representation.shape) {
    case 'map-background':
      return {
        ...common,
        shape: 'image',
        image: representation.image?.src,
        imageAspect: 0,
        imageBackground: 'none',
        imageBorder: 'none',
        fontSize: 0,
        fontStyle: 0,
        fillOpacity: 100,
        strokeOpacity: 0,
        shadow: false,
        pointerEvents: false,
        movable: false,
        resizable: false,
        selectable: false,
        editable: false,
        connectable: false,
        deletable: false,
      };
    case 'map-portal':
      return {
        ...common,
        rounded: true,
        arcSize: theme.geo.portalArcSize,
        perimeter: 'rectanglePerimeter',
        fillOpacity: theme.geo.portalFillOpacity,
        strokeOpacity: theme.geo.portalStrokeOpacity,
        strokeWidth: theme.geo.portalStrokeWidth / scale,
        dashed: true,
        shadow: false,
        verticalAlign: 'top',
        spacingTop: theme.vertex.boundarySpacingTop / scale,
      };
    case 'map-control-point':
      return {
        ...common,
        shape: 'ellipse',
        fillOpacity: 0,
        strokeOpacity: 0,
        shadow: false,
        pointerEvents: false,
        perimeter: 'ellipsePerimeter',
        fontSize: 1,
        movable: false,
        resizable: false,
        selectable: false,
        editable: false,
        connectable: false,
        deletable: false,
      };
    case 'map-poi':
      return { ...common, shape: 'ellipse', rounded: false, shadow: false, perimeter: 'ellipsePerimeter' };
    case 'map-attribution':
      return {
        ...common,
        fillOpacity: 0,
        strokeOpacity: 0,
        shadow: false,
        align: 'right',
        verticalAlign: 'bottom',
        fontSize: theme.geo.attributionFontSize / scale,
        fontStyle: 0,
        pointerEvents: false,
        movable: false,
        resizable: false,
        selectable: false,
        editable: false,
        connectable: false,
        deletable: false,
      };
    case 'map-region':
      return { ...common, rounded: true, arcSize: theme.vertex.mapArcSize, perimeter: 'rectanglePerimeter' };
    case 'graph-terminal':
      return { ...common, shape: 'ellipse', rounded: false, perimeter: 'ellipsePerimeter' };
    case 'graph-decision':
      return {
        ...common,
        shape: 'semanticDiamond',
        rounded: false,
        perimeter: 'rhombusPerimeter',
        spacingLeft: theme.vertex.graphShapeSpacing / scale,
        spacingRight: theme.vertex.graphShapeSpacing / scale,
      };
    case 'graph-data':
      return {
        ...common,
        shape: 'semanticParallelogram',
        rounded: false,
        perimeter: 'rectanglePerimeter',
        spacingLeft: theme.vertex.graphShapeSpacing / scale,
        spacingRight: theme.vertex.graphShapeSpacing / scale,
      };
    case 'graph-node':
      return { ...common, rounded: true, arcSize: theme.vertex.graphArcSize, perimeter: 'rectanglePerimeter' };
    case 'vector-sector':
      return {
        ...common,
        shape: 'semanticSector',
        sectorStartAngle: visual?.sector?.startAngle ?? -90,
        sectorEndAngle: visual?.sector?.endAngle ?? 270,
        sectorInnerRatio: visual?.sector?.innerRatio ?? 0,
        sectorOuterRatio: visual?.sector?.outerRatio ?? 1,
        rounded: false,
        fontSize: 0,
        fontStyle: 0,
        shadow: false,
        movable: false,
        resizable: false,
        selectable: false,
        editable: false,
        connectable: false,
        deletable: false,
      };
    case 'seq-step':
      return { ...common, rounded: true, arcSize: theme.vertex.sequenceArcSize, perimeter: 'rectanglePerimeter' };
    case 'seq-message':
      return { ...common, rounded: true, arcSize: theme.vertex.messageArcSize, perimeter: 'rectanglePerimeter', shadow: theme.vertex.messageShadow };
    case 'seq-interval':
      return { ...common, rounded: true, arcSize: theme.vertex.intervalArcSize, perimeter: 'rectanglePerimeter', shadow: theme.vertex.intervalShadow };
    default:
      throw new Error(`unsupported Scene shape: ${representation.shape}`);
  }
}

function edgeStyle(relation, scale, theme) {
  const visual = theme.edge.lines[relation.line] ?? Object.freeze({
    stroke: theme.edge.stroke,
    width: theme.edge.strokeWidth,
    dashed: theme.edge.defaultDashed,
    rounded: theme.edge.defaultRounded,
  });
  const directlyEditable = !relation.readOnly && relation.relationIds.length === 1;
  return {
    strokeColor: visual.stroke,
    strokeWidth: visual.width / scale,
    endArrow: relation.directed ? theme.edge.directedArrow : theme.edge.undirectedArrow,
    dashed: visual.dashed,
    rounded: visual.rounded,
    fontColor: theme.edge.font,
    fontSize: theme.edge.fontSize / scale,
    labelBackgroundColor: theme.edge.labelBackground,
    labelBorderColor: theme.edge.labelBorder,
    movable: false,
    selectable: directlyEditable,
    editable: false,
    deletable: directlyEditable,
    bendable: false,
    disconnectable: false,
  };
}

function geometryEquals(geometry, bounds) {
  return geometry
    && geometry.x === bounds.x
    && geometry.y === bounds.y
    && geometry.width === bounds.width
    && geometry.height === bounds.height;
}

function uniqueCells(cells) {
  return [...new Set(cells.filter(Boolean))];
}

function relationProjectionKey(relation) {
  return `${relation.relationIds.join(',')}@${relation.from}->${relation.to}:${relation.kind}`;
}

export class MaxGraphAdapter {
  constructor(container, options = {}) {
    InternalEvent.disableContextMenu(container);
    this.container = container;
    this.theme = options.theme ?? DEFAULT_THEME;
    this.surfaceBackgroundMount = document.createElement('div');
    this.surfaceBackgroundMount.className = 'resource-surface resource-surface-background';
    this.surfaceBackgroundMount.setAttribute('data-resource-host', 'surface-background');
    Object.assign(this.surfaceBackgroundMount.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '0',
    });
    container.prepend(this.surfaceBackgroundMount);
    this.graph = new SemanticGraph({
      container,
      plugins: [
        CellEditorHandler,
        ConnectionHandler,
        PanningHandler,
        RubberBandHandler,
        SelectionCellsHandler,
        SelectionHandler,
      ],
    });
    this.overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.overlaySvg.classList.add('semantic-projection-overlay');
    this.overlaySvg.setAttribute('aria-hidden', 'true');
    this.overlaySvg.setAttribute('data-semantic-overlay', 'terrain-sets');
    Object.assign(this.overlaySvg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '1',
    });
    this.overlayRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.overlayRoot.setAttribute('data-layer', 'projection');
    this.overlaySvg.append(this.overlayRoot);
    container.append(this.overlaySvg);
    this.surfaceContentMount = document.createElement('div');
    this.surfaceContentMount.className = 'resource-surface resource-surface-content';
    this.surfaceContentMount.setAttribute('data-resource-host', 'surface-content');
    Object.assign(this.surfaceContentMount.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      zIndex: '2',
    });
    container.append(this.surfaceContentMount);
    this.surfaceCompositionKey = null;
    this.graph.setPanning(true);
    this.graph.centerZoom = false;
    this.graph.setCellsSelectable(true);
    this.graph.setCellsMovable(true);
    this.graph.setCellsResizable(true);
    this.graph.setCellsEditable(true);
    this.graph.setEnterStopsCellEditing(true);
    this.graph.setCellsCloneable(false);
    this.graph.setAllowDanglingEdges(false);
    this.graph.setAllowLoops(false);
    this.graph.setMultigraph(false);
    this.graph.setCellsDisconnectable(false);
    this.graph.setDropEnabled(false);
    this.graph.setSplitEnabled(false);
    this.graph.setGridEnabled(false);

    const panning = this.graph.getPlugin('PanningHandler');
    panning.useLeftButtonForPanning = false;
    panning.ignoreCell = false;

    VertexHandlerConfig.selectionColor = this.theme.selection.stroke;
    VertexHandlerConfig.selectionDashed = this.theme.selection.dashed;
    VertexHandlerConfig.selectionStrokeWidth = this.theme.selection.strokeWidth;
    EdgeHandlerConfig.selectionColor = this.theme.selection.stroke;
    HandleConfig.fillColor = this.theme.handle.fill;
    HandleConfig.strokeColor = this.theme.handle.stroke;
    const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches
      || navigator.maxTouchPoints > 0;
    HandleConfig.size = coarsePointer ? this.theme.handle.coarseSize : this.theme.handle.fineSize;

    const connection = this.graph.getPlugin('ConnectionHandler');
    connection.setEnabled(true);
    connection.connectImage = new ImageBox(connectIcon(this.theme), this.theme.connect.size, this.theme.connect.size);
    connection.getIconPosition = (icon, state) => ({
      x: state.x + state.width - icon.bounds.width / 2,
      y: state.y + state.height / 2 - icon.bounds.height / 2,
    });
    connection.select = true;
    connection.createTarget = false;

    this.cellsByRegionId = new Map();
    this.edgesByProjectionKey = new Map();
    this.edgeByRelationId = new Map();
    this.lastScene = null;
    this.projecting = false;
    this.tool = 'select';
    this.operationHandler = null;
    this.errorHandler = null;
    this.activationHandler = null;
    this.activationPending = false;
    this.selectionListeners = new Set();
    this.selectionRegionIds = new Set();
    this.selectionRelationIds = new Set();
    this.pendingRelationSelection = null;
    this.focusMarkerRegionId = null;
    this.cameraPreview = null;

    this.graph.getView().addListener(InternalEvent.SCALE, () => this.renderOverlays());
    this.graph.getView().addListener(InternalEvent.TRANSLATE, () => this.renderOverlays());
    this.graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, () => this.renderOverlays());

    this.installEditEvents();
    this.setTool('select');
  }

  installEditEvents() {
    this.graph.addListener(InternalEvent.CLICK, (_sender, event) => {
      if (this.projecting || this.activationPending) return;
      const cell = event.getProperty('cell');
      const activation = cell?.semantic?.activation ?? null;
      if (!activation || !this.activationHandler) return;
      event.consume();
      this.activationPending = true;
      Promise.resolve(this.activationHandler(activation, cell.semantic))
        .catch((error) => this.errorHandler?.(error))
        .finally(() => { this.activationPending = false; });
    });

    this.graph.addListener(InternalEvent.CELLS_MOVED, (_sender, event) => {
      if (this.projecting) return;
      const cells = (event.getProperty('cells') ?? []).filter(
        (cell) => cell.isVertex()
          && cell.semantic?.type === 'region'
          && cell.semantic.mode !== 'boundary'
          && !cell.semantic.readOnly
          && (cell.semantic.geometryEditable || cell.semantic.temporalEdit),
      );
      if (!cells.length) return;
      const temporal = cells.filter((cell) => cell.semantic.temporalEdit);
      if (temporal.length) {
        if (temporal.length !== cells.length) {
          this.errorHandler?.(new Error('seq/1 temporal items cannot move with geometric regions'));
          this.render(this.lastScene);
          return;
        }
        const axis = temporal[0].semantic.temporalEdit.axis;
        if (temporal.some((cell) => cell.semantic.temporalEdit.axis !== axis)) {
          this.errorHandler?.(new Error('seq/1 temporal items must share one active axis'));
          this.render(this.lastScene);
          return;
        }
        const dx = event.getProperty('dx');
        const dy = event.getProperty('dy');
        const items = temporal.map((cell) => {
          const edit = cell.semantic.temporalEdit;
          const delta = Math.round(dx / edit.unitWidth);
          const start = temporalScalar(edit.start, axis) + delta;
          const end = temporalScalar(edit.end, axis) + delta;
          const centerY = cell.semantic.bounds.y + cell.semantic.bounds.height / 2 + dy;
          return {
            regionId: cell.semantic.regionId,
            actor: nearestLaneActor(edit, centerY),
            start: temporalValue(start, axis),
            end: temporalValue(end, axis),
          };
        });
        this.submitOperation({ type: 'PlaceTemporalRegions', axis, items });
        return;
      }
      this.submitOperation({
        type: 'MoveRegions',
        regionIds: cells.map((cell) => cell.semantic.regionId),
        dx: event.getProperty('dx'),
        dy: event.getProperty('dy'),
      });
    });

    this.graph.addListener(InternalEvent.CELLS_RESIZED, (_sender, event) => {
      if (this.projecting) return;
      const cells = event.getProperty('cells') ?? [];
      const resizedBounds = event.getProperty('bounds') ?? [];
      const temporalItems = [];
      const geometricItems = [];
      let temporalAxis = null;
      cells.forEach((cell, index) => {
        if (!cell.isVertex() || cell.semantic?.type !== 'region' || cell.semantic.mode === 'boundary' || cell.semantic.readOnly) return;
        const next = resizedBounds[index];
        const edit = cell.semantic.temporalEdit;
        if (edit) {
          temporalAxis ??= edit.axis;
          if (temporalAxis !== edit.axis) throw new Error('seq/1 temporal resize axes differ');
          const startScalar = edit.origin + Math.round((next.x - edit.axisStartX - 6) / edit.unitWidth);
          const endScalar = edit.origin + Math.round((next.x + next.width - edit.axisStartX + 6) / edit.unitWidth) - 1;
          const start = Math.max(edit.axis === 'ordinal' ? 0 : Number.NEGATIVE_INFINITY, startScalar);
          const endValue = Math.max(start, endScalar);
          temporalItems.push({
            regionId: cell.semantic.regionId,
            actor: edit.actor,
            start: temporalValue(start, edit.axis),
            end: temporalValue(endValue, edit.axis),
          });
        } else if (cell.semantic.geometryEditable) {
          geometricItems.push({
            regionId: cell.semantic.regionId,
            bounds: [next.x, next.y, next.width, next.height],
          });
        }
      });
      if (temporalItems.length && geometricItems.length) {
        this.errorHandler?.(new Error('seq/1 temporal items cannot resize with geometric regions'));
        this.render(this.lastScene);
        return;
      }
      if (temporalItems.length) this.submitOperation({ type: 'PlaceTemporalRegions', axis: temporalAxis, items: temporalItems });
      else if (geometricItems.length) this.submitOperation({ type: 'ResizeRegions', items: geometricItems });
    });

    this.graph.addListener(InternalEvent.LABEL_CHANGED, (_sender, event) => {
      if (this.projecting) return;
      const cell = event.getProperty('cell');
      if (cell?.semantic?.type !== 'region' || !cell.semantic.labelEditable || cell.semantic.readOnly) return;
      this.submitOperation({
        type: 'RenameRegion',
        regionId: cell.semantic.regionId,
        label: event.getProperty('value'),
      });
    });

    const connection = this.graph.getPlugin('ConnectionHandler');
    connection.addListener(InternalEvent.CONNECT, (_sender, event) => {
      if (this.projecting) return;
      const edge = event.getProperty('cell');
      const source = edge?.getTerminal(true);
      const target = edge?.getTerminal(false);
      const from = source?.semantic?.regionId;
      const to = target?.semantic?.regionId;
      if (!from || !to || source?.semantic?.readOnly || target?.semantic?.readOnly) return;
      const result = this.submitOperation({
        type: 'ConnectRegions',
        from,
        to,
        kind: defaultRelationKind(this.lastScene?.pattern),
        label: '',
      });
      if (result?.createdRelationId) {
        this.pendingRelationSelection = result.createdRelationId;
        this.selectionRegionIds.clear();
        this.selectionRelationIds = new Set([result.createdRelationId]);
      }
    });

    this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
      if (this.projecting) return;
      const selected = this.graph.getSelectionCells();
      const regions = new Set();
      const relations = new Set();
      for (const cell of selected) {
        if (cell.semantic?.type === 'region' && !cell.semantic.readOnly) regions.add(cell.semantic.regionId);
        if (cell.semantic?.type === 'relation' && !cell.semantic.readOnly && cell.semantic.relationIds.length === 1) {
          relations.add(cell.semantic.relationIds[0]);
        }
      }
      if (selected.some((cell) => cell.isEdge() && !cell.semantic) && this.pendingRelationSelection) {
        relations.add(this.pendingRelationSelection);
      }
      this.selectionRegionIds = regions;
      this.selectionRelationIds = relations;
      this.emitSelection();
    });
  }

  setOperationHandler(handler) {
    this.operationHandler = handler;
  }

  setErrorHandler(handler) {
    this.errorHandler = handler;
  }

  setActivationHandler(handler) {
    this.activationHandler = handler;
  }

  submitOperation(operation) {
    if (!this.operationHandler) return null;
    try {
      return this.operationHandler(Object.freeze({ ...operation }));
    } catch (error) {
      this.errorHandler?.(error);
      return null;
    }
  }

  onSelectionChange(listener) {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  emitSelection() {
    this.refreshRenderedLabels();
    const snapshot = this.selectionSnapshot();
    for (const listener of this.selectionListeners) listener(snapshot);
  }

  selectionSnapshot() {
    return Object.freeze({
      regionIds: Object.freeze([...this.selectionRegionIds]),
      relationIds: Object.freeze([...this.selectionRelationIds]),
    });
  }

  setSelection({ regionIds = [], relationIds = [] }) {
    const readOnlyRegions = new Set(
      this.lastScene?.representations.filter((item) => item.readOnly).map((item) => item.regionId) ?? [],
    );
    const readOnlyRelations = new Set(
      this.lastScene?.relations.filter((item) => item.readOnly).flatMap((item) => item.relationIds) ?? [],
    );
    this.selectionRegionIds = new Set(regionIds.filter((id) => !readOnlyRegions.has(id)));
    this.selectionRelationIds = new Set(relationIds.filter((id) => !readOnlyRelations.has(id)));
    this.restoreSelection(this.lastScene);
    this.emitSelection();
  }

  selectRegion(regionId) {
    this.setSelection({ regionIds: [regionId] });
  }

  setFocusMarker(regionId = null) {
    if (regionId !== null && typeof regionId !== 'string') throw new Error('focus marker regionId must be a string or null');
    this.focusMarkerRegionId = regionId;
    this.renderOverlays();
  }

  focusMarkerSnapshot() {
    return this.focusMarkerRegionId;
  }

  clearSelection() {
    this.selectionRegionIds.clear();
    this.selectionRelationIds.clear();
    this.projecting = true;
    try {
      this.graph.clearSelection();
    } finally {
      this.projecting = false;
    }
    this.emitSelection();
  }

  restoreSelection(scene) {
    if (!scene) return;
    const cells = [];
    for (const regionId of this.selectionRegionIds) {
      const visibleId = scene.selectionProxies[regionId];
      if (visibleId) cells.push(this.cellsByRegionId.get(visibleId));
    }
    for (const relationId of this.selectionRelationIds) {
      cells.push(this.edgeByRelationId.get(relationId));
    }
    this.projecting = true;
    try {
      this.graph.setSelectionCells(uniqueCells(cells));
    } finally {
      this.projecting = false;
    }
    this.pendingRelationSelection = null;
  }

  renderOverlays(scene = this.lastScene) {
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
  }

  labelContext(scene) {
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

  regionDisplayLabel(representation, scene, context) {
    return displayedRegionLabel(
      representation,
      scene.scale,
      this.theme,
      context.selectedRegionIds.has(representation.regionId),
    );
  }

  relationDisplayLabel(relation, scene, context) {
    const selected = relation.relationIds.some((id) => context.selectedRelationIds.has(id));
    return displayedRelationLabel(
      relation,
      scene.scale,
      this.theme,
      context.representationsById,
      selected,
    );
  }

  refreshRenderedLabels() {
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

  render(scene) {
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

  setTool(tool) {
    if (!['select', 'hand'].includes(tool)) throw new Error(`unknown tool: ${tool}`);
    this.tool = tool;
    const selecting = tool === 'select';
    this.graph.setCellsMovable(selecting);
    this.graph.setCellsResizable(selecting);
    this.graph.setCellsEditable(selecting);
    this.graph.setCellsSelectable(selecting);

    this.graph.getPlugin('SelectionHandler')?.setEnabled(selecting);
    this.graph.getPlugin('SelectionCellsHandler')?.setEnabled(selecting);
    this.graph.getPlugin('RubberBandHandler')?.setEnabled(selecting);
    this.graph.getPlugin('ConnectionHandler')?.setEnabled(selecting);

    const panning = this.graph.getPlugin('PanningHandler');
    panning.useLeftButtonForPanning = !selecting;
    panning.ignoreCell = !selecting;
    this.container.dataset.tool = tool;
  }

  cancelInteraction() {
    this.graph.stopEditing(true);
    this.graph.getPlugin('ConnectionHandler')?.reset();
    this.graph.getPlugin('SelectionHandler')?.reset();
    this.graph.getPlugin('SelectionCellsHandler')?.reset();
    this.graph.getPlugin('RubberBandHandler')?.reset();
    this.graph.getPlugin('PanningHandler')?.reset();
  }

  isEditableTouchTarget(clientX, clientY, target = null) {
    if (this.tool !== 'select') return false;
    if (target?.tagName?.toLowerCase() === 'image') return true;
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cell = this.graph.getCellAt(x, y, null, true, false);
    if (cell?.semantic?.activation) return true;
    if (cell?.semantic?.type === 'region' && !cell.semantic.readOnly && (cell.semantic.mode !== 'boundary' || cell.semantic.labelEditable)) return true;
    for (const selected of this.graph.getSelectionCells()) {
      const state = this.graph.getView().getState(selected);
      if (!state || !selected.isVertex()) continue;
      const margin = 28;
      if (
        x >= state.x - margin && x <= state.x + state.width + margin
        && y >= state.y - margin && y <= state.y + state.height + margin
      ) return true;
    }
    return false;
  }

  deleteSelection() {
    const selection = this.selectionSnapshot();
    if (!selection.regionIds.length && !selection.relationIds.length) return null;
    return this.submitOperation({
      type: 'RemoveSelection',
      regionIds: selection.regionIds,
      relationIds: selection.relationIds,
    });
  }

  startEditingSelection() {
    const selectedIds = [...this.selectionRegionIds];
    if (selectedIds.length !== 1) return false;
    const cell = this.cellsByRegionId.get(selectedIds[0]);
    if (cell?.semantic?.type !== 'region' || !cell.semantic.labelEditable || cell.semantic.readOnly) return false;
    this.graph.startEditingAtCell(cell);
    return true;
  }

  setNativePinchEnabled(enabled) {
    this.graph.getPlugin('PanningHandler')?.setPinchEnabled(enabled);
  }

  setCamera(scale, translateX, translateY) {
    if (this.cameraPreview) this.cancelCameraPreview();
    this.graph.getView().scaleAndTranslate(scale, translateX, translateY);
  }

  camera() {
    const view = this.graph.getView();
    return {
      scale: view.scale,
      translateX: view.translate.x,
      translateY: view.translate.y,
    };
  }

  // Touch gestures transform the already rendered SVG. The semantic camera,
  // projection and maxGraph model are committed once when the gesture ends.
  beginCameraPreview() {
    if (this.cameraPreview) return { ...this.cameraPreview.camera };
    this.graph.panGraph(0, 0);
    const canvas = this.graph.getView().getCanvas();
    const camera = this.camera();
    this.cameraPreview = {
      base: { ...camera },
      camera: { ...camera },
      canvas,
      canvasTransform: canvas?.style.transform ?? '',
      canvasTransformBox: canvas?.style.transformBox ?? '',
      canvasTransformOrigin: canvas?.style.transformOrigin ?? '',
      canvasWillChange: canvas?.style.willChange ?? '',
      overlayTransform: this.overlayRoot?.style.transform ?? '',
      overlayTransformBox: this.overlayRoot?.style.transformBox ?? '',
      overlayTransformOrigin: this.overlayRoot?.style.transformOrigin ?? '',
      overlayWillChange: this.overlayRoot?.style.willChange ?? '',
      frame: 0,
    };
    this.container.dataset.cameraPreview = 'true';
    return { ...camera };
  }

  previewCamera(scale, translateX, translateY) {
    if (!this.cameraPreview) this.beginCameraPreview();
    this.cameraPreview.camera = { scale, translateX, translateY };
    if (!this.cameraPreview.frame) {
      this.cameraPreview.frame = requestAnimationFrame(() => {
        if (!this.cameraPreview) return;
        this.cameraPreview.frame = 0;
        this.applyCameraPreview();
      });
    }
    return { ...this.cameraPreview.camera };
  }

  applyCameraPreview() {
    const preview = this.cameraPreview;
    if (!preview) return;
    const ratio = preview.camera.scale / preview.base.scale;
    const dx = preview.camera.scale * (preview.camera.translateX - preview.base.translateX);
    const dy = preview.camera.scale * (preview.camera.translateY - preview.base.translateY);
    const matrix = `matrix(${ratio}, 0, 0, ${ratio}, ${dx}, ${dy})`;
    for (const node of [preview.canvas, this.overlayRoot]) {
      if (!node) continue;
      node.style.transformBox = 'view-box';
      node.style.transformOrigin = '0 0';
      node.style.willChange = 'transform';
      node.style.transform = matrix;
    }
  }

  clearCameraPreview() {
    const preview = this.cameraPreview;
    if (!preview) return null;
    if (preview.frame) cancelAnimationFrame(preview.frame);
    if (preview.canvas) {
      preview.canvas.style.transform = preview.canvasTransform;
      preview.canvas.style.transformBox = preview.canvasTransformBox;
      preview.canvas.style.transformOrigin = preview.canvasTransformOrigin;
      preview.canvas.style.willChange = preview.canvasWillChange;
    }
    if (this.overlayRoot) {
      this.overlayRoot.style.transform = preview.overlayTransform;
      this.overlayRoot.style.transformBox = preview.overlayTransformBox;
      this.overlayRoot.style.transformOrigin = preview.overlayTransformOrigin;
      this.overlayRoot.style.willChange = preview.overlayWillChange;
    }
    delete this.container.dataset.cameraPreview;
    this.cameraPreview = null;
    return { ...preview.camera };
  }

  commitCameraPreview() {
    const preview = this.cameraPreview;
    if (!preview) return false;
    const base = preview.base;
    const camera = this.clearCameraPreview();
    const changed = camera.scale !== base.scale
      || camera.translateX !== base.translateX
      || camera.translateY !== base.translateY;
    if (changed) this.setCamera(camera.scale, camera.translateX, camera.translateY);
    return changed;
  }

  cancelCameraPreview() {
    return Boolean(this.clearCameraPreview());
  }

  cameraPreviewSnapshot() {
    if (!this.cameraPreview) return Object.freeze({ active: false, camera: null });
    return Object.freeze({ active: true, camera: { ...this.cameraPreview.camera } });
  }

  viewport() {
    const { scale, translateX, translateY } = this.camera();
    const { clientWidth, clientHeight } = this.graph.getContainer();
    return {
      x: -translateX,
      y: -translateY,
      width: clientWidth / scale,
      height: clientHeight / scale,
    };
  }

  onCameraChange(listener) {
    const view = this.graph.getView();
    view.addListener(InternalEvent.SCALE, listener);
    view.addListener(InternalEvent.TRANSLATE, listener);
    view.addListener(InternalEvent.SCALE_AND_TRANSLATE, listener);
  }
}
