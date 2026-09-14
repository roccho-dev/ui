import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson, createUrlModuleUrl } from '../../../packages/url-module/src/index.mjs';
import { createAdapter as createControlAdapter } from '../adapters/control.mjs';
import { createAdapter as createGraphAdapter } from '../adapters/graph.mjs';
import { createAdapter as createGraphEditorAdapter } from '../adapters/graph-editor.mjs';
import { createAdapter as createMapAdapter } from '../adapters/map.mjs';
import { createAdapter as createPresentationAdapter } from '../adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../adapters/seq.mjs';
import { buildFeaturePage } from './build-feature-page.mjs';

export const buildAdapters = async ({ appRoot, outputRoot, repoRoot }) => {
  const adapters = [createGraphAdapter(), createMapAdapter(), createSeqAdapter(), createPresentationAdapter(), createControlAdapter(), createGraphEditorAdapter()];
  if (new Set(adapters.map(adapter => adapter.id)).size !== adapters.length) throw new Error('artifact-adapters: duplicate id');

  await fs.copyFile(path.join(appRoot, 'src', 'adapter.mjs'), path.join(outputRoot, 'adapter.mjs'));
  await fs.copyFile(path.join(appRoot, 'publication', 'adapter-host.css'), path.join(outputRoot, 'adapter.css'));
  const adapterHost = await fs.readFile(path.join(appRoot, 'publication', 'adapter-host.html'));

  for (const adapter of adapters) {
    if (typeof adapter.compile !== 'function') throw new Error(`artifact-adapters: ${adapter.id} compile required`);
    const sourcePath = path.join(repoRoot, adapter.source);
    const source = adapter.source.endsWith('.jsonl') ? await fs.readFile(sourcePath, 'utf8') : JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    const compiled = await adapter.compile(source);
    let published;

    if (adapter.kind === 'feature') {
      const feature = await buildFeaturePage({ adapter, compiled, outputRoot, repoRoot });
      published = Object.freeze({ href: feature.href, id: adapter.id, kind: 'feature', label: adapter.label, proof: feature.proof, schema: 'ui-adapter/1' });
    } else if (adapter.kind === 'invocation') {
      if (compiled?.schema !== 'artifact-invocation/2') throw new Error(`artifact-adapters: ${adapter.id} compiler did not return artifact-invocation/2`);
      const encoded = new URL(await createUrlModuleUrl({ base: 'https://artifact-shell.invalid/index.html', fragment: 'invoke', value: compiled }));
      published = Object.freeze({ href: `../../index.html${encoded.hash}`, id: adapter.id, kind: 'invocation', label: adapter.label, schema: 'ui-adapter/1' });
    } else {
      throw new Error(`artifact-adapters: ${adapter.id} unsupported kind ${adapter.kind}`);
    }

    const root = path.join(outputRoot, 'adapters', adapter.id);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'adapter.json'), `${canonicalJson(published)}\n`);
    await fs.writeFile(path.join(root, 'index.html'), adapterHost);
  }

  return Object.freeze(adapters.map(adapter => adapter.id));
};
