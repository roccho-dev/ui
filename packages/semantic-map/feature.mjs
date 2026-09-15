const id = new URL(import.meta.url).searchParams.get('feature');
const supported = new Set(['graph', 'map', 'seq', 'chart']);
if (!supported.has(id)) throw new Error(`semantic-map-feature: unsupported feature ${String(id)}`);

export const feature = Object.freeze({
  id,
  label: id,
  entry: 'packages/semantic-map/feature-runtime.mjs',
  styles: Object.freeze([
    'packages/semantic-map/feature.css',
    'packages/semantic-map/authoring/styles/handoff.css',
    'packages/semantic-map/authoring/styles/review.css',
  ]),
});
