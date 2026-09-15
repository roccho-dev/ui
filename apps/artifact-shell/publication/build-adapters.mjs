import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, createUrlModuleUrl } from '../../../packages/url-module/src/index.mjs';
import { createAdapter as createChartAdapter } from '../adapters/chart.mjs';
import { createAdapter as createControlAdapter } from '../adapters/control.mjs';
import { createAdapter as createGraphAdapter } from '../adapters/graph.mjs';
import { createAdapter as createMapAdapter } from '../adapters/map.mjs';
import { createAdapter as createPresentationAdapter } from '../adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../adapters/seq.mjs';
import { materializeFeature } from './materialize-feature.mjs';

const PUBLIC_MODULE_ROOTS = Object.freeze([
  'packages/a2ui-browser/src',
  'packages/business-model',
  'packages/control',
  'packages/core-port/src',
  'packages/presentation',
  'packages/semantic-map/authoring',
  'packages/semantic-map/domain',
  'packages/semantic-map/feature-runtime.mjs',
  'packages/semantic-map/surface-runtime.mjs',
  'packages/semantic-map/feature.css',
  'packages/semantic-map/module-embedding',
  'packages/semantic-map/pattern',
  'packages/semantic-map/projection',
  'packages/semantic-map/protocol',
  'packages/semantic-map/renderer-maxgraph',
  'packages/semantic-map/renderer-resource-dom',
  'packages/semantic-map/resource-composition',
  'packages/semantic-map/transport',
  'packages/semantic-map/vendor',
  'packages/url-module/src',
]);

const materializeCanonicalSemanticApp = async ({ outputRoot, repoRoot }) => {
  const source = await fs.readFile(path.join(repoRoot, 'packages', 'semantic-map', 'authoring', 'pages', 'app.html'), 'utf8');
  const replacements = new Map([
    ['../styles/styles.css', '../modules/packages/semantic-map/authoring/styles/styles.css'],
    ['../styles/handoff.css', '../modules/packages/semantic-map/authoring/styles/handoff.css'],
    ['../styles/review.css', '../modules/packages/semantic-map/authoring/styles/review.css'],
    ['../styles/source.css', '../modules/packages/semantic-map/authoring/styles/source.css'],
    ['../index.js', '../modules/packages/semantic-map/authoring/index.js'],
    ['<!-- @INLINE_IMPORTMAP -->', ''],
    ['<!-- @PAGE_CONFIG -->', canonicalJson({ mode: 'publication', title: 'Semantic Map' })],
    ['<!-- @INITIAL_DOCUMENT -->', ''],
    ['<!-- @EMBEDDED_NOTICES -->', ''],
  ]);
  let page = source;
  for (const [from, to] of replacements) {
    if (!page.includes(from)) throw new Error(`artifact-adapters: canonical semantic app marker missing: ${from}`);
    page = page.replaceAll(from, to);
  }
  if (/@(?:INLINE_IMPORTMAP|PAGE_CONFIG|INITIAL_DOCUMENT|EMBEDDED_NOTICES)/u.test(page)) {
    throw new Error('artifact-adapters: canonical semantic app has unresolved markers');
  }
  const app = path.join(outputRoot, 'app');
  await fs.mkdir(app, { recursive: true });
  await fs.writeFile(path.join(app, 'index.html'), page);
};

const variantIdPattern = /^[a-z][a-z0-9-]*$/u;
const readSourceFile = async (repoRoot, source) => {
  const sourcePath = path.join(repoRoot, source);
  return source.endsWith('.jsonl') ? fs.readFile(sourcePath, 'utf8') : JSON.parse(await fs.readFile(sourcePath, 'utf8'));
};
const readSource = async (repoRoot, source) => {
  if (typeof source === 'string') return readSourceFile(repoRoot, source);
  if (!source || Array.isArray(source) || typeof source !== 'object') throw new Error('artifact-adapters: source must be a path or named path object');
  const entries = await Promise.all(Object.entries(source).map(async ([id, sourcePath]) => {
    if (typeof sourcePath !== 'string' || !sourcePath) throw new Error(`artifact-adapters: source ${id} path required`);
    return [id, await readSourceFile(repoRoot, sourcePath)];
  }));
  return Object.freeze(Object.fromEntries(entries));
};
const featureExampleHref = async ({ adapter, source }) => {
  const encoded = new URL(await createUrlModuleUrl({
    base: `https://artifact-shell.invalid/adapters/${adapter.id}/`,
    fragment: 'data',
    value: source,
  }));
  return `adapters/${adapter.id}/${encoded.hash}`;
};

