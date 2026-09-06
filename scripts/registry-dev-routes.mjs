import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRegistry } from "../packages/core-port/src/catalog.mjs";

const REGISTRY_PREFIX = "/registry/";
const PACKAGE_PREFIX = `${REGISTRY_PREFIX}packages/`;
const COMPONENT_PREFIX = `${REGISTRY_PREFIX}components/`;
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsonl", "application/x-ndjson; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function assertLiteralRelative(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a non-empty literal relative POSIX path`);
  }
  if (/[*?{}[\]]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be a normalized literal relative POSIX path`);
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function manifestPaths(repoRoot) {
  const rootManifestPath = path.resolve(repoRoot, "package.json");
  const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, "utf8"));
  const packagePaths = rootManifest.uiRegistry?.packages;
  if (!Array.isArray(packagePaths)) throw new Error("root manifest must declare uiRegistry.packages");
  const result = [rootManifestPath, ...packagePaths.map((packagePath) => {
    assertLiteralRelative(packagePath, "uiRegistry package declaration");
    const manifestPath = path.resolve(repoRoot, packagePath, "package.json");
    if (!isWithin(repoRoot, manifestPath)) throw new Error(`package manifest escapes repository: ${packagePath}`);
    return manifestPath;
  })];
  if (new Set(result.map((item) => item.toLowerCase())).size !== result.length) {
    throw new Error("uiRegistry package declarations contain duplicate manifest paths");
  }
  return result;
}

export function packageEndpointInventory({ repoRoot = DEFAULT_ROOT } = {}) {
  const packages = manifestPaths(repoRoot).map((manifestPath) => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || !manifest.name) throw new Error(`package manifest has no name: ${manifestPath}`);
    if (!manifest.uiRegistry || !Object.hasOwn(manifest.uiRegistry, "browserEntry")) {
      throw new Error(`package manifest has no explicit uiRegistry.browserEntry: ${manifestPath}`);
    }
    const packageRoot = path.dirname(manifestPath);
    const configuredEntry = manifest.uiRegistry.browserEntry;
    if (configuredEntry !== null) {
      assertLiteralRelative(configuredEntry, `browser entry: ${manifestPath}`);
      if (!configuredEntry.endsWith(".html")) throw new Error(`browser entry must be HTML or null: ${manifestPath}`);
    }
    const browserEntryPath = configuredEntry === null ? null : path.resolve(packageRoot, configuredEntry);
    if (browserEntryPath && (!isWithin(packageRoot, browserEntryPath) || !fs.existsSync(browserEntryPath))) {
      throw new Error(`browser entry does not exist inside package: ${manifestPath}`);
    }
    const browserEndpoints = (manifest.uiRegistry.browserEndpoints ?? []).map((endpoint) => {
      if (!endpoint || typeof endpoint.kind !== "string" || typeof endpoint.id !== "string") {
        throw new Error(`invalid browser endpoint: ${manifestPath}`);
      }
      if (!endpoint.kind || !endpoint.id || endpoint.kind.includes("/") || endpoint.id.includes("/")) {
        throw new Error(`browser endpoint kind and id must be non-empty path segments: ${manifestPath}`);
      }
      assertLiteralRelative(endpoint.entry, `browser endpoint entry: ${manifestPath}`);
      const entryPath = path.resolve(packageRoot, endpoint.entry);
      if (!isWithin(packageRoot, entryPath) || !fs.existsSync(entryPath)) {
        throw new Error(`browser endpoint entry does not exist inside package: ${entryPath}`);
      }
      return {
        ...endpoint,
        entryPath: path.relative(repoRoot, entryPath).replaceAll("\\", "/"),
        url: `${PACKAGE_PREFIX}${encodeURIComponent(manifest.name)}/${encodeURIComponent(endpoint.kind)}/${encodeURIComponent(endpoint.id)}/`,
      };
    });
    if (new Set(browserEndpoints.map(({ url }) => url)).size !== browserEndpoints.length) {
      throw new Error(`duplicate package browser endpoints: ${manifestPath}`);
    }
    return {
      key: manifest.name,
      manifestPath: path.relative(repoRoot, manifestPath).replaceAll("\\", "/"),
      packageRoot: path.relative(repoRoot, packageRoot).replaceAll("\\", "/") || ".",
      browserEntry: browserEntryPath ? path.relative(repoRoot, browserEntryPath).replaceAll("\\", "/") : null,
      componentRegistry: manifest.uiRegistry.componentRegistry ?? null,
      browserEndpoints,
      renderable: Boolean(browserEntryPath),
      url: `${PACKAGE_PREFIX}${encodeURIComponent(manifest.name)}/`,
    };
  }).sort((left, right) => left.manifestPath.localeCompare(right.manifestPath));
  if (new Set(packages.map(({ key }) => key)).size !== packages.length) throw new Error("duplicate uiRegistry package names");
  return packages;
}

