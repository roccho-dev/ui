const wait = async (scope, predicate, label, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => scope.setTimeout(resolve, 50));
  }
  throw new Error(`artifact-adapter: ${label} timed out`);
};
const visible = element => {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
};

export const bootArtifactAdapter = async ({ scope = globalThis } = {}) => {
  const document = scope.document;
  const mount = document.querySelector('#adapter');
  const status = document.querySelector('#status');
  if (!mount || !status) throw new Error('artifact-adapter: mount/status required');
  const response = await scope.fetch(new URL('./adapter.json', scope.location.href), { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error(`artifact-adapter: adapter.json returned ${response.status}`);
  const adapter = await response.json();
  if (adapter.schema !== 'ui-adapter/1' || !['invocation', 'feature'].includes(adapter.kind)) throw new Error('artifact-adapter: unsupported adapter');
  const target = new URL(adapter.href, scope.location.href);
  if (target.origin !== scope.location.origin) throw new Error('artifact-adapter: same-origin target required');
  document.title = `${adapter.label} · UI`;
  document.querySelector('#label').textContent = adapter.label;
  const iframe = document.createElement('iframe');
  iframe.src = target.href;
  iframe.title = adapter.label;
  iframe.dataset.adapterFrame = adapter.id;
  mount.replaceChildren(iframe);
  await new Promise((resolve, reject) => {
    iframe.addEventListener('load', resolve, { once: true });
    iframe.addEventListener('error', () => reject(new Error(`artifact-adapter: ${adapter.id} frame failed`)), { once: true });
  });

  if (adapter.kind === 'invocation') {
    await wait(scope, () => iframe.contentWindow?.artifactShellProof?.outcome?.result?.status === 'PASS', `${adapter.id} invocation`);
  } else {
    const selectors = Array.isArray(adapter.proof?.selectors) ? adapter.proof.selectors : [];
    if (selectors.length === 0) throw new Error(`artifact-adapter: ${adapter.id} proof selectors required`);
    await wait(scope, () => {
      const child = iframe.contentDocument;
      if (!child) return false;
      if (adapter.proof.rootStatus && child.documentElement.dataset.status !== adapter.proof.rootStatus) return false;
      return selectors.every(selector => child.querySelector(selector));
    }, `${adapter.id} feature UI`, 20_000);
  }

  if (!visible(iframe)) throw new Error(`artifact-adapter: ${adapter.id} frame is not visible`);
  document.body.dataset.adapterStatus = 'pass';
  status.textContent = 'PASS';
  scope.artifactAdapterProof = Object.freeze({ adapter, status: 'PASS' });
  return scope.artifactAdapterProof;
};

if (globalThis.location?.protocol === 'http:' || globalThis.location?.protocol === 'https:') {
  bootArtifactAdapter().catch(error => {
    document.body.dataset.adapterStatus = 'fail';
    const status = document.querySelector('#status');
    if (status) status.textContent = `FAIL · ${error.message}`;
    globalThis.artifactAdapterProof = Object.freeze({ error: String(error.message), status: 'FAIL' });
  });
}