export const buildAdapters = async ({ appRoot, outputRoot, repoRoot }) => {
  const adapters = [createGraphAdapter(), createMapAdapter(), createSeqAdapter(), createChartAdapter(), createPresentationAdapter(), createControlAdapter()];
  if (new Set(adapters.map(adapter => adapter.id)).size !== adapters.length) throw new Error('artifact-adapters: duplicate id');

  await fs.copyFile(path.join(appRoot, 'src', 'adapter.mjs'), path.join(outputRoot, 'adapter.mjs'));
  await fs.copyFile(path.join(appRoot, 'publication', 'adapter-host.css'), path.join(outputRoot, 'adapter.css'));
  for (const relative of PUBLIC_MODULE_ROOTS) {
    await fs.cp(path.join(repoRoot, relative), path.join(outputRoot, 'modules', relative), { recursive: true });
  }
  await materializeCanonicalSemanticApp({ outputRoot, repoRoot });
  const adapterHost = await fs.readFile(path.join(appRoot, 'publication', 'adapter-host.html'));
  const featureExamples = new Map();

  for (const adapter of adapters) {
    const source = await readSource(repoRoot, adapter.source);
    const root = path.join(outputRoot, 'adapters', adapter.id);
    await fs.mkdir(root, { recursive: true });

    if (adapter.kind === 'feature') {
      featureExamples.set(adapter.id, await featureExampleHref({ adapter, source }));
      await materializeFeature({ adapter, outputRoot, repoRoot, root });
      const variants = adapter.variants ?? [];
      if (!Array.isArray(variants)) throw new Error(`artifact-adapters: ${adapter.id} variants must be an array`);
      if (new Set(variants.map(variant => variant.id)).size !== variants.length) throw new Error(`artifact-adapters: ${adapter.id} duplicate variant id`);
      for (const variant of variants) {
        if (!variantIdPattern.test(variant.id)) throw new Error(`artifact-adapters: ${adapter.id} invalid variant id ${String(variant.id)}`);
        if (typeof variant.source !== 'string' || !variant.source) throw new Error(`artifact-adapters: ${adapter.id}/${variant.id} source required`);
        await fs.access(path.join(repoRoot, variant.source));
        await materializeFeature({
          adapter,
          outputRoot,
          repoRoot,
          root: path.join(root, variant.id),
          view: variant.view,
          label: `${adapter.label}/${variant.id}`,
        });
      }
      continue;
    }
    if (adapter.kind !== 'invocation') throw new Error(`artifact-adapters: ${adapter.id} unsupported kind ${adapter.kind}`);
    if (source?.schema !== 'artifact-invocation/2') throw new Error(`artifact-adapters: ${adapter.id} example must be artifact-invocation/2`);
    const encoded = new URL(await createUrlModuleUrl({ base: 'https://artifact-shell.invalid/index.html', fragment: 'invoke', value: source }));
    const published = Object.freeze({ href: `../../index.html${encoded.hash}`, id: adapter.id, kind: 'invocation', label: adapter.label, schema: 'ui-adapter/1' });
    await fs.writeFile(path.join(root, 'adapter.json'), `${canonicalJson(published)}\n`);
    await fs.writeFile(path.join(root, 'index.html'), adapterHost);
  }

  const launcherPath = path.join(outputRoot, 'index.html');
  let launcher = await fs.readFile(launcherPath, 'utf8');
  for (const [id, href] of featureExamples) {
    const marker = `href="adapters/${id}/"`;
    if (!launcher.includes(marker)) throw new Error(`artifact-adapters: launcher link missing for ${id}`);
    launcher = launcher.replace(marker, `href="${href}"`);
  }
  await fs.writeFile(launcherPath, launcher);

  return Object.freeze(adapters.map(adapter => adapter.id));
};
