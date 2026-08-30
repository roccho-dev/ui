import { createSemanticMap } from '../domain/index.js';
import {
  normalizePattern,
  normalizePatternConfig,
  patternConfigKey,
  validatePatternDomain,
} from '../pattern/index.js';
import { normalizeDecision, previewDecision, verifyDecisionLog } from './decision-log.js';
import { normalizeResourceComposition, parseTargetRef, projectResourceComposition, resolveResourceEntries } from '../resource-composition/index.js';

export const ENVELOPE_SCHEMA = 'semantic-map-envelope/3';
const FRAME_FIELDS = Object.freeze(['focus', 'scale', 'select', 'bbox', 'viewport']);

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-envelope: ${message}`);
}

function plainObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
}

function exactKeys(value, required, name, optional = []) {
  const expected = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(expected.has(key), `${name}.${key} is not allowed`);
}

function finiteTuple(value, length, name, { positiveFrom = length } = {}) {
  invariant(Array.isArray(value) && value.length === length, `${name} must contain ${length} numbers`);
  return Object.freeze(value.map((item, index) => {
    invariant(typeof item === 'number' && Number.isFinite(item), `${name}[${index}] must be finite`);
    invariant(index < positiveFrom || item > 0, `${name}[${index}] must be positive`);
    return Object.is(item, -0) ? 0 : item;
  }));
}

export function normalizeFrame(input) {
  const value = plainObject(input, 'View.frame');
  for (const key of Object.keys(value)) invariant(FRAME_FIELDS.includes(key), `View.frame.${key} is not allowed`);
  invariant(Object.keys(value).length > 0, 'View.frame must not be empty');

  const hasFocus = Object.hasOwn(value, 'focus');
  const hasScale = Object.hasOwn(value, 'scale');
  invariant(hasFocus === hasScale, 'View.frame.focus and View.frame.scale must be specified together');
  const result = {};
  if (hasFocus) {
    invariant(typeof value.focus === 'string' && value.focus.length > 0, 'View.frame.focus must be a non-empty string');
    invariant(typeof value.scale === 'number' && Number.isFinite(value.scale) && value.scale > 0, 'View.frame.scale must be positive');
    result.focus = value.focus;
    result.scale = value.scale;
  }
  if (Object.hasOwn(value, 'select')) {
    invariant(Array.isArray(value.select) && value.select.length > 0, 'View.frame.select must be a non-empty array');
    const select = value.select.map((item) => {
      invariant(typeof item === 'string' && item.length > 0, 'View.frame.select values must be non-empty strings');
      return item;
    });
    invariant(new Set(select).size === select.length, 'View.frame.select contains duplicates');
    result.select = Object.freeze(select);
  }
  const hasBbox = Object.hasOwn(value, 'bbox');
  const hasViewport = Object.hasOwn(value, 'viewport');
  invariant(hasBbox === hasViewport, 'View.frame.bbox and View.frame.viewport must be specified together');
  invariant(!(hasBbox && hasFocus), 'View.frame must not combine bbox/viewport with focus/scale');
  if (hasBbox) {
    result.bbox = finiteTuple(value.bbox, 4, 'View.frame.bbox', { positiveFrom: 2 });
    result.viewport = finiteTuple(value.viewport, 2, 'View.frame.viewport', { positiveFrom: 0 });
  }
  return Object.freeze(result);
}

export function normalizeView(input) {
  const value = plainObject(input, 'View');
  invariant(Object.hasOwn(value, 'pattern'), 'View.pattern is required');
  const pattern = normalizePattern(value.pattern);
  const configKey = patternConfigKey(pattern);
  exactKeys(
    value,
    ['pattern'],
    'View',
    ['frame', 'resourceComposition', ...(configKey === null ? [] : [configKey])],
  );
  const result = { pattern };
  if (configKey !== null) {
    invariant(Object.hasOwn(value, configKey), `View.${configKey} is required for Pattern ${pattern}`);
    result[configKey] = normalizePatternConfig(pattern, value[configKey]);
  }
  if (Object.hasOwn(value, 'frame')) result.frame = normalizeFrame(value.frame);
  if (Object.hasOwn(value, 'resourceComposition')) result.resourceComposition = normalizeResourceComposition(value.resourceComposition);
  return Object.freeze(result);
}

function regionIdsFor(records) {
  return new Set(records.filter((record) => record.type === 'region').map((record) => record.id));
}

function validateView(view, records) {
  validatePatternDomain(
    createSemanticMap(records),
    view.pattern,
    patternConfigKey(view.pattern) === null ? null : view[patternConfigKey(view.pattern)],
  );
  const regionIds = regionIdsFor(records);
  if (view.frame?.focus) invariant(regionIds.has(view.frame.focus), `View.frame.focus region not found: ${view.frame.focus}`);
  for (const id of view.frame?.select ?? []) invariant(regionIds.has(id), `View.frame.select region not found: ${id}`);
  if (view.resourceComposition) {
    const mountedRegionIds = new Set(records.filter(
      (record) => record.type === 'region' && record.mount,
    ).map((record) => record.id));
    for (const entry of resolveResourceEntries(view.resourceComposition)) {
      const target = parseTargetRef(entry.placement.targetRef);
      if (target.catalog !== 'node') continue;
      invariant(regionIds.has(target.id), `resource placement node not found: ${target.id}`);
      invariant(
        !(entry.resource.contract === 'semantic-map-envelope/3' && mountedRegionIds.has(target.id)),
        `resource semantic-map conflicts with region.mount: ${target.id}`,
      );
    }
  }
  return view;
}

export function projectView(input, records) {
  const view = normalizeView(input);
  validatePatternDomain(
    createSemanticMap(records),
    view.pattern,
    patternConfigKey(view.pattern) === null ? null : view[patternConfigKey(view.pattern)],
  );
  const regionIds = regionIdsFor(records);
  const projected = { pattern: view.pattern };
  const configKey = patternConfigKey(view.pattern);
  if (configKey !== null) projected[configKey] = view[configKey];
  if (view.frame) {
    const frame = {};
    if (view.frame.focus && regionIds.has(view.frame.focus)) {
      frame.focus = view.frame.focus;
      frame.scale = view.frame.scale;
    }
    const select = (view.frame.select ?? []).filter((id) => regionIds.has(id));
    if (select.length) frame.select = Object.freeze(select);
    if (view.frame.bbox) {
      frame.bbox = view.frame.bbox;
      frame.viewport = view.frame.viewport;
    }
    if (Object.keys(frame).length) projected.frame = Object.freeze(frame);
  }
  if (view.resourceComposition) {
    const remaining = view.resourceComposition.placements.filter((placement) => {
      const target = parseTargetRef(placement.targetRef);
      return target.catalog !== 'node' || regionIds.has(target.id);
    });
    if (remaining.length) projected.resourceComposition = projectResourceComposition(view.resourceComposition, { nodeIds: regionIds });
  }
  return Object.freeze(projected);
}

export async function inspectEnvelope(input) {
  const value = plainObject(input, 'Envelope');
  exactKeys(value, ['schema', 'log', 'proposal', 'view'], 'Envelope');
  invariant(value.schema === ENVELOPE_SCHEMA, `schema ${value.schema} is not ${ENVELOPE_SCHEMA}`);
  invariant(typeof value.log === 'string', 'Envelope.log must be a string');
  const base = await verifyDecisionLog(value.log);
  const proposal = value.proposal === null ? null : normalizeDecision(value.proposal);
  const preview = proposal === null ? null : await previewDecision(base.log, proposal);
  const view = validateView(normalizeView(value.view), preview?.records ?? base.records);
  const envelope = Object.freeze({ schema: ENVELOPE_SCHEMA, log: base.log, proposal, view });
  return Object.freeze({ envelope, base, preview });
}

export async function createEnvelope(log, proposal = null, view) {
  invariant(view !== undefined && view !== null, 'View is required');
  return (await inspectEnvelope({ schema: ENVELOPE_SCHEMA, log, proposal, view })).envelope;
}
