import { createShapeType } from './create-shape-type.js';
import Point from '../vendor/maxgraph/view/geometry/Point.js';
import { intersection } from '../vendor/maxgraph/util/mathUtils.js';

function parallelogramVertices(x, y, width, height) {
  const skew = Math.min(width * 0.16, height * 0.45);
  return [[x + skew, y], [x + width, y], [x + width - skew, y + height], [x, y + height]];
}

export const ParallelogramPerimeter = (bounds, _vertex, next, orthogonal = false) => {
  if (!next || ![bounds.x, bounds.y, bounds.width, bounds.height, next.x, next.y].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) return null;
  const center = new Point(bounds.getCenterX(), bounds.getCenterY());
  if (next.x === center.x && next.y === center.y) return null;
  let from = center;
  let to = next;
  if (orthogonal && next.y >= bounds.y && next.y <= bounds.y + bounds.height) {
    from = new Point(bounds.x, next.y);
    to = new Point(bounds.x + bounds.width, next.y);
  } else if (orthogonal && next.x >= bounds.x && next.x <= bounds.x + bounds.width) {
    from = new Point(next.x, bounds.y);
    to = new Point(next.x, bounds.y + bounds.height);
  }
  const vertices = parallelogramVertices(bounds.x, bounds.y, bounds.width, bounds.height);
  const hits = vertices.map((a, index) => {
    const b = vertices[(index + 1) % vertices.length];
    return intersection(from.x, from.y, to.x, to.y, a[0], a[1], b[0], b[1]);
  }).filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  hits.sort((a, b) => Math.hypot(a.x - next.x, a.y - next.y) - Math.hypot(b.x - next.x, b.y - next.y));
  return hits[0] ?? null;
};

export const ParallelogramShape = createShapeType(function paintParallelogram(canvas, x, y, width, height) {
  const vertices = parallelogramVertices(x, y, width, height);
  canvas.begin();
  canvas.moveTo(...vertices[0]);
  for (const point of vertices.slice(1)) canvas.lineTo(...point);
  canvas.close();
  canvas.fillAndStroke();
});
