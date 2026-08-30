import { canonicalJson, inspectEnvelope } from './protocol/index.js';
import { assertUrlWithinLimit, encodeEnvelopeToken, SMAP_FRAGMENT } from './transport/index.js';

const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-package: ${message}`); };
const waitForReady = (frame, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const started = performance.now();
  const poll = () => {
    try {
      const site = frame.contentWindow?.semanticMapSite;
      if (site?.ready === true) return resolve(site);
      if (site?.ready === false) return reject(new Error(site.error || 'embedded semantic map failed'));
    } catch (_) {}
    if (performance.now() - started > timeoutMs) return reject(new Error('embedded semantic map timed out'));
    setTimeout(poll, 25);
  };
  poll();
});

export const lockDetachedAuthoring = (frame, site) => {
  const reject = () => { throw new Error('semantic-map-package: this input is read-only because the host cannot replace it'); };
  site.editor.adapter.setOperationHandler(reject);
  site.editor.adapter.setActivationHandler(reject);
  for (const method of ['accept', 'changeView', 'commitView', 'reject']) {
    Object.defineProperty(site.runtime, method, { configurable: true, value: reject });
  }
  for (const control of frame.contentDocument?.querySelectorAll?.('[data-state-control], #review-accept, #review-reject') ?? []) {
    control.disabled = true;
  }
  return Object.freeze({ enabled: true, reason: 'host-input-immutable', schema: 'semantic-map-read-only-lock/1' });
};

export const createEnvelopeInputBridge = ({ initialEnvelope, inputAction, site }) => {
  invariant(inputAction?.enabled === true && typeof inputAction.replace === 'function', 'enabled inputAction.replace is required');
  invariant(site?.runtime?.onChange && site.runtime.envelope, 'semantic map runtime change API is required');
  let expectedValue = initialEnvelope;
  let pending = Promise.resolve();
  let revisions = 0;
  let lastError = null;

  const flush = async () => {
    const value = structuredClone(await site.runtime.envelope({ proposal: site.runtime.proposal, view: site.runtime.view }));
    if (canonicalJson(value) === canonicalJson(expectedValue)) return null;
    const commit = await inputAction.replace({ expectedValue, history: 'replace', value });
    expectedValue = value;
    revisions += 1;
    lastError = null;
    return commit;
  };
  const enqueue = () => {
    const task = pending.then(flush);
    pending = task.catch((error) => {
      lastError = String(error?.message ?? error);
      site.editor?.showError?.(`共有URLを更新できません: ${lastError}`);
      return null;
    });
    return task;
  };
  const unsubscribe = site.runtime.onChange(enqueue);
  return Object.freeze({
    enabled: true,
    inputId: inputAction.inputId,
    schema: 'semantic-map-input-bridge/1',
    snapshot: () => Object.freeze({ enabled: true, inputId: inputAction.inputId, lastError, revisions }),
    unsubscribe,
  });
};

export async function executeArtifactPackage({ document, input, inputAction = null, surfaceMount }) {
  invariant(document?.createElement, 'document is required');
  invariant(surfaceMount?.replaceChildren, 'surfaceMount is required');
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'input is required');
  const inspection = await inspectEnvelope(input.envelope);
  const frame = document.createElement('iframe');
  const bridgeEnabled = inputAction?.enabled === true && typeof inputAction.replace === 'function';
  frame.title = 'Semantic Map';
  frame.dataset.inputAction = bridgeEnabled ? 'enabled' : 'read-only';
  frame.dataset.package = 'semantic-map';
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  frame.style.cssText = 'display:block;width:100%;height:min(78vh,900px);min-height:560px;border:0;border-radius:12px;background:#f8fafb;pointer-events:none;';
  const frameUrl = new URL('./authoring/pages/embed.html', import.meta.url);
  frameUrl.hash = `${SMAP_FRAGMENT}=${await encodeEnvelopeToken(inspection.envelope)}`;
  frame.src = assertUrlWithinLimit(frameUrl.href);
  surfaceMount.replaceChildren(frame);
  const site = await waitForReady(frame);
  let bridge = null;
  if (bridgeEnabled) {
    bridge = createEnvelopeInputBridge({ initialEnvelope: inspection.envelope, inputAction, site });
    frame.contentWindow.semanticMapInputBridge = bridge;
  } else {
    lockDetachedAuthoring(frame, site);
  }
  frame.style.pointerEvents = 'auto';
  return Object.freeze({
    schema: 'semantic-map-render-receipt/1',
    mapId: site.runtime.mapId,
    head: site.runtime.head,
    stateHash: site.runtime.stateHash,
    pattern: site.runtime.view.pattern,
    proposal: Boolean(site.runtime.proposal),
    editorReady: Boolean(site.editor?.ready),
    inputBridge: Object.freeze({
      enabled: Boolean(bridge),
      history: bridge ? 'replace' : null,
      inputId: bridge?.inputId ?? inputAction?.inputId ?? null,
      mode: bridge ? 'parent-invocation' : 'read-only',
      schema: 'semantic-map-input-bridge-receipt/1',
    }),
    source: Object.freeze({ contract: 'semantic-map-envelope/3', mode: 'inline-child' }),
  });
}
