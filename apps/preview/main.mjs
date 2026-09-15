import { createUrlModuleUrl, readUrlModule } from '../../packages/url-module/src/index.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`ui-preview: ${message}`); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const featureModules = import.meta.glob('../../packages/*/feature.mjs', { eager: true });
const runtimeModules = import.meta.glob([
  '../../packages/**/feature-runtime.mjs',
  '../../packages/**/*-feature-runtime.mjs',
  '../../packages/**/feature-app.mjs',
  '../../packages/**/render.mjs',
]);
const planModules = import.meta.glob('../../packages/**/model.mjs');
const styleModules = import.meta.glob('../../packages/**/*.css');
const jsonlExamples = import.meta.glob('../../examples/**/*.jsonl', { eager: true, query: '?raw', import: 'default' });
const jsonExamples = import.meta.glob('../../examples/**/*.json', { eager: true, import: 'default' });
const moduleKey = path => `../../${path}`;

const exampleFiles = new Map();
const registerExample = (path, value) => {
  const prefix = '../../examples/';
  invariant(path.startsWith(prefix), `unexpected example path ${path}`);
  const relative = path.slice(prefix.length);
  const parts = relative.split('/');
  if (parts.length !== 2) return;
  const match = /^(.*)\.(jsonl|json)$/u.exec(parts[1]);
  invariant(match, `unsupported example file ${relative}`);
  const key = `${parts[0]}/${match[1]}`;
  invariant(!exampleFiles.has(key), `duplicate example key ${key}`);
  exampleFiles.set(key, Object.freeze({ group: parts[0], name: match[1], extension: match[2], path: `examples/${relative}`, value }));
};
for (const [path, value] of Object.entries(jsonlExamples)) registerExample(path, value);
for (const [path, value] of Object.entries(jsonExamples)) registerExample(path, value);

const consumed = new Set();
const takeNamed = (group, name, caseId) => {
  const example = exampleFiles.get(`${group}/${name}`);
  invariant(example, `${caseId}: example missing ${group}/${name}`);
  consumed.add(example.path);
  return example;
};
const takeSingleJsonl = (group, caseId) => {
  const matches = [...exampleFiles.values()].filter(example => example.group === group && example.extension === 'jsonl');
  invariant(matches.length === 1, `${caseId}: ${group} must contain exactly one JSONL input`);
  consumed.add(matches[0].path);
  return matches[0];
};

const freezeFeature = feature => Object.freeze({ ...feature, styles: Object.freeze([...(feature.styles ?? [])]) });
const discovered = [];
const addCase = ({ id, input, source, feature }) => {
  invariant(typeof id === 'string' && id, 'case id required');
  invariant(feature?.id === id || id.startsWith(`${feature?.id}/`), `${id}: feature id mismatch`);
  invariant(typeof feature.entry === 'string' && feature.entry, `${id}: feature entry required`);
  invariant(Array.isArray(feature.styles), `${id}: feature styles required`);
  discovered.push(Object.freeze({ id, label: id, input, source, feature: freezeFeature(feature) }));
};

for (const [path, loaded] of Object.entries(featureModules).sort(([left], [right]) => left.localeCompare(right))) {
  if (!Array.isArray(loaded.featureIds)) continue;
  invariant(loaded.featureIds.length > 0, `${path}: featureIds required`);
  invariant(new Set(loaded.featureIds).size === loaded.featureIds.length, `${path}: duplicate feature id`);
  invariant(typeof loaded.getFeature === 'function', `${path}: getFeature export required`);

  for (const featureId of loaded.featureIds) {
    const baseFeature = loaded.getFeature(featureId);
    const contract = baseFeature.input;
    invariant(contract !== undefined, `${featureId}: input contract required`);

    if (typeof contract === 'string') {
      const example = takeSingleJsonl(contract, featureId);
      addCase({ id: featureId, input: example.value, source: example.path, feature: baseFeature });
      continue;
    }

    if (Array.isArray(contract)) {
      invariant(contract.length > 0 && new Set(contract).size === contract.length, `${featureId}: named inputs must be unique`);
      const entries = contract.map(name => {
        invariant(typeof name === 'string' && name, `${featureId}: named input required`);
        return [name, takeNamed(featureId, name, featureId)];
      });
      addCase({
        id: featureId,
        input: Object.freeze(Object.fromEntries(entries.map(([name, example]) => [name, example.value]))),
        source: Object.freeze(Object.fromEntries(entries.map(([name, example]) => [name, example.path]))),
        feature: baseFeature,
      });
      continue;
    }

    invariant(plain(contract) && Array.isArray(contract.variants), `${featureId}: unsupported input contract`);
    invariant(contract.variants.length > 0, `${featureId}: variants required`);
    invariant(new Set(contract.variants).size === contract.variants.length, `${featureId}: duplicate variant`);
    invariant(contract.default === undefined || contract.variants.includes(contract.default), `${featureId}: default variant must be supported`);
    for (const variant of contract.variants) {
      invariant(typeof variant === 'string' && variant, `${featureId}: variant id required`);
      const id = `${featureId}/${variant}`;
      const example = takeNamed(featureId, variant, id);
      const feature = loaded.getFeature(featureId, variant);
      addCase({ id, input: example.value, source: example.path, feature });
      if (contract.default === variant) addCase({ id: featureId, input: example.value, source: example.path, feature });
    }
  }
}

for (const example of exampleFiles.values()) invariant(consumed.has(example.path), `orphan example ${example.path}`);
discovered.sort((left, right) => left.id.localeCompare(right.id));
const cases = Object.freeze(discovered);
const byId = new Map(cases.map(item => [item.id, item]));
invariant(byId.size === cases.length, 'duplicate case id');

const hrefFor = async item => createUrlModuleUrl({
  base: new URL(`?case=${encodeURIComponent(item.id)}`, globalThis.location.href).href,
  fragment: 'data',
  value: item.input,
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
  globalThis.uiPreviewProof = Object.freeze({ status: 'PASS', mode: 'feature', caseId: item.id, source: item.source, feature, mounted: mounted ?? null });
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
