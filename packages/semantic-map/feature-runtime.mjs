import { createSemanticMap, parseSemanticMapRecords } from './domain/index.js';
import { SemanticProjector } from './projection/index.js';
import { defaultViewForPattern } from './protocol/index.js';
import { createMaxGraphAdapter } from './renderer-maxgraph/index.js';

const patterns = Object.freeze({ graph: 'graph/1', map: 'map/1', seq: 'seq/1' });
const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-feature: ${message}`); };
const frame = scope => new Promise(resolve => scope.requestAnimationFrame(() => resolve()));

export const mountFeature = async ({ feature, input, root, scope = globalThis }) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(typeof input === 'string', 'raw JSONL text is required');
  const pattern = patterns[feature?.id];
  invariant(pattern, `unsupported feature ${String(feature?.id)}`);

  const records = parseSemanticMapRecords(input);
  const domain = createSemanticMap(records);
  const view = defaultViewForPattern(pattern);
  const surface = scope.document.createElement('div');
  surface.className = 'semantic-map-feature';
  surface.dataset.feature = feature.id;
  root.replaceChildren(surface);
  await frame(scope);

  const adapter = createMaxGraphAdapter(surface);
  adapter.setTool('hand');
  const projector = new SemanticProjector(domain, null, view);
  const project = () => projector.project({ scale: adapter.camera().scale, viewport: adapter.viewport() });
  let scene = project();
  adapter.render(scene);

  const width = Math.max(1, surface.clientWidth);
  const height = Math.max(1, surface.clientHeight);
  const bounds = scene.bounds;
  const scale = Math.max(0.01, Math.min(
    1,
    Math.max(1, width - 48) / Math.max(1, bounds.width),
    Math.max(1, height - 48) / Math.max(1, bounds.height),
  ));
  const translateX = width / (2 * scale) - (bounds.x + bounds.width / 2);
  const translateY = height / (2 * scale) - (bounds.y + bounds.height / 2);
  adapter.setCamera(scale, translateX, translateY);
  scene = project();
  adapter.render(scene);

  const svg = Boolean(surface.querySelector('svg'));
  invariant(svg, 'rendered SVG is missing');
  return Object.freeze({
    schema: 'semantic-map-feature-receipt/1',
    feature: feature.id,
    pattern: scene.pattern,
    records: records.length,
    svg,
  });
};
