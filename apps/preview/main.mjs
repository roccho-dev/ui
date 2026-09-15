import { createUrlModuleUrl, readUrlModule } from '../../packages/url-module/src/index.mjs';
import casesText from './cases.jsonl?raw';

const invariant = (condition, message) => { if (!condition) throw new Error(`ui-preview: ${message}`); };
const rows = casesText.split(/\r?\n/u).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`ui-preview: cases line ${index + 1}: ${error.message}`); }
});
const cases = Object.freeze(rows.map(item => Object.freeze(item)));
const byId = new Map(cases.map(item => [item.id, item]));
invariant(byId.size === cases.length, 'duplicate case id');

const runtimeModules = import.meta.glob([
  '../../packages/**/feature-runtime.mjs',
  '../../packages/**/*-feature-runtime.mjs',
  '../../packages/**/render.mjs',
]);
const styleModules = import.meta.glob('../../packages/**/*.css');
const examples = import.meta.glob('../../examples/**/*.jsonl', { eager: true, query: '?raw', import: 'default' });
const moduleKey = path => `../../${path}`;

const featureFor = item => Object.freeze({
  id: item.featureId,
  label: item.label ?? item.id,
  entry: item.entry,
  styles: Object.freeze([...(item.styles ?? [])]),
  ...(item.view ? { view: item.view } : {}),
});
const exampleFor = item => {
  const input = examples[moduleKey(item.source)];
  invariant(typeof input === 'string', `${item.id}: example missing ${item.source}`);
  return input;
};
const hrefFor = async item => createUrlModuleUrl({
  base: new URL(`?case=${encodeURIComponent(item.id)}`, globalThis.location.href).href,
  fragment: 'data',
  value: exampleFor(item),
});

const renderLauncher = async () => {
  const target = document.querySelector('#cases');
  invariant(target, 'launcher target missing');
  target.replaceChildren();
  for (const item of cases) {
    const link = document.createElement('a');
    link.href = await hrefFor(item);
    link.textContent = item.label ?? item.id;
    target.append(link);
  }
  document.body.dataset.mode = 'launcher';
  document.documentElement.dataset.status = 'pass';
  globalThis.uiPreviewProof = Object.freeze({ status: 'PASS', mode: 'launcher', cases: cases.map(item => item.id) });
};

const renderFeature = async item => {
  const input = await readUrlModule({ fragment: 'data', input: globalThis.location.href });
  invariant(input !== null, `${item.id}: #data required`);
  const feature = featureFor(item);
  for (const style of feature.styles) {
    const load = styleModules[moduleKey(style)];
    invariant(typeof load === 'function', `${item.id}: style missing ${style}`);
    await load();
  }
  const loadRuntime = runtimeModules[moduleKey(feature.entry)];
  invariant(typeof loadRuntime === 'function', `${item.id}: runtime missing ${feature.entry}`);
  const runtime = await loadRuntime();
  invariant(typeof runtime.mountFeature === 'function', `${item.id}: mountFeature export required`);
  const root = document.querySelector('#feature');
  invariant(root, 'feature root missing');
  document.body.dataset.mode = 'feature';
  document.title = `UI · ${item.label ?? item.id}`;
  const mounted = await runtime.mountFeature({ feature, input, root, scope: globalThis });
  document.documentElement.dataset.status = 'pass';
  globalThis.uiPreviewProof = Object.freeze({ status: 'PASS', mode: 'feature', caseId: item.id, feature, mounted: mounted ?? null });
};

const boot = async () => {
  const id = new URL(globalThis.location.href).searchParams.get('case');
  if (id === null) return renderLauncher();
  const item = byId.get(id);
  invariant(item, `unknown case ${id}`);
  return renderFeature(item);
};

boot().catch(error => {
  document.documentElement.dataset.status = 'fail';
  const fatal = document.querySelector('#fatal');
  if (fatal) { fatal.hidden = false; fatal.textContent = `BLOCKED · ${error.message}`; }
  globalThis.uiPreviewProof = Object.freeze({ status: 'FAIL', error: String(error.message) });
});
