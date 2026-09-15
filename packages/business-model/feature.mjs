const semanticStyles = Object.freeze([
  'packages/semantic-map/feature.css',
  'packages/semantic-map/authoring/styles/handoff.css',
  'packages/semantic-map/authoring/styles/review.css',
]);

const descriptors = Object.freeze({
  graph: Object.freeze({
    id: 'graph',
    label: 'graph',
    entry: 'packages/business-model/semantic-feature-runtime.mjs',
    styles: semanticStyles,
    input: 'presentation',
  }),
  seq: Object.freeze({
    id: 'seq',
    label: 'seq',
    entry: 'packages/business-model/semantic-feature-runtime.mjs',
    styles: semanticStyles,
    input: 'presentation',
  }),
});

export const featureIds = Object.freeze(['graph', 'seq']);
export const getFeature = (id, variant = null) => {
  if (variant !== null) throw new Error(`business-model-feature: unsupported variant ${String(variant)}`);
  const descriptor = descriptors[id];
  if (!descriptor) throw new Error(`business-model-feature: unsupported feature ${String(id)}`);
  return descriptor;
};

const requestedId = new URL(import.meta.url).searchParams.get('feature');
export const feature = requestedId === null ? null : getFeature(requestedId);
