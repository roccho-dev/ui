import { createIncrementalSurfaceRuntime } from '../a2ui-browser/src/incremental-surface.mjs';
import { createControlCatalog } from './catalog.mjs';
import { connectControl, parseClaims, parseControl } from './src/control-graph.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`control: ${message}`); };
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const cleanRecords = records => records.map(record => JSON.parse(JSON.stringify(record)));
const loadDesign = async scope => {
  const response = await scope.fetch(new URL('./design.json', import.meta.url), { cache: 'no-store', credentials: 'omit' });
  invariant(response.ok, `design.json returned ${response.status}`);
  const design = await response.json();
  invariant(design?.schema === 'ui-control-a2ui-design/1', 'design schema is invalid');
  invariant(typeof design.catalogId === 'string' && design.catalogId, 'design catalogId required');
  invariant(typeof design.surfaceId === 'string' && design.surfaceId, 'design surfaceId required');
  invariant(typeof design.rootId === 'string' && design.rootId, 'design rootId required');
  invariant(typeof design.css === 'string', 'design css required');
  invariant(Array.isArray(design.messages) && design.messages.length >= 2, 'design messages required');
  invariant(design.messages[0]?.createSurface, 'design must start with createSurface');
  return design;
};

export const mountFeature = async ({ input, root, scope = globalThis }) => {
  invariant(plainObject(input), 'input object required');
  invariant(typeof input.control === 'string' && input.control.trim(), 'control.jsonl input required');
  invariant(typeof input.claims === 'string', 'claims.jsonl input required');
  const control = parseControl(input.control);
  connectControl(control);
  const claims = parseClaims(input.claims, control);
  const design = await loadDesign(scope);
  const document = root.ownerDocument;
  document.querySelector('style[data-control-design]')?.remove();
  const style = document.createElement('style');
  style.dataset.controlDesign = design.schema;
  style.textContent = design.css;
  document.head.append(style);
  const runtime = createIncrementalSurfaceRuntime({
    catalog: createControlCatalog({ id: design.catalogId }),
    catalogId: design.catalogId,
    document,
    eventTarget: scope,
    mount: root,
    requiredRootIds: [design.rootId],
    rootId: design.rootId,
    surfaceId: design.surfaceId,
  });
  const [createSurface, ...projection] = design.messages;
  runtime.apply([
    createSurface,
    { version: createSurface.version, updateDataModel: { surfaceId: design.surfaceId, path: '/control', value: cleanRecords(control) } },
    { version: createSurface.version, updateDataModel: { surfaceId: design.surfaceId, path: '/claims', value: cleanRecords(claims) } },
    ...projection,
  ]);
  return Object.freeze({
    read: () => Object.freeze({ control: input.control, claims: input.claims, runtime: runtime.read() }),
    schema: 'ui-control-runtime/2',
  });
};
