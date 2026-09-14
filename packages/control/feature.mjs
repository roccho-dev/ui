export const feature = Object.freeze({
  id: 'control',
  label: 'control',
  entry: 'packages/control/render.mjs',
  styles: Object.freeze(['packages/control/styles.css']),
  files: Object.freeze([
    'packages/control/render.mjs',
    'packages/control/styles.css',
    'packages/control/src/control-graph.mjs',
  ]),
  proof: Object.freeze({ selectors: Object.freeze(['#tree .node']) }),
});
