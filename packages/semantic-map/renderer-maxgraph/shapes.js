import Shape from '../vendor/maxgraph/view/shape/Shape.js';

function finiteStyle(style, key, fallback) {
  const value = Number(style?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function pointOnEllipse(centerX, centerY, radiusX, radiusY, angleDegrees) {
  const angle = angleDegrees * Math.PI / 180;
  return Object.freeze({
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY,
  });
}

function outerArc(canvas, centerX, centerY, radiusX, radiusY, fromAngle, toAngle) {
  const delta = toAngle - fromAngle;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / 179.999));
  for (let index = 1; index <= segments; index += 1) {
    const endAngle = fromAngle + delta * index / segments;
    const end = pointOnEllipse(centerX, centerY, radiusX, radiusY, endAngle);
    canvas.arcTo(radiusX, radiusY, 0, 0, delta >= 0 ? 1 : 0, end.x, end.y);
  }
}

export class DiamondShape extends Shape {
  paintVertexShape(canvas, x, y, width, height) {
    canvas.begin();
    canvas.moveTo(x + width / 2, y);
    canvas.lineTo(x + width, y + height / 2);
    canvas.lineTo(x + width / 2, y + height);
    canvas.lineTo(x, y + height / 2);
    canvas.close();
    canvas.fillAndStroke();
  }
}

export class ParallelogramShape extends Shape {
  paintVertexShape(canvas, x, y, width, height) {
    const skew = Math.min(width * 0.16, height * 0.45);
    canvas.begin();
    canvas.moveTo(x + skew, y);
    canvas.lineTo(x + width, y);
    canvas.lineTo(x + width - skew, y + height);
    canvas.lineTo(x, y + height);
    canvas.close();
    canvas.fillAndStroke();
  }
}

// A single generic vector primitive supports both pie slices and donut arcs.
// Chart-specific semantics remain in the projector; this shape only paints
// start/end angles and an optional inner radius supplied through maxGraph style.
export class SectorShape extends Shape {
  paintVertexShape(canvas, x, y, width, height) {
    const startAngle = finiteStyle(this.style, 'sectorStartAngle', -90);
    const rawEndAngle = finiteStyle(this.style, 'sectorEndAngle', startAngle + 360);
    const endAngle = Math.max(startAngle, Math.min(startAngle + 360, rawEndAngle));
    const outerRatio = Math.max(0.01, Math.min(1, finiteStyle(this.style, 'sectorOuterRatio', 1)));
    const innerRatio = Math.max(0, Math.min(outerRatio - 0.001, finiteStyle(this.style, 'sectorInnerRatio', 0)));
    const delta = endAngle - startAngle;
    if (delta <= 0.000_001 || width <= 0 || height <= 0) return;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radiusX = width / 2 * outerRatio;
    const radiusY = height / 2 * outerRatio;
    const outerStart = pointOnEllipse(centerX, centerY, radiusX, radiusY, startAngle);

    canvas.begin();
    if (innerRatio === 0) {
      canvas.moveTo(centerX, centerY);
      canvas.lineTo(outerStart.x, outerStart.y);
      outerArc(canvas, centerX, centerY, radiusX, radiusY, startAngle, endAngle);
      canvas.lineTo(centerX, centerY);
    } else {
      const innerRadiusX = width / 2 * innerRatio;
      const innerRadiusY = height / 2 * innerRatio;
      const innerEnd = pointOnEllipse(centerX, centerY, innerRadiusX, innerRadiusY, endAngle);
      canvas.moveTo(outerStart.x, outerStart.y);
      outerArc(canvas, centerX, centerY, radiusX, radiusY, startAngle, endAngle);
      canvas.lineTo(innerEnd.x, innerEnd.y);
      outerArc(canvas, centerX, centerY, innerRadiusX, innerRadiusY, endAngle, startAngle);
    }
    canvas.close();
    canvas.fillAndStroke();
  }
}
