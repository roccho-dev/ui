import { getViewTypeProjection, normalizePattern, normalizePatternConfig, patternConfigKey } from '../pattern/index.js';

export function createPatternLayout(domain, inputPattern, config = null) {
  const pattern = normalizePattern(inputPattern);
  const definition = getViewTypeProjection(pattern);
  if (pattern === 'seq/1') throw new Error('semantic-projection: seq/1 requires explicit View.seq and createSeqLayout');
  const view = { pattern };
  const key = patternConfigKey(pattern);
  if (key !== null) view[key] = normalizePatternConfig(pattern, config);
  return definition.createPlan(domain, view);
}
