import {existsSync, readFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultRegistry} from '../../../../src/catalog.mjs';

const REGISTRY_ROUTE_PREFIX = '/registry/';
const PACKAGE_ROUTE_PREFIX = '/registry/packages/';
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const VITE_ROUTE_PREFIXES = ['src', 'a2ui', 'assets', '@vite', '@id', 'node_modules']
  .map((segment) => `${REGISTRY_ROUTE_PREFIX}${segment}/`);

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function canonicalManifestPaths() {
  const rootManifestPath = resolve(REPO_ROOT, 'package.json');
  const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
  if (!Array.isArray(rootManifest.workspaces)) throw new Error('root package manifest must declare workspace packages');
  const workspaceManifests = rootManifest.workspaces.map((workspace) => {
    if (typeof workspace !== 'string' || /[*?{}[\]]/.test(workspace)) {
      throw new Error('ui registry workspace declarations must be literal package paths');
    }
    return resolve(REPO_ROOT, workspace, 'package.json');
  });
  return [rootManifestPath, ...workspaceManifests];
}

export function packageEndpointInventory() {
  const packages = canonicalManifestPaths().map((manifestPath) => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest.name) throw new Error(`package manifest has no name: ${manifestPath}`);
    if (!manifest.uiRegistry || !Object.hasOwn(manifest.uiRegistry, 'browserEntry')) {
      throw new Error(`package manifest has no explicit uiRegistry.browserEntry: ${manifestPath}`);
    }
    const configuredEntry = manifest.uiRegistry.browserEntry;
    if (configuredEntry !== null && (typeof configuredEntry !== 'string' || !configuredEntry.endsWith('.html'))) {
      throw new Error(`package browser entry must be an HTML path or null: ${manifestPath}`);
    }
    const browserEntryPath = configuredEntry === null ? null : resolve(dirname(manifestPath), configuredEntry);
    if (browserEntryPath && !existsSync(browserEntryPath)) throw new Error(`package browser entry does not exist: ${browserEntryPath}`);
    return {
      key: manifest.name,
      manifestPath: relative(REPO_ROOT, manifestPath).replaceAll('\\', '/'),
      browserEntry: browserEntryPath ? relative(REPO_ROOT, browserEntryPath).replaceAll('\\', '/') : null,
      componentRegistry: manifest.uiRegistry.componentRegistry ?? null,
      renderable: Boolean(browserEntryPath),
      url: `${PACKAGE_ROUTE_PREFIX}${encodeURIComponent(manifest.name)}/`,
    };
  }).sort((a, b) => a.manifestPath.localeCompare(b.manifestPath));
  if (new Set(packages.map(({key}) => key)).size !== packages.length) {
    throw new Error('canonical package manifests contain duplicate names');
  }
  return packages;
}

export function registryEndpointInventory() {
  const owners = packageEndpointInventory().filter(({componentRegistry}) => componentRegistry === 'default');
  if (owners.length !== 1) throw new Error('exactly one package must own the default component registry');
  const [owner] = owners;
  const entries = defaultRegistry().list();
  const keys = entries.map((entry) => entry.id);
  if (new Set(keys).size !== keys.length) throw new Error('canonical registry contains duplicate keys');
  return entries.map((entry) => ({
    packageKey: owner.key,
    key: entry.id,
    url: `${PACKAGE_ROUTE_PREFIX}${encodeURIComponent(owner.key)}/components/${encodeURIComponent(entry.id)}/`,
    entry,
  }));
}

function sharedShell({title, body, script = ''}) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Canonical UI package and component registry development surface">
<title>${escapeHtml(title)}</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#06101e;color:#edf5ff}body{max-width:64rem;margin:0 auto;padding:2rem}a{color:#9ec5ff}ul{columns:2}pre{overflow:auto;padding:1rem;border:1px solid #30445f;border-radius:.5rem}.status{color:#bdcbe0}
</style></head><body>${body}${script}</body></html>`;
}

function aggregateShell(packages, components) {
  const rows = packages.map((item) => {
    const identity = escapeHtml(item.key);
    if (item.renderable) return `<li data-package-key="${identity}" data-package-status="browser-renderable"><a href="${item.url}">${identity}</a> <span class="status">browser-renderable · ${escapeHtml(item.browserEntry)}</span></li>`;
    const links = components.filter(({packageKey}) => packageKey === item.key)
      .map(({key, url}) => `<li><a href="${url}">${escapeHtml(key)}</a></li>`).join('');
    return `<li data-package-key="${identity}" data-package-status="non-renderable"><span>${identity}</span> <span class="status">non-renderable package · ${escapeHtml(item.manifestPath)}</span>${links ? `<ul>${links}</ul>` : ''}</li>`;
  }).join('');
  return sharedShell({title: 'UI package registry', body: `<main data-registry-aggregate="packages"><h1>UI package registry</h1><p>Generated from canonical package manifests and the default component registry.</p><ul id="package-endpoints">${rows}</ul></main>`});
}

function componentShell({packageKey, key, url, entry}) {
  return sharedShell({title: `${key} / UI component registry`, body: `<main data-package-key="${escapeHtml(packageKey)}" data-registry-key="${escapeHtml(key)}"><nav><a href="/registry/">UI package registry</a></nav><p>Canonical registry component</p><h1>${escapeHtml(key)}</h1><p><code>${escapeHtml(url)}</code></p><pre id="registry-entry">${escapeHtml(JSON.stringify(entry, null, 2))}</pre></main>`});
}

function packageDevelopmentHtml(item) {
  const entryPath = resolve(REPO_ROOT, item.browserEntry);
  const packageRoot = resolve(REPO_ROOT, dirname(item.manifestPath));
  return readFileSync(entryPath, 'utf8').replaceAll(/(src|href)="(?![a-z]+:|\/)([^"]+)"/gi, (match, attribute, source) => {
    const packagePath = relative(packageRoot, resolve(dirname(entryPath), source)).replaceAll('\\', '/');
    if (packagePath.startsWith('../')) throw new Error(`browser asset escapes package root: ${source}`);
    return `${attribute}="${REGISTRY_ROUTE_PREFIX}${packagePath}"`;
  });
}

function notFound(response) {
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('Not Found');
}

export function registryDevRoutesPlugin() {
  const packages = packageEndpointInventory();
  const components = registryEndpointInventory();
  const packageByUrl = new Map(packages.filter(({renderable}) => renderable).map((item) => [item.url, item]));
  const componentByUrl = new Map(components.map((item) => [item.url, item]));
  return {
    name: 'ui-registry-development-routes',
    transformIndexHtml: {order: 'pre', handler(html, context) { return context.path.endsWith('/registry/index.html') ? aggregateShell(packages, components) : html; }},
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
        if (pathname === REGISTRY_ROUTE_PREFIX) {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(aggregateShell(packages, components));
          return;
        }
        if (VITE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return next();
        const packageItem = packageByUrl.get(pathname);
        if (packageItem) {
          const html = packageDevelopmentHtml(packageItem);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Package-Key', packageItem.key);
          response.end(html);
          return;
        }
        const componentItem = componentByUrl.get(pathname);
        if (componentItem) {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Package-Key', componentItem.packageKey);
          response.setHeader('X-Registry-Key', componentItem.key);
          response.end(componentShell(componentItem));
          return;
        }
        if (pathname.startsWith(REGISTRY_ROUTE_PREFIX)) return notFound(response);
        next();
      });
    },
  };
}
