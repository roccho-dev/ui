import { createSemanticMap } from '../domain/index.js';
import { layoutMap, splitStateRecords } from '../layout/state.js';
import { createGraphLayout } from '../pattern/index.js';
import { normalizeView } from './envelope.js';

// Where a view will lay a map's regions out, for a consumer that has to place
// something relative to what is already on screen - "beside that part" - and so
// needs the region's real position and size rather than a guess at them.
//
// Read-only and derived: it answers from the same canonical state the log
// carries, applies the layout pins in that state exactly as the embedded view
// does, and returns plain JSON. It writes nothing, and it is not a way to ask
// for a change.
//
// The alternative this exists to avoid is a consumer importing the layout
// functions and copying the view's own sizing constants, which would go stale
// silently the moment the view changed.

export const LAYOUT_BOUNDS_SCHEMA = 'semantic-map-layout-bounds/1';

const GRAPH_PATTERN = 'graph/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-layout-bounds: ${message}`);
}

const boundsTuple = value => Object.freeze([value.x, value.y, value.width, value.height]);

/**
 * The layout of `records` under `view`.
 *
 * `records` is a canonical state - the records a verified DecisionLog projects,
 * semantic and layout together. `view` is a normalized view; only `graph/1` is
 * supported, and anything else fails rather than guessing.
 *
 * Returns a frozen
 *   { schema, pattern, bounds: { [regionId]: [x, y, w, h] }, rootBounds, pinned }
 * where `bounds` holds every region the view actually places, `pinned` lists
 * the regions drawn at bounds a layout pin fixed (always a subset of `bounds`),
 * and `rootBounds` is the enclosing boundary after any expansion a pin forced.
 *
 * The coordinates are the view's own layout space **before the viewport is
 * cropped and the camera transform applied**. A region can therefore have
 * bounds here and still be off screen: this says where the view puts things,
 * not what a person can currently see.
 */
export function layoutBoundsFor(records, view) {
  invariant(Array.isArray(records) && records.length > 0, 'records must be a non-empty array');
  const normalized = normalizeView(view);
  invariant(
    normalized.pattern === GRAPH_PATTERN,
    `unsupported pattern ${normalized.pattern}; only ${GRAPH_PATTERN} reports layout bounds`,
  );

  // The domain accepts semantic records only, so the layout records travel
  // separately - the same split the embedded view performs.
  const { semanticRecords, layoutRecords } = splitStateRecords(records);
  const domain = createSemanticMap(semanticRecords);
  const pins = layoutMap(layoutRecords, domain);

  const pinned = createGraphLayout(domain, { pins });
  // A region the view does not place - one folded into its parent's label, say
  // - has no bounds to report, and a pin on it is not a position either.
  const placed = createGraphLayout(domain).bounds;

  const bounds = {};
  for (const [regionId, value] of pinned.bounds) {
    if (placed.has(regionId)) bounds[regionId] = boundsTuple(value);
  }
  invariant(Object.hasOwn(bounds, domain.meta.root), 'the enclosing boundary has no layout');

  return Object.freeze({
    schema: LAYOUT_BOUNDS_SCHEMA,
    pattern: normalized.pattern,
    bounds: Object.freeze(bounds),
    rootBounds: bounds[domain.meta.root],
    pinned: Object.freeze([...pins.keys()].filter(regionId => Object.hasOwn(bounds, regionId)).sort()),
  });
}
