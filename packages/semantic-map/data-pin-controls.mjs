const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-data-pin-controls: ${message}`); };

const selectedTargetId = selection => {
  const ids = [
    ...(selection?.regionIds ?? []),
    ...(selection?.relationIds ?? []),
  ];
  return ids.length === 1 ? ids[0] : null;
};

const selectedRegionId = selection => (
  (selection?.regionIds?.length ?? 0) === 1
  && (selection?.relationIds?.length ?? 0) === 0
    ? selection.regionIds[0]
    : null
);

const editableSelectedRegion = (adapter, selection) => {
  const regionId = selectedRegionId(selection);
  if (!regionId) return null;
  const visibleId = adapter.lastScene?.selectionProxies?.[regionId] ?? regionId;
  const cell = adapter.cellsByRegionId?.get?.(visibleId) ?? null;
  return cell?.semantic?.type === 'region'
    && cell.semantic.labelEditable === true
    && cell.semantic.readOnly !== true
      ? regionId
      : null;
};

export const mountDataPinControls = ({ adapter, document, mount, store }) => {
  invariant(
    adapter?.selectionSnapshot && adapter?.submitOperation && adapter?.startEditingSelection,
    'adapter is required',
  );
  invariant(document?.createElement, 'document is required');
  invariant(mount?.append, 'mount is required');
  invariant(store?.dataPins instanceof Map, 'store dataPins are required');

  const root = document.createElement('section');
  root.className = 'semantic-map-data-pin-controls';
  root.dataset.dataPinControls = 'true';
  root.setAttribute('aria-label', 'Data pin');

  const summary = document.createElement('span');
  summary.className = 'semantic-map-data-pin-summary';
  summary.dataset.dataPinSummary = 'true';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'semantic-map-data-pin-button';
  editButton.dataset.dataPinAction = 'edit';
  editButton.textContent = '✎ Edit text → 📍';

  const unpinButton = document.createElement('button');
  unpinButton.type = 'button';
  unpinButton.className = 'semantic-map-data-pin-button';
  unpinButton.dataset.dataPinAction = 'unpin';
  unpinButton.textContent = 'Unpin data';

  root.append(summary, editButton, unpinButton);
  mount.append(root);

  let targetId = null;
  let editableRegionId = null;

  const update = (selection = adapter.selectionSnapshot()) => {
    targetId = selectedTargetId(selection);
    editableRegionId = editableSelectedRegion(adapter, selection);
    const pin = targetId ? store.dataPins.get(targetId) ?? null : null;
    const canEditAndPin = Boolean(editableRegionId) && !pin;

    root.dataset.dataPinTarget = targetId ?? '';
    root.dataset.dataPinned = pin ? 'true' : 'false';
    root.dataset.dataPinEditable = canEditAndPin ? 'true' : 'false';

    summary.textContent = !targetId
      ? 'Select one text item'
      : pin
        ? `📍 ${pin.basis} — ${pin.reason}`
        : canEditAndPin
          ? 'Edit text; the edit is pinned automatically'
          : targetId;

    editButton.hidden = Boolean(pin);
    editButton.disabled = !canEditAndPin;
    unpinButton.hidden = !pin;
    unpinButton.disabled = !pin;
    return Object.freeze({ targetId, pin, editableRegionId });
  };

  editButton.addEventListener('click', () => {
    if (!editableRegionId || store.dataPins.has(editableRegionId)) return;
    adapter.startEditingSelection();
  });

  unpinButton.addEventListener('click', () => {
    if (!targetId || !store.dataPins.has(targetId)) return;
    const result = adapter.submitOperation({ type: 'UnpinData', targetIds: [targetId] });
    if (!result) return;
    update();
  });

  adapter.onSelectionChange(update);
  store.onChange?.(() => update());
  update();

  return Object.freeze({ root, update });
};
