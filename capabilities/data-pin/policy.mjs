import { dataPinMap } from './contract.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`data-pin-policy: ${message}`); };

const asMap = pins => pins instanceof Map ? pins : dataPinMap(pins);

export const blockedDataPins = (pins, targetIds) => {
  invariant(Array.isArray(targetIds), 'targetIds must be an array');
  const byTargetId = asMap(pins);
  const seen = new Set();
  const blocked = [];
  for (const targetId of targetIds) {
    invariant(typeof targetId === 'string' && targetId.length > 0, 'targetIds must contain non-empty strings');
    if (seen.has(targetId)) continue;
    seen.add(targetId);
    const pin = byTargetId.get(targetId);
    if (pin) blocked.push(pin);
  }
  return Object.freeze(blocked);
};

export const assertDataMutationAllowed = (pins, targetIds) => {
  const blocked = blockedDataPins(pins, targetIds);
  invariant(
    blocked.length === 0,
    `mutation blocked by ${blocked.map(pin => `${pin.targetId} (${pin.basis}: ${pin.reason})`).join(', ')}`,
  );
  return true;
};
