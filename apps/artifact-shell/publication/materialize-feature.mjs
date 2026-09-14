import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../../packages/url-module/src/index.mjs';
import { copyModuleClosure } from './copy-module-closure.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`feature-materializer: ${message}`); };
const posix = value => value.split(path.sep).join('/');
const inside = (root, target) => {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  invariant(resolved === base || resolved.startsWith(`${base}${path.sep}`), `${target} escapes ${root}`);
  return resolved;
};
const hrefFrom = (from, target) => {
  const relative = posix(path.relative(from, target));
  return relative.startsWith('.') ? relative : `./${relative}`;
};

export const materializeFeature = async ({ adapter, compiled, outputRoot, repoRoot, root }) => {
  invariant(compiled?.schema === 'ui-feature-input/1', `${adapter.id} must compile to ui-feature-input/1`);
  invariant(compiled.feature === adapter.id, `${adapter.id} compiled feature mismatch`);
  invariant(typeof adapter.featureModule === 'string' && adapter.featureModule, `${adapter.id} featureModule required`);

  const descriptorPath = inside(repoRoot, path.join(repoRoot, adapter.featureModule));
  const loaded = await import(`${pathToFileURL(descriptorPath).href}?feature=${encodeURIComponent(adapter.id)}`);
  const feature = loaded.feature;
  invariant(feature?.id === adapter.id, `${adapter.id} feature descriptor mismatch`);
  invariant(typeof feature.entry === 'string' && feature.entry, `${adapter.id} entry required`);
  invariant(Array.isArray(feature.styles), `${adapter.id} styles required`);
  invariant(feature.proof && Array.isArray(feature.proof.selectors) && feature.proof.selectors.length > 0, `${adapter.id} proof selectors required`);

  await copyModuleClosure({ entry: feature.entry, outputRoot, repoRoot });
  const modulesRoot = path.join(outputRoot, 'modules');
  for (const relative of feature.styles) {
    invariant(typeof relative === 'string' && relative, `${adapter.id} style path required`);
    const source = inside(repoRoot, path.join(repoRoot, relative));
    const target = path.join(modulesRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }

  await fs.mkdir(root, { recursive: true });
  const hostRoot = path.join(repoRoot, 'apps', 'artifact-shell', 'publication');
  await fs.copyFile(path.join(hostRoot, 'feature-host.html'), path.join(root, 'index.html'));
  await fs.copyFile(path.join(hostRoot, 'feature-host.css'), path.join(root, 'host.css'));
  await fs.copyFile(path.join(hostRoot, 'feature-host.mjs'), path.join(root, 'host.mjs'));

  const publication = Object.freeze({
    schema: 'ui-feature-publication/1',
    id: feature.id,
    label: feature.label ?? adapter.label,
    entry: hrefFrom(root, path.join(modulesRoot, feature.entry)),
    styles: Object.freeze(feature.styles.map(relative => hrefFrom(root, path.join(modulesRoot, relative)))),
  });
  await fs.writeFile(path.join(root, 'feature.json'), `${canonicalJson(publication)}\n`);
  await fs.writeFile(path.join(root, 'input.json'), `${canonicalJson(compiled.value)}\n`);
  return Object.freeze({ proof: feature.proof });
};
