import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, createUrlModuleUrl } from '../../../packages/url-module/src/index.mjs';
import { createAdapter as createChartAdapter } from '../adapters/chart.mjs';
import { createAdapter as createControlAdapter } from '../adapters/control.mjs';
import { createAdapter as createGraphAdapter } from '../adapters/graph.mjs';
import { createAdapter as createGraphEditorAdapter } from '../adapters/graph-editor.mjs';
import { createAdapter as createMapAdapter } from '../adapters/map.mjs';
import { createAdapter as createPresentationAdapter } from '../adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../adapters/seq.mjs';
import { materializeFeature } from './materialize-feature.mjs';

const PUBLIC_MODULE_ROOTS = Object.freeze([
  'packages/a2ui-browser/src',
  'packages/control',
  'packages/core-port/src',
  'packages/graph-editor',
  'packages/presentation',
  'packages/semantic-map/domain',
  'packages/semantic-map/feature-runtime.mjs',
  'packages/semantic-map/feature.css',
  'packages/semantic-map/pattern',
  'packages/semantic-map/projection',
  'packages/semantic-map/protocol',
  'packages/semantic-map/renderer-maxgraph',
  'packages/semantic-map/renderer-resource-dom',
  'packages/semantic-map/resource-composition',
  'packages/semantic-map/vendor',
  'packages/url-module/src',
]);

export const buildAdapters = async ({ appRoot, outputRoot, repoRoot }) => {
  const adapters = [createGraphAdapter(), createMapAdapter(), createSeqAdapter(), createChartAdapter(), createPresentationAdapter(), createControlAdapter(), createGraphEditorAdapter()];
  if (new Set(adapters.map(adapter => adapter.id)).size !== adapters.length) throw new Error('artifact-adapters: duplicate id');

  await fs.copyFile(path.join(appRoot, 'src', 'adapter.mjs'), path.join(outputRoot, 'adapter.mjs'));
  await fs.copyFile(path.join(appRoot, 'publication', 'adapter-host.css'), path.join(outputRoot, 'adapter.css'));
  for (const relative of PUBLIC_MODULE_ROOTS) {
    await fs.cp(path.join(repoRoot, relative), path.join(outputRoot, 'modules', relative), { recursive: true });
  }
  const adapterHost = await fs.readFile(path.join(appRoot, 'publication', 'adapter-host.html'));

  for (const adapter of adapters) {
    const sourcePath = path.join(repoRoot, adapter.source);
    const source = adapter.source.endsWith('.jsonl') ? await fs.readFile(sourcePath, 'utf8') : JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    const root = path.join(outputRoot, 'adapters', adapter.id);
    await fs.mkdir(root, { recursive: true });

    if (adapter.kind === 'feature') {
      await materializeFeature({ adapter, input: source, outputRoot, repoRoot, root });
      continue;
    }
    if (adapter.kind !== 'invocation') throw new Error(`artifact-adapters: ${adapter.id} unsupported kind ${adapter.kind}`);
    if (source?.schema !== 'artifact-invocation/2') throw new Error(`artifact-adapters: ${adapter.id} example must be artifact-invocation/2`);
    const encoded = new URL(await createUrlModuleUrl({ base: 'https://artifact-shell.invalid/index.html', fragment: 'invoke', value: source }));
    const published = Object.freeze({ href: `../../index.html${encoded.hash}`, id: adapter.id, kind: 'invocation', label: adapter.label, schema: 'ui-adapter/1' });
    await fs.writeFile(path.join(root, 'adapter.json'), `${canonicalJson(published)}\n`);
    await fs.writeFile(path.join(root, 'index.html'), adapterHost);
  }

  return Object.freeze(adapters.map(adapter => adapter.id));
};
