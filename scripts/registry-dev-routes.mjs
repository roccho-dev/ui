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

function assertRouteSerializablePath(value, label) {
  assertLiteralRelative(value, label);
  const segments = value.split("/");
  if (segments[0] === "public" || segments.some((segment) => encodeURIComponent(segment) !== segment)) {
    throw new Error(`${label} must use route-serializable names and cannot name physical public/`);
  }
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

function resolvePackageResource(packageRoot, resourcePath, { allowHtml = false, label = "package resource" } = {}) {
  assertRouteSerializablePath(resourcePath, label);
  if (!allowHtml && path.extname(resourcePath).toLowerCase() === ".html") {
    throw new Error(`${label} cannot expose undeclared HTML`);
  }
  const direct = path.resolve(packageRoot, resourcePath);
  const publicFile = path.resolve(packageRoot, "public", resourcePath);
  const file = fs.existsSync(direct) ? realFile(direct, packageRoot, label) : realFile(publicFile, packageRoot, label);
  const logicalHtml = path.extname(resourcePath).toLowerCase() === ".html";
  const realHtml = path.extname(file).toLowerCase() === ".html";
  if (logicalHtml !== realHtml) throw new Error(`${label} logical and real HTML types disagree`);
  return { file, resourcePath };
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
    const browserEntryReal = configuredEntry === null ? null : resolvePackageResource(packageRoot, configuredEntry, { allowHtml: true, label: "browser entry" }).file;
    const endpointDeclarations = Object.hasOwn(manifest.uiRegistry, "browserEndpoints") ? manifest.uiRegistry.browserEndpoints : [];
    if (!Array.isArray(endpointDeclarations)) throw new Error(`browserEndpoints must be an array: ${manifestPath}`);
    if (configuredEntry === null && endpointDeclarations.length > 0) throw new Error(`headless package cannot declare browserEndpoints: ${manifestPath}`);
    const browserEndpoints = endpointDeclarations.map((endpoint) => {
      if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) throw new Error(`invalid browser endpoint: ${manifestPath}`);
      const kind = assertRouteSegment(endpoint.kind, `browser endpoint kind: ${manifestPath}`);
      const id = assertRouteSegment(endpoint.id, `browser endpoint id: ${manifestPath}`);
      assertLiteralRelative(endpoint.entry, `browser endpoint entry: ${manifestPath}`);
      if (!endpoint.entry.endsWith(".html")) throw new Error(`browser endpoint entry must be HTML: ${manifestPath}`);
      const entryReal = resolvePackageResource(packageRoot, endpoint.entry, { allowHtml: true, label: "browser endpoint entry" }).file;
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
      browserEntry: configuredEntry,
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

function packageHtml(item, entryReal = item.browserEntryReal, entryPath = item.browserEntry) {
  const entryRelative = path.posix.dirname(entryPath) === "." ? "" : path.posix.dirname(entryPath);
  return fs.readFileSync(entryReal, "utf8").replaceAll(/<(?:script|img|source|video|audio|embed|iframe|input|link|object)\b[^>]*>/gi, (tag) => {
    const tagName = /^<([a-z]+)/i.exec(tag)[1].toLowerCase();
    const resourceAttribute = tagName === "link" ? "href" : tagName === "object" ? "data" : "src";
    return tag.replaceAll(/(\s+)([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
      (attribute, whitespace, name, doubleQuoted, singleQuoted, unquoted) => {
        if (name.toLowerCase() !== resourceAttribute) return attribute;
        const value = doubleQuoted ?? singleQuoted ?? unquoted;
        if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|[?#])/i.test(value)) return attribute;
        if (unquoted !== undefined) throw new Error("local browser resources must use a quoted attribute");
        const [, source, suffix] = /^([^?#]+)(.*)$/.exec(value);
        const resourcePath = source.startsWith("/") ? source.slice(1) : path.posix.normalize(path.posix.join(entryRelative, source));
        const resource = resolvePackageResource(item.packageRootReal, resourcePath, { label: "browser resource" });
        const quote = doubleQuoted !== undefined ? '"' : "'";
        return `${whitespace}${name}=${quote}${item.url}${resource.resourcePath}${suffix}${quote}`;
      });
  });
}

function write(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

function normalizeAliasPath(value) {
  const segments = value.replaceAll("\\", "/").split("/");
  const stack = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return `/${stack.join("/")}`;
}

function tolerantPercentDecode(value) {
  return value.replaceAll(/%([0-9A-Fa-f]{2})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function touchesRegistryNamespace(rawTarget) {
  const decodedTarget = tolerantPercentDecode(rawTarget);
  const malformedElided = decodedTarget.replaceAll(/%(?![0-9A-Fa-f]{2})[^/?#\\]{0,2}/g, "");
  const candidates = [decodedTarget, malformedElided];
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(decodedTarget) || decodedTarget.startsWith("//")) {
    try {
      candidates.push(new URL(decodedTarget, "http://registry.invalid").pathname);
    } catch {
      // The tolerant candidate below still reserves recognizable registry aliases.
    }
  }
  return candidates.some((candidate) => {
    const pathname = candidate.split(/[?#]/, 1)[0];
    const normalized = normalizeAliasPath(pathname);
    return normalized === "/registry" || normalized.startsWith(REGISTRY_PREFIX) ||
      /(?:^|[\\/])registry(?:$|[\\/%?#])/.test(pathname);
  });
}

function classifyRequestTarget(requestTarget) {
  const originForm = requestTarget.startsWith("/") && !requestTarget.startsWith("//");
  const rawPathname = originForm ? requestTarget.split(/[?#]/, 1)[0] : null;
  const canonicalRegistryPath = rawPathname && (rawPathname === "/registry" || rawPathname.startsWith(REGISTRY_PREFIX));
  const canonicalSegments = canonicalRegistryPath && !requestTarget.includes("#") && !rawPathname.includes("%") && !rawPathname.includes("\\") &&
    rawPathname.split("/").every((segment, index, all) => index === 0 || segment !== "." && segment !== ".." && (segment || index === all.length - 1));
  if (canonicalSegments) return { ownership: "registry", pathname: rawPathname };
  if (touchesRegistryNamespace(requestTarget)) return { ownership: "reject", pathname: null };
  return { ownership: "legacy", pathname: null };
}

export async function createRegistryRequestHandler({ repoRoot = DEFAULT_ROOT } = {}) {
  const packages = packageEndpointInventory({ repoRoot });
  const components = await componentEndpointInventory({ repoRoot, packages });
  for (const item of packages.filter(({ renderable }) => renderable)) {
    packageHtml(item);
    for (const endpoint of item.browserEndpoints) packageHtml(item, endpoint.entryReal, endpoint.entry);
  }
  const packageByUrl = new Map(packages.filter(({ renderable }) => renderable).map((item) => [item.url, item]));
  const endpointByUrl = new Map(packages.flatMap((item) => item.browserEndpoints.map((endpoint) => [endpoint.url, { item, endpoint }])));
  const componentByUrl = new Map(components.map((item) => [item.url, item]));
  return (request, response) => {
    const requestTarget = request.url || "/";
    const classification = classifyRequestTarget(requestTarget);
    if (classification.ownership === "reject") {
      write(response, 404, "Not Found");
      return true;
    }
    if (classification.ownership === "legacy") return false;
    const pathname = classification.pathname;
    if (pathname === REGISTRY_PREFIX) {
      write(response, 200, aggregateShell(packages, components), { "cache-control": "no-store" });
      return true;
    }
    const endpoint = endpointByUrl.get(pathname);
    if (endpoint) {
      try {
        write(response, 200, packageHtml(endpoint.item, endpoint.endpoint.entryReal, endpoint.endpoint.entry), {
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
      let resource;
      try {
        resource = resolvePackageResource(resourceOwner.packageRootReal, relativeResource);
      } catch {
        write(response, 404, "Not Found");
        return true;
      }
      response.writeHead(200, { "content-type": TYPES.get(path.extname(resource.file)) || "application/octet-stream", "x-package-key": resourceOwner.key });
      response.end(fs.readFileSync(resource.file));
      return true;
    }
    write(response, 404, "Not Found");
    return true;
  };
}
