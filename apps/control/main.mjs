import { getFeature } from '/packages/a2ui-browser/feature.mjs';
import { mountFeature } from '/packages/a2ui-browser/src/feature-app.mjs';
import * as planModule from '/packages/control/model.mjs';
import { loadControlInput } from '/packages/control/live-input.mjs';

const invariant = (condition, message) => {
  if (!condition) throw new Error(`control-app: ${message}`);
};

const readDesign = async () => {
  const response = await fetch('/design.json', { cache: 'no-store' });
  invariant(response.ok, `/design.json returned HTTP ${response.status}`);
  return response.json();
};

const boot = async () => {
  const root = document.querySelector('#feature');
  invariant(root, '#feature required');

  const [design, live] = await Promise.all([readDesign(), loadControlInput()]);
  const feature = Object.freeze({ ...getFeature('control'), planModule });
  const mounted = await mountFeature({
    feature,
    input: Object.freeze({ design, ...live }),
    root,
    scope: globalThis,
  });

  document.documentElement.dataset.status = 'pass';
  globalThis.controlUiProof = Object.freeze({ status: 'PASS', mounted });
};

boot().catch(error => {
  document.documentElement.dataset.status = 'fail';
  const fatal = document.querySelector('#fatal');
  if (fatal) {
    fatal.hidden = false;
    fatal.textContent = `BLOCKED · ${error.message}`;
  }
  globalThis.controlUiProof = Object.freeze({ status: 'FAIL', error: String(error.message) });
});
