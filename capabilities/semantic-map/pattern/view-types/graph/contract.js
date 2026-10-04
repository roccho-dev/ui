import { TOPOLOGY_SPACE } from '../../../domain/index.js';

export const GRAPH_PATTERN = 'graph/1';
const TERMINAL_KINDS = new Set(['start', 'end', 'terminal', 'initial', 'final']);
const DECISION_KINDS = new Set(['decision', 'choice', 'branch', 'merge']);
const DATA_KINDS = new Set(['input', 'output', 'data', 'document']);
const ITEM_KINDS = new Set(['attribute', 'field', 'method']);
const UNDIRECTED_RELATION_KINDS = new Set(['association', 'relationship']);

export function isGraphItemKind(kind) {
  return ITEM_KINDS.has(kind);
}

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
  relationVisual: (relation) => Object.freeze({
    directed: !UNDIRECTED_RELATION_KINDS.has(relation.kind),
    line: 'graph',
    foreground: relation.from === relation.to,
  }),
  defaultView: () => Object.freeze({ pattern: GRAPH_PATTERN }),
});
