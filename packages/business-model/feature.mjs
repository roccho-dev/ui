const id = new URL(import.meta.url).searchParams.get('feature');
const semanticStyles = Object.freeze([
  'packages/semantic-map/feature.css',
  'packages/semantic-map/authoring/styles/handoff.css',
  'packages/semantic-map/authoring/styles/review.css',
]);
const descriptors = Object.freeze({
  graph: Object.freeze({ entry: 'packages/business-model/semantic-feature-runtime.mjs', styles: semanticStyles }),
  seq: Object.freeze({ entry: 'packages/business-model/semantic-feature-runtime.mjs', styles: semanticStyles }),
  presentation: Object.freeze({ entry: 'packages/business-model/presentation-feature-runtime.mjs', styles: Object.freeze(['packages/presentation/styles.css', 'packages/semantic-map/feature.css']) }),
});
const descriptor = descriptors[id];
if (!descriptor) throw new Error(`business-model-feature: unsupported feature ${String(id)}`);

export const feature = Object.freeze({ id, label: id, ...descriptor });
