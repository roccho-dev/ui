import { deriveSetSemantics } from '../domain/index.js';
import { createPresentationProjection } from './presentation-projection.js';

const MIN_GAP = 36;
const GAP_RATIO = 0.14;
const OVERLAP_RATIO = 0.42;
const INNER_RATIO = 0.58;

export const SET_TOPOLOGY_PROJECTION_PROFILES = Object.freeze([
  'horizontal',
  'vertical',
]);

function projectionProfile(value = 'horizontal') {
  if (!SET_TOPOLOGY_PROJECTION_PROFILES.includes(value)) {
    throw new Error(`semantic-set-topology-layout: unsupported projection profile ${value}`);
  }
  return value;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function frozenBounds(value) {
  return Object.freeze({
    x: round(value.x),
    y: round(value.y),
    width: round(value.width),
    height: round(value.height),
  });
}

function centered(root, width, height) {
  return {
    x: root.x + (root.width - width) / 2,
    y: root.y + (root.height - height) / 2,
    width,
    height,
  };
}

function inside(outer, original) {
  const width = Math.max(24, Math.min(original.width, outer.width * INNER_RATIO));
  const height = Math.max(18, Math.min(original.height, outer.height * INNER_RATIO));
  return {
    x: outer.x + (outer.width - width) / 2,
    y: outer.y + (outer.height - height) / 2,
    width,
    height,
  };
}

function canonicalHorizontalBounds(root, leftSize, rightSize, topology) {
  const verticalOffset = topology === 'partial-overlap'
    ? Math.min(leftSize.height, rightSize.height) * 0.12
    : 0;
  const overlap = topology === 'partial-overlap'
    ? Math.min(leftSize.width, rightSize.width) * OVERLAP_RATIO
    : 0;
  const gap = topology === 'disjoint'
    ? Math.max(MIN_GAP, Math.min(leftSize.width, rightSize.width) * GAP_RATIO)
    : -overlap;
  const totalWidth = leftSize.width + gap + rightSize.width;
  const totalHeight = Math.max(leftSize.height, rightSize.height + verticalOffset);
  const origin = centered(root, totalWidth, totalHeight);
  return {
    left: {
      x: origin.x,
      y: origin.y,
      width: leftSize.width,
      height: leftSize.height,
    },
    right: {
      x: origin.x + leftSize.width + gap,
      y: origin.y + verticalOffset,
      width: rightSize.width,
      height: rightSize.height,
    },
  };
}

function canonicalVerticalBounds(root, leftSize, rightSize, topology) {
  const horizontalOffset = topology === 'partial-overlap'
    ? Math.min(leftSize.width, rightSize.width) * 0.12
    : 0;
  const overlap = topology === 'partial-overlap'
    ? Math.min(leftSize.height, rightSize.height) * OVERLAP_RATIO
    : 0;
  const gap = topology === 'disjoint'
    ? Math.max(MIN_GAP, Math.min(leftSize.height, rightSize.height) * GAP_RATIO)
    : -overlap;
  const totalWidth = Math.max(leftSize.width, rightSize.width + horizontalOffset);
  const totalHeight = leftSize.height + gap + rightSize.height;
  const origin = centered(root, totalWidth, totalHeight);
  return {
    left: {
      x: origin.x,
      y: origin.y,
      width: leftSize.width,
      height: leftSize.height,
    },
    right: {
      x: origin.x + horizontalOffset,
      y: origin.y + leftSize.height + gap,
      width: rightSize.width,
      height: rightSize.height,
    },
  };
}

function canonicalBounds(root, left, right, topology, profile) {
  const leftSize = { width: left.width, height: left.height };
  const rightSize = { width: right.width, height: right.height };

  if (topology === 'subset') {
    const outer = centered(root, rightSize.width, rightSize.height);
    return { left: inside(outer, leftSize), right: outer };
  }
  if (topology === 'superset') {
    const outer = centered(root, leftSize.width, leftSize.height);
    return { left: outer, right: inside(outer, rightSize) };
  }
  if (topology === 'equal') {
    const shared = centered(
      root,
      Math.min(leftSize.width, rightSize.width),
      Math.min(leftSize.height, rightSize.height),
    );
    return { left: shared, right: shared };
  }

  return profile === 'vertical'
    ? canonicalVerticalBounds(root, leftSize, rightSize, topology)
    : canonicalHorizontalBounds(root, leftSize, rightSize, topology);
}

export function compileTwoSetTopologyPresentation(domain, options = {}) {
  const profile = projectionProfile(options.profile);
  const semantics = deriveSetSemantics(domain);
  if (semantics.sets.length !== 2 || semantics.pairs.length !== 1) return null;

  const pair = semantics.pairs[0];
  if (!['disjoint', 'partial-overlap', 'subset', 'superset', 'equal'].includes(pair.topology)) {
    return null;
  }

  const left = domain.regions.get(pair.left);
  const right = domain.regions.get(pair.right);
  if (!left || !right || left.parent !== right.parent || left.parent === null) return null;
  const root = domain.regions.get(left.parent);
  if (!root) return null;

  const layout = canonicalBounds(root.bounds, left.bounds, right.bounds, pair.topology, profile);
  const leftBounds = frozenBounds(layout.left);
  const rightBounds = frozenBounds(layout.right);
  return createPresentationProjection({
    id: `set-topology/${profile}/1`,
    pattern: 'map/1',
    layout: [
      { regionId: left.id, bounds: leftBounds },
      { regionId: right.id, bounds: rightBounds },
    ],
    interactions: [
      { regionId: left.id, role: 'set', bounds: leftBounds, editKinds: ['set-topology'] },
      { regionId: right.id, role: 'set', bounds: rightBounds, editKinds: ['set-topology'] },
    ],
  });
}
