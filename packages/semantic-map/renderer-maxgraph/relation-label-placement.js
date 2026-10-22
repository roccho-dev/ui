const valid = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite)
  && box.width > 0 && box.height > 0;
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (a, b) => a.x >= b.x && a.y >= b.y
  && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

// A render-owned text offset for short arrows. Inputs are actual renderer
// rectangles in one pixel coordinate system. Never move an endpoint or route.
// Lack of a clear finite candidate retains the default, potentially unmet view.
export function relationLabelOffset(label, obstacles, viewport, gap = 4) {
  if (!valid(label) || !valid(viewport) || !(Number.isFinite(gap) && gap >= 0)) return { x: 0, y: 0 };
  const boxes = obstacles.filter(valid);
  if (inside(label, viewport) && boxes.every(box => !overlaps(label, box))) return { x: 0, y: 0 };
  const hits = boxes.filter(box => overlaps(label, box));
  if (!hits.length) return { x: 0, y: 0 };
  const left = Math.min(...hits.map(box => box.x)), top = Math.min(...hits.map(box => box.y));
  const right = Math.max(...hits.map(box => box.x + box.width)), bottom = Math.max(...hits.map(box => box.y + box.height));
  const choices = [
    { ...label, y: top - label.height - gap },
    { ...label, y: bottom + gap },
    { ...label, x: left - label.width - gap },
    { ...label, x: right + gap },
  ].sort((a, b) => Math.hypot(a.x - label.x, a.y - label.y) - Math.hypot(b.x - label.x, b.y - label.y));
  const chosen = choices.find(box => inside(box, viewport) && boxes.every(other => !overlaps(box, other)));
  return chosen ? { x: chosen.x - label.x, y: chosen.y - label.y } : { x: 0, y: 0 };
}
