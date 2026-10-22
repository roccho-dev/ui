import { displayedRegionLabel, estimatedLabelWidth, fontSizeForRepresentation } from './labels.js';

const valid = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite)
  && box.width > 0 && box.height > 0;
const inside = (box, outer) => valid(box) && valid(outer) && box.x >= outer.x && box.y >= outer.y
  && box.x + box.width <= outer.x + outer.width && box.y + box.height <= outer.y + outer.height;
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height;

// Small pinned nodes can have room for a complete name beside them, within
// their containing group, even when their own text rectangle is too small.
// Reserve complete labels and node shapes before choosing that nearby space.
// If no clear space is available, keep the existing omission; do not truncate
// names or move semantic nodes/pins to manufacture a readable result.
export function planLabelCallouts(scene, theme) {
  const result = new Map();
  if (!(scene.scale > 0) || !valid(scene.viewport)) return result;
  const byId = new Map(scene.representations.map(item => [item.regionId, item]));
  const reserved = [], candidates = [], titles = [];
  const gap = 4 / scene.scale;
  const shapes = scene.representations.filter(item => valid(item.bounds) && item.mode !== 'boundary').map(item => item.bounds);
  for (const item of scene.representations) {
    if (!valid(item.bounds)) continue;
    const box = item.bounds, font = fontSizeForRepresentation(item, theme);
    // Callouts force the renderer's complete label, including data-pin markers.
    // Reserve that same string rather than just the underlying region name.
    const completeLabel = displayedRegionLabel(item, scene.scale, theme, true);
    const width = (estimatedLabelWidth(completeLabel, font) * 1.25 + 8) / scene.scale;
    const height = font * 1.6 / scene.scale;
    if (item.mode === 'boundary') {
      titles.push({ item, box: { x: box.x + theme.vertex.boundarySpacingLeft / scene.scale,
        y: box.y + theme.vertex.boundarySpacingTop / scene.scale,
        width, height } });
      continue;
    }
    reserved.push(box);
    const label = displayedRegionLabel(item, scene.scale, theme, false);
    if (label) {
      reserved.push({ x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height });
    } else if (completeLabel && !item.resource && !item.isGuide && ['graph-node', 'graph-data', 'graph-terminal', 'graph-decision'].includes(item.shape)) {
      candidates.push({ item, width, height });
    }
  }
  // A fixed screen title can overlap a child pinned just below the group's
  // top edge when zoomed out. Shift only that owned title into clear space
  // along its own top edge, retaining the complete group and child geometry.
  for (const { item, box } of titles.sort((a, b) => a.item.depth - b.item.depth || String(a.item.regionId).localeCompare(String(b.item.regionId)))) {
    const obstacles = [...shapes, ...reserved];
    const choices = [box, ...obstacles.filter(obstacle => box.y < obstacle.y + obstacle.height && obstacle.y < box.y + box.height)
      .map(obstacle => ({ ...box, x: obstacle.x + obstacle.width + gap })).sort((a, b) => a.x - b.x)];
    const placement = choices.find(candidate => inside(candidate, item.bounds) && inside(candidate, scene.viewport)
      && obstacles.every(obstacle => !overlaps(candidate, obstacle))) ?? box;
    if (placement.x !== box.x || placement.y !== box.y) result.set(item.regionId, Object.freeze(placement));
    reserved.push(placement);
  }
  for (const { item, width, height } of candidates.sort((a, b) => String(a.item.regionId).localeCompare(String(b.item.regionId)))) {
    const parent = byId.get(item.parentRegionId)?.bounds, box = item.bounds;
    if (!valid(parent)) continue;
    const choices = [
      { x: box.x + box.width + gap, y: box.y + (box.height - height) / 2, width, height },
      { x: box.x, y: box.y + box.height + gap, width, height },
      { x: box.x - width - gap, y: box.y + (box.height - height) / 2, width, height },
      { x: box.x, y: box.y - height - gap, width, height },
    ];
    const placement = choices.find(candidate => inside(candidate, parent) && inside(candidate, scene.viewport)
      && reserved.every(obstacle => !overlaps(candidate, obstacle)));
    if (!placement) continue;
    result.set(item.regionId, Object.freeze(placement));
    reserved.push(placement);
  }
  return result;
}

export function calloutTextStyle(placement, theme) {
  return { labelPosition: 'right', verticalLabelPosition: 'middle', align: 'left', verticalAlign: 'middle',
    labelWidth: placement.width, whiteSpace: 'nowrap', overflow: 'visible', spacing: 0,
    spacingTop: 0, spacingLeft: 0, spacingBottom: 0, spacingRight: 0,
    labelBackgroundColor: theme.edge.labelBackground };
}
