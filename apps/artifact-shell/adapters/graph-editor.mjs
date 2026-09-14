import { compileGraphEditor } from '../../../packages/comptime/graph-editor.mjs';

export const createAdapter = () => Object.freeze({
  compile: compileGraphEditor,
  featureModule: 'packages/graph-editor/feature.mjs',
  id: 'graph-editor',
  kind: 'feature',
  label: 'graph-editor',
  source: 'examples/graph-editor/example.json',
});
