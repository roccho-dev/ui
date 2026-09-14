import { compileSemanticMap } from '../../../packages/comptime/semantic-map.mjs';

export const createAdapter = () => Object.freeze({
  compile: compileSemanticMap,
  id: 'graph',
  kind: 'invocation',
  label: 'graph',
  source: 'examples/graph/example.json',
});
