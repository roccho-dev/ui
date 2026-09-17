const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-data-pin-controls: ${message}`); };

const selectedTargetId = selection => {
  const ids = [
    ...(selection?.regionIds ?? []),
    ...(selection?.relationIds ?? []),
  ];
  return ids.length === 1 ? ids[0] : null;
};

const option = (document, value, label) => {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
};

export const mountDataPinControls = ({ adapter, document, mount, store }) => {
  invariant(adapter?.selectionSnapshot && adapter?.submitOperation, 'adapter is required');
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

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.className = 'semantic-map-data-pin-button';
  pinButton.dataset.dataPinAction = 'pin';
  pinButton.textContent = '📍 Pin data';

  const unpinButton = document.createElement('button');
  unpinButton.type = 'button';
  unpinButton.className = 'semantic-map-data-pin-button';
  unpinButton.dataset.dataPinAction = 'unpin';
  unpinButton.textContent = 'Unpin data';

  const form = document.createElement('form');
  form.className = 'semantic-map-data-pin-form';
  form.dataset.dataPinForm = 'true';
  form.hidden = true;

  const basis = document.createElement('select');
  basis.className = 'semantic-map-data-pin-input';
  basis.dataset.dataPinBasis = 'true';
  basis.required = true;
  const basisPlaceholder = option(document, '', 'Basis…');
  basisPlaceholder.disabled = true;
  basisPlaceholder.selected = true;
  basis.append(
    basisPlaceholder,
    option(document, 'premise', 'Premise'),
    option(document, 'dependency', 'Dependency'),
    option(document, 'given', 'Given'),
  );

  const reason = document.createElement('input');
  reason.type = 'text';
  reason.className = 'semantic-map-data-pin-input semantic-map-data-pin-reason';
  reason.dataset.dataPinReason = 'true';
  reason.placeholder = 'Why is this fixed input?';
  reason.required = true;

  const confirm = document.createElement('button');
  confirm.type = 'submit';
  confirm.className = 'semantic-map-data-pin-button';
  confirm.dataset.dataPinAction = 'confirm';
  confirm.textContent = 'Pin';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'semantic-map-data-pin-button';
  cancel.dataset.dataPinAction = 'cancel';
  cancel.textContent = 'Cancel';

  form.append(basis, reason, confirm, cancel);
  root.append(summary, pinButton, unpinButton, form);
  mount.append(root);

  let targetId = null;

  const closeForm = () => {
    form.hidden = true;
    form.reset();
  };

  const update = (selection = adapter.selectionSnapshot()) => {
    const nextTargetId = selectedTargetId(selection);
    if (nextTargetId !== targetId) closeForm();
    targetId = nextTargetId;
    const pin = targetId ? store.dataPins.get(targetId) ?? null : null;
    root.dataset.dataPinTarget = targetId ?? '';
    root.dataset.dataPinned = pin ? 'true' : 'false';
    summary.textContent = !targetId
      ? 'Select one item'
      : pin
        ? `📍 ${pin.basis} — ${pin.reason}`
        : targetId;
    pinButton.disabled = !targetId || Boolean(pin);
    unpinButton.disabled = !pin;
    unpinButton.hidden = !pin;
    return Object.freeze({ targetId, pin });
  };

  pinButton.addEventListener('click', () => {
    if (!targetId || store.dataPins.has(targetId)) return;
    form.hidden = false;
    basis.focus();
  });

  cancel.addEventListener('click', closeForm);

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!targetId) return;
    const reasonText = reason.value.trim();
    if (!basis.value || !reasonText) return;
    const result = adapter.submitOperation({
      type: 'PinData',
      items: [{ targetId, basis: basis.value, reason: reasonText }],
    });
    if (!result) return;
    closeForm();
    update();
  });

  unpinButton.addEventListener('click', () => {
    if (!targetId || !store.dataPins.has(targetId)) return;
    const result = adapter.submitOperation({ type: 'UnpinData', targetIds: [targetId] });
    if (!result) return;
    closeForm();
    update();
  });

  adapter.onSelectionChange(update);
  store.onChange?.(() => update());
  update();

  return Object.freeze({ root, update });
};
