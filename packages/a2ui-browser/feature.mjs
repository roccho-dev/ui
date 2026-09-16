const descriptors = Object.freeze({
  control: Object.freeze({
    id: 'control',
    label: 'control',
    entry: 'packages/a2ui-browser/src/feature-app.mjs',
    plan: 'packages/control/model.mjs',
    styles: Object.freeze([]),
    input: Object.freeze(['design', 'control', 'claims']),
  }),
  presentation: Object.freeze({
    id: 'presentation',
    label: 'presentation',
    entry: 'packages/a2ui-browser/src/feature-app.mjs',
    plan: 'packages/presentation/model.mjs',
    styles: Object.freeze(['packages/semantic-map/feature.css']),
    input: Object.freeze(['design', 'presentation']),
  }),
});

export const featureIds = Object.freeze(['control', 'presentation']);
export const getFeature = (id, variant = null) => {
  if (variant !== null) throw new Error(`a2ui-app-feature: unsupported variant ${String(variant)}`);
  const descriptor = descriptors[id];
  if (!descriptor) throw new Error(`a2ui-app-feature: unsupported feature ${String(id)}`);
  return descriptor;
};

const requestedId = new URL(import.meta.url).searchParams.get('feature');
export const feature = requestedId === null ? null : getFeature(requestedId);
