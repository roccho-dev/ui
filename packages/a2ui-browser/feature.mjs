const id = new URL(import.meta.url).searchParams.get('feature');

const plans = Object.freeze({
  control: 'packages/control/model.mjs',
  presentation: 'packages/presentation/model.mjs',
});

const plan = plans[id];
if (!plan) throw new Error(`a2ui-app-feature: unsupported feature ${String(id)}`);

export const feature = Object.freeze({
  id,
  label: id,
  entry: 'packages/a2ui-browser/src/feature-app.mjs',
  plan,
  styles: Object.freeze(id === 'presentation' ? ['packages/semantic-map/feature.css'] : []),
});
