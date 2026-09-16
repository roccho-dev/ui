import { createControlCatalog } from '../a2ui-browser/src/catalog/control.mjs';
import { connectControl, parseClaims, parseControl } from './src/control-graph.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`control-model: ${message}`); };
const cleanRecords = records => records.map(record => JSON.parse(JSON.stringify(record)));

export const createFeaturePlan = async ({ design, input }) => {
  invariant(design.app === 'control', 'control design required');
  invariant(typeof input.control === 'string' && input.control.trim(), 'control.jsonl input required');
  const control = parseControl(input.control);
  connectControl(control);

  const claimsProvided = Object.hasOwn(input, 'claims');
  if (claimsProvided) invariant(typeof input.claims === 'string', 'claims.jsonl input must be a string when provided');
  const claims = claimsProvided ? parseClaims(input.claims, control) : [];
  const summary = Object.freeze({
    claims: claimsProvided ? `${claims.length} / ${control.length} reported` : 'not provided',
  });

  const [createSurface, ...projection] = design.messages;
  const messages = Object.freeze([
    createSurface,
    { version: createSurface.version, updateDataModel: { surfaceId: design.surfaceId, path: '/control', value: cleanRecords(control) } },
    { version: createSurface.version, updateDataModel: { surfaceId: design.surfaceId, path: '/claims', value: cleanRecords(claims) } },
    { version: createSurface.version, updateDataModel: { surfaceId: design.surfaceId, path: '/summary', value: summary } },
    ...projection,
  ]);
  return Object.freeze({
    catalog: createControlCatalog({ id: design.catalogId }),
    messages,
    schema: 'ui-control-runtime/3',
    read: ({ runtime }) => Object.freeze({
      control: input.control,
      ...(claimsProvided ? { claims: input.claims } : {}),
      runtime: runtime.read(),
    }),
  });
};
