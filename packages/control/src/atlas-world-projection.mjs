// Generic a2 world -> semantic scene projection.
// Owner contracts supply qualified entities/relations and explicit presentation areas;
// this file never derives business meaning from labels or position.

import { createGraphLayout } from '../../semantic-map/layout/graph.js';
import { DEFAULT_THEME } from '../../semantic-map/renderer-maxgraph/theme.js';
import { LABEL_LINE_PX, linePx, wrapLabel } from './atlas-text.mjs';
import { containmentIndex, entityKey, indexWorldFrame, relationKey } from './atlas-world.mjs';
import { timelinePosition } from './atlas-timeline.mjs';
import { dayClockText, phaseStale, staleDeltaLabel } from './atlas-gap.mjs';

const AREA_GAP = 40;
const AREA_TOP = 56;
const AREA_PAD = 22;
// Keep nested layout topology, but give the fixed-pixel node text enough width
// inside its own SVG clip at the representative fitted viewport.
const WORLD_WIDTH_SCALE = 1.5;
const MAX_ENTITIES_PER_AREA = 40;
const MAX_RELATION_GROUPS = 64;

const appearance = Object.freeze({
  now: Object.freeze({ fillColor: '#e6f6ea', strokeColor: '#2b8a3e', strokeWidth: 1.8, dashed: false }),
  recent: Object.freeze({ fillColor: '#fff3e0', strokeColor: '#d9480f', strokeWidth: 1.5, dashed: false }),
  unknown: Object.freeze({ fillColor: '#f1f3f5', strokeColor: '#495057', strokeWidth: 1.5, dashed: true }),
  none: Object.freeze({ fillColor: '#ffffff', strokeColor: '#868e96', strokeWidth: 1.2, dashed: false }),
});

const token = Object.freeze({ now: '▶', recent: '•', unknown: '?', none: '' });

// Supplied status flags, read as one display status. Checked in this order,
// so a conflict or an unassigned unit is never shown as a plain unmet one.
// Colors come from the renderer theme's palettes; the symbol always goes
// with the color, so no status is told by color alone.
const palette = (index, { dashed = false, strokeWidth = 1.6 } = {}) => Object.freeze({
  fillColor: DEFAULT_THEME.palettes[index][0], strokeColor: DEFAULT_THEME.palettes[index][1], strokeWidth, dashed,
});
export const ATLAS_STATUS = Object.freeze({
  conflict: Object.freeze({ symbol: '⚠', appearance: palette(4, { strokeWidth: 2.2 }),
    flags: Object.freeze(['scope_status=conflict', 'evaluation-disagreement', 'conflict', 'source=conflict', 'source=whole-purpose-conflict', 'purpose_standing=conflict']) }),
  unassigned: Object.freeze({ symbol: '∅', appearance: palette(1, { dashed: true }), flags: Object.freeze(['unassigned']) }),
  // D1 (apps#73): GapA waits for the User's evaluation; before `unknown`, so it wins over the `?` it also is.
  // …and a series' card with judgments P recorded as waiting (adrs#647 W c6349826755): the same meaning, a human's judgment.
  awaitingUser: Object.freeze({ symbol: '✋', appearance: palette(0, { strokeWidth: 2 }), flags: Object.freeze(['awaiting=user-evaluation', 'awaiting=user-decision']) }),
  unknown: Object.freeze({ symbol: '?', appearance: palette(5, { dashed: true }),
    flags: Object.freeze(['scope_status=unknown', 'standing=unresolved', 'unknown', 'source=unknown', 'unexplained', 'purpose_standing=unknown']) }),
  unmet: Object.freeze({ symbol: '!', appearance: palette(3), flags: Object.freeze(['scope_status=unmet', 'purpose_standing=unmet']) }),
  satisfied: Object.freeze({ symbol: '✓', appearance: palette(2),
    flags: Object.freeze(['scope_status=declared_satisfied', 'standing=completed-history', 'purpose_standing=declared_satisfied']) }),
  history: Object.freeze({ symbol: '⟲', appearance: palette(5, { strokeWidth: 1.2 }), flags: Object.freeze(['history-preserved']) }),
});
const STATUS = ATLAS_STATUS;
const statusOf = flags => Object.keys(STATUS).find(status => STATUS[status].flags.some(flag => flags?.includes(flag))) ?? null;
// The one layout (contract 3, revised): the graph takes the viewport the page
// leaves below its status and search rows; no panel, strip or band.
export const worldViewport = ({ width = 1500, height = 1000 } = {}) => Object.freeze({
  graph: Object.freeze({ x: 16, y: 16, width: Math.max(1, width - 32), height: Math.max(1, height - 32) }),
});

