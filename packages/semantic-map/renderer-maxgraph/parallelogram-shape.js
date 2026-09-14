import { createShapeType } from './create-shape-type.js';

export const ParallelogramShape = createShapeType(function paintParallelogram(canvas, x, y, width, height) {
  const skew = Math.min(width * 0.16, height * 0.45);
  canvas.begin();
  canvas.moveTo(x + skew, y);
  canvas.lineTo(x + width, y);
  canvas.lineTo(x + width - skew, y + height);
  canvas.lineTo(x, y + height);
  canvas.close();
  canvas.fillAndStroke();
});
