import fs from 'node:fs/promises';

const adapterPath = 'packages/semantic-map/renderer-maxgraph/adapter.js';
const mainPath = 'packages/semantic-map/authoring/main.js';
const indexPath = 'packages/semantic-map/renderer-maxgraph/index.js';

const replaceExact = (source, from, to, label) => {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(from, to);
};

let source = await fs.readFile(adapterPath, 'utf8');
if (!source.includes('export class MaxGraphAdapter')) {
  console.log('maxGraph adapter is already factory based');
  process.exit(0);
}

source = source
  .replace("import EllipseShape from '../vendor/maxgraph/view/shape/node/EllipseShape.js';\n", '')
  .replace("import ImageShape from '../vendor/maxgraph/view/shape/node/ImageShape.js';\n", '')
  .replace("import { EllipsePerimeter } from '../vendor/maxgraph/view/style/perimeter/EllipsePerimeter.js';\n", '')
  .replace("import { RectanglePerimeter } from '../vendor/maxgraph/view/style/perimeter/RectanglePerimeter.js';\n", '')
  .replace("import { RhombusPerimeter } from '../vendor/maxgraph/view/style/perimeter/RhombusPerimeter.js';\n", '')
  .replace("import { PerimeterRegistry } from '../vendor/maxgraph/view/style/perimeter/PerimeterRegistry.js';\n", '');

const semanticStart = source.indexOf('class SemanticGraph extends BaseGraph {');
const semanticEndMarker = '\n\nfunction vertexStyle';
const semanticEnd = source.indexOf(semanticEndMarker, semanticStart);
if (semanticStart < 0 || semanticEnd < 0) throw new Error('SemanticGraph class boundary not found');
const semanticFactory = `const createSemanticGraph = options => {\n  const graph = new BaseGraph(options);\n  ShapeRegistry.add('semanticDiamond', DiamondShape);\n  ShapeRegistry.add('semanticParallelogram', ParallelogramShape);\n  ShapeRegistry.add('semanticSector', SectorShape);\n  const getCellAt = graph.getCellAt.bind(graph);\n  graph.isToggleEvent = event => Boolean(event.shiftKey || event.ctrlKey || event.metaKey);\n  graph.isCellSelectable = cell => graph.isCellsSelectable() && (graph.getCurrentCellStyle(cell).selectable ?? true);\n  graph.getCellAt = (x, y, parent = null, vertices = true, edges = true, ignoreFn = null) => getCellAt(\n    x, y, parent, vertices, edges,\n    (state, px, py) => (\n      state.cell?.semantic?.mode === 'boundary'\n      || (state.cell?.semantic?.readOnly === true && !state.cell?.semantic?.activation)\n      || Boolean(ignoreFn?.(state, px, py))\n    ),\n  );\n  return graph;\n};`;
source = `${source.slice(0, semanticStart)}${semanticFactory}${source.slice(semanticEnd)}`;
source = replaceExact(source, 'this.graph = new SemanticGraph({', 'this.graph = createSemanticGraph({', 'SemanticGraph construction');

const classHeader = 'export class MaxGraphAdapter {';
const classStart = source.indexOf(classHeader);
if (classStart < 0) throw new Error('MaxGraphAdapter class header not found');
const classClose = source.lastIndexOf('\n}');
if (classClose < classStart) throw new Error('MaxGraphAdapter class end not found');
const before = source.slice(0, classStart);
const body = source.slice(classStart + classHeader.length, classClose).replace(/^\n/, '');
const after = source.slice(classClose + 2);
const dedented = body.split('\n').map(line => line.startsWith('  ') ? line.slice(2) : line).join('\n');

const methodPattern = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
const methodNames = [...dedented.matchAll(methodPattern)].map(match => match[1]).filter(name => name !== 'constructor');
if (methodNames.length < 25) throw new Error(`MaxGraphAdapter method scan too small: ${methodNames.length}`);
if (new Set(methodNames).size !== methodNames.length) throw new Error('MaxGraphAdapter method names are duplicated');

let functions = dedented.replace(/^constructor\s*\(/m, 'function initializeMaxGraphAdapter(');
functions = functions.replace(/^async\s+([A-Za-z_$][\w$]*)\s*\(/gm, 'async function $1(');
functions = functions.replace(/^([A-Za-z_$][\w$]*)\s*\(/gm, 'function $1(');
if (/^\s*(?:get|set)\s+[A-Za-z_$]/m.test(functions)) throw new Error('accessor method requires explicit migration');

const methodObject = `\nconst maxGraphAdapterMethods = Object.freeze({\n${methodNames.map(name => `  ${name},`).join('\n')}\n});\n\nexport const createMaxGraphAdapter = (container, options = {}) => {\n  const adapter = Object.assign(Object.create(null), maxGraphAdapterMethods);\n  initializeMaxGraphAdapter.call(adapter, container, options);\n  return adapter;\n};\n`;
source = `${before}${functions}${methodObject}${after}`;
if (/\bclass\s+(?:SemanticGraph|MaxGraphAdapter)\b/.test(source)) throw new Error('first-party adapter class survived migration');
await fs.writeFile(adapterPath, source);

let main = await fs.readFile(mainPath, 'utf8');
main = replaceExact(main, "import { MaxGraphAdapter } from '../renderer-maxgraph/index.js';", "import { createMaxGraphAdapter } from '../renderer-maxgraph/index.js';", 'authoring import');
main = replaceExact(main, 'const adapter = new MaxGraphAdapter(container);', 'const adapter = createMaxGraphAdapter(container);', 'authoring construction');
await fs.writeFile(mainPath, main);

let index = await fs.readFile(indexPath, 'utf8');
index = replaceExact(index, "export { MaxGraphAdapter } from './adapter.js';", "export { createMaxGraphAdapter } from './adapter.js';", 'renderer export');
await fs.writeFile(indexPath, index);

console.log(JSON.stringify({ schema: 'maxgraph-factory-migration/1', status: 'PASS', methods: methodNames.length }));
