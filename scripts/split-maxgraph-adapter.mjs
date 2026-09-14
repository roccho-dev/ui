import fs from 'node:fs/promises';

const path = 'packages/semantic-map/renderer-maxgraph/adapter.js';
let source = await fs.readFile(path, 'utf8');

if (source.includes("from './render-methods.js'")) {
  console.log('maxGraph adapter responsibilities already split');
  process.exit(0);
}

const slice = (from, to, label) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`${label} boundary not found`);
  return source.slice(start, end);
};
const remove = (block, label) => {
  const count = source.split(block).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one block, found ${count}`);
  source = source.replace(block, '');
};
const replaceOne = (from, to, label) => {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(from, to);
};

const labelsBlock = slice('function fontSizeForRepresentation', 'const createSemanticGraph', 'labels');
const graphBlock = slice('const createSemanticGraph', 'function vertexStyle', 'semantic graph');
const stylesBlock = slice('function vertexStyle', 'function geometryEquals', 'styles');
const geometryBlock = slice('function geometryEquals', 'function uniqueCells', 'geometry helper');
const relationKeyBlock = slice('function relationProjectionKey', "const REVIEW_OVERLAY_SCHEMA", 'relation key helper');
const reviewBlock = slice("const REVIEW_OVERLAY_SCHEMA", 'function initializeMaxGraphAdapter', 'review overlay');
let renderBlock = slice('function renderOverlays', 'function setTool', 'render methods');
const cameraBlock = slice('function setNativePinchEnabled', 'const maxGraphAdapterMethods', 'camera methods');

const labels = labelsBlock
  .replace('function displayedRegionLabel(', 'export function displayedRegionLabel(')
  .replace('function displayedRelationLabel(', 'export function displayedRelationLabel(');
await fs.writeFile('packages/semantic-map/renderer-maxgraph/labels.js', labels);

const graph = `import { BaseGraph } from '../vendor/maxgraph/view/BaseGraph.js';\nimport { ShapeRegistry } from '../vendor/maxgraph/view/shape/ShapeRegistry.js';\nimport { DiamondShape, ParallelogramShape, SectorShape } from './shapes.js';\n\n${graphBlock.replace('const createSemanticGraph', 'export const createSemanticGraph')}`;
await fs.writeFile('packages/semantic-map/renderer-maxgraph/create-semantic-graph.js', graph);

const styles = `import { paletteFor } from './theme.js';\n\n${stylesBlock
  .replace('function vertexStyle(', 'export function vertexStyle(')
  .replace('function edgeStyle(', 'export function edgeStyle(')}`;
await fs.writeFile('packages/semantic-map/renderer-maxgraph/styles.js', styles);

const review = `${reviewBlock.replace('function appendReviewOverlay(', 'export function appendReviewOverlay(')}\nexport function assertReviewOverlay(overlay) {\n  if (overlay?.schema !== REVIEW_OVERLAY_SCHEMA) throw new Error('review overlay schema is invalid');\n  if (overlay.authority !== false || overlay.status !== 'proposal') {\n    throw new Error('review overlay must remain a non-authority Proposal');\n  }\n  if (!Array.isArray(overlay.regions) || !Array.isArray(overlay.relations)) {\n    throw new Error('review overlay regions and relations are required');\n  }\n  for (const item of [...overlay.regions, ...overlay.relations]) {\n    if (!REVIEW_STATUSES.has(item.status)) throw new Error(\`review overlay status is invalid: \${item.status}\`);\n  }\n}\n`;
await fs.writeFile('packages/semantic-map/renderer-maxgraph/review-overlay.js', review);

renderBlock = renderBlock.replace(
  `function setReviewOverlay(overlay) {\n  if (overlay === null) return this.clearReviewOverlay();\n  if (overlay?.schema !== REVIEW_OVERLAY_SCHEMA) throw new Error('review overlay schema is invalid');\n  if (overlay.authority !== false || overlay.status !== 'proposal') {\n    throw new Error('review overlay must remain a non-authority Proposal');\n  }\n  if (!Array.isArray(overlay.regions) || !Array.isArray(overlay.relations)) {\n    throw new Error('review overlay regions and relations are required');\n  }\n  for (const item of [...overlay.regions, ...overlay.relations]) {\n    if (!REVIEW_STATUSES.has(item.status)) throw new Error(\`review overlay status is invalid: \${item.status}\`);\n  }`,
  `function setReviewOverlay(overlay) {\n  if (overlay === null) return this.clearReviewOverlay();\n  assertReviewOverlay(overlay);`,
);
const render = `import { renderResourceTarget } from '../renderer-resource-dom/index.js';\nimport { displayedRegionLabel, displayedRelationLabel } from './labels.js';\nimport { appendReviewOverlay, assertReviewOverlay } from './review-overlay.js';\nimport { edgeStyle, vertexStyle } from './styles.js';\nimport { paletteFor, styleScaleFor } from './theme.js';\n\n${geometryBlock}${relationKeyBlock}${renderBlock}\nexport const renderMethods = Object.freeze({\n  renderOverlays,\n  setReviewOverlay,\n  clearReviewOverlay,\n  reviewOverlaySnapshot,\n  labelContext,\n  regionDisplayLabel,\n  relationDisplayLabel,\n  refreshRenderedLabels,\n  render,\n});\n`;
await fs.writeFile('packages/semantic-map/renderer-maxgraph/render-methods.js', render);

const cameraNames = [
  'setNativePinchEnabled', 'setCamera', 'camera', 'beginCameraPreview', 'previewCamera',
  'applyCameraPreview', 'clearCameraPreview', 'commitCameraPreview', 'cancelCameraPreview',
  'cameraPreviewSnapshot', 'viewport', 'onCameraChange',
];
const camera = `import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';\n\n${cameraBlock}\nexport const cameraMethods = Object.freeze({\n${cameraNames.map(name => `  ${name},`).join('\n')}\n});\n`;
await fs.writeFile('packages/semantic-map/renderer-maxgraph/camera-methods.js', camera);

remove(labelsBlock, 'labels');
remove(graphBlock, 'semantic graph');
remove(stylesBlock, 'styles');
remove(geometryBlock, 'geometry helper');
remove(relationKeyBlock, 'relation key helper');
remove(reviewBlock, 'review overlay');
remove(slice('function renderOverlays', 'function setTool', 'render methods after helper removal'), 'render methods');
remove(cameraBlock, 'camera methods');

replaceOne("import { BaseGraph } from '../vendor/maxgraph/view/BaseGraph.js';\n", '', 'BaseGraph import');
replaceOne("import { ShapeRegistry } from '../vendor/maxgraph/view/shape/ShapeRegistry.js';\n", '', 'ShapeRegistry import');
replaceOne("import { DiamondShape, ParallelogramShape, SectorShape } from './shapes.js';\n", '', 'shape import');
replaceOne("import { DEFAULT_THEME, connectIcon, paletteFor, styleScaleFor } from './theme.js';", "import { DEFAULT_THEME, connectIcon } from './theme.js';", 'theme import');
replaceOne("import { renderResourceTarget } from '../renderer-resource-dom/index.js';\n", '', 'resource renderer import');
replaceOne(
  "import { DEFAULT_THEME, connectIcon } from './theme.js';\n",
  "import { DEFAULT_THEME, connectIcon } from './theme.js';\nimport { cameraMethods } from './camera-methods.js';\nimport { createSemanticGraph } from './create-semantic-graph.js';\nimport { renderMethods } from './render-methods.js';\n",
  'split imports',
);

replaceOne(
  `  renderOverlays,\n  setReviewOverlay,\n  clearReviewOverlay,\n  reviewOverlaySnapshot,\n  labelContext,\n  regionDisplayLabel,\n  relationDisplayLabel,\n  refreshRenderedLabels,\n  render,\n`,
  '  ...renderMethods,\n',
  'render method registry',
);
replaceOne(
  `${cameraNames.map(name => `  ${name},`).join('\n')}\n`,
  '  ...cameraMethods,\n',
  'camera method registry',
);

if (/\b(?:displayedRegionLabel|displayedRelationLabel|vertexStyle|edgeStyle|appendReviewOverlay|REVIEW_OVERLAY_SCHEMA|REVIEW_STATUSES)\b/u.test(source)) {
  throw new Error('render-only symbol survived in adapter');
}
if (/\b(?:BaseGraph|ShapeRegistry|DiamondShape|ParallelogramShape|SectorShape)\b/u.test(source)) {
  throw new Error('graph-type symbol survived in adapter');
}
await fs.writeFile(path, source);

console.log(JSON.stringify({
  schema: 'maxgraph-responsibility-split/1',
  status: 'PASS',
  modules: ['create-semantic-graph', 'labels', 'styles', 'review-overlay', 'render-methods', 'camera-methods'],
}));
