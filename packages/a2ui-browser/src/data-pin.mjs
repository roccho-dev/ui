export const findDataPin = (dataModel, targetId) => {
  const pins = dataModel?.dataPins;
  if (!Array.isArray(pins)) return null;
  return pins.find(pin => pin?.targetId === targetId) ?? null;
};

export const appendDataPinMarker = ({ container, dataModel, document, targetId }) => {
  const pin = findDataPin(dataModel, targetId);
  if (!pin) return null;
  container.dataset.dataPinned = 'true';
  container.dataset.dataPinBasis = pin.basis;
  container.dataset.dataPinReason = pin.reason;
  const marker = document.createElement('span');
  marker.className = 'data-pin';
  marker.dataset.dataPin = targetId;
  marker.dataset.dataPinBasis = pin.basis;
  marker.setAttribute('role', 'note');
  marker.setAttribute('aria-label', `Pinned ${pin.basis}: ${pin.reason}`);
  marker.title = `${pin.basis}: ${pin.reason}`;
  marker.textContent = `📍 ${pin.basis} — ${pin.reason}`;
  container.append(marker);
  return marker;
};
