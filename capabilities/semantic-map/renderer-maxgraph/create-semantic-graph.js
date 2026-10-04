import { BaseGraph } from '../vendor/maxgraph/view/BaseGraph.js';
import { ShapeRegistry } from '../vendor/maxgraph/view/shape/ShapeRegistry.js';
import EllipseShape from '../vendor/maxgraph/view/shape/node/EllipseShape.js';
import { EdgeMarkerRegistry } from '../vendor/maxgraph/view/style/marker/EdgeMarkerRegistry.js';
import { createArrow } from '../vendor/maxgraph/view/style/marker/edge-markers.js';
import { PerimeterRegistry } from '../vendor/maxgraph/view/style/perimeter/PerimeterRegistry.js';
import { RectanglePerimeter } from '../vendor/maxgraph/view/style/perimeter/RectanglePerimeter.js';
import { RhombusPerimeter } from '../vendor/maxgraph/view/style/perimeter/RhombusPerimeter.js';
import { EllipsePerimeter } from '../vendor/maxgraph/view/style/perimeter/EllipsePerimeter.js';
import { DiamondShape, ParallelogramShape, SectorShape } from './shapes.js';
import { ParallelogramPerimeter } from './parallelogram-shape.js';

export const createSemanticGraph = options => {
  // BaseGraph leaves built-in registries empty; register only the primitives
  // selected by this renderer's existing styles.
  ShapeRegistry.add('ellipse', EllipseShape);
  EdgeMarkerRegistry.add('classic', createArrow(2));
  PerimeterRegistry.add('rectanglePerimeter', RectanglePerimeter);
  PerimeterRegistry.add('rhombusPerimeter', RhombusPerimeter);
  PerimeterRegistry.add('ellipsePerimeter', EllipsePerimeter);
  PerimeterRegistry.add('semanticParallelogramPerimeter', ParallelogramPerimeter);
  const graph = new BaseGraph(options);
  ShapeRegistry.add('semanticDiamond', DiamondShape);
  ShapeRegistry.add('semanticParallelogram', ParallelogramShape);
  ShapeRegistry.add('semanticSector', SectorShape);
  const getCellAt = graph.getCellAt.bind(graph);
  const getEditingValue = graph.getEditingValue.bind(graph);
  graph.getEditingValue = (cell, trigger) => cell?.semantic?.sourceLabel ?? getEditingValue(cell, trigger);
  graph.isToggleEvent = event => Boolean(event.shiftKey || event.ctrlKey || event.metaKey);
  graph.isCellSelectable = cell => graph.isCellsSelectable() && (graph.getCurrentCellStyle(cell).selectable ?? true);
  graph.getCellAt = (x, y, parent = null, vertices = true, edges = true, ignoreFn = null) => getCellAt(
    x, y, parent, vertices, edges,
    (state, px, py) => (
      state.cell?.semantic?.mode === 'boundary'
      || (state.cell?.semantic?.readOnly === true && !state.cell?.semantic?.activation)
      || Boolean(ignoreFn?.(state, px, py))
    ),
  );
  return graph;
};
