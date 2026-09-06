import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function assertRouteSegment(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === "." || value === "..") {
    throw new Error(`${label} must be one literal URL segment`);
  }
  return value;
}

function realFile(candidate, root, label) {
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    throw new Error(`${label} does not exist: ${candidate}`);
  }
  if (!isWithin(root, real) || !fs.statSync(real).isFile()) throw new Error(`${label} escapes its declared root: ${candidate}`);
  return real;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function manifestPaths(repoRoot) {
  const realRepoRoot = fs.realpathSync(repoRoot);
  const rootManifestPath = realFile(path.resolve(realRepoRoot, "package.json"), realRepoRoot, "root manifest");
  const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, "utf8"));
  const packagePaths = rootManifest.uiRegistry?.packages;
  if (!Array.isArray(packagePaths)) throw new Error("root manifest must declare uiRegistry.packages");
  const result = [rootManifestPath, ...packagePaths.map((packagePath) => {
    assertLiteralRelative(packagePath, "uiRegistry package declaration");
    return realFile(path.resolve(realRepoRoot, packagePath, "package.json"), realRepoRoot, "package manifest");
  })];
  if (new Set(result.map((item) => item.toLowerCase())).size !== result.length) {
    throw new Error("uiRegistry package declarations contain duplicate real manifest paths");
  }
  return { realRepoRoot, paths: result };
}

function componentRegistryDeclaration(value, packageRoot, manifestPath) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== "default" ||
      typeof value.module !== "string" || value.export !== "defaultRegistry") {
    throw new Error(`componentRegistry must be null or the declared default registry source: ${manifestPath}`);
  }
  assertLiteralRelative(value.module, `component registry module: ${manifestPath}`);
  if (!/\.[cm]?js$/.test(value.module)) throw new Error(`component registry module must be JavaScript: ${manifestPath}`);
  return { id: value.id, module: value.module, export: value.export, modulePath: realFile(path.resolve(packageRoot, value.module), packageRoot, "component registry module") };
}

export function packageEndpointInventory({ repoRoot = DEFAULT_ROOT } = {}) {
  const { realRepoRoot, paths } = manifestPaths(repoRoot);
  const packages = paths.map((manifestPath) => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const key = assertRouteSegment(manifest.name, `package name: ${manifestPath}`);
    if (!manifest.uiRegistry || !Object.hasOwn(manifest.uiRegistry, "browserEntry")) {
      throw new Error(`package manifest has no explicit uiRegistry.browserEntry: ${manifestPath}`);
    }
    if (!Object.hasOwn(manifest.uiRegistry, "componentRegistry")) {
      throw new Error(`package manifest has no explicit uiRegistry.componentRegistry: ${manifestPath}`);
    }
    const packageRoot = fs.realpathSync(path.dirname(manifestPath));
    const configuredEntry = manifest.uiRegistry.browserEntry;
    if (configuredEntry !== null) {
      assertLiteralRelative(configuredEntry, `browser entry: ${manifestPath}`);
      if (!configuredEntry.endsWith(".html")) throw new Error(`browser entry must be HTML or null: ${manifestPath}`);
    }
    const browserEntryReal = configuredEntry === null ? null : realFile(path.resolve(packageRoot, configuredEntry), packageRoot, "browser entry");
    const endpointDeclarations = Object.hasOwn(manifest.uiRegistry, "browserEndpoints") ? manifest.uiRegistry.browserEndpoints : [];
    if (!Array.isArray(endpointDeclarations)) throw new Error(`browserEndpoints must be an array: ${manifestPath}`);
    if (configuredEntry === null && endpointDeclarations.length > 0) throw new Error(`headless package cannot declare browserEndpoints: ${manifestPath}`);
    const browserEndpoints = endpointDeclarations.map((endpoint) => {
      if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) throw new Error(`invalid browser endpoint: ${manifestPath}`);
      const kind = assertRouteSegment(endpoint.kind, `browser endpoint kind: ${manifestPath}`);
      const id = assertRouteSegment(endpoint.id, `browser endpoint id: ${manifestPath}`);
      assertLiteralRelative(endpoint.entry, `browser endpoint entry: ${manifestPath}`);
      if (!endpoint.entry.endsWith(".html")) throw new Error(`browser endpoint entry must be HTML: ${manifestPath}`);
      const entryReal = realFile(path.resolve(packageRoot, endpoint.entry), packageRoot, "browser endpoint entry");
      return {
        ...endpoint, kind, id,
        entryPath: path.relative(realRepoRoot, entryReal).replaceAll("\\", "/"),
        entryReal,
        url: `${PACKAGE_PREFIX}${key}/${kind}/${id}/`,
      };
    });
    if (new Set(browserEndpoints.map(({ url }) => url)).size !== browserEndpoints.length) {
      throw new Error(`duplicate package browser endpoints: ${manifestPath}`);
    }
    const componentRegistry = componentRegistryDeclaration(manifest.uiRegistry.componentRegistry, packageRoot, manifestPath);
    return {
      key,
      manifestPath: path.relative(realRepoRoot, manifestPath).replaceAll("\\", "/"),
      packageRoot: path.relative(realRepoRoot, packageRoot).replaceAll("\\", "/") || ".",
      packageRootReal: packageRoot,
      browserEntry: browserEntryReal ? path.relative(realRepoRoot, browserEntryReal).replaceAll("\\", "/") : null,
      browserEntryReal,
      componentRegistry,
      browserEndpoints,
      renderable: Boolean(browserEntryReal),
      url: `${PACKAGE_PREFIX}${key}/`,
    };
  }).sort((left, right) => left.manifestPath.localeCompare(right.manifestPath));
  if (new Set(packages.map(({ key }) => key)).size !== packages.length) throw new Error("duplicate uiRegistry package names");
  return packages;
}

