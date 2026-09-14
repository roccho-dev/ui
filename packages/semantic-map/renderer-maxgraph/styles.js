import { paletteFor } from './theme.js';

export function vertexStyle(representation, scale, theme) {
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
        shadow: false,
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

export function edgeStyle(relation, scale, theme) {
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

