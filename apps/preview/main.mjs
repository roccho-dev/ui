import { createUrlModuleUrl, readUrlModule } from '../../packages/url-module/src/index.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`ui-preview: ${message}`); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cases = Object.freeze(__UI_PREVIEW_CASES__.map(item => Object.freeze({
  ...item,
  feature: Object.freeze({ ...item.feature, styles: Object.freeze([...item.feature.styles]) }),
})));
const byId = new Map(cases.map(item => [item.id, item]));
invariant(byId.size === cases.length, 'duplicate case id');

const runtimeModules = import.meta.glob([
  '../../packages/**/feature-runtime.mjs',
  '../../packages/**/*-feature-runtime.mjs',
  '../../packages/**/feature-app.mjs',
  '../../packages/**/render.mjs',
]);
const planModules = import.meta.glob('../../packages/**/model.mjs');
const styleModules = import.meta.glob('../../packages/**/*.css');
const jsonlExamples = Object.freeze({
  ...import.meta.glob('../../examples/**/*.jsonl', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('../../packages/semantic-map/examples/**/*.jsonl', { eager: true, query: '?raw', import: 'default' }),
});
const jsonExamples = import.meta.glob('../../examples/**/*.json', { eager: true, import: 'default' });
const moduleKey = path => `../../${path}`;

const sourceValue = (sourcePath, id) => {
  if (sourcePath.endsWith('.jsonl')) {
    const value = jsonlExamples[moduleKey(sourcePath)];
    invariant(typeof value === 'string', `${id}: example missing ${sourcePath}`);
    return value;
  }
  if (sourcePath.endsWith('.json')) {
    const value = jsonExamples[moduleKey(sourcePath)];
    invariant(plain(value), `${id}: example missing ${sourcePath}`);
    return value;
  }
  throw new Error(`ui-preview: ${id}: unsupported source ${sourcePath}`);
};
const inputFor = item => {
  if (typeof item.source === 'string') return sourceValue(item.source, item.id);
  invariant(plain(item.source), `${item.id}: source must be a path or named paths`);
  return Object.freeze(Object.fromEntries(Object.entries(item.source).map(([name, sourcePath]) => [name, sourceValue(sourcePath, item.id)])));
};
const hrefFor = async item => createUrlModuleUrl({
  base: new URL(`?case=${encodeURIComponent(item.id)}`, globalThis.location.href).href,
  fragment: 'data',
  value: inputFor(item),
});

const renderLauncher = async () => {
  const target = document.querySelector('#cases');
  invariant(target, 'launcher target missing');
  target.replaceChildren();
  for (const item of cases) {
    const link = document.createElement('a');
    link.href = await hrefFor(item);
    link.textContent = item.label;
    target.append(link);
  }
  document.body.dataset.mode = 'launcher';
  document.documentElement.dataset.status = 'pass';
  globalThis.uiPreviewProof = Object.freeze({ status: 'PASS', mode: 'launcher', cases: cases.map(item => item.id) });
};

const renderFeature = async item => {
  const input = await readUrlModule({ fragment: 'data', input: globalThis.location.href });
  invariant(input !== null, `${item.id}: #data required`);
  let feature = item.feature;
  if (typeof feature.plan === 'string') {
    const loadPlan = planModules[moduleKey(feature.plan)];
    invariant(typeof loadPlan === 'function', `${item.id}: plan missing ${feature.plan}`);
    feature = Object.freeze({ ...feature, planModule: await loadPlan() });
  }
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
  document.title = `UI · ${item.label}`;
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
