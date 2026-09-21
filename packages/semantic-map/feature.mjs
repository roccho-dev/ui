const styles = Object.freeze([
  'packages/semantic-map/feature.css',
  'packages/semantic-map/authoring/styles/handoff.css',
  'packages/semantic-map/authoring/styles/review.css',
]);
const supported = new Set(['graph', 'map', 'seq', 'chart']);
const chartVariants = Object.freeze([
  'bar-horizontal',
  'bar-vertical',
  'line',
  'pie',
  'donut',
  'scatter',
  'heatmap',
  'sunburst',
]);
const chartVariantSet = new Set(chartVariants);
const chartInput = Object.freeze({ variants: chartVariants, default: 'bar-horizontal' });

const baseFeature = id => Object.freeze({
  id,
  label: id,
  entry: 'packages/semantic-map/feature-runtime.mjs',
  styles,
  ...(id === 'map' ? { input: 'map' } : {}),
  ...(id === 'chart' ? { input: chartInput } : {}),
});

export const featureIds = Object.freeze(['map', 'chart']);
export const getFeature = (id, variant = null) => {
  if (!supported.has(id)) throw new Error(`semantic-map-feature: unsupported feature ${String(id)}`);
  const feature = baseFeature(id);
  if (variant === null) return feature;
  if (id !== 'chart' || !chartVariantSet.has(variant)) {
    throw new Error(`semantic-map-feature: unsupported ${String(id)} variant ${String(variant)}`);
  }
  return Object.freeze({
    ...feature,
    view: Object.freeze({
      pattern: 'chart/1',
      chart: Object.freeze({ type: `${variant}/1` }),
    }),
  });
};

const requestedId = new URL(import.meta.url).searchParams.get('feature');
export const feature = requestedId === null ? null : getFeature(requestedId);
