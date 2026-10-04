import { CALENDAR_SPACE, ORDINAL_SPACE } from '../../../domain/index.js';
const DAY_MS = 86_400_000;
const ITEM_KINDS = new Set(['task', 'activity', 'event', 'milestone']);
const SEQ_RELATION_KINDS = new Set(['message', 'dependency', 'handoff', 'trigger']);

const LANE_LABEL_WIDTH = 146;
const LANE_LEFT = 190;
const LANE_TOP = 82;
const LANE_PADDING_Y = 16;
const ITEM_HEIGHT = 60;
const SUBROW_GAP = 10;
const LANE_GAP = 12;

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-projection: seq/1 ${message}`);
}

function dayIndex(value) {
  return Date.parse(`${value}T00:00:00.000Z`) / DAY_MS;
}

function dateFromDay(value) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

function scalar(value, axis) {
  if (axis === 'ordinal') {
    invariant(Number.isSafeInteger(value) && value >= 0, 'ordinal axis requires non-negative integer values');
    return value;
  }
  invariant(typeof value === 'string', 'calendar axis requires YYYY-MM-DD values');
  return dayIndex(value);
}

function valueFromScalar(value, axis) {
  return axis === 'ordinal' ? value : dateFromDay(value);
}

function tickStep(span, axis) {
  if (axis === 'calendar') {
    if (span <= 14) return 1;
    if (span <= 90) return 7;
    return 30;
  }
  return Math.max(1, Math.ceil(span / 10));
}

function laneHeight(rows) {
  const rowCount = Math.max(1, rows);
  return LANE_PADDING_Y * 2 + rowCount * ITEM_HEIGHT + (rowCount - 1) * SUBROW_GAP;
}

function assignSubrows(values, sourceOrder) {
  const rowEnds = [];
  const rows = new Map();
  const ordered = [...values].sort((left, right) => (
    left.start - right.start
    || left.end - right.end
    || sourceOrder.get(left.item.id) - sourceOrder.get(right.item.id)
    || left.item.id.localeCompare(right.item.id)
  ));
  for (const value of ordered) {
    let row = rowEnds.findIndex((end) => end < value.start);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = value.end;
    rows.set(value.item.id, row);
  }
  return Object.freeze({ count: Math.max(1, rowEnds.length), rows });
}

export function createSeqLayout(domain, config) {
  const root = domain.regions.get(domain.meta.root);
  const actors = [...domain.regions.values()].filter((region) => region.kind === 'actor');
  const items = [...domain.regions.values()].filter((region) => Boolean(region.temporal));
  const sourceOrder = new Map(items.map((item, index) => [item.id, index]));
  for (const region of domain.regions.values()) {
    if (ITEM_KINDS.has(region.kind)) {
      invariant(region.temporal, `${region.id} kind ${region.kind} requires temporal data`);
    }
  }

  const values = items.map((item) => {
    const interval = item.temporal[config.axis];
    invariant(interval, `${item.id}.temporal.${config.axis} is required for axis ${config.axis}`);
    return Object.freeze({
      item,
      interval,
      start: scalar(interval.start, config.axis),
      end: scalar(interval.end, config.axis),
    });
  });

  const itemIds = new Set(items.map((item) => item.id));
  for (const relation of domain.relations) {
    if (!SEQ_RELATION_KINDS.has(relation.kind)) continue;
    invariant(
      itemIds.has(relation.from) && itemIds.has(relation.to),
      `relation ${relation.id} kind ${relation.kind} must connect temporal items`,
    );
  }

  const emptyOrigin = config.axis === 'ordinal' ? 0 : dayIndex('1970-01-01');
  const origin = values.length ? Math.min(...values.map((value) => value.start)) : emptyOrigin;
  const maximum = values.length ? Math.max(...values.map((value) => value.end)) : origin;
  const span = Math.max(1, maximum - origin + 1);
  const unitWidth = config.axis === 'ordinal'
    ? 142
    : Math.max(12, Math.min(42, 1_100 / span));

  let lanes;
  if (config.groupBy === 'actor') {
    if (values.length) invariant(actors.length > 0, 'groupBy actor requires at least one actor region');
    for (const { item } of values) {
      invariant(item.temporal.actor !== null, `${item.id}.temporal.actor is required for groupBy actor`);
    }
    lanes = actors.map((actor) => Object.freeze({
      id: actor.id,
      actor: actor.id,
      label: actor.label,
      source: actor,
    }));
  } else {
    lanes = [...values]
      .sort((left, right) => (
        left.start - right.start
        || left.end - right.end
        || sourceOrder.get(left.item.id) - sourceOrder.get(right.item.id)
        || left.item.id.localeCompare(right.item.id)
      ))
      .map(({ item }) => Object.freeze({
        id: item.id,
        actor: item.temporal.actor,
        label: item.label,
        source: item,
      }));
  }

  const valuesByLane = new Map(lanes.map((lane) => [lane.id, []]));
  for (const value of values) {
    const laneId = config.groupBy === 'actor' ? value.item.temporal.actor : value.item.id;
    invariant(valuesByLane.has(laneId), `${value.item.id} lane ${laneId} is not available`);
    valuesByLane.get(laneId).push(value);
  }
  const subrowsByLane = new Map(lanes.map((lane) => [
    lane.id,
    assignSubrows(valuesByLane.get(lane.id), sourceOrder),
  ]));

  const axisWidth = span * unitWidth;
  let nextLaneY = root.bounds.y + LANE_TOP;
  const laneBands = lanes.map((lane) => {
    const subrows = subrowsByLane.get(lane.id);
    const height = laneHeight(subrows.count);
    const band = Object.freeze({
      id: lane.id,
      actor: lane.actor,
      y: nextLaneY,
      height,
      rows: subrows.count,
    });
    nextLaneY += height + LANE_GAP;
    return band;
  });
  const laneIndex = new Map(laneBands.map((lane, index) => [lane.id, index]));
  const contentBottom = laneBands.length ? nextLaneY - LANE_GAP : root.bounds.y + LANE_TOP;
  const rootBounds = Object.freeze({
    x: root.bounds.x,
    y: root.bounds.y,
    width: Math.max(root.bounds.width, LANE_LEFT + axisWidth + 54),
    height: Math.max(root.bounds.height, contentBottom - root.bounds.y + 42),
  });
  const axisStartX = rootBounds.x + LANE_LEFT;

  const bounds = new Map();
  const temporalEdit = new Map();
  for (const value of values) {
    const laneId = config.groupBy === 'actor' ? value.item.temporal.actor : value.item.id;
    const index = laneIndex.get(laneId);
    invariant(index !== undefined, `${value.item.id} lane ${laneId} is not available`);
    const lane = laneBands[index];
    const row = subrowsByLane.get(laneId).rows.get(value.item.id) ?? 0;
    const x = axisStartX + (value.start - origin) * unitWidth + 6;
    const width = Math.max(42, (value.end - value.start + 1) * unitWidth - 12);
    bounds.set(value.item.id, Object.freeze({
      x,
      y: lane.y + LANE_PADDING_Y + row * (ITEM_HEIGHT + SUBROW_GAP),
      width,
      height: ITEM_HEIGHT,
    }));
    temporalEdit.set(value.item.id, Object.freeze({
      axis: config.axis,
      groupBy: config.groupBy,
      actor: value.item.temporal.actor,
      start: value.interval.start,
      end: value.interval.end,
      origin,
      unitWidth,
      axisStartX,
      laneBands: Object.freeze(laneBands),
      subrow: row,
    }));
  }

  const guides = [Object.freeze({
    id: 'axis-title',
    kind: 'axis-title',
    label: config.axis === 'ordinal' ? 't → order' : 't → calendar',
    bounds: Object.freeze({
      x: axisStartX,
      y: rootBounds.y + 24,
      width: Math.max(180, axisWidth),
      height: 30,
    }),
  })];

  const step = tickStep(span, config.axis);
  for (let value = origin; value <= maximum; value += step) {
    guides.push(Object.freeze({
      id: `tick-${value}`,
      kind: 'axis-tick',
      label: String(valueFromScalar(value, config.axis)),
      bounds: Object.freeze({
        x: axisStartX + (value - origin) * unitWidth,
        y: rootBounds.y + 52,
        width: Math.max(54, unitWidth * step),
        height: 22,
      }),
    }));
  }

  for (const lane of laneBands) {
    guides.push(Object.freeze({
      id: `lane-bg-${lane.id}`,
      kind: 'lane-background',
      label: '',
      bounds: Object.freeze({
        x: rootBounds.x + 12,
        y: lane.y,
        width: rootBounds.width - 24,
        height: lane.height,
      }),
    }));
    if (config.groupBy === 'task') {
      guides.push(Object.freeze({
        id: `lane-label-${lane.id}`,
        kind: 'lane-label',
        label: lanes[laneIndex.get(lane.id)].source.label,
        bounds: Object.freeze({
          x: rootBounds.x + 24,
          y: lane.y + (lane.height - ITEM_HEIGHT) / 2,
          width: LANE_LABEL_WIDTH,
          height: ITEM_HEIGHT,
        }),
      }));
    }
  }

  const actorBounds = new Map();
  if (config.groupBy === 'actor') {
    for (const lane of laneBands) {
      actorBounds.set(lane.id, Object.freeze({
        x: rootBounds.x + 24,
        y: lane.y + (lane.height - ITEM_HEIGHT) / 2,
        width: LANE_LABEL_WIDTH,
        height: ITEM_HEIGHT,
      }));
    }
  }

  return Object.freeze({
    space: config.axis === 'calendar' ? CALENDAR_SPACE : ORDINAL_SPACE,
    rootBounds,
    actors: Object.freeze(actors),
    items: Object.freeze(items),
    itemIds,
    lanes: Object.freeze(laneBands),
    bounds,
    actorBounds,
    guides: Object.freeze(guides),
    temporalEdit,
    relations: Object.freeze(
      domain.relations.filter((relation) => itemIds.has(relation.from) && itemIds.has(relation.to)),
    ),
    axis: Object.freeze({
      ...config,
      origin: valueFromScalar(origin, config.axis),
      maximum: valueFromScalar(maximum, config.axis),
      unitWidth,
    }),
  });
}
