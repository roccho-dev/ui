import { compileControl } from '../../../packages/comptime/control.mjs';

export const createAdapter = () => Object.freeze({
  compile: compileControl,
  featureModule: 'packages/control/feature.mjs',
  id: 'control',
  kind: 'feature',
  label: 'control',
  source: 'examples/control/example.jsonl',
});