const regionId = key => 'world:' + key;
const areaRegionId = id => 'area:' + encodeURIComponent(id);

const orderedKeys = (keys, entityByKey, rank = new Map()) => [...keys].sort((left, right) => {
  const a = entityByKey.get(left), b = entityByKey.get(right);
  return (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
    || (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right);
});

// The vertical order inside each area. It starts from the supplied `order`.
// Entities joined by visible relations inside one area form a block that keeps
// its supplied order (a chain stays a chain); each block then moves toward the
// mean position of the entities its members are related to in the other areas
// (a fixed number of barycenter sweeps over the visible supplied relations),
// which removes avoidable relation crossings.
// Only declared order and relations are read; ties keep the previous order,
// so the result is deterministic. Names and labels are never compared.
// An area with supplied containment keeps its supplied order: moving nested
// containers can hide relations behind them.
const BARYCENTER_SWEEPS = 4;
const areaRanks = (frame, areas, containment) => {
  const areaOf = new Map(frame.entities.map(entity => [entityKey(entity.ref), entity.area]));
  const nested = new Set([...containment.parentByChild.keys()].map(key => areaOf.get(key)));
  const movable = areas.filter(area => !nested.has(area.id));
  const lists = new Map(areas.map(area => [area.id, orderedKeys(frame.entities.filter(entity => entity.area === area.id)
    .map(entity => entityKey(entity.ref)), new Map(frame.entities.map(entity => [entityKey(entity.ref), entity])))]));
  const neighbors = new Map([...areaOf.keys()].map(key => [key, []]));
  const blockOf = new Map([...areaOf.keys()].map(key => [key, key]));
  const root = key => blockOf.get(key) === key ? key : root(blockOf.get(key));
  for (const relation of frame.relations) {
    const from = entityKey(relation.from), to = entityKey(relation.to);
    if (!relation.visible || !areaOf.has(from) || !areaOf.has(to) || from === to) continue;
    if (areaOf.get(from) === areaOf.get(to)) { blockOf.set(root(from), root(to)); continue; }
    neighbors.get(from).push(to);
    neighbors.get(to).push(from);
  }
  const position = new Map();
  const place = () => {
    for (const list of lists.values()) list.forEach((key, index) => position.set(key, list.length > 1 ? index / (list.length - 1) : 0.5));
  };
  place();
  // A block's members in supplied order, the blocks in their first member's order.
  const blocksOf = list => [...list.reduce((blocks, key) => blocks.set(root(key), [...(blocks.get(root(key)) ?? []), key]), new Map()).values()];
  const blocks = new Map(movable.map(area => [area.id, blocksOf(lists.get(area.id))]));
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep += 1) {
    for (const area of movable) {
      const list = blocks.get(area.id);
      const barycenter = new Map(list.map(block => {
        const near = block.flatMap(key => neighbors.get(key));
        return [block, mean(near.length ? near.map(other => position.get(other)) : block.map(key => position.get(key)))];
      }));
      const previous = new Map(list.map((block, index) => [block, index]));
      list.sort((left, right) => barycenter.get(left) - barycenter.get(right) || previous.get(left) - previous.get(right));
      lists.set(area.id, list.flat());
      place();
    }
  }
  return new Map(movable.flatMap(area => lists.get(area.id).map((key, index) => [key, index])));
};

// The supplied history units (B1, atlas-gap.mjs) are counted by their own line.
const isHistoryUnit = entity => Boolean(entity) && (entity.ref.kind === 'obligation' || entity.ref.kind === 'closed-change'
  || (entity.ref.kind === 'scope-group' && entity.ref.id === 'history'));

const markSubtreeOmitted = (key, childrenByParent, omitted) => {
  if (omitted.has(key)) return;
  omitted.add(key);
  for (const child of childrenByParent.get(key) ?? []) markSubtreeOmitted(child, childrenByParent, omitted);
};

