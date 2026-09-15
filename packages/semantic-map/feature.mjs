const supported = new Set(['graph', 'map', 'seq', 'chart']);

export const resolveFeature = id => {
  if (!supported.has(id)) throw new Error(`semantic-map-feature: unsupported feature ${String(id)}`);
  return Object.freeze({
    id,
    label: id,
    entry: 'packages/semantic-map/feature-runtime.mjs',
    styles: Object.freeze(['packages/semantic-map/feature.css']),
  });
};

const id = new URL(import.meta.url).searchParams.get('feature');
export const feature = id === null ? null : resolveFeature(id);
