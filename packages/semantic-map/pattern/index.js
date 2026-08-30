import {
  getViewTypeContract,
  patternCapabilities as readPatternCapabilities,
  RESERVED_PATTERNS,
  SUPPORTED_PATTERNS,
  defaultViewForPattern,
} from './view-types/contracts.js';
import {
  BAR_HORIZONTAL_CHART,
  BAR_VERTICAL_CHART,
  CHART_COMBINATION_COUNT,
  CHART_PATTERN,
  CHART_TYPES,
  DONUT_CHART,
  LINE_CHART,
  MAX_CHART_ITEMS,
  MAX_CHART_LAYERS,
  PIE_CHART,
  SUNBURST_CHART,
  chartLayers,
  normalizeChartView,
} from './view-types/chart/contract.js';
import { GRAPH_PATTERN } from './view-types/graph/contract.js';
import { MAP_PATTERN } from './view-types/map/contract.js';
import {
  SEQ_AXES,
  SEQ_GROUPS,
  SEQ_ITEM_KINDS,
  SEQ_PATTERN,
  SEQ_RELATION_KINDS,
  normalizeSeqView,
  sequenceAxis,
} from './view-types/seq/contract.js';

export {
  BAR_HORIZONTAL_CHART,
  BAR_VERTICAL_CHART,
  CHART_COMBINATION_COUNT,
  CHART_PATTERN,
  CHART_TYPES,
  DONUT_CHART,
  GRAPH_PATTERN,
  LINE_CHART,
  MAP_PATTERN,
  MAX_CHART_ITEMS,
  MAX_CHART_LAYERS,
  PIE_CHART,
  SUNBURST_CHART,
  RESERVED_PATTERNS,
  SEQ_AXES,
  SEQ_GROUPS,
  SEQ_ITEM_KINDS,
  SEQ_PATTERN,
  SEQ_RELATION_KINDS,
  SUPPORTED_PATTERNS,
  chartLayers,
  defaultViewForPattern,
  normalizeChartView,
  normalizeSeqView,
  sequenceAxis,
};

export const PATTERN_MAP = MAP_PATTERN;
export const PATTERN_GRAPH = GRAPH_PATTERN;
export const PATTERN_SEQ = SEQ_PATTERN;
export const PATTERN_CHART = CHART_PATTERN;

const REPRESENTATION_MODES = new Set([
  'overview', 'boundary', 'node', 'lane', 'item', 'bar', 'point', 'slice',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-pattern: ${message}`);
}

export function normalizePattern(value) {
  return getViewTypeContract(value).id;
}

export function patternConfigKey(inputPattern) {
  return getViewTypeContract(inputPattern).configKey;
}

export function normalizePatternConfig(inputPattern, config = null) {
  const definition = getViewTypeContract(inputPattern);
  return definition.configKey === null ? null : definition.normalizeConfig(config);
}

export function coordinateSpaceForPattern(inputPattern, config = null) {
  const definition = getViewTypeContract(inputPattern);
  return definition.coordinateSpace(definition.configKey === null ? null : definition.normalizeConfig(config));
}

export function shapeForPattern(inputPattern, region, mode) {
  const definition = getViewTypeContract(inputPattern);
  invariant(region && typeof region === 'object', 'Region is required for Scene shape');
  invariant(REPRESENTATION_MODES.has(mode), `unsupported representation mode ${mode}`);
  return definition.shape(region, mode);
}

export function relationVisualForPattern(inputPattern, relation) {
  const definition = getViewTypeContract(inputPattern);
  invariant(relation && typeof relation === 'object', 'Relation is required for Scene relation visual');
  return definition.relationVisual(relation);
}

export function validatePatternDomain(domain, inputPattern, config = null) {
  const definition = getViewTypeContract(inputPattern);
  invariant(domain && domain.meta && domain.regions && domain.children && domain.relations, 'Domain is required');
  const normalized = definition.configKey === null ? null : definition.normalizeConfig(config);
  definition.validateDomain(domain, normalized);
  return definition.id;
}

export function patternCapabilities(inputPattern) {
  return readPatternCapabilities(inputPattern);
}

export { createMapLayout, createGraphLayout } from './view-types/spatial-layout.js';
export { createSeqLayout } from './view-types/seq/layout.js';
export { createChartLayout } from './view-types/chart/layout.js';
export { getViewTypeProjection, viewTypeRegistryManifest } from './view-types/registry.js';
