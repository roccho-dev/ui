import { createHttpResource } from './http-resource.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`ui-feature-host: ${message}`); };
const sameOriginUrl = (value, base) => {
  const url = new URL(value, base);
  invariant(url.origin === base.origin, `same-origin URL required: ${value}`);
  return url;
};
const readData = async base => {
  if (!base.hash) return null;
  const moduleUrl = new URL('../../modules/packages/url-module/src/index.mjs', import.meta.url);
  const { readUrlModule } = await import(moduleUrl.href);
  return readUrlModule({ fragment: 'data', input: base.href });
};
const readSource = async ({ base, scope }) => {
  if (!base.searchParams.has('source')) return null;
  invariant(!base.hash, 'source and #data are mutually exclusive');
  const source = base.searchParams.get('source');
  invariant(source, 'source URL required');
  const href = sameOriginUrl(source, base).href;
  const resource = createHttpResource({ fetch: scope.fetch.bind(scope), href });
  return Object.freeze({ input: await resource.read(), resource });
};

export const bootFeatureHost = async ({ scope = globalThis } = {}) => {
  const base = new URL(scope.location.href);
  const root = scope.document.querySelector('#feature');
  const fatal = scope.document.querySelector('#fatal');
  invariant(root && fatal, 'feature/fatal mount required');

  const response = await scope.fetch(new URL('./feature.json', base), { cache: 'no-store', credentials: 'omit' });
  invariant(response.ok, `feature.json returned ${response.status}`);
  const feature = await response.json();
  invariant(feature?.schema === 'ui-feature-publication/1', 'feature schema is invalid');
  invariant(typeof feature.id === 'string' && feature.id, 'feature id required');
  invariant(typeof feature.entry === 'string' && feature.entry, 'feature entry required');
  invariant(Array.isArray(feature.styles), 'feature styles required');

  scope.document.title = feature.label || feature.id;
  for (const href of feature.styles) {
    const link = scope.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sameOriginUrl(href, base).href;
    scope.document.head.append(link);
  }

  const sourced = await readSource({ base, scope });
  const resource = sourced?.resource ?? null;
  let input;
  if (sourced) input = sourced.input;
  else input = await readData(base);
  if (!sourced && input === null) {
    const inputResponse = await scope.fetch(new URL('./input.json', base), { cache: 'no-store', credentials: 'omit' });
    invariant(inputResponse.ok, `input.json returned ${inputResponse.status}`);
    input = await inputResponse.json();
  }
  const module = await import(sameOriginUrl(feature.entry, base).href);
  invariant(typeof module.mountFeature === 'function', 'mountFeature export required');
  const mounted = await module.mountFeature({ feature, input, resource, root, scope });

  scope.document.documentElement.dataset.status = 'pass';
  scope.uiFeatureProof = Object.freeze({ feature, mounted: mounted ?? null, status: 'PASS' });
  return scope.uiFeatureProof;
};

if (globalThis.location?.protocol === 'http:' || globalThis.location?.protocol === 'https:') {
  bootFeatureHost().catch(error => {
    document.documentElement.dataset.status = 'fail';
    const fatal = document.querySelector('#fatal');
    if (fatal) { fatal.hidden = false; fatal.textContent = `BLOCKED · ${error.message}`; }
    globalThis.uiFeatureProof = Object.freeze({ error: String(error.message), status: 'FAIL' });
  });
}