export function componentEndpointInventory({ repoRoot = DEFAULT_ROOT } = {}) {
  const owners = packageEndpointInventory({ repoRoot }).filter(({ componentRegistry }) => componentRegistry === "default");
  if (owners.length !== 1) throw new Error("exactly one package must own the default component registry");
  const [owner] = owners;
  const entries = defaultRegistry().list();
  if (new Set(entries.map(({ id }) => id)).size !== entries.length) throw new Error("default registry contains duplicate keys");
  return entries.map((entry) => ({
    packageKey: owner.key,
    key: entry.id,
    entry,
    url: `${COMPONENT_PREFIX}${encodeURIComponent(entry.id)}/`,
  }));
}

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#06101e;color:#edf5ff}body{max-width:64rem;margin:auto;padding:2rem}a{color:#9ec5ff}ul{columns:2}.status{color:#bdcbe0}pre{overflow:auto}</style></head><body>${body}</body></html>`;
}

function aggregateShell(packages, components) {
  const packageRows = packages.map((item) => {
    const endpoints = item.browserEndpoints.map(({ kind, id, url }) => `<li><a href="${url}">${escapeHtml(`${kind}/${id}`)}</a></li>`).join("");
    const componentsForOwner = components.filter(({ packageKey }) => packageKey === item.key)
      .map(({ key, url }) => `<li><a href="${url}">${escapeHtml(key)}</a></li>`).join("");
    const identity = escapeHtml(item.key);
    const label = item.renderable ? `<a href="${item.url}">${identity}</a>` : `<span>${identity}</span>`;
    return `<li data-package-key="${identity}" data-package-status="${item.renderable ? "browser-renderable" : "non-renderable"}">${label} <span class="status">${item.renderable ? escapeHtml(item.browserEntry) : "non-renderable"}</span>${endpoints || componentsForOwner ? `<ul>${endpoints}${componentsForOwner}</ul>` : ""}</li>`;
  }).join("");
  return shell("UI package registry", `<main data-registry-aggregate="packages"><h1>UI package registry</h1><p>Generated from canonical package manifests and the default component registry.</p><ul id="package-endpoints">${packageRows}</ul></main>`);
}

function componentShell(item) {
  return shell(`${item.key} / UI component registry`, `<main data-package-key="${escapeHtml(item.packageKey)}" data-registry-key="${escapeHtml(item.key)}"><nav><a href="/registry/">UI package registry</a></nav><h1>${escapeHtml(item.key)}</h1><pre id="registry-entry">${escapeHtml(JSON.stringify(item.entry, null, 2))}</pre></main>`);
}

