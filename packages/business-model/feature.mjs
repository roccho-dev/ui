const id = new URL(import.meta.url).searchParams.get('feature');
const descriptors = Object.freeze({
  graph: Object.freeze({ entry: 'packages/business-model/semantic-feature-runtime.mjs', styles: Object.freeze(['packages/semantic-map/feature.css']) }),
  seq: Object.freeze({ entry: 'packages/business-model/semantic-feature-runtime.mjs', styles: Object.freeze(['packages/semantic-map/feature.css']) }),
  presentation: Object.freeze({ entry: 'packages/business-model/presentation-feature-runtime.mjs', styles: Object.freeze(['packages/presentation/styles.css', 'packages/semantic-map/feature.css']) }),
});
const descriptor = descriptors[id];
if (!descriptor) throw new Error(`business-model-feature: unsupported feature ${String(id)}`);

export const feature = Object.freeze({ id, label: id, ...descriptor });
