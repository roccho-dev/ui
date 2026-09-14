import { compileSemanticMap } from '../../../packages/comptime/semantic-map.mjs';

export const createAdapter = () => Object.freeze({
  compile: compileSemanticMap,
  id: 'map',
  kind: 'invocation',
  label: 'map',
  source: 'examples/map/example.json',
});
