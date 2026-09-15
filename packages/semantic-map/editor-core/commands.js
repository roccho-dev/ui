function invariant(condition, message) {
  if (!condition) throw new Error(`editor-command: ${message}`);
}

export const SURFACE_GESTURES = Object.freeze([
  'selection.changed',
  'relation.connect',
  'relation.reconnect',
  'camera.changed',
  'activation.requested',
]);

export function assertSurfaceGesture(gesture) {
  invariant(gesture && typeof gesture === 'object' && !Array.isArray(gesture), 'gesture is required');
  invariant(SURFACE_GESTURES.includes(gesture.type), `unsupported gesture ${String(gesture.type)}`);
  return gesture;
}

export function gestureToOperation(input) {
  const gesture = assertSurfaceGesture(input);
  switch (gesture.type) {
    case 'relation.connect': {
      const { type: _type, pattern, ...fields } = gesture;
      return {
        type: 'ConnectRegions',
        ...structuredClone(fields),
        kind: fields.kind ?? (pattern === 'seq/1' ? 'message' : 'relates'),
        label: fields.label ?? '',
      };
    }
    case 'relation.reconnect':
      return { type: 'ReconnectRelation', relationId: gesture.relationId, from: gesture.from, to: gesture.to };
    default:
      throw new Error(`editor-command: gesture ${gesture.type} is not a document edit`);
  }
}

// The DOM supplies key facts and the core's logical selection, never cells.
// Text/IME editing takes precedence over *all* editor shortcuts, including undo.
export function commandForKey(event, { selection, editing = false }) {
  if (editing || event.isComposing || event.keyCode === 229 || event.altKey) return null;
  const key = String(event.key ?? '').toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier) {
    if (key === 'z') return { type: event.shiftKey ? 'history.redo' : 'history.undo' };
    if (key === 'y') return { type: 'history.redo' };
    return null;
  }
  switch (key) {
    case 'insert':
    case 'n': return event.repeat ? null : { type: 'node.create' };
    case 'enter':
    case 'f2': return event.repeat ? null : { type: 'node.edit' };
    case 'delete':
    case 'backspace':
      return { type: 'RemoveSelection', regionIds: [...selection.regionIds], relationIds: [...selection.relationIds] };
    case 'arrowleft':
    case 'arrowright':
    case 'arrowup':
    case 'arrowdown': {
      if (!selection.regionIds.length) return null;
      const step = event.shiftKey ? 10 : 1;
      return {
        type: 'MoveRegions', regionIds: [...selection.regionIds],
        dx: key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0,
        dy: key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0,
      };
    }
    case 'o': return { type: 'link.open' };
    case 'v': return { type: 'tool.set', tool: 'select' };
    case 'h': return { type: 'tool.set', tool: 'hand' };
    case ' ': return event.repeat ? null : { type: 'tool.hold', tool: 'hand' };
    case 'escape': return { type: 'interaction.cancel' };
    default: return null;
  }
}
