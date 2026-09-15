export const resolveFeature = id => {
  if (id !== 'control') throw new Error(`control-feature: unsupported feature ${String(id)}`);
  return Object.freeze({
    id: 'control',
    label: 'control',
    entry: 'packages/control/render.mjs',
    styles: Object.freeze(['packages/control/styles.css']),
  });
};

export const feature = resolveFeature('control');
