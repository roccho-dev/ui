import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import {
  BAR_HORIZONTAL_CHART,
  CHART_PATTERN,
  GRAPH_PATTERN,
  MAP_PATTERN,
  RESERVED_PATTERNS,
  SEQ_PATTERN,
  SUPPORTED_PATTERNS,
  coordinateSpaceForPattern,
  normalizeChartView,
  normalizePattern,
  normalizeSeqView,
  validatePatternDomain,
} from '../pattern/index.js';
import { createPatternLayout, createSeqLayout, SemanticProjector } from '../projection/index.js';

function load(name) {
  return createSemanticMap(parseSemanticMapRecords(fs.readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8')));
}

assert.deepEqual(SUPPORTED_PATTERNS, [MAP_PATTERN, GRAPH_PATTERN, SEQ_PATTERN, CHART_PATTERN]);
assert.deepEqual(RESERVED_PATTERNS, []);
for (const pattern of SUPPORTED_PATTERNS) assert.equal(normalizePattern(pattern), pattern);
assert.throws(() => normalizePattern(null), /non-empty string/u, 'MUTATION:implicit-pattern-default');
assert.throws(() => normalizePattern('flow/1'), /unsupported Pattern/u, 'MUTATION:accept-retired-flow-pattern');
assert.deepEqual(normalizeSeqView({ groupBy: 'actor', axis: 'ordinal' }), { groupBy: 'actor', axis: 'ordinal' });
assert.deepEqual(normalizeChartView({ type: BAR_HORIZONTAL_CHART }), { type: BAR_HORIZONTAL_CHART });
assert.throws(() => normalizeSeqView({ groupBy: 'actor' }), /axis is required/u);
assert.equal(coordinateSpaceForPattern(MAP_PATTERN), 'semantic-2d/1');
assert.equal(coordinateSpaceForPattern(GRAPH_PATTERN), 'topology/1');
assert.equal(coordinateSpaceForPattern(SEQ_PATTERN, { groupBy: 'actor', axis: 'ordinal' }), 'ordinal/1');
assert.equal(coordinateSpaceForPattern(SEQ_PATTERN, { groupBy: 'task', axis: 'calendar' }), 'calendar/1');
assert.equal(coordinateSpaceForPattern(CHART_PATTERN, { type: BAR_HORIZONTAL_CHART }), 'quantitative/1');

const map = load('example.jsonl');
const graph = load('graph.jsonl');
const sequence = load('sequence.jsonl');
const gantt = load('gantt.jsonl');
const chart = load('chart.jsonl');
validatePatternDomain(map, MAP_PATTERN);
validatePatternDomain(graph, GRAPH_PATTERN);
validatePatternDomain(sequence, SEQ_PATTERN, { groupBy: 'actor', axis: 'ordinal' });
validatePatternDomain(gantt, SEQ_PATTERN, { groupBy: 'task', axis: 'calendar' });
validatePatternDomain(chart, CHART_PATTERN, { type: BAR_HORIZONTAL_CHART });

const originalGraphBounds = [...graph.regions.values()].map((item) => [item.id, { ...item.bounds }]);
const graphLayoutA = createPatternLayout(graph, GRAPH_PATTERN);
const graphLayoutB = createPatternLayout(graph, GRAPH_PATTERN);
assert.deepEqual([...graphLayoutA.bounds], [...graphLayoutB.bounds], 'graph projection must be deterministic');
assert.notDeepEqual(graphLayoutA.bounds.get('request'), graph.regions.get('request').bounds, 'graph geometry must be derived');
assert.deepEqual([...graph.regions.values()].map((item) => [item.id, { ...item.bounds }]), originalGraphBounds, 'projection must not mutate State');
assert.equal(graphLayoutA.space, 'topology/1');
assert.equal(createPatternLayout(map, MAP_PATTERN).space, 'semantic-2d/1');
assert.equal(createPatternLayout(chart, CHART_PATTERN, { type: BAR_HORIZONTAL_CHART }).space, 'quantitative/1');

const ordinal = createSeqLayout(sequence, { groupBy: 'actor', axis: 'ordinal' });
const calendar = createSeqLayout(gantt, { groupBy: 'task', axis: 'calendar' });
const actorCalendar = createSeqLayout(sequence, { groupBy: 'actor', axis: 'calendar' });
assert.equal(ordinal.space, 'ordinal/1');
assert.equal(calendar.space, 'calendar/1');
assert.equal(ordinal.axis.groupBy, 'actor');
assert.equal(calendar.axis.groupBy, 'task');
assert.deepEqual(actorCalendar.lanes.map(({ id, rows }) => ({ id, rows })), [{ id: 'human', rows: 2 }, { id: 'agent', rows: 2 }]);
assert.deepEqual(
  ordinal.lanes.map(({ id, rows, height }) => ({ id, rows, height })),
  [
    { id: 'human', rows: 2, height: 162 },
    { id: 'agent', rows: 2, height: 162 },
  ],
  'same actor must remain one semantic lane while overlapping intervals use visual subrows',
);
assert.equal(ordinal.bounds.get('request').y, ordinal.bounds.get('review').y, 'non-overlapping Human items reuse one subrow');
assert.notEqual(ordinal.bounds.get('review').y, ordinal.bounds.get('accept').y, 'overlapping Human items must not overlap visually');
assert.notEqual(ordinal.bounds.get('proposal').y, ordinal.bounds.get('revise').y, 'overlapping Agent items must not overlap visually');
assert.equal(ordinal.temporalEdit.get('accept').subrow, 1);
assert.equal(ordinal.temporalEdit.get('revise').subrow, 1);
assert.equal(ordinal.actorBounds.get('human').height, 60, 'lane identity must not stretch into a second semantic lane');

const tripleRecords = parseSemanticMapRecords(fs.readFileSync(new URL('../examples/sequence.jsonl', import.meta.url), 'utf8'));
tripleRecords.splice(tripleRecords.findIndex((record) => record.type === 'relation'), 0, {
  type: 'region',
  id: 'human-third-overlap',
  parent: 'sequence',
  label: 'Third overlap',
  kind: 'event',
  bounds: [0, 0, 80, 60],
  summary: 'third simultaneous occurrence in the same actor lane',
  temporal: {
    actor: 'human',
    ordinal: { start: 2, end: 2 },
    calendar: { start: '2026-08-12', end: '2026-08-12' },
  },
});
const tripleOverlap = createSemanticMap(tripleRecords);
const tripleLayout = createSeqLayout(tripleOverlap, { groupBy: 'actor', axis: 'ordinal' });
assert.deepEqual(
  tripleLayout.lanes.find((lane) => lane.id === 'human'),
  { id: 'human', actor: 'human', y: 82, height: 232, rows: 3 },
  'three simultaneous occurrences must become three visual subrows inside one semantic lane',
);

const graphScene = new SemanticProjector(graph, null, { pattern: GRAPH_PATTERN }).project({ scale: 1, viewport: { x: -100, y: -100, width: 2000, height: 2000 } });
assert.equal(graphScene.scenes.length, 1);
assert.equal(graphScene.scenes[0].space, 'topology/1');
assert.ok(graphScene.representations.some((item) => item.shape === 'graph-decision'));
assert.ok(graphScene.relations.every((item) => item.directed && item.line === 'graph'));

const broken = createSemanticMap(parseSemanticMapRecords(fs.readFileSync(new URL('../examples/sequence.jsonl', import.meta.url), 'utf8')).map((record) => {
  if (record.id !== 'proposal') return record;
  return { ...record, temporal: { actor: null, ordinal: record.temporal.ordinal, calendar: record.temporal.calendar } };
}));
assert.throws(() => validatePatternDomain(broken, SEQ_PATTERN, { groupBy: 'actor', axis: 'ordinal' }), /actor is required/u);

console.log(JSON.stringify({
  schema: 'semantic-map-pattern-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  supported: SUPPORTED_PATTERNS,
  reserved: RESERVED_PATTERNS,
  spaces: ['semantic-2d/1', 'topology/1', 'ordinal/1', 'calendar/1', 'quantitative/1'],
  graphStateGeometryUnchanged: true,
  explicitSeqContract: true,
}));
