import { createShapeType } from './create-shape-type.js';

export const DiamondShape = createShapeType(function paintDiamond(canvas, x, y, width, height) {
  canvas.begin();
  canvas.moveTo(x + width / 2, y);
  canvas.lineTo(x + width, y + height / 2);
  canvas.lineTo(x + width / 2, y + height);
  canvas.lineTo(x, y + height / 2);
  canvas.close();
  canvas.fillAndStroke();
});
