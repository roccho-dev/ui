export const feature = Object.freeze({
  id: 'presentation',
  label: 'presentation',
  entry: 'packages/presentation/render.mjs',
  styles: Object.freeze(['packages/presentation/styles.css']),
  proof: Object.freeze({ rootStatus: 'pass', selectors: Object.freeze(['#surface .profiled-app', '#seq-shell', '.seq-svg']) }),
});
