export const feature = Object.freeze({
  id: 'graph-editor',
  label: 'graph-editor',
  entry: 'packages/graph-editor/render.mjs',
  styles: Object.freeze(['packages/graph-editor/styles.css']),
  files: Object.freeze([
    'packages/graph-editor/render.mjs',
    'packages/graph-editor/styles.css',
    'packages/graph-editor/src',
    'packages/semantic-map/vendor/maxgraph',
  ]),
  proof: Object.freeze({ selectors: Object.freeze(['.roccho-graph-editor', '.roccho-graph-editor__canvas svg', '.roccho-graph-editor__projection li']) }),
});
