import assert from 'node:assert/strict';
import { createSemanticMapEditorCore } from '../editor-core/index.js';
import { createDecisionLog, createEnvelope } from '../protocol/index.js';
import { DecisionRuntime } from '../authoring/runtime.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'map', title: 'Transaction boundary' },
  { type: 'region', id: 'map', parent: null, label: 'Map', kind: 'root', bounds: [0, 0, 900, 620], summary: '' },
  { type: 'region', id: 'request', parent: 'map', label: 'Request', kind: 'concept', bounds: [40, 60, 160, 80], summary: '' },
];
const rename = label => ({ type: 'RenameRegion', regionId: 'request', label });
const selection = { regionIds: ['request'], relationIds: [] };
const replacement = () => records.map(row => row.id === 'request' ? { ...row, label: 'Replacement' } : row);
const nestedError = /nested mutation transaction is not allowed/u;

function harness() {
  const hooks = {};
  const calls = { authorize: [], requestEdit: [], reload: [], commit: [], render: [], chrome: [], events: [] };
  const call = (phase, value) => {
    calls[phase].push(structuredClone(value));
    return hooks[phase]?.(value);
  };
  const core = createSemanticMapEditorCore({
    semantic: records,
    revision: 'r0',
    ports: {
      surface: {
        render: value => { call('render', value); },
        onGesture: () => () => {},
        destroy() {},
      },
      authority: { authorize: value => call('authorize', value) ?? { allowed: true } },
      document: {
        requestEdit: value => call('requestEdit', value) ?? { operations: [value.operation] },
        reload: value => call('reload', value) ?? { input: value.input },
        commit: value => call('commit', value) ?? { revision: value.expectedRevision },
        renderChrome: value => { call('chrome', value); },
      },
    },
  });
  core.dispatch(rename('First'));
  core.dispatch(rename('Second'));
  core.dispatch({ type: 'history.undo' });
  core.subscribe(value => { call('events', value); });
  const reset = () => { for (const values of Object.values(calls)) values.length = 0; };
  reset();
  return { core, calls, hooks, reset };
}

const actions = {
  dispatch: core => core.dispatch(rename('Candidate')),
  undo: core => core.dispatch({ type: 'history.undo' }),
  redo: core => core.dispatch({ type: 'history.redo' }),
  replace: core => core.replaceInput(replacement()),
};
const nestedActions = [
  core => core.dispatch({ type: 'selection.set', selection }),
  core => core.acceptGesture({ type: 'selection.changed', selection }),
  core => core.replaceInput(replacement()),
  core => core.destroy(),
];

let earlyReentryCases = 0;
for (const [action, phase] of [['dispatch', 'authorize'], ['dispatch', 'requestEdit'], ['undo', 'authorize'], ['redo', 'authorize']]) {
  for (const nested of nestedActions) {
    for (const failure of phase === 'authorize' ? ['deny', 'throw'] : ['throw']) {
      const test = harness();
      const before = test.core.snapshot();
      let attempted = 0;
      test.hooks[phase] = () => {
        attempted += 1;
        assert.throws(() => nested(test.core), nestedError, `E_EARLY_REENTRY: ${action}/${phase}`);
        if (failure === 'throw') throw new Error('E_CALLBACK_THROW');
        return { allowed: false, code: 'E_CALLBACK_DENY', reason: 'negative control' };
      };
      assert.throws(() => actions[action](test.core), failure === 'throw' ? /E_CALLBACK_THROW/u : /E_CALLBACK_DENY/u);
      assert.equal(attempted, 1);
      assert.deepEqual(test.core.snapshot(), before, `${action}/${phase}/${failure}`);
      for (const phase of ['reload', 'commit', 'render', 'chrome', 'events']) assert.equal(test.calls[phase].length, 0, phase);
      delete test.hooks[phase];
      assert.equal(test.core.dispatch({ type: 'history.redo' }), true);
      test.core.destroy();
      earlyReentryCases += 1;
    }
  }
}