const nestedAreaLayout = ({ area, rows, containment, rank, labelOf }) => {
  const entityByKey = new Map(rows.map(entity => [entityKey(entity.ref), entity]));
  const childrenByParent = new Map([...entityByKey.keys()].map(key => [key, []]));
  const roots = [];
  for (const key of entityByKey.keys()) {
    const parent = containment.parentByChild.get(key);
    if (parent && entityByKey.has(parent)) childrenByParent.get(parent).push(key);
    else roots.push(key);
  }
  // Contained entities keep their supplied order inside their container; the
  // relation ordering moves only the top-level entities of an area.
  for (const [parent, children] of childrenByParent) childrenByParent.set(parent, orderedKeys(children, entityByKey));

  const shown = [];
  const omitted = new Set();
  // D6: what the per-area limit drops, apart from what is not visible.
  const limited = new Set();
  const visit = key => {
    const entity = entityByKey.get(key);
    if (!entity?.visible || shown.length >= MAX_ENTITIES_PER_AREA) {
      markSubtreeOmitted(key, childrenByParent, omitted);
      if (entity?.visible) markSubtreeOmitted(key, childrenByParent, limited);
      return;
    }
    shown.push(key);
    for (const child of childrenByParent.get(key) ?? []) visit(child);
  };
  for (const root of orderedKeys(roots, entityByKey, rank)) visit(root);

  const shownSet = new Set(shown);
  const rootId = 'atlas-area-root:' + area.id;
  const regions = new Map([[rootId, Object.freeze({
    id: rootId, parent: null, label: area.label, kind: 'node', order: 0,
  })]]);
  const children = new Map([[rootId, []]]);
  for (const key of shown) children.set(key, []);
  for (const key of shown) {
    const entity = entityByKey.get(key);
    const declaredParent = containment.parentByChild.get(key);
    const parent = declaredParent && shownSet.has(declaredParent) ? declaredParent : rootId;
    regions.set(key, Object.freeze({
      id: key,
      parent,
      label: labelOf(entity),
      kind: 'node',
      order: parent === rootId ? rank.get(key) ?? entity.order : entity.order,
    }));
    children.get(parent).push(key);
  }

  const layout = createGraphLayout({
    meta: Object.freeze({ root: rootId }),
    regions,
    children,
    relations: Object.freeze([]),
  });
  return Object.freeze({
    layout,
    widthScale: WORLD_WIDTH_SCALE,
    rootId,
    entityByKey,
    childrenByParent,
    shown: Object.freeze(shown),
    shownSet,
    omitted: Object.freeze([...omitted].sort()),
    limited: Object.freeze([...limited].sort()),
  });
};

// Content-fitted layout of an area. Node text is drawn at a fixed screen
// size, so each box is sized in screen pixels for a camera scale of
// `textScale` (1 in the app; Fit never goes below it): wide enough for its
// longest line, tall enough for its lines, never wider than LABEL_MAX_PX —
// longer lines are broken into more lines instead (atlas-text.mjs).
// A supplied container (containment), when fitted, is a box headed by its
// label with its children stacked below, as wide as the widest of them.
// Contained entities keep their supplied order; the relation ordering moves
// only an area's top-level entities. Whole, even widths keep every centre
// exact, so an area's boxes share one centre line.
const LABEL_PAD_X_PX = 16;
const LABEL_PAD_Y_PX = 9;
const AREA_HEADER_PX = 40;
const FLAT_GAP = 24;
const NEST_PAD_PX = 10;
const NEST_GAP_PX = 10;
export { wrapLabel };

