import { SEMANTIC_2D_SPACE } from '../../../domain/index.js';

export const MAP_PATTERN = 'map/1';

const lines = Object.freeze({
  'geo-road-major': 'map-road-major',
  'geo-road': 'map-road',
  'geo-path': 'map-path',
  'geo-building-edge': 'map-building',
  'straight-distance': 'map-distance',
});

export const mapViewTypeContract = Object.freeze({
  id: MAP_PATTERN,
  status: 'supported',
  configKey: null,
  capabilities: Object.freeze({ editable: true }),
  normalizeConfig: () => null,
  coordinateSpace: () => SEMANTIC_2D_SPACE,
  validateDomain: () => undefined,
  shape: (region, mode) => {
    if (mode === 'boundary') return 'boundary';
    if (region.kind === 'map-background') return 'map-background';
    if (region.kind === 'map-control-point') return 'map-control-point';
    if (region.kind === 'map-poi') return 'map-poi';
    if (region.kind === 'map-attribution') return 'map-attribution';
    if (region.kind === 'geo-detail-portal') return 'map-portal';
    return 'map-region';
  },
  relationVisual: relation => Object.freeze({ directed: false, line: lines[relation.kind] ?? 'map' }),
  defaultView: () => Object.freeze({ pattern: MAP_PATTERN }),
});
