const INIT_SCHEMA = 'artifact-module-init/1';
const READY_SCHEMA = 'artifact-module-ready/1';
const STATE_SCHEMA = 'artifact-module-state/1';
const STATE_APPLIED_SCHEMA = 'artifact-module-state-applied/1';
const EVENT_SCHEMA = 'artifact-module-event/1';
export const SEMANTIC_MAP_MODULE_STATE_SCHEMA = 'semantic-map-module-state/1';
export const SEMANTIC_MAP_MODULE_IDENTITY = Object.freeze({
  appId: 'semantic-map',
  contractVersion: '3',
  rendererVersion: '3',
});

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-map-artifact-module: ${message}`);
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, required, optional, name) {
  invariant(plain(value), `${name} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
}

export function normalizeSemanticMapModuleState(value) {
  exactKeys(value, ['schema', 'mode'], ['focusRef'], 'state');
  invariant(value.schema === SEMANTIC_MAP_MODULE_STATE_SCHEMA, `state.schema must be ${SEMANTIC_MAP_MODULE_STATE_SCHEMA}`);
  invariant(value.mode === 'overview' || value.mode === 'focus', 'state.mode must be overview or focus');
  const hasFocus = Object.hasOwn(value, 'focusRef');
  if (hasFocus) invariant(typeof value.focusRef === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.focusRef), 'state.focusRef is invalid');
  if (value.mode === 'focus') invariant(hasFocus, 'state.focusRef is required for focus mode');
  return Object.freeze({
    schema: SEMANTIC_MAP_MODULE_STATE_SCHEMA,
    mode: value.mode,
    ...(hasFocus ? { focusRef: value.focusRef } : {}),
  });
}

export function createSemanticMapArtifactModuleBridge({ window = globalThis, embedded = window.parent !== window } = {}) {
  invariant(window && typeof window.addEventListener === 'function', 'window is required');
  const identity = SEMANTIC_MAP_MODULE_IDENTITY;
  invariant(typeof embedded === 'boolean', 'embedded must be a boolean');
  let port = null;
  let editor = null;
  let removeSelectionListener = null;
  let disposed = false;
  let suppressSelection = false;
  const pending = [];
  const metrics = { applyCount: 0, eventCount: 0, initCount: 0, queuedCount: 0 };
  let current = Object.freeze({ schema: SEMANTIC_MAP_MODULE_STATE_SCHEMA, mode: 'overview' });

  const post = value => {
    invariant(!disposed, 'bridge is disposed');
    invariant(port && typeof port.postMessage === 'function', 'lifecycle port is unavailable');
    port.postMessage(value);
  };
  const emit = (event, value) => {
    post({ schema: EVENT_SCHEMA, event, value });
    metrics.eventCount += 1;
  };
  const receipt = (sequence, status, value = null, error = null) => {
    const result = { schema: STATE_APPLIED_SCHEMA, sequence, status };
    if (status === 'PASS') result.value = value ?? {};
    else result.error = error ?? 'state rejected';
    post(result);
  };
  const apply = async (sequence, input) => {
    let state;
    try {
      invariant(Number.isSafeInteger(sequence) && sequence >= 1, 'state.sequence must be positive');
      state = normalizeSemanticMapModuleState(input);
      invariant(editor, 'editor is not attached');
      if (state.focusRef) {
        const focusedRegion = editor.domain.regions.get(state.focusRef);
        invariant(focusedRegion, `focusRef is missing: ${state.focusRef}`);
        invariant(state.focusRef !== editor.domain.meta.root && focusedRegion.temporal, 'focusRef must identify a temporal slide region');
      }
      suppressSelection = true;
      try {
        editor.adapter.setFocusMarker?.(state.focusRef ?? null);
        if (state.mode === 'overview') {
          editor.adapter.setSelection({ regionIds: [], relationIds: [] });
          if (typeof editor.fitOverview === 'function') editor.fitOverview();
          else editor.reset();
        } else {
          editor.adapter.setSelection({ regionIds: [state.focusRef], relationIds: [] });
          invariant(editor.focusRegion(state.focusRef, 1.15), `focusRef is not visible: ${state.focusRef}`);
        }
      } finally {
        suppressSelection = false;
      }
      current = state;
      metrics.applyCount += 1;
      receipt(sequence, 'PASS', {
        applyCount: metrics.applyCount,
        focusRef: state.focusRef ?? null,
        markerRef: editor.adapter.focusMarkerSnapshot?.() ?? state.focusRef ?? null,
        mode: state.mode,
        pattern: editor.snapshot().scene?.pattern ?? null,
        selection: editor.adapter.selectionSnapshot(),
      });
    } catch (error) {
      receipt(sequence, 'FAIL', null, error instanceof Error ? error.message : String(error));
    }
  };
  const onPortMessage = event => {
    const message = event.data;
    if (!plain(message) || message.schema !== STATE_SCHEMA) return;
    if (!editor) {
      invariant(pending.length < 32, 'pending state limit exceeded');
      pending.push({ sequence: message.sequence, value: message.value });
      metrics.queuedCount += 1;
      return;
    }
    void apply(message.sequence, message.value);
  };
  const onMessage = event => {
    const message = event.data;
    if (!plain(message) || message.schema !== INIT_SCHEMA || event.ports?.length !== 1) return;
    if (message.appId !== identity.appId || message.contractVersion !== identity.contractVersion || message.rendererVersion !== identity.rendererVersion) return;
    port?.close?.();
    port = event.ports[0];
    port.onmessage = onPortMessage;
    port.start?.();
    metrics.initCount += 1;
    post({ ...identity, schema: READY_SCHEMA });
  };
  window.addEventListener('message', onMessage);

  const attach = value => {
    invariant(value && value.adapter && value.domain, 'editor is required');
    invariant(!editor, 'editor is already attached');
    editor = value;
    removeSelectionListener = editor.adapter.onSelectionChange(selection => {
      if (suppressSelection || selection.regionIds.length !== 1) return;
      const ref = selection.regionIds[0];
      const region = editor.domain.regions.get(ref);
      if (ref === editor.domain.meta.root || !region?.temporal) return;
      if (port) emit('activate', { ref });
    });
    const queued = pending.splice(0);
    for (const item of queued) void apply(item.sequence, item.value);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener?.('message', onMessage);
    removeSelectionListener?.();
    port?.close?.();
    port = null;
    editor = null;
  };
  const read = () => Object.freeze({
    connected: port !== null,
    current,
    embedded,
    metrics: Object.freeze({ ...metrics, pendingCount: pending.length }),
  });
  return Object.freeze({ attach, dispose, embedded, read });
}
