import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { assertSurfaceGesture } from '../editor-core/commands.js';
import { normalizeSelection } from '../editor-core/ports.js';

// Actual SurfacePort code with an explicit mechanics fixture, not a browser
// or a substitute semantic editor. Real domain behavior has separate tests.
const events = Object.freeze(Object.fromEntries([
  'CHANGE', 'CONNECT', 'CELL_CONNECTED', 'SCALE', 'TRANSLATE', 'SCALE_AND_TRANSLATE',
  'CLICK', 'CELLS_MOVED', 'CELLS_RESIZED', 'LABEL_CHANGED',
].map(name => [name, name])));
class Source {
  listeners = [];
  addListener(type, handler) { this.listeners.push({ type, handler }); }
  removeListener(handler) { this.listeners = this.listeners.filter(row => row.handler !== handler); }
  fire(type, properties = {}) {
    const event = { getProperty: key => properties[key], consume() {} };
    for (const row of [...this.listeners]) if (row.type === type) row.handler(this, event);
  }
}
const region = id => ({ semantic: { type: 'region', regionId: id }, isEdge: () => false });
const edge = (id, from, to) => ({
  semantic: id ? { type: 'relation', relationIds: [id] } : undefined,
  from: region(from), to: region(to), isEdge: () => true,
  getTerminal(source) { return source ? this.from : this.to; },
});
const instances = [];
class MechanicsFixture {
  constructor() {
    instances.push(this);
    this.projecting = false;
    this.selectionListeners = new Set();
    this.selection = normalizeSelection({});
    this.cellsByRegionId = new Map();
    this.edgesByProjectionKey = new Map();
    this.cancelCount = 0;
    this.renderCount = 0;
    const graph = new Source();
    const selection = new Source();
    const connection = new Source();
    const view = new Source();
    graph.selected = [];
    graph.physicalEdges = new Set();
    graph.getSelectionModel = () => selection;
    graph.getSelectionCells = () => graph.selected;
    graph.getPlugin = () => connection;
    graph.getView = () => view;
    graph.getDataModel = () => ({ contains: cell => graph.physicalEdges.has(cell) });
    graph.batchUpdate = callback => callback();
    graph.cellsRemoved = cells => { for (const cell of cells) graph.physicalEdges.delete(cell); };
    for (const name of ['Movable', 'Resizable', 'Editable', 'Disconnectable']) {
      graph[`setCells${name}`] = value => { graph[name] = value; };
    }
    graph.destroy = () => { graph.destroyed = true; };
    this.graph = graph;
    this.installEditEvents();
    this.setTool('select');
  }
  installEditEvents() { throw new Error('E_LEGACY_DOCUMENT_LISTENERS'); }
  setTool(tool) {
    this.tool = tool;
    for (const name of ['Movable', 'Resizable', 'Editable']) this.graph[`setCells${name}`](tool === 'select');
  }
  render(scene) {
    this.renderCount += 1;
    this.lastScene = scene;
    for (const row of scene.relations) {
      let physical = this.edgesByProjectionKey.get(row.id);
      if (!physical) {
        physical = edge(row.id, row.from, row.to);
        this.edgesByProjectionKey.set(row.id, physical);
        this.graph.physicalEdges.add(physical);
      }
      physical.from = region(row.from);
      physical.to = region(row.to);
    }
  }
  setSelection(selection) {
    this.selection = structuredClone(selection);
    this.projecting = true;
    this.graph.selected = [
      ...selection.regionIds.map(region),
      ...selection.relationIds.map(id => this.edgesByProjectionKey.get(id)).filter(Boolean),
    ];
    this.graph.getSelectionModel().fire(events.CHANGE);
    this.projecting = false;
    for (const listener of this.selectionListeners) listener(this.selection);
  }
  onSelectionChange(listener) { this.selectionListeners.add(listener); return () => this.selectionListeners.delete(listener); }
  camera() { return { scale: 1, translateX: 0, translateY: 0 }; }
  viewport() { return { x: 0, y: 0, width: 100, height: 100 }; }
  cancelCameraPreview() { this.cancelCount += 1; }
  setErrorHandler(handler) { this.errorHandler = handler; }
  setActivationHandler(handler) { this.activationHandler = handler; }
}
const source = fs.readFileSync(new URL('../renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const context = vm.createContext({ structuredClone, console, Promise });
const surfaceModule = new vm.SourceTextModule(source, { context });
const dependencies = new Map([
  ['../vendor/maxgraph/view/event/InternalEvent.js', { default: events }],
  ['../editor-core/commands.js', { assertSurfaceGesture }],
  ['../editor-core/ports.js', { normalizeSelection }],
  ['./adapter.js', { MaxGraphAdapter: MechanicsFixture }],
]);
await surfaceModule.link(specifier => {
  const exports = dependencies.get(specifier);
  assert.ok(exports, `Unexpected SurfacePort dependency ${specifier}`);
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
});
await surfaceModule.evaluate();
const Surface = surfaceModule.namespace.SurfacePortMaxGraphAdapter;
const scene = () => ({ scenes: [], pattern: 'map/1', relations: [{ id: 'r1', from: 'a', to: 'b' }] });
function harness() {
  const surface = new Surface({});
  const inner = instances.at(-1);
  const calls = [];
  const errors = [];
  let respond = gesture => gesture.type === 'selection.changed' ? gesture.selection : null;
  surface.onGesture(gesture => { calls.push(structuredClone(gesture)); return respond(gesture); });
  surface.setErrorHandler(error => errors.push(error));
  surface.render({ scene: scene(), selection: { regionIds: ['a'], relationIds: [] } });
  return { surface, inner, calls, errors, respond: callback => { respond = callback; } };
}
const primary = harness();
assert.equal(primary.surface.submitOperation, undefined);
assert.equal(primary.surface.deleteSelection, undefined);
assert.equal(primary.surface.startEditingSelection, undefined);
for (const tool of ['hand', 'select']) {
  primary.surface.setTool(tool);
  for (const name of ['Movable', 'Resizable', 'Editable']) assert.equal(primary.inner.graph[name], false);
}
for (const type of [events.CELLS_MOVED, events.CELLS_RESIZED, events.LABEL_CHANGED]) {
  primary.inner.graph.fire(type, { cells: [region('a')], cell: region('a'), dx: 1, dy: 1, value: 'Changed' });
}
assert.equal(primary.calls.length, 0, 'retired pointer document edits must not produce gestures');
const other = harness();
primary.inner.graph.selected = [region('b')];
primary.inner.graph.getSelectionModel().fire(events.CHANGE);
assert.equal(primary.calls.length, 1);
assert.deepEqual(primary.calls[0], { type: 'selection.changed', selection: { regionIds: ['b'], relationIds: [] } });
assert.deepEqual(primary.surface.selectionSnapshot(), { regionIds: ['b'], relationIds: [] });
assert.equal(other.calls.length, 0);

let connectionCases = 0;
for (const outcome of ['success', 'falsy', 'throw']) {
  const test = harness();
  test.respond(gesture => {
    assert.equal(gesture.type, 'relation.connect');
    if (outcome === 'throw') throw new Error('E_CONNECT_DENY');
    if (outcome === 'falsy') return null;
    test.surface.render({ scene: { ...scene(), relations: [...scene().relations, { id: 'r2', from: 'a', to: 'c' }] },
      selection: { regionIds: [], relationIds: ['r2'] } });
    return { createdRelationId: 'r2' };
  });
  const temporary = edge(null, 'a', 'c');
  test.inner.graph.physicalEdges.add(temporary);
  test.inner.graph.getPlugin().fire(events.CONNECT, { cell: temporary });
  assert.equal(test.inner.graph.getPlugin().select, false);
  assert.equal(test.inner.graph.physicalEdges.has(temporary), false);
  assert.equal(test.calls.length, 1);
  assert.deepEqual(test.calls[0], { type: 'relation.connect', from: 'a', to: 'c', pattern: 'map/1' });
  assert.deepEqual(test.surface.selectionSnapshot(), outcome === 'success'
    ? { regionIds: [], relationIds: ['r2'] } : { regionIds: ['a'], relationIds: [] });
  assert.equal(test.errors.length, outcome === 'throw' ? 1 : 0);
  if (outcome === 'throw') assert.match(test.errors[0].message, /E_CONNECT_DENY/u);
  test.surface.destroy();
  connectionCases += 1;
}
let reconnectCases = 0;
for (const outcome of ['success', 'falsy', 'throw', 'missing-endpoint']) {
  const test = harness();
  test.respond(gesture => {
    assert.equal(gesture.type, 'relation.reconnect');
    if (outcome === 'throw') throw new Error('E_RECONNECT_DENY');
    if (outcome === 'falsy') return null;
    test.surface.render({ scene: { ...scene(), relations: [{ id: 'r1', from: 'a', to: 'c' }] },
      selection: { regionIds: ['a'], relationIds: [] } });
    return { relationId: 'r1' };
  });
  const physical = test.inner.edgesByProjectionKey.get('r1');
  physical.to = outcome === 'missing-endpoint' ? null : region('c');
  test.inner.graph.fire(events.CELL_CONNECTED, { edge: physical });
  assert.equal(test.calls.length, outcome === 'missing-endpoint' ? 0 : 1);
  assert.equal(physical.getTerminal(false).semantic.regionId, outcome === 'success' ? 'c' : 'b');
  assert.deepEqual(physical.semantic.relationIds, ['r1']);
  assert.deepEqual(test.surface.selectionSnapshot(), { regionIds: ['a'], relationIds: [] });
  assert.equal(test.errors.length, outcome === 'throw' ? 1 : 0);
  if (outcome === 'throw') assert.match(test.errors[0].message, /E_RECONNECT_DENY/u);
  test.surface.destroy();
  reconnectCases += 1;
}
primary.inner.graph.getView().fire(events.SCALE);
assert.equal(primary.calls.at(-1).type, 'camera.changed');
const activation = { type: 'inspect', id: 'a' };
let activations = 0;
primary.surface.setActivationHandler(value => { activations += 1; value.id = 'changed-copy'; });
primary.inner.graph.fire(events.CLICK, { cell: { semantic: { activation } } });
await Promise.resolve();
await Promise.resolve();
assert.equal(primary.calls.at(-1).type, 'activation.requested');
assert.equal(activations, 1);
assert.equal(activation.id, 'a');
const beforeDestroy = primary.calls.length;
assert.equal(primary.surface.destroy(), true);
assert.equal(primary.surface.destroy(), false);
for (const source of [primary.inner.graph, primary.inner.graph.getView(), primary.inner.graph.getSelectionModel(), primary.inner.graph.getPlugin()]) {
  assert.equal(source.listeners.length, 0);
  for (const type of Object.values(events)) source.fire(type);
}
assert.equal(primary.inner.cancelCount, 1);
assert.equal(primary.calls.length, beforeDestroy);
assert.equal(other.inner.graph.destroyed, undefined);
other.inner.graph.selected = [region('b')];
other.inner.graph.getSelectionModel().fire(events.CHANGE);
assert.equal(other.calls.length, 1);
other.surface.destroy();
const remounted = harness();
remounted.inner.graph.selected = [region('c')];
remounted.inner.graph.getSelectionModel().fire(events.CHANGE);
assert.equal(remounted.calls.length, 1);
remounted.surface.destroy();
console.log(JSON.stringify({ schema: 'semantic-map-surface-gestures-test/1', status: 'PASS',
  retiredPointerKinds: 3, connectionCases, reconnectCases, editorsIndependent: true, lifecycle: true,
  renderer: 'explicit mechanics fixture', formalBrowser: false }));