export async function componentEndpointInventory({ repoRoot = DEFAULT_ROOT, packages = packageEndpointInventory({ repoRoot }) } = {}) {
  const owners = packages.filter(({ componentRegistry }) => componentRegistry?.id === "default");
  if (owners.length !== 1) throw new Error("exactly one package must own the default component registry");
  const [owner] = owners;
  const declaration = owner.componentRegistry;
  const source = await import(pathToFileURL(declaration.modulePath).href);
  const factory = source[declaration.export];
  if (typeof factory !== "function") throw new Error(`declared registry export is not a function: ${declaration.export}`);
  const registry = factory();
  if (!registry || typeof registry.list !== "function") throw new Error("declared registry factory must return a registry with list()");
  const entries = registry.list();
  if (!Array.isArray(entries)) throw new Error("declared registry list() must return an array");
  const keys = entries.map((entry) => assertRouteSegment(entry?.id, "component registry id"));
  if (new Set(keys).size !== keys.length) throw new Error("default registry contains duplicate keys");
  return entries.map((entry, index) => ({
    packageKey: owner.key,
    key: keys[index],
    entry,
    url: `${COMPONENT_PREFIX}${keys[index]}/`,
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
  return shell("UI package registry", `<main data-registry-aggregate="packages"><h1>UI package registry</h1><p>Generated from canonical package manifests and the declared default component registry.</p><ul id="package-endpoints">${packageRows}</ul></main>`);
}

function componentShell(item) {
  return shell(`${item.key} / UI component registry`, `<main data-package-key="${escapeHtml(item.packageKey)}" data-registry-key="${escapeHtml(item.key)}"><nav><a href="/registry/">UI package registry</a></nav><h1>${escapeHtml(item.key)}</h1><pre id="registry-entry">${escapeHtml(JSON.stringify(item.entry, null, 2))}</pre></main>`);
}

function packageHtml(item, entryReal = item.browserEntryReal) {
  return fs.readFileSync(entryReal, "utf8").replaceAll(/(<(?:script|img|source|video|audio|embed)\b[^>]*\bsrc|<link\b[^>]*\bhref|<object\b[^>]*\bdata)="(?![a-z][a-z0-9+.-]*:|\/\/)([^"?#]+)([^\"]*)"/gi,
    (_match, prefix, source, suffix) => {
      const unresolved = source.startsWith("/") ? path.resolve(item.packageRootReal, source.slice(1)) : path.resolve(path.dirname(entryReal), source);
      const resource = realFile(unresolved, item.packageRootReal, "browser resource");
      const packagePath = path.relative(item.packageRootReal, resource).replaceAll("\\", "/");
      return `${prefix}="${item.url}${packagePath}${suffix}"`;
    });
}

function write(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

export async function createRegistryRequestHandler({ repoRoot = DEFAULT_ROOT } = {}) {
  const packages = packageEndpointInventory({ repoRoot });
  const components = await componentEndpointInventory({ repoRoot, packages });
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
      try {
        write(response, 200, packageHtml(endpoint.item, endpoint.endpoint.entryReal), {
          "cache-control": "no-store", "x-package-key": endpoint.item.key,
          "x-package-endpoint": `${endpoint.endpoint.kind}/${endpoint.endpoint.id}`,
        });
      } catch {
        write(response, 404, "Not Found");
      }
      return true;
    }
    const packageItem = packageByUrl.get(pathname);
    if (packageItem) {
      try {
        write(response, 200, packageHtml(packageItem), { "cache-control": "no-store", "x-package-key": packageItem.key });
      } catch {
        write(response, 404, "Not Found");
      }
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
      const direct = path.resolve(resourceOwner.packageRootReal, relativeResource);
      const publicFile = path.resolve(resourceOwner.packageRootReal, "public", relativeResource);
      const unresolved = fs.existsSync(direct) ? direct : publicFile;
      let file;
      try {
        file = realFile(unresolved, resourceOwner.packageRootReal, "package resource");
      } catch {
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
