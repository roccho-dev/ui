import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const previewRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(previewRoot, '../..');
const invariant = (condition, message) => { if (!condition) throw new Error(`ui-preview-cases: ${message}`); };

export const readPreviewCaseDeclarations = async () => {
  const source = await fs.readFile(path.join(previewRoot, 'cases.jsonl'), 'utf8');
  const rows = source.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`ui-preview-cases: line ${index + 1}: ${error.message}`); }
  });
  invariant(rows.length > 0, 'at least one case required');
  invariant(new Set(rows.map(item => item.id)).size === rows.length, 'duplicate case id');
  return Object.freeze(rows.map(item => Object.freeze(item)));
};

export const resolvePreviewCases = async () => {
  const declarations = await readPreviewCaseDeclarations();
  const resolved = [];
  for (const item of declarations) {
    invariant(typeof item.id === 'string' && item.id, 'case id required');
    invariant(typeof item.featureModule === 'string' && item.featureModule, `${item.id}: featureModule required`);
    invariant(typeof item.featureId === 'string' && item.featureId, `${item.id}: featureId required`);
    invariant(typeof item.source === 'string' && item.source, `${item.id}: source required`);
    invariant(!Object.hasOwn(item, 'entry') && !Object.hasOwn(item, 'styles'), `${item.id}: feature runtime belongs to featureModule`);

    const featurePath = path.resolve(repoRoot, item.featureModule);
    invariant(featurePath.startsWith(`${repoRoot}${path.sep}`), `${item.id}: featureModule escapes repository`);
    await fs.access(featurePath);
    await fs.access(path.resolve(repoRoot, item.source));

    const moduleUrl = new URL(pathToFileURL(featurePath));
    moduleUrl.searchParams.set('feature', item.featureId);
    moduleUrl.searchParams.set('preview-case', item.id);
    const loaded = await import(moduleUrl.href);
    const descriptor = loaded.feature;
    invariant(descriptor?.id === item.featureId, `${item.id}: feature descriptor mismatch`);
    invariant(typeof descriptor.entry === 'string' && descriptor.entry, `${item.id}: feature entry required`);
    invariant(Array.isArray(descriptor.styles), `${item.id}: feature styles required`);
    await fs.access(path.resolve(repoRoot, descriptor.entry));
    for (const style of descriptor.styles) await fs.access(path.resolve(repoRoot, style));

    const feature = Object.freeze({
      ...descriptor,
      label: item.label ?? descriptor.label ?? item.id,
      styles: Object.freeze([...descriptor.styles]),
      ...(item.view ? { view: item.view } : {}),
    });
    resolved.push(Object.freeze({ id: item.id, label: item.label ?? item.id, source: item.source, feature }));
  }
  return Object.freeze(resolved);
};
