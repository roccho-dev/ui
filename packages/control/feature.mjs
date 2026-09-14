export const feature = Object.freeze({
  id: 'control',
  label: 'control',
  entry: 'packages/control/render.mjs',
  styles: Object.freeze(['packages/control/styles.css']),
  proof: Object.freeze({ selectors: Object.freeze(['#tree .node']) }),
});