const fittedAreaLayout = ({ area, rows, containment, rank, labelOf, textScale }) => {
  const entityByKey = new Map(rows.map(entity => [entityKey(entity.ref), entity]));
  const childrenByParent = new Map([...entityByKey.keys()].map(key => [key, []]));
  const roots = [];
  for (const key of entityByKey.keys()) {
    const parent = containment.parentByChild.get(key);
    if (parent && entityByKey.has(parent)) childrenByParent.get(parent).push(key);
    else roots.push(key);
  }
  for (const [parent, children] of childrenByParent) childrenByParent.set(parent, orderedKeys(children, entityByKey));
  const shown = [];
  const omitted = new Set();
  const limited = new Set();
  const visit = key => {
    if (!entityByKey.get(key).visible || shown.length >= MAX_ENTITIES_PER_AREA) {
      markSubtreeOmitted(key, childrenByParent, omitted);
      if (entityByKey.get(key).visible) markSubtreeOmitted(key, childrenByParent, limited);
      return;
    }
    shown.push(key);
    for (const child of childrenByParent.get(key)) visit(child);
  };
  const tops = orderedKeys(roots, entityByKey, rank);
  for (const root of tops) visit(root);
  const shownSet = new Set(shown);
  const kids = key => childrenByParent.get(key).filter(child => shownSet.has(child));
  const labels = new Map(shown.map(key => [key, wrapLabel(labelOf(entityByKey.get(key)))]));
  const even = value => 2 * Math.ceil(value / 2);
  const nestPad = NEST_PAD_PX / textScale, nestGap = NEST_GAP_PX / textScale;
  const headHeight = key => Math.ceil((labels.get(key).split('\n').length * LABEL_LINE_PX + 2 * LABEL_PAD_Y_PX) / textScale);
  const sizes = new Map();
  const measure = key => {
    const head = { width: even((Math.max(...labels.get(key).split('\n').map(linePx)) + 2 * LABEL_PAD_X_PX) / textScale), height: headHeight(key) };
    const inside = kids(key).map(measure);
    const size = inside.length ? { width: Math.max(head.width, ...inside.map(item => item.width + 2 * nestPad)),
      height: head.height + inside.reduce((sum, item) => sum + item.height, 0) + nestGap * (inside.length - 1) + nestPad } : head;
    sizes.set(key, size);
    return size;
  };
  const top = tops.filter(key => shownSet.has(key));
  top.forEach(measure);
  const header = AREA_HEADER_PX / textScale;
  const pad = LABEL_PAD_X_PX / textScale;
  const inner = even(Math.max(linePx(area.label) / textScale, ...top.map(key => sizes.get(key).width), 120));
  const bounds = new Map();
  const place = (key, x, y) => {
    const { width, height } = sizes.get(key);
    bounds.set(key, Object.freeze({ x, y, width, height }));
    let childY = y + headHeight(key);
    for (const child of kids(key)) {
      place(child, x + (width - sizes.get(child).width) / 2, childY);
      childY += sizes.get(child).height + nestGap;
    }
  };
  let y = header;
  for (const key of top) {
    place(key, pad + (inner - sizes.get(key).width) / 2, y);
    y += sizes.get(key).height + FLAT_GAP;
  }
  const rootBounds = Object.freeze({ x: 0, y: 0, width: inner + 2 * pad, height: Math.max(y - FLAT_GAP + pad, header + pad) });
  return Object.freeze({
    layout: Object.freeze({ rootBounds, bounds }),
    widthScale: 1,
    labels,
    entityByKey,
    childrenByParent,
    shown: Object.freeze(shown),
    shownSet,
    omitted: Object.freeze([...omitted].sort()),
    limited: Object.freeze([...limited].sort()),
  });
};

const containmentDepth = (key, parentByChild) => {
  let depth = 1, current = key;
  while (parentByChild.has(current)) {
    depth += 1;
    current = parentByChild.get(current);
  }
  return depth;
};

const translateBounds = (bounds, dx, dy, widthScale) => Object.freeze({
  x: bounds.x * widthScale + dx,
  y: bounds.y + dy,
  width: bounds.width * widthScale,
  height: bounds.height,
});

