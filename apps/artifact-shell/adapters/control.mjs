export const createAdapter = () => Object.freeze({
  featureModule: 'packages/control/feature.mjs',
  id: 'control',
  kind: 'feature',
  label: 'control',
  source: Object.freeze({
    control: 'examples/control/control.jsonl',
    claims: 'examples/control/claims.jsonl',
  }),
});
