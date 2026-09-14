function invariant(condition, message) {
  if (!condition) throw new Error(`editor-command: ${message}`);
}

function copyArray(value) {
  return Array.isArray(value) ? value.map((item) => structuredClone(item)) : value;
}

export function operationToGesture(operation) {
  invariant(operation && typeof operation === 'object' && !Array.isArray(operation), 'operation is required');
  const type = operation.type;
  switch (type) {
    case 'MoveRegions':
      return Object.freeze({ type: 'move-regions', regionIds: copyArray(operation.regionIds), dx: operation.dx, dy: operation.dy });
    case 'ResizeRegions':
      return Object.freeze({ type: 'resize-regions', items: copyArray(operation.items) });
    case 'PlaceTemporalRegions':
      return Object.freeze({ type: 'place-temporal-regions', axis: operation.axis, items: copyArray(operation.items) });
    case 'RenameRegion':
      return Object.freeze({ type: 'rename-region', regionId: operation.regionId, label: operation.label });
    case 'SetRegionOrder':
      return Object.freeze({ type: 'set-region-order', regionId: operation.regionId, order: operation.order });
    case 'SetRegionValue':
      return Object.freeze({ type: 'set-region-value', regionId: operation.regionId, value: structuredClone(operation.value) });
    case 'SetRegionLink':
      return Object.freeze({ type: 'set-region-link', regionId: operation.regionId, href: operation.href });
    case 'SetSetCompleteness':
      return Object.freeze({ type: 'set-set-completeness', regionId: operation.regionId, complete: operation.complete });
    case 'AddRegion': {
      const { type: _type, ...fields } = operation;
      return Object.freeze({ type: 'add-region', fields: structuredClone(fields) });
    }
    case 'ConnectRegions': {
      const { type: _type, ...fields } = operation;
      return Object.freeze({ type: 'connect-regions', fields: structuredClone(fields) });
    }
    case 'MountRegionModule':
      return Object.freeze({ type: 'mount-region-module', regionId: operation.regionId, src: operation.src });
    case 'UnmountRegionModule':
      return Object.freeze({ type: 'unmount-region-module', regionId: operation.regionId });
    case 'RemoveSelection':
      return Object.freeze({ type: 'remove-selection', regionIds: copyArray(operation.regionIds), relationIds: copyArray(operation.relationIds) });
    case 'ReconnectRelation':
      return Object.freeze({ type: 'reconnect-relation', relationId: operation.relationId, from: operation.from, to: operation.to });
    default:
      throw new Error(`editor-command: unsupported operation ${String(type)}`);
  }
}

export function gestureToOperation(gesture) {
  invariant(gesture && typeof gesture === 'object' && !Array.isArray(gesture), 'gesture is required');
  switch (gesture.type) {
    case 'move-regions':
      return { type: 'MoveRegions', regionIds: copyArray(gesture.regionIds), dx: gesture.dx, dy: gesture.dy };
    case 'resize-regions':
      return { type: 'ResizeRegions', items: copyArray(gesture.items) };
    case 'place-temporal-regions':
      return { type: 'PlaceTemporalRegions', axis: gesture.axis, items: copyArray(gesture.items) };
    case 'rename-region':
      return { type: 'RenameRegion', regionId: gesture.regionId, label: gesture.label };
    case 'set-region-order':
      return { type: 'SetRegionOrder', regionId: gesture.regionId, order: gesture.order };
    case 'set-region-value':
      return { type: 'SetRegionValue', regionId: gesture.regionId, value: structuredClone(gesture.value) };
    case 'set-region-link':
      return { type: 'SetRegionLink', regionId: gesture.regionId, href: gesture.href };
    case 'set-set-completeness':
      return { type: 'SetSetCompleteness', regionId: gesture.regionId, complete: gesture.complete };
    case 'add-region':
      return { type: 'AddRegion', ...structuredClone(gesture.fields) };
    case 'connect-regions':
      return { type: 'ConnectRegions', ...structuredClone(gesture.fields) };
    case 'mount-region-module':
      return { type: 'MountRegionModule', regionId: gesture.regionId, src: gesture.src };
    case 'unmount-region-module':
      return { type: 'UnmountRegionModule', regionId: gesture.regionId };
    case 'remove-selection':
      return { type: 'RemoveSelection', regionIds: copyArray(gesture.regionIds), relationIds: copyArray(gesture.relationIds) };
    case 'reconnect-relation':
      return { type: 'ReconnectRelation', relationId: gesture.relationId, from: gesture.from, to: gesture.to };
    default:
      throw new Error(`editor-command: unsupported gesture ${String(gesture.type)}`);
  }
}
