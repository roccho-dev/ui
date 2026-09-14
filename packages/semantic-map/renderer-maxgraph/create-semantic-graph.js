import { BaseGraph } from '../vendor/maxgraph/view/BaseGraph.js';
import { ShapeRegistry } from '../vendor/maxgraph/view/shape/ShapeRegistry.js';
import { DiamondShape, ParallelogramShape, SectorShape } from './shapes.js';

export const createSemanticGraph = options => {
  const graph = new BaseGraph(options);
  ShapeRegistry.add('semanticDiamond', DiamondShape);
  ShapeRegistry.add('semanticParallelogram', ParallelogramShape);
  ShapeRegistry.add('semanticSector', SectorShape);
  const getCellAt = graph.getCellAt.bind(graph);
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

