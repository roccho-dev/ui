export const feature = Object.freeze({
  id: 'graph-editor',
  label: 'graph-editor',
  entry: 'packages/graph-editor/render.mjs',
  styles: Object.freeze(['packages/graph-editor/styles.css']),
  proof: Object.freeze({ selectors: Object.freeze(['.roccho-graph-editor', '.roccho-graph-editor__canvas svg', '.roccho-graph-editor__projection li']) }),
});