let provisionalReadCases = 0;
for (const action of Object.keys(actions)) {
  for (const fail of [false, true]) {
    const test = harness();
    const before = test.core.snapshot();
    let inspected = 0;
    test.hooks.commit = candidate => {
      inspected += 1;
      assert.deepEqual(test.core.snapshot(), before, `E_PROVISIONAL_PUBLIC_READ: ${action}`);
      const observed = test.core.snapshot();
      observed.records.find(row => row.id === 'request').label = 'Attempted snapshot mutation';
      assert.deepEqual(test.core.snapshot(), before);
      assert.notEqual(candidate.semantic.regions.get('request').label, before.records.find(row => row.id === 'request').label);
      for (const phase of ['render', 'chrome', 'events']) assert.equal(test.calls[phase].length, 0, phase);
      if (fail) throw new Error('E_COMMIT_THROW');
      return { revision: 'r1' };
    };
    if (fail) {
      assert.throws(() => actions[action](test.core), /E_COMMIT_THROW/u);
      assert.deepEqual(test.core.snapshot(), before);
      for (const phase of ['render', 'chrome', 'events']) assert.equal(test.calls[phase].length, 0, phase);
    } else {
      actions[action](test.core);
      assert.equal(test.core.snapshot().revision, 'r1');
      assert.notDeepEqual(test.core.snapshot().records, before.records);
      for (const phase of ['render', 'chrome', 'events']) assert.equal(test.calls[phase].length, 1, phase);
    }
    assert.equal(inspected, 1, 'a skipped commit is not a passing observation');
    test.core.destroy();
    provisionalReadCases += 1;
  }
}

let publicationReentryCases = 0;
for (const phase of ['render', 'chrome', 'events']) {
  for (const nested of nestedActions) {
    const test = harness();
    let attempted = 0;
    const cuts = [];
    let observerFailure = null;
    test.hooks[phase] = () => {
      attempted += 1;
      try {
        const accepted = test.core.snapshot();
        assert.throws(() => nested(test.core), nestedError, `E_PUBLICATION_REENTRY: ${phase}`);
        assert.deepEqual(test.core.snapshot(), accepted);
      } catch (error) { observerFailure = error; }
    };
    test.core.subscribe(event => { cuts.push(event.core); });
    test.core.dispatch(rename('Published cut'));
    assert.equal(observerFailure, null, 'callback assertion failures must not be swallowed as observer errors');
    assert.equal(attempted, 1);
    assert.equal(test.calls.commit.length, 1);
    assert.equal(test.calls.events.length, 1);
    assert.equal(cuts.length, 1);
    assert.deepEqual(cuts[0], test.core.snapshot());
    assert.deepEqual(test.calls.events[0].core, cuts[0]);
    test.core.destroy();
    publicationReentryCases += 1;
  }
}

