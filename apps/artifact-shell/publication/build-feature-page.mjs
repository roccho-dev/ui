import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../../packages/url-module/src/index.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`feature-page: ${message}`); };
const posix = value => value.split(path.sep).join('/');
const inside = (root, target) => {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  invariant(resolved === base || resolved.startsWith(`${base}${path.sep}`), `${target} escapes ${root}`);
  return resolved;
};
const copyPath = async (source, target) => {
  const stat = await fs.stat(source);
  if (stat.isFile()) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    return;
  }
  invariant(stat.isDirectory(), `unsupported source ${source}`);
  await fs.mkdir(target, { recursive: true });
  for (const entry of (await fs.readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    await copyPath(path.join(source, entry.name), path.join(target, entry.name));
  }
};
const hrefFrom = (from, target) => {
  const relative = posix(path.relative(from, target));
  return relative.startsWith('.') ? relative : `./${relative}`;
};

export const buildFeaturePage = async ({ adapter, compiled, outputRoot, repoRoot }) => {
  invariant(compiled?.schema === 'ui-feature-input/1', `${adapter.id} must compile to ui-feature-input/1`);
  invariant(compiled.feature === adapter.id, `${adapter.id} compiled feature mismatch`);
  invariant(typeof adapter.featureModule === 'string' && adapter.featureModule, `${adapter.id} featureModule required`);

  const featureModule = inside(repoRoot, path.join(repoRoot, adapter.featureModule));
  const loaded = await import(`${pathToFileURL(featureModule).href}?feature=${encodeURIComponent(adapter.id)}`);
  const feature = loaded.feature;
  invariant(feature?.id === adapter.id, `${adapter.id} feature descriptor mismatch`);
  invariant(typeof feature.entry === 'string' && feature.entry, `${adapter.id} entry required`);
  invariant(Array.isArray(feature.styles), `${adapter.id} styles required`);
  invariant(Array.isArray(feature.files) && feature.files.length > 0, `${adapter.id} files required`);
  invariant(feature.proof && Array.isArray(feature.proof.selectors) && feature.proof.selectors.length > 0, `${adapter.id} proof selectors required`);

  const modulesRoot = path.join(outputRoot, 'modules');
  for (const relative of feature.files) {
    invariant(typeof relative === 'string' && relative, `${adapter.id} file path required`);
    const source = inside(repoRoot, path.join(repoRoot, relative));
    await copyPath(source, path.join(modulesRoot, relative));
  }

  const root = path.join(outputRoot, 'features', adapter.id);
  await fs.mkdir(root, { recursive: true });
  const hostRoot = path.join(repoRoot, 'apps', 'artifact-shell', 'publication');
  for (const name of ['feature-host.html', 'feature-host.css', 'feature-host.mjs']) {
    await fs.copyFile(path.join(hostRoot, name), path.join(root, name.replace('feature-host.', name === 'feature-host.html' ? 'index.' : 'host.')));
  }

  const entry = hrefFrom(root, path.join(modulesRoot, feature.entry));
  const styles = feature.styles.map(relative => hrefFrom(root, path.join(modulesRoot, relative)));
  const publication = Object.freeze({
    schema: 'ui-feature-publication/1',
    id: feature.id,
    label: feature.label ?? adapter.label,
    entry,
    styles: Object.freeze(styles),
  });
  await fs.writeFile(path.join(root, 'feature.json'), `${canonicalJson(publication)}\n`);
  await fs.writeFile(path.join(root, 'input.json'), `${canonicalJson(compiled.value)}\n`);
  return Object.freeze({ href: `../../features/${adapter.id}/`, proof: feature.proof });
};
