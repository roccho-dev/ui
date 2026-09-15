const descriptors = Object.freeze({
  graph: Object.freeze({ entry: 'packages/business-model/semantic-feature-runtime.mjs', styles: Object.freeze(['packages/semantic-map/feature.css']) }),
  seq: Object.freeze({ entry: 'packages/business-model/semantic-feature-runtime.mjs', styles: Object.freeze(['packages/semantic-map/feature.css']) }),
  presentation: Object.freeze({ entry: 'packages/business-model/presentation-feature-runtime.mjs', styles: Object.freeze(['packages/presentation/styles.css', 'packages/semantic-map/feature.css']) }),
});

export const resolveFeature = id => {
  const descriptor = descriptors[id];
  if (!descriptor) throw new Error(`business-model-feature: unsupported feature ${String(id)}`);
  return Object.freeze({ id, label: id, ...descriptor });
};

const id = new URL(import.meta.url).searchParams.get('feature');
export const feature = id === null ? null : resolveFeature(id);
