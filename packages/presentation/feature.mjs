export const feature = Object.freeze({
  id: 'presentation',
  label: 'presentation',
  entry: 'packages/presentation/render.mjs',
  styles: Object.freeze(['packages/presentation/styles.css']),
  files: Object.freeze([
    'packages/presentation/render.mjs',
    'packages/presentation/styles.css',
    'packages/presentation/compiler',
    'packages/a2ui-browser/src',
  ]),
  proof: Object.freeze({ rootStatus: 'pass', selectors: Object.freeze(['#surface .profiled-app', '#seq-shell', '.seq-svg']) }),
});
