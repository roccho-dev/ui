const PALETTES = Object.freeze([
  Object.freeze(['#eff6ff', '#4f82bd']),
  Object.freeze(['#f5f3ff', '#8065bd']),
  Object.freeze(['#ecfdf5', '#3a9d75']),
  Object.freeze(['#fff7ed', '#d17834']),
  Object.freeze(['#fdf2f8', '#ba5e8a']),
  Object.freeze(['#f8fafc', '#64748b']),
]);

export const DEFAULT_THEME = Object.freeze({
  palettes: PALETTES,
  vertex: Object.freeze({
    font: '#1f2937',
    strokeWidth: 1.6,
    fontSize: 13,
    deepFontSize: 10,
    deepFontFromDepth: 3,
    fontStyle: 1,
    linkFontStyle: 5,
    shadow: false,
    align: 'center',
    verticalAlign: 'middle',
    whiteSpace: 'wrap',
    overflow: 'hidden',
    boundaryStrokeWidth: 1.4,
    boundaryOpacity: 58,
    boundaryArcSize: 10,
    boundarySpacingTop: 9,
    boundarySpacingLeft: 10,
    boundaryFill: 'none',
    boundaryShadow: false,
    laneFillOpacity: 28,
    laneStrokeOpacity: 72,
    mapArcSize: 12,
    graphArcSize: 8,
    graphShapeSpacing: 12,
    sequenceArcSize: 8,
    messageArcSize: 50,
    intervalArcSize: 4,
    messageShadow: false,
    intervalShadow: false,
  }),
  edge: Object.freeze({
    stroke: '#697586',
    font: '#53606c',
    labelBackground: '#ffffff',
    labelBorder: '#e2e8f0',
    strokeWidth: 1.35,
    fontSize: 10,
    directedArrow: 'classic',
    undirectedArrow: 'none',
    lines: Object.freeze({
      message: Object.freeze({ stroke: '#697586', width: 1.35, dashed: true, rounded: false }),
      'chart-line': Object.freeze({ stroke: '#334155', width: 2.6, dashed: false, rounded: true }),
      'map-road-major': Object.freeze({ stroke: '#d28a2e', width: 4.2, dashed: false, rounded: true }),
      'map-road': Object.freeze({ stroke: '#8795a5', width: 2.8, dashed: false, rounded: true }),
      'map-path': Object.freeze({ stroke: '#84906b', width: 1.5, dashed: true, rounded: true }),
      'map-building': Object.freeze({ stroke: '#59636f', width: 1.3, dashed: false, rounded: false }),
      'map-distance': Object.freeze({ stroke: '#5b5fc7', width: 2.1, dashed: true, rounded: false }),
    }),
    defaultDashed: false,
    defaultRounded: true,
  }),
  geo: Object.freeze({
    portalFillOpacity: 14,
    portalStrokeOpacity: 88,
    portalStrokeWidth: 2,
    portalArcSize: 14,
    attributionFontSize: 9,
  }),
  selection: Object.freeze({
    stroke: '#5969c5',
    fill: '#a6b1ef',
    strokeWidth: 1.5,
    dashed: false,
  }),
  focusMarker: Object.freeze({
    fill: '#111827',
    outline: '#ffffff',
    outlineWidth: 2,
    regionFill: '#111827',
    regionFillOpacity: 0.06,
    regionStroke: '#111827',
    regionStrokeWidth: 2,
    size: 16,
    radius: 2,
  }),
  handle: Object.freeze({
    fill: '#ffffff',
    stroke: '#5969c5',
    fineSize: 8,
    coarseSize: 14,
  }),
  terrain: Object.freeze({
    fillOpacity: 0.34,
    strokeOpacity: 0.32,
    strokeWidth: 1,
  }),
  set: Object.freeze({
    fill: 'none',
    strokeOpacity: 0.72,
    completeStrokeWidth: 3,
    incompleteStrokeWidth: 2,
    completeDash: 'none',
    incompleteDash: '8 6',
    cornerMin: 8,
    cornerMax: 28,
    cornerFactor: 0.18,
  }),
  connect: Object.freeze({
    fill: '#ffffff',
    stroke: '#5969c5',
    size: 24,
    strokeWidth: 2,
  }),
});

function stableIndex(value, length) {
  let hash = 0;
  for (const character of String(value ?? '')) hash = (Math.imul(hash, 31) + character.codePointAt(0)) | 0;
  return Math.abs(hash) % length;
}

// Keep screen-space visual sizes stable without rewriting every maxGraph style
// for insignificant camera changes. Half-octave buckets cap the visual jump at
// sqrt(2) while replacing continuous zoom-dependent style churn.
export function styleScaleFor(cameraScale) {
  if (!(typeof cameraScale === 'number' && Number.isFinite(cameraScale) && cameraScale > 0)) {
    throw new Error('renderer theme: cameraScale must be positive');
  }
  return 2 ** (Math.round(Math.log2(cameraScale) * 2) / 2);
}

export function paletteFor(theme, key) {
  return theme.palettes[stableIndex(key, theme.palettes.length)];
}

export function connectIcon(theme) {
  const { fill, stroke, size, strokeWidth } = theme.connect;
  return `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
  <path d="M7 12h8m-3.5-3.5L15 12l-3.5 3.5" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`)}`;
}