const groupRelations = (frame, index, visibleEntityKeys) => {
  const groups = new Map();
  const omitted = [];
  for (const relation of frame.relations) {
    const id = relationKey(relation.ref);
    const from = entityKey(relation.from), to = entityKey(relation.to);
    const resolved = index.entityByKey.has(from) && index.entityByKey.has(to);
    const drawable = relation.visible && resolved && visibleEntityKeys.has(from) && visibleEntityKeys.has(to);
    if (!drawable) { omitted.push(id); continue; }
    const key = JSON.stringify([from, to, relation.kind]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(relation);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const drawn = ordered.slice(0, MAX_RELATION_GROUPS);
  for (const [, relations] of ordered.slice(MAX_RELATION_GROUPS)) {
    for (const relation of relations) omitted.push(relationKey(relation.ref));
  }
  return { drawn, omitted };
};

const activityDisplay = ({ mode, connected, latest, admission }) => {
  const liveLatest = mode === 'live' && latest;
  const currentUnavailable = !connected || admission?.status === 'rejected';
  return Object.freeze({
    liveLatest,
    currentUnavailable,
    displayed: declared => (liveLatest && currentUnavailable && declared !== 'none' ? 'unknown' : declared),
  });
};

// The three-area World alone: areas, nested entities and drawn relation groups
// in world coordinates. It knows nothing of the camera, panel or controls.
// `fitNested: true` fits nested areas to their content too (the one screen,
// which never shrinks the World); otherwise a nested area keeps the graph
// layout, whose larger boxes hold their text in a shrunk overview.
export const projectWorldScene = ({
  input,
  frame,
  mode = 'sample',
  connected = false,
  latest = true,
  admission = null,
  ordering = 'relations',
  textScale = 1,
  staleAt = null,
  fitNested = false,
} = {}) => {
  if (!['relations', 'supplied'].includes(ordering)) throw new Error('atlas-world: unsupported ordering ' + ordering);
  if (!(textScale > 0)) throw new Error('atlas-world: textScale must be positive');
  const index = indexWorldFrame(frame);
  const displayedActivity = activityDisplay({ mode, connected, latest, admission }).displayed;
  const containment = containmentIndex(frame);
  const areas = input.presentation.areas;
  const areaEntities = new Map(areas.map(area => [area.id, []]));
  for (const entity of frame.entities) areaEntities.get(entity.area)?.push(entity);

  const representations = [];
  const visibleEntityKeys = new Set();
  const omittedEntityIds = [];
  const areaBounds = new Map();
  let worldHeight = 0;
  let contentRight = AREA_PAD;
  // `ordering: 'supplied'` keeps the supplied order alone; it exists so the
  // crossings removed by the relation ordering can be measured against it.
  const rank = ordering === 'supplied' ? new Map() : areaRanks(frame, areas, containment);
  // Live activity keeps its own glyph and color; otherwise the supplied status
  // flags choose them. Either way a symbol precedes the label.
  // A matched phase past its matched_until, on the ui's clock, for the frame
  // shown as the present: 理想↔現在の差's heading says it is stale and not
  // known latest (S6), and its box reads unknown. The gap is not derived again.
  const stale = staleAt !== null && phaseStale(frame, staleAt);
  const look = supplied => {
    const entity = stale && supplied.ref.kind === 'gap'
      ? { ...supplied, label: staleDeltaLabel(supplied.label, frame), flags: ['scope_status=unknown'] }
      : supplied;
    const activity = displayedActivity(entity.activity);
    const status = activity === 'none' ? statusOf(entity.flags) : null;
    const symbol = status ? STATUS[status].symbol : token[activity];
    return { activity, status, label: (symbol ? symbol + ' · ' : '') + entity.label,
      appearance: status ? STATUS[status].appearance : appearance[activity] };
  };

  const nestedAreas = new Set([...containment.parentByChild.keys()].map(key => index.entityByKey.get(key)?.area));
  // Graph-laid areas: nested ones, unless nested areas are fitted too.
  const graphLaid = new Set(fitNested ? [] : nestedAreas);
  for (const area of areas) {
    const rows = areaEntities.get(area.id) ?? [];
    const nested = graphLaid.has(area.id)
      ? nestedAreaLayout({ area, rows, containment, rank, labelOf: entity => look(entity).label })
      : fittedAreaLayout({ area, rows, containment, rank, labelOf: entity => look(entity).label, textScale });
    const rootBounds = nested.layout.rootBounds;
    const dx = contentRight - rootBounds.x * nested.widthScale;
    const dy = AREA_TOP - rootBounds.y;
    const bounds = translateBounds(rootBounds, dx, dy, nested.widthScale);
    areaBounds.set(area.id, bounds);
    worldHeight = Math.max(worldHeight, bounds.y + bounds.height);
    contentRight = bounds.x + bounds.width + AREA_GAP;
    omittedEntityIds.push(...nested.omitted);
    // D6 (apps#73; adrs#647 c6342302345, R c6342315491): what is not drawn is
    // counted on the area heading by reason, and said to be reachable by search
    // (the record keeps it). The history units have their own line (履歴 n 件),
    // so they are not counted here again; the total stays in atlas.omitted.
    const limitedSet = new Set(nested.limited);
    const limitCount = nested.limited.length;
    const hiddenCount = nested.omitted.filter(key => !limitedSet.has(key) && !isHistoryUnit(nested.entityByKey.get(key))).length;

    representations.push(Object.freeze({
      regionId: areaRegionId(area.id),
      label: area.label + (limitCount ? ' · 上限で描かない ' + limitCount + ' 件（検索で読める）' : '')
        + (hiddenCount ? ' · 非表示 ' + hiddenCount + ' 件（検索で読める）' : ''),
      bounds,
      kind: 'area',
      depth: 0,
      shape: 'boundary',
      mode: 'boundary',
      readOnly: true,
      geometryEditable: false,
      labelEditable: false,
      atlas: Object.freeze({ kind: 'area', areaId: area.id, count: rows.length, omitted: nested.omitted.length,
        omittedBy: Object.freeze({ limit: limitCount, hidden: nested.omitted.length - limitCount }) }),
    }));

    for (const key of nested.shown) {
      const entity = nested.entityByKey.get(key);
      const localBounds = nested.layout.bounds.get(key);
      const entityBounds = translateBounds(localBounds, dx, dy, nested.widthScale);
      const shownChildren = (nested.childrenByParent.get(key) ?? []).filter(child => nested.shownSet.has(child));
      const hasChildren = shownChildren.length > 0;
      const { activity, status, label: lookLabel, appearance: entityAppearance } = look(entity);
      const label = nested.labels?.get(key) ?? lookLabel;
      visibleEntityKeys.add(key);
      representations.push(Object.freeze({
        regionId: regionId(key),
        sourceRegionId: regionId(key),
        label,
        bounds: entityBounds,
        kind: entity.ref.kind,
        depth: containmentDepth(key, containment.parentByChild),
        zIndex: containmentDepth(key, containment.parentByChild) * 10,
        shape: hasChildren ? 'boundary' : 'graph-node',
        readOnly: true,
        geometryEditable: false,
        labelEditable: false,
        activation: Object.freeze({ type: 'atlas.world.select', id: key }),
        visual: Object.freeze({ appearance: entityAppearance }),
        atlas: Object.freeze({
          kind: 'entity',
          ref: entity.ref,
          area: entity.area,
          activity,
          status,
          declaredActivity: entity.activity,
          parent: containment.parentByChild.get(key) ?? null,
          containmentEvidence: Object.freeze([...(containment.evidenceByChild.get(key) ?? [])]),
          hasChildren,
        }),
      }));
    }
  }

  const grouped = groupRelations(frame, index, visibleEntityKeys);
  const relations = [];
  const groupByRelationId = new Map();
  for (const [, members] of grouped.drawn) {
    const ids = members.map(member => relationKey(member.ref)).sort();
    const first = members[0];
    const sceneRelation = Object.freeze({
      relationIds: Object.freeze(ids),
      from: regionId(entityKey(first.from)),
      to: regionId(entityKey(first.to)),
      kind: first.kind,
      // S6: a relation is drawn as its line; its label is in the record (search).
      label: '',
      directed: true,
      readOnly: true,
      foreground: true,
      atlas: Object.freeze({ kind: 'relation-group', relationRefs: Object.freeze(members.map(member => member.ref)) }),
    });
    relations.push(sceneRelation);
    for (const id of ids) groupByRelationId.set(id, sceneRelation);
  }

  const totalWidth = Math.max(640, contentRight - AREA_GAP + AREA_PAD);
  return Object.freeze({
    representations: Object.freeze(representations),
    relations: Object.freeze(relations),
    world: Object.freeze({ x: 0, y: 44, width: totalWidth, height: worldHeight - 44 + AREA_PAD }),
    areaBounds,
    index,
    containment,
    visibleEntityKeys,
    groupByRelationId,
    omittedRelationIds: Object.freeze([...new Set(grouped.omitted)].sort()),
    omittedEntityIds: Object.freeze([...new Set(omittedEntityIds)].sort()),
    // True when some area drew content-fitted boxes, which hold their text
    // only at a camera scale of at least `textScale`.
    contentFitted: areas.some(area => !graphLaid.has(area.id) && (areaEntities.get(area.id) ?? []).length > 0),
  });
};

// The judgement panel's text: every tab's logical lines for the selected
// record, wrapped to the panel width and paged. Pure text; no regions.
// Where the focus marker goes. A drawn entity marks itself; an omitted entity
// marks its nearest drawn container (else its area); a chosen relation (from
// the search) brings a drawn end of it into view, its from box first; a record
// missing from this frame marks none.
const focusRegion = ({ scene, selected }) => {
  const { index, visibleEntityKeys, containment } = scene;
  if (index.entityByKey.has(selected) && visibleEntityKeys.has(selected)) return regionId(selected);
  const relation = index.relationByKey.get(selected);
  if (relation) {
    const end = [relation.from, relation.to].map(entityKey).find(key => visibleEntityKeys.has(key));
    return end ? regionId(end) : null;
  }
  const entity = index.entityByKey.get(selected);
  if (!entity) return null;
  for (let parent = containment.parentByChild.get(selected); parent; parent = containment.parentByChild.get(parent)) {
    if (visibleEntityKeys.has(parent)) return regionId(parent);
  }
  return scene.areaBounds.has(entity.area) ? areaRegionId(entity.area) : null;
};

// D4 (apps#73; adrs#647 W c6344580290, R c6345797392): a selection the frame
// shown does not draw says so; the id is never swapped for another. Absent
// from the frame: the received frame it was last in, to open held. A history
// unit kept but not drawn (B1): that it is history (the search of this frame
// reaches it). Otherwise null: drawn, or marked on its container as before.
const recordIn = (frame, key) => frame.entities.find(entity => entityKey(entity.ref) === key)
  ?? frame.relations.find(relation => relationKey(relation.ref) === key) ?? null;
const recordName = (record, key) => String(record?.label || key).split('\n')[0];
export const selectionState = ({ frames, scene, selected }) => {
  if (typeof selected !== 'string' || !selected) return null;
  const entity = scene.index.entityByKey.get(selected);
  if (entity) return scene.visibleEntityKeys.has(selected) || !isHistoryUnit(entity) ? null
    : Object.freeze({ state: 'history', label: recordName(entity, selected), last: null });
  if (scene.index.relationByKey.has(selected)) return null;
  const last = frames.findLastIndex(frame => recordIn(frame, selected) !== null);
  return Object.freeze({ state: 'absent', label: recordName(last < 0 ? null : recordIn(frames[last], selected), selected),
    last: last < 0 ? null : Object.freeze({ index: last, id: frames[last].id, asOf: frames[last].asOf }) });
};
export const selectionText = selection => selection === null ? ''
  : selection.state === 'history' ? '選択 ' + selection.label + ' は描かれない（履歴）'
    : '選択 ' + selection.label + ' はこの時点に無い（最後 ' + (selection.last ? selection.last.id + ' · ' + dayClockText(selection.last.asOf) : '不明') + '）';

// One World projection (contract 3, revised: one screen, no HUD, panel, strip
// or band): the three areas, fitted to their content. Content-fitted boxes are
// sized for scale 1, whatever the viewport, so the World does not change size
// with the window: `minScale` keeps Fit from shrinking their text, and a World
// larger than the view is panned. The status and search rows, the time
// controls and the changes of the time shown are the page's own (atlas-ui.mjs).
export const projectAtlasWorld = ({
  input,
  receivedInput = input,
  frame,
  selected,
  mode = 'sample',
  connected = false,
  latest = true,
  scale = 1,
  viewport = { width: 1500, height: 1000 },
  admission = null,
  now = null,
} = {}) => {
  const present = timelinePosition(receivedInput.frames, frame.id).present;
  const scene = projectWorldScene({ input, frame, mode, connected, latest, admission, staleAt: present ? now : null, fitNested: true });
  return Object.freeze({
    scene: Object.freeze({
      pattern: 'graph/1',
      scale,
      resourceComposition: null,
      representations: scene.representations,
      relations: scene.relations,
      selectionProxies: Object.freeze({}),
    }),
    world: scene.world,
    minScale: 1,
    selectedRegionId: focusRegion({ scene, selected }),
    selection: selectionState({ frames: receivedInput.frames, scene, selected }),
    omittedRelationIds: scene.omittedRelationIds,
    omittedEntityIds: scene.omittedEntityIds,
    areaBounds: scene.areaBounds,
    viewport: worldViewport(viewport),
    timeline: timelinePosition(receivedInput.frames, frame.id),
    coverage: Object.freeze({
      omittedRelations: scene.omittedRelationIds.length,
      omittedEntities: scene.omittedEntityIds.length,
      totalRelations: frame.relations.length,
      totalEntities: frame.entities.length,
    }),
  });
};
