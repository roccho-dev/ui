export { EditorCore } from './core.js';
export { gestureToOperation, operationToGesture } from './commands.js';
export {
  assertSurfacePort,
  claimPendingEditorCore,
  normalizeSelection,
  pendingEditorCoreCount,
  registerPendingEditorCore,
  sameSelection,
} from './ports.js';
export {
  WORKSPACE_SCHEMA,
  createWorkspace,
  normalizeWorkspace,
  workspaceBytes,
} from './workspace-codec.js';
export {
  MAX_DECISION_OPERATIONS,
  OPERATION_TYPES,
  isOperationType,
  normalizeOperation,
  normalizeOperations,
} from './operation.js';
