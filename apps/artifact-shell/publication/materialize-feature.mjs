import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../../packages/url-module/src/index.mjs';

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

export const materializeFeature = async ({ adapter, outputRoot, repoRoot, root, view = null, label = null }) => {
  invariant(typeof adapter.featureModule === 'string' && adapter.featureModule, `${adapter.id} featureModule required`);

  const descriptorPath = inside(repoRoot, path.join(repoRoot, adapter.featureModule));
  const loaded = await import(`${pathToFileURL(descriptorPath).href}?feature=${encodeURIComponent(adapter.id)}`);
  const feature = loaded.feature;
  invariant(feature?.id === adapter.id, `${adapter.id} feature descriptor mismatch`);
  invariant(typeof feature.entry === 'string' && feature.entry, `${adapter.id} entry required`);
  invariant(Array.isArray(feature.styles), `${adapter.id} styles required`);
  if (feature.plan !== undefined) invariant(typeof feature.plan === 'string' && feature.plan, `${adapter.id} plan path required`);
  if (view !== null) invariant(view && typeof view === 'object' && !Array.isArray(view), `${adapter.id} view must be an object`);

  const modulesRoot = path.join(outputRoot, 'modules');
  const entry = inside(modulesRoot, path.join(modulesRoot, feature.entry));
  const plan = feature.plan === undefined ? null : inside(modulesRoot, path.join(modulesRoot, feature.plan));
  const urlModule = inside(modulesRoot, path.join(modulesRoot, 'packages', 'url-module', 'src', 'index.mjs'));
  await fs.access(entry);
  if (plan) await fs.access(plan);
  await fs.access(urlModule);
  const styles = [];
  for (const relative of feature.styles) {
    invariant(typeof relative === 'string' && relative, `${adapter.id} style path required`);
    const target = inside(modulesRoot, path.join(modulesRoot, relative));
    await fs.access(target);
    styles.push(target);
  }

  await fs.mkdir(root, { recursive: true });
  const hostRoot = path.join(repoRoot, 'apps', 'artifact-shell', 'publication');
  await fs.copyFile(path.join(hostRoot, 'feature-host.html'), path.join(root, 'index.html'));
  await fs.copyFile(path.join(hostRoot, 'feature-host.css'), path.join(root, 'host.css'));
  const hostSource = await fs.readFile(path.join(hostRoot, 'feature-host.mjs'), 'utf8');
  const canonicalUrlModuleHref = '../../modules/packages/url-module/src/index.mjs';
  invariant(hostSource.includes(canonicalUrlModuleHref), 'feature host URL-module import marker required');
  await fs.writeFile(
    path.join(root, 'host.mjs'),
    hostSource.replace(canonicalUrlModuleHref, hrefFrom(root, urlModule)),
  );

  const publication = Object.freeze({
    schema: 'ui-feature-publication/1',
    id: feature.id,
    label: label ?? feature.label ?? adapter.label,
    entry: hrefFrom(root, entry),
    ...(plan === null ? {} : { plan: hrefFrom(root, plan) }),
    styles: Object.freeze(styles.map(target => hrefFrom(root, target))),
    ...(view === null ? {} : { view }),
  });
  await fs.writeFile(path.join(root, 'feature.json'), `${canonicalJson(publication)}\n`);
};
