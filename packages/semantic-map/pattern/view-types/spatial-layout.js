import { SEMANTIC_2D_SPACE } from '../../domain/index.js';

export function createMapLayout(domain) {
  const bounds = new Map();
  for (const region of domain.regions.values()) bounds.set(region.id, region.bounds);
  return Object.freeze({
    pattern: 'map/1',
    space: SEMANTIC_2D_SPACE,
    bounds,
    rootBounds: bounds.get(domain.meta.root),
    forceExpanded: new Set(),
    geometryEditable: true,
  });
}

export { createGraphLayout } from '../../layout/graph.js';