function packageHtml(repoRoot, item, entry = item.browserEntry) {
  const entryPath = path.resolve(repoRoot, entry);
  const packageRoot = path.resolve(repoRoot, item.packageRoot);
  return fs.readFileSync(entryPath, "utf8").replaceAll(/(src|href)="(?![a-z]+:|\/)([^"?#]+)([^\"]*)"/gi,
    (_match, attribute, source, suffix) => {
      const resource = path.resolve(path.dirname(entryPath), source);
      if (!isWithin(packageRoot, resource)) throw new Error(`browser asset escapes package root: ${source}`);
      const packagePath = path.relative(packageRoot, resource).replaceAll("\\", "/");
      return `${attribute}="${item.url}${packagePath}${suffix}"`;
    });
}

function write(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

export function createRegistryRequestHandler({ repoRoot = DEFAULT_ROOT } = {}) {
  const packages = packageEndpointInventory({ repoRoot });
  const components = componentEndpointInventory({ repoRoot });
  const packageByUrl = new Map(packages.filter(({ renderable }) => renderable).map((item) => [item.url, item]));
  const endpointByUrl = new Map(packages.flatMap((item) => item.browserEndpoints.map((endpoint) => [endpoint.url, { item, endpoint }])));
  const componentByUrl = new Map(components.map((item) => [item.url, item]));
  return (request, response) => {
    const requestTarget = request.url || "/";
    const rawPathname = requestTarget.split(/[?#]/, 1)[0];
    const rawRegistryTarget = rawPathname === "/registry" || rawPathname.startsWith(REGISTRY_PREFIX);
    if (rawRegistryTarget && (rawPathname.includes("%") || rawPathname.includes("\\") ||
        rawPathname.split("/").some((part) => part === "." || part === ".."))) {
      write(response, 404, "Not Found");
      return true;
    }
    const pathname = new URL(requestTarget, "http://127.0.0.1").pathname;
    if (pathname !== "/registry" && !pathname.startsWith(REGISTRY_PREFIX)) return false;
    if (pathname === REGISTRY_PREFIX) {
      write(response, 200, aggregateShell(packages, components), { "cache-control": "no-store" });
      return true;
    }
    const endpoint = endpointByUrl.get(pathname);
    if (endpoint) {
      write(response, 200, packageHtml(repoRoot, endpoint.item, endpoint.endpoint.entryPath), {
        "cache-control": "no-store", "x-package-key": endpoint.item.key,
        "x-package-endpoint": `${endpoint.endpoint.kind}/${endpoint.endpoint.id}`,
      });
      return true;
    }
    const packageItem = packageByUrl.get(pathname);
    if (packageItem) {
      write(response, 200, packageHtml(repoRoot, packageItem), { "cache-control": "no-store", "x-package-key": packageItem.key });
      return true;
    }
    const component = componentByUrl.get(pathname);
    if (component) {
      write(response, 200, componentShell(component), {
        "cache-control": "no-store", "x-package-key": component.packageKey, "x-registry-key": component.key,
      });
      return true;
    }
    const resourceOwner = packages.find(({ renderable, url }) => renderable && pathname.startsWith(url));
    if (resourceOwner) {
      const relativeResource = pathname.slice(resourceOwner.url.length);
      if (!relativeResource || relativeResource.includes("%") || relativeResource.includes("\\") || relativeResource.endsWith("/") ||
          relativeResource.split("/").some((part) => !part || part === "." || part === "..")) {
        write(response, 404, "Not Found");
        return true;
      }
      const packageRoot = path.resolve(repoRoot, resourceOwner.packageRoot);
      const direct = path.resolve(packageRoot, relativeResource);
      const publicFile = path.resolve(packageRoot, "public", relativeResource);
      const file = fs.existsSync(direct) ? direct : publicFile;
      if (!isWithin(packageRoot, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        write(response, 404, "Not Found");
        return true;
      }
      response.writeHead(200, { "content-type": TYPES.get(path.extname(file)) || "application/octet-stream", "x-package-key": resourceOwner.key });
      response.end(fs.readFileSync(file));
      return true;
    }
    write(response, 404, "Not Found");
    return true;
  };
}
