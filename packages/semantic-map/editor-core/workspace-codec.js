import { canonicalClone } from '../domain/canonical-json.js';
import { createSemanticMap } from '../domain/semantic-map.js';

export const WORKSPACE_SCHEMA = 'semantic-map-workspace/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`workspace-codec: ${message}`);
}

function plain(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value;
}

function selection(value = {}) {
  plain(value, 'layout.selection');
  const regionIds = Array.isArray(value.regionIds) ? [...value.regionIds] : [];
  const relationIds = Array.isArray(value.relationIds) ? [...value.relationIds] : [];
  invariant(regionIds.every((id) => typeof id === 'string'), 'layout.selection.regionIds must be strings');
  invariant(relationIds.every((id) => typeof id === 'string'), 'layout.selection.relationIds must be strings');
  return Object.freeze({ regionIds: Object.freeze(regionIds), relationIds: Object.freeze(relationIds) });
}

export function normalizeWorkspace(input) {
  const value = plain(input, 'workspace');
  invariant(value.schema === WORKSPACE_SCHEMA, `schema must be ${WORKSPACE_SCHEMA}`);
  const document = plain(value.document, 'document');
  invariant(Array.isArray(document.records), 'document.records must be an array');
  createSemanticMap(structuredClone(document.records));
  const layout = plain(value.layout ?? {}, 'layout');
  return Object.freeze({
    schema: WORKSPACE_SCHEMA,
    document: Object.freeze({ records: Object.freeze(canonicalClone(document.records).map(Object.freeze)) }),
    layout: Object.freeze({
      selection: selection(layout.selection),
      frame: layout.frame == null ? null : canonicalClone(layout.frame),
    }),
  });
}

export function createWorkspace(records, { selection: currentSelection = {}, frame = null } = {}) {
  return normalizeWorkspace({
    schema: WORKSPACE_SCHEMA,
    document: { records: canonicalClone(records) },
    layout: { selection: currentSelection, frame },
  });
}

export function workspaceBytes(input) {
  const normalized = normalizeWorkspace(input);
  return new TextEncoder().encode(`${JSON.stringify(normalized)}\n`);
}
