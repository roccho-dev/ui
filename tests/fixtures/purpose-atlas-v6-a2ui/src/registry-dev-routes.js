import {defaultRegistry} from '../../../../src/catalog.mjs';

const REGISTRY_ROUTE_PREFIX = '/registry/';
const VITE_ROUTE_PREFIXES = ['src', 'a2ui', 'assets', '@vite', '@id', 'node_modules']
  .map((segment) => `${REGISTRY_ROUTE_PREFIX}${segment}/`);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function registryEndpointInventory() {
  const entries = defaultRegistry().list();
  const keys = entries.map((entry) => entry.id);
  if (new Set(keys).size !== keys.length) throw new Error('canonical registry contains duplicate keys');
  return entries.map((entry) => ({
    key: entry.id,
    url: `${REGISTRY_ROUTE_PREFIX}${encodeURIComponent(entry.id)}/`,
    entry,
  }));
}

function sharedShell({title, body, script = ''}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Canonical UI component registry development surface">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #06101e; color: #edf5ff; }
    body { max-width: 56rem; margin: 0 auto; padding: 2rem; }
    a { color: #9ec5ff; } ul { columns: 2; } pre { overflow: auto; padding: 1rem; border: 1px solid #30445f; border-radius: .5rem; }
  </style>
</head>
<body>
${body}
${script}
</body>
</html>`;
}

function componentShell({key, url, entry}) {
  const identity = escapeHtml(key);
  const descriptor = escapeHtml(JSON.stringify(entry, null, 2));
  return sharedShell({
    title: `${key} / UI component registry`,
    body: `<div data-registry-key="${identity}">
  <nav><a href="/registry/">UI component registry</a></nav>
  <main>
    <p>Canonical registry component</p>
    <h1>${identity}</h1>
    <p><code>${escapeHtml(url)}</code></p>
    <pre id="registry-entry">${descriptor}</pre>
  </main>
 </div>`,
  });
}

function aggregateShell(inventory, scriptPath = '/registry/src/main.js') {
  const links = inventory
    .map(({key, url}) => `<li><a href="${escapeHtml(url)}">${escapeHtml(key)}</a></li>`)
    .join('\n');
  return sharedShell({
    title: 'UI component registry',
    body: `<main>
  <h1>UI component registry</h1>
  <p>Canonical development endpoints generated from the default registry.</p>
  <ul id="registry-endpoints">${links}</ul>
  <section aria-label="Registry source UI witness"><purpose-atlas-app></purpose-atlas-app></section>
</main>`,
    script: `<script type="module" src="${escapeHtml(scriptPath)}"></script>`,
  });
}

function notFound(response) {
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end('Not Found');
}

export function registryDevRoutesPlugin() {
  const inventory = registryEndpointInventory();
  const byKey = new Map(inventory.map((item) => [item.key, item]));
  return {
    name: 'ui-registry-development-routes',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, context) {
        return aggregateShell(inventory, context.server ? 'src/main.js' : '../src/main.js');
      },
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
        if (pathname === REGISTRY_ROUTE_PREFIX) {
          request.url = '/registry/registry/index.html';
          next();
          return;
        }
        if (VITE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
          next();
          return;
        }
        if (!pathname.startsWith(REGISTRY_ROUTE_PREFIX)) {
          next();
          return;
        }
        const encodedKey = pathname.slice(REGISTRY_ROUTE_PREFIX.length, -1);
        if (!pathname.endsWith('/') || !encodedKey || encodedKey.includes('/')) {
          notFound(response);
          return;
        }
        let key;
        try {
          key = decodeURIComponent(encodedKey);
        } catch {
          notFound(response);
          return;
        }
        const item = byKey.get(key);
        if (!item || encodeURIComponent(key) !== encodedKey) {
          notFound(response);
          return;
        }
        const html = componentShell(item);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Registry-Key', key);
        response.end(html);
      });
    },
  };
}
