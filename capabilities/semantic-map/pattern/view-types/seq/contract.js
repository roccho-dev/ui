import { CALENDAR_SPACE, ORDINAL_SPACE, TEMPORAL_AXES } from '../../../domain/index.js';
import { exactKeys, invariant, plainObject } from '../contract-helpers.js';

export const SEQ_PATTERN = 'seq/1';
export const SEQ_AXES = TEMPORAL_AXES;
export const SEQ_GROUPS = Object.freeze(['actor', 'task']);
export const SEQ_ITEM_KINDS = Object.freeze(['task', 'activity', 'event', 'milestone']);
export const SEQ_RELATION_KINDS = Object.freeze(['message', 'dependency', 'handoff', 'trigger']);

const AXES = new Set(SEQ_AXES);
const GROUPS = new Set(SEQ_GROUPS);
const ITEM_KINDS = new Set(SEQ_ITEM_KINDS);
const RELATION_KINDS = new Set(SEQ_RELATION_KINDS);

export function normalizeSeqView(input) {
  const value = plainObject(input, 'View.seq');
  exactKeys(value, ['axis', 'groupBy'], 'View.seq');
  invariant(AXES.has(value.axis), `View.seq.axis must be one of ${SEQ_AXES.join(', ')}`);
  invariant(GROUPS.has(value.groupBy), `View.seq.groupBy must be one of ${SEQ_GROUPS.join(', ')}`);
  return Object.freeze({ axis: value.axis, groupBy: value.groupBy });
}

function validateSequence(domain, config = null) {
  const actors = [...domain.regions.values()].filter(region => region.kind === 'actor');
  const items = [...domain.regions.values()].filter(region => Boolean(region.temporal));
  const itemIds = new Set(items.map(item => item.id));

  for (const region of domain.regions.values()) {
    if (ITEM_KINDS.has(region.kind)) invariant(region.temporal, `${region.id} kind ${region.kind} requires temporal data for seq/1`);
  }
  for (const relation of domain.relations) {
    if (!RELATION_KINDS.has(relation.kind)) continue;
    invariant(itemIds.has(relation.from) && itemIds.has(relation.to), `${relation.id} kind ${relation.kind} must connect temporal items`);
  }
  if (config === null) return;
  const seq = normalizeSeqView(config);
  for (const item of items) {
    invariant(item.temporal[seq.axis], `${item.id}.temporal.${seq.axis} is required for axis ${seq.axis}`);
    if (seq.groupBy === 'actor') invariant(item.temporal.actor !== null, `${item.id}.temporal.actor is required for groupBy actor`);
  }
  if (items.length && seq.groupBy === 'actor') invariant(actors.length > 0, 'groupBy actor requires at least one actor region');
}

export function sequenceAxis(domain) {
  const items = [...domain.regions.values()].filter(region => Boolean(region.temporal));
  if (!items.length) return 'ordinal';
  const allOrdinal = items.every(item => Boolean(item.temporal.ordinal));
  const allCalendar = items.every(item => Boolean(item.temporal.calendar));
  if (allOrdinal) return 'ordinal';
  if (allCalendar) return 'calendar';
  throw new Error('semantic-pattern: seq/1 axis is ambiguous; View.seq.axis is required');
}

export const seqViewTypeContract = Object.freeze({
  id: SEQ_PATTERN,
  status: 'supported',
  configKey: 'seq',
  capabilities: Object.freeze({ editable: true }),
  normalizeConfig: normalizeSeqView,
  coordinateSpace: config => normalizeSeqView(config).axis === 'calendar' ? CALENDAR_SPACE : ORDINAL_SPACE,
  validateDomain: validateSequence,
  shape: (region, mode) => {
    if (mode === 'boundary') return 'boundary';
    if (mode === 'lane' || region.kind === 'actor') return 'seq-lane';
    if (region.temporal) return 'seq-interval';
    if (region.kind === 'message') return 'seq-message';
    return 'seq-step';
  },
  relationVisual: relation => {
    if (relation.kind === 'message') return Object.freeze({ directed: true, line: 'message' });
    if (relation.kind === 'dependency') return Object.freeze({ directed: true, line: 'dependency' });
    return Object.freeze({ directed: true, line: 'sequence' });
  },
  defaultView: () => Object.freeze({ pattern: SEQ_PATTERN, seq: Object.freeze({ axis: 'ordinal', groupBy: 'actor' }) }),
});
