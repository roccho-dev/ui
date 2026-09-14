import { compileSemanticMap } from '../../../packages/comptime/semantic-map.mjs';

export const createAdapter = () => Object.freeze({
  compile: compileSemanticMap,
  id: 'seq',
  kind: 'invocation',
  label: 'seq',
  source: 'examples/seq/example.json',
});
