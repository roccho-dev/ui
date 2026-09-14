export { createSemanticMapEditorCore, editorDocumentBytes } from './core.js';
export {
  assertAuthorityPort,
  assertDocumentPort,
  assertSurfacePort,
  normalizeSelection,
  sameSelection,
} from './ports.js';
export {
  WORKSPACE_SCHEMA,
  createWorkspace,
  normalizeWorkspace,
  workspaceBytes,
} from './workspace-codec.js';
