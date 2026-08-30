import { chartViewTypeContract } from './chart/contract.js';
import { chartViewTypeProjection } from './chart/projection.js';
import { graphViewTypeContract } from './graph/contract.js';
import { graphViewTypeProjection } from './graph/projection.js';
import { mapViewTypeContract } from './map/contract.js';
import { mapViewTypeProjection } from './map/projection.js';
import { seqViewTypeContract } from './seq/contract.js';
import { seqViewTypeProjection } from './seq/projection.js';
import { invariant } from './contract-helpers.js';

function entry(contract, projection) {
  invariant(contract.id === projection.id, `contract/projection id mismatch: ${contract.id} / ${projection.id}`);
  return Object.freeze({ id: contract.id, contract, projection });
}

// This is the only trusted view-type allowlist. A new type adds one package and one entry here.
const VIEW_TYPES = Object.freeze([
  entry(mapViewTypeContract, mapViewTypeProjection),
  entry(graphViewTypeContract, graphViewTypeProjection),
  entry(seqViewTypeContract, seqViewTypeProjection),
  entry(chartViewTypeContract, chartViewTypeProjection),
]);
const BY_ID = new Map(VIEW_TYPES.map(definition => [definition.id, definition]));
invariant(BY_ID.size === VIEW_TYPES.length, 'duplicate view type id');

export const SUPPORTED_PATTERNS = Object.freeze(
  VIEW_TYPES.filter(item => item.contract.status === 'supported').map(item => item.id),
);
export const RESERVED_PATTERNS = Object.freeze(
  VIEW_TYPES.filter(item => item.contract.status === 'reserved').map(item => item.id),
);

export function getViewType(inputPattern) {
  invariant(typeof inputPattern === 'string' && inputPattern.length > 0, 'Pattern must be a non-empty string');
  const definition = BY_ID.get(inputPattern);
  invariant(definition, `unsupported Pattern ${inputPattern}`);
  invariant(definition.contract.status === 'supported', `Pattern ${inputPattern} is reserved and unsupported`);
  return definition;
}

export function getViewTypeContract(inputPattern) {
  return getViewType(inputPattern).contract;
}

export function getViewTypeProjection(inputPattern) {
  return getViewType(inputPattern).projection;
}

export function defaultViewForPattern(inputPattern) {
  return getViewTypeContract(inputPattern).defaultView();
}

export function patternCapabilities(inputPattern) {
  return getViewTypeContract(inputPattern).capabilities;
}

export function viewTypeRegistryManifest() {
  return Object.freeze(VIEW_TYPES.map(item => Object.freeze({
    id: item.id,
    status: item.contract.status,
    configKey: item.contract.configKey,
    capabilities: item.contract.capabilities,
  })));
}