let committedDisplayFailureCases = 0;
for (const action of ['accept', 'reject']) {
  for (const phase of ['render', 'chrome']) {
    const test = harness();
    // Begin with the same accepted records and a real core draft.
    test.core.replaceInput(records);
    const urls = [];
    const log = await createDecisionLog(records, `urn:test:transaction:${action}:${phase}`);
    const runtime = await DecisionRuntime.create(await createEnvelope(log.log, null, { pattern: 'map/1' }), {
      baseUrl: () => urls.at(-1) ?? 'https://example.test/app',
      replaceUrl: url => { urls.push(url); },
    });
    runtime.attachCore(test.core);
    test.core.dispatch(rename('Runtime draft'));
    const proposal = await runtime.createDraftProposal();
    const oldHead = runtime.head;
    const runtimeEvents = [];
    runtime.onChange(event => runtimeEvents.push(event));
    test.reset();
    test.hooks[phase] = () => { throw new Error(`E_DISPLAY_${phase}`); };
    if (action === 'accept') {
      await runtime.accept(proposal);
      assert.notEqual(runtime.head, oldHead, 'display error must not undo an accepted Decision');
    } else {
      await runtime.reject({ local: true });
      assert.equal(runtime.head, oldHead, 'local rejection must not append a Decision');
    }
    const accepted = test.core.snapshot();
    assert.deepEqual(accepted.records, runtime.records, 'E_CORE_DECISION_SPLIT');
    assert.equal(accepted.draft.applied, 0);
    assert.equal(test.calls.commit.length, 1);
    assert.equal(runtimeEvents.length, 1);
    assert.equal(test.calls.events.length, 1);
    assert.equal(accepted.display.status, 'error', 'display failure must remain observable');
    assert.equal(accepted.display.failures.length, 1);
    assert.equal(accepted.display.failures[0].code, 'E_EDITOR_DISPLAY');
    assert.equal(accepted.display.failures[0].phase, phase === 'render' ? 'SurfacePort.render' : 'DocumentPort.renderChrome');
    assert.match(accepted.display.failures[0].message, /E_DISPLAY_/u);
    assert.deepEqual(test.calls.events[0].core.display, accepted.display);
    if (phase === 'render') assert.deepEqual(test.calls.chrome[0].display, accepted.display);
    // Retry only display; do not authorize/commit/apply the edit again.
    delete test.hooks[phase];
    const committedCalls = test.calls.commit.length;
    const authorizedCalls = test.calls.authorize.length;
    test.core.dispatch({ type: 'presentation.refresh' });
    const repaired = test.core.snapshot();
    assert.equal(repaired.display.status, 'ready');
    assert.deepEqual(test.calls.chrome.at(-1).display, repaired.display, 'E_STALE_CHROME_REPLAY');
    assert.deepEqual(test.calls.events.at(-1).core.display, repaired.display);
    assert.deepEqual(repaired.display.failures, []);
    assert.deepEqual({ ...repaired, display: accepted.display }, accepted);
    assert.equal(test.calls.commit.length, committedCalls);
    assert.equal(test.calls.authorize.length, authorizedCalls);
    assert.equal(runtimeEvents.length, 1);
    test.core.destroy();
    committedDisplayFailureCases += 1;
  }
}

let displayReplayCases = 0;
for (const failures of [[], ['render'], ['chrome'], ['render', 'chrome']]) {
  const test = harness();
  const before = test.core.snapshot();
  // Repeated failure must remain an error with this attempt's message.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    for (const phase of failures) {
      test.hooks[phase] = () => { throw new Error(`E_REPLAY_${phase}_${attempt}`); };
    }
    test.core.dispatch({ type: 'presentation.refresh' });
    const observed = test.core.snapshot();
    assert.equal(observed.display.status, failures.length ? 'error' : 'ready');
    assert.equal(observed.display.failures.length, failures.length);
    for (const failure of observed.display.failures) {
      assert.match(failure.message, new RegExp(`_${attempt}$`, 'u'));
    }
    assert.deepEqual({ ...observed, display: before.display }, before);
    assert.deepEqual(test.calls.events.at(-1).core, observed);
  }
  for (const phase of failures) delete test.hooks[phase];
  test.core.dispatch({ type: 'presentation.refresh' });
  const repaired = test.core.snapshot();
  assert.deepEqual(repaired, before);
  assert.deepEqual(test.calls.chrome.at(-1), repaired, 'E_STALE_CHROME_REPLAY');
  assert.deepEqual(test.calls.events.at(-1).core, repaired);
  for (const phase of ['render', 'chrome', 'events']) assert.equal(test.calls[phase].length, 3, phase);
  for (const phase of ['authorize', 'requestEdit', 'reload', 'commit']) assert.equal(test.calls[phase].length, 0, phase);
  test.core.destroy();
  displayReplayCases += 1;
}

console.log(JSON.stringify({
  schema: 'semantic-map-transaction-boundary-test/2', status: 'PASS',
  earlyReentryCases, provisionalReadCases, publicationReentryCases, committedDisplayFailureCases,
  displayReplayCases, formalBrowser: false,
}));
