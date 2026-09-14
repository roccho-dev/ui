import { compilePresentation } from '../../../packages/comptime/presentation.mjs';

export const createAdapter = () => Object.freeze({
  compile: compilePresentation,
  featureModule: 'packages/presentation/feature.mjs',
  id: 'presentation',
  kind: 'feature',
  label: 'presentation',
  source: 'examples/presentation/2-actors.jsonl',
});
