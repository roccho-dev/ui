import { TOPOLOGY_SPACE } from '../../../domain/index.js';

export const GRAPH_PATTERN = 'graph/1';
const TERMINAL_KINDS = new Set(['start', 'end', 'terminal']);
const DECISION_KINDS = new Set(['decision', 'choice', 'branch', 'merge']);
const DATA_KINDS = new Set(['input', 'output', 'data', 'document']);

export const graphViewTypeContract = Object.freeze({
  id: GRAPH_PATTERN,
  status: 'supported',
  configKey: null,
  capabilities: Object.freeze({ editable: true }),
  normalizeConfig: () => null,
  coordinateSpace: () => TOPOLOGY_SPACE,
  validateDomain: () => undefined,
  shape: (region, mode) => {
    if (mode === 'boundary') return 'boundary';
    if (TERMINAL_KINDS.has(region.kind)) return 'graph-terminal';
    if (DECISION_KINDS.has(region.kind)) return 'graph-decision';
    if (DATA_KINDS.has(region.kind)) return 'graph-data';
    return 'graph-node';
  },
  relationVisual: () => Object.freeze({ directed: true, line: 'graph' }),
  defaultView: () => Object.freeze({ pattern: GRAPH_PATTERN }),
});
