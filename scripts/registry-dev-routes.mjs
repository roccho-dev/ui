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
  if (path.posix.normalize(value) !== value || segments[0].toLowerCase() === "public" ||
      segments.some((segment) => encodeURIComponent(segment) !== segment)) {
    throw new Error(`${label} must use route-serializable names and cannot name physical public/`);
  }
}

function realDirectory(candidate, root, label, { optional = false } = {}) {
  if (optional && !fs.existsSync(candidate)) return null;
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    throw new Error(`${label} does not exist: ${candidate}`);
  }
  if (!isWithin(root, real) || !fs.statSync(real).isDirectory()) throw new Error(`${label} escapes its declared root: ${candidate}`);
  return real;
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

function hasExactPathSpelling(root, relativePath) {
  let directory = root;
  for (const segment of relativePath.split("/")) {
    if (!fs.readdirSync(directory).includes(segment)) return false;
    directory = path.join(directory, segment);
  }
  return true;
}

function resolvePackageResource(packageRoot, publicRoot, resourcePath, { allowHtml = false, label = "package resource" } = {}) {
  assertRouteSerializablePath(resourcePath, label);
  if (!allowHtml && path.extname(resourcePath).toLowerCase() === ".html") {
    throw new Error(`${label} cannot expose undeclared HTML`);
  }
  const direct = path.resolve(packageRoot, resourcePath);
  let file;
  let selectedRoot;
  let branch;
  if (fs.existsSync(direct)) {
    file = realFile(direct, packageRoot, label);
    if (publicRoot && isWithin(publicRoot, file)) throw new Error(`${label} direct path aliases physical public/`);
    selectedRoot = packageRoot;
    branch = "direct";
  } else {
    if (!publicRoot) throw new Error(`${label} does not exist: ${direct}`);
    file = realFile(path.resolve(publicRoot, resourcePath), publicRoot, label);
    selectedRoot = publicRoot;
    branch = "public";
  }
  const canonicalRelative = path.relative(selectedRoot, file).replaceAll("\\", "/");
  if (canonicalRelative !== resourcePath || !hasExactPathSpelling(selectedRoot, resourcePath)) {
    throw new Error(`${label} path spelling does not match its real file`);
  }
  const logicalHtml = path.extname(resourcePath).toLowerCase() === ".html";
  const realHtml = path.extname(file).toLowerCase() === ".html";
  if (logicalHtml !== realHtml) throw new Error(`${label} logical and real HTML types disagree`);
  return { file, resourcePath, branch };
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
    const packagePublicRoot = realDirectory(path.resolve(packageRoot, "public"), packageRoot, "package public root", { optional: true });
    const configuredEntry = manifest.uiRegistry.browserEntry;
    if (configuredEntry !== null) {
      assertLiteralRelative(configuredEntry, `browser entry: ${manifestPath}`);
      if (!configuredEntry.endsWith(".html")) throw new Error(`browser entry must be HTML or null: ${manifestPath}`);
    }
    const browserEntryResource = configuredEntry === null ? null : resolvePackageResource(packageRoot, packagePublicRoot, configuredEntry, { allowHtml: true, label: "browser entry" });
    const browserEntryReal = browserEntryResource?.file ?? null;
    const endpointDeclarations = Object.hasOwn(manifest.uiRegistry, "browserEndpoints") ? manifest.uiRegistry.browserEndpoints : [];
    if (!Array.isArray(endpointDeclarations)) throw new Error(`browserEndpoints must be an array: ${manifestPath}`);
    if (configuredEntry === null && endpointDeclarations.length > 0) throw new Error(`headless package cannot declare browserEndpoints: ${manifestPath}`);
    const browserEndpoints = endpointDeclarations.map((endpoint) => {
      if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) throw new Error(`invalid browser endpoint: ${manifestPath}`);
      const kind = assertRouteSegment(endpoint.kind, `browser endpoint kind: ${manifestPath}`);
      const id = assertRouteSegment(endpoint.id, `browser endpoint id: ${manifestPath}`);
      assertLiteralRelative(endpoint.entry, `browser endpoint entry: ${manifestPath}`);
      if (!endpoint.entry.endsWith(".html")) throw new Error(`browser endpoint entry must be HTML: ${manifestPath}`);
      const entryResource = resolvePackageResource(packageRoot, packagePublicRoot, endpoint.entry, { allowHtml: true, label: "browser endpoint entry" });
      const entryReal = entryResource.file;
      return {
        ...endpoint, kind, id,
        entryPath: path.relative(realRepoRoot, entryReal).replaceAll("\\", "/"),
        entryReal,
        entryBranch: entryResource.branch,
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
      packagePublicRootReal: packagePublicRoot,
      browserEntry: configuredEntry,
      browserEntryReal,
      browserEntryBranch: browserEntryResource?.branch ?? null,
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

const RESOURCE_ATTRIBUTES = new Map([
  ["script", new Set(["src"])],
  ["img", new Set(["src", "srcset"])],
  ["source", new Set(["src", "srcset"])],
  ["video", new Set(["src", "poster"])],
  ["audio", new Set(["src"])],
  ["embed", new Set(["src"])],
  ["iframe", new Set(["src"])],
  ["input", new Set(["src"])],
  ["link", new Set(["href"])],
  ["object", new Set(["data"])],
  ["track", new Set(["src"])],
]);

function externalResource(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

function findStartTagEnd(html, start) {
  let quote = null;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  throw new Error("browser entry contains an unterminated start tag");
}

function localSrcset(value) {
  if (/^data:/i.test(value.trim())) return false;
  return value.split(",").some((candidate) => {
    const url = candidate.trim().split(/\s+/, 1)[0];
    return !url || !externalResource(url);
  });
}

function rewriteStartTag(tag, tagName, item, entryRelative) {
  const admitted = RESOURCE_ATTRIBUTES.get(tagName);
  if (!admitted) return tag;
  const nameMatch = /^<[A-Za-z][A-Za-z0-9:-]*/.exec(tag);
  let cursor = nameMatch[0].length;
  const replacements = [];
  while (cursor < tag.length - 1) {
    while (/\s/.test(tag[cursor])) cursor += 1;
    if (tag[cursor] === ">" || tag[cursor] === "/") { cursor += 1; continue; }
    const attributeStart = cursor;
    while (cursor < tag.length && !/[\s=/>]/.test(tag[cursor])) cursor += 1;
    if (cursor === attributeStart) throw new Error("browser entry contains an unsupported start-tag form");
    const attributeName = tag.slice(attributeStart, cursor).toLowerCase();
    while (/\s/.test(tag[cursor])) cursor += 1;
    if (tag[cursor] !== "=") {
      if (admitted.has(attributeName)) throw new Error("browser resource URL must name a file");
      continue;
    }
    cursor += 1;
    while (/\s/.test(tag[cursor])) cursor += 1;
    const quote = tag[cursor] === '"' || tag[cursor] === "'" ? tag[cursor] : null;
    const valueStart = quote ? ++cursor : cursor;
    if (quote) {
      while (cursor < tag.length && tag[cursor] !== quote) cursor += 1;
      if (cursor >= tag.length) throw new Error("browser entry contains an unterminated quoted attribute");
    } else {
      while (cursor < tag.length && !/[\s>]/.test(tag[cursor])) cursor += 1;
    }
    const valueEnd = cursor;
    if (quote) cursor += 1;
    if (!admitted.has(attributeName)) continue;
    const value = tag.slice(valueStart, valueEnd);
    if (attributeName === "srcset") {
      if (localSrcset(value)) throw new Error("local srcset browser resources are unsupported");
      continue;
    }
    if (!value || value.startsWith("?") || value.startsWith("#")) {
      throw new Error("browser resource URL must name a file");
    }
    if (externalResource(value)) continue;
    if (!quote) throw new Error("local browser resources must use a quoted attribute");
    const match = /^([^?#]+)(.*)$/.exec(value);
    if (!match?.[1]) throw new Error("browser resource URL must name a file");
    const [, source, suffix] = match;
    const resourcePath = source.startsWith("/") ? source.slice(1) : path.posix.normalize(path.posix.join(entryRelative, source));
    const resource = resolvePackageResource(item.packageRootReal, item.packagePublicRootReal, resourcePath, { label: "browser resource" });
    replacements.push({ start: valueStart, end: valueEnd, value: `${item.url}${resource.resourcePath}${suffix}` });
  }
  let rewritten = tag;
  for (const replacement of replacements.reverse()) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`;
  }
  return rewritten;
}

function packageHtml(item, entryReal = item.browserEntryReal, entryPath = item.browserEntry) {
  const html = fs.readFileSync(entryReal, "utf8");
  const entryRelative = path.posix.dirname(entryPath) === "." ? "" : path.posix.dirname(entryPath);
  let result = "";
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) return result + html.slice(cursor);
    result += html.slice(cursor, start);
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end === -1) throw new Error("browser entry contains an unterminated comment");
      result += html.slice(start, end + 3);
      cursor = end + 3;
      continue;
    }
    const nameMatch = /^<([A-Za-z][A-Za-z0-9:-]*)/.exec(html.slice(start));
    if (!nameMatch) {
      result += "<";
      cursor = start + 1;
      continue;
    }
    const tagName = nameMatch[1].toLowerCase();
    const end = findStartTagEnd(html, start + nameMatch[0].length);
    result += rewriteStartTag(html.slice(start, end), tagName, item, entryRelative);
    cursor = end;
    if (tagName === "script" || tagName === "style") {
      const closing = new RegExp(`</${tagName}\\s*>`, "ig");
      closing.lastIndex = cursor;
      const match = closing.exec(html);
      if (!match) throw new Error(`browser entry contains an unterminated ${tagName} element`);
      result += html.slice(cursor, match.index + match[0].length);
      cursor = match.index + match[0].length;
    }
  }
  return result;
}

function write(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

function registryPathTrace(value) {
  const segments = value.replaceAll("\\", "/").split("/");
  const stack = [];
  let entered = false;
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
    if (stack[0] === "registry") entered = true;
  }
  const normalized = `/${stack.join("/")}`;
  return { entered, normalized, exits: entered && normalized !== "/registry" && !normalized.startsWith(REGISTRY_PREFIX) };
}

function strictDecode(value) {
  if (/%(?![0-9A-Fa-f]{2})/.test(value)) throw new Error("invalid percent triplet");
  const decoded = decodeURIComponent(value);
  if (/[\u0000-\u001f\u007f]/.test(decoded)) throw new Error("decoded request target contains a control character");
  return decoded;
}

function undecodableMayNameRegistry(value) {
  const asciiProjection = value.replaceAll(/%([0-7][0-9A-Fa-f])/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  const segments = asciiProjection.replaceAll("\\", "/").split("/");
  const stack = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
    if (stack[0]?.startsWith("reg") || "registry".startsWith(stack[0] ?? "") && stack[0]?.length >= 3) return true;
  }
  return false;
}

function classifyRequestTarget(requestTarget) {
  const delimiter = requestTarget.search(/[?#]/);
  const rawPathname = delimiter === -1 ? requestTarget : requestTarget.slice(0, delimiter);
  const suffix = delimiter === -1 ? "" : requestTarget.slice(delimiter);
  const originForm = rawPathname.startsWith("/") && !rawPathname.startsWith("//");
  let decoded;
  try {
    decoded = strictDecode(rawPathname);
  } catch {
    return { ownership: undecodableMayNameRegistry(rawPathname) ? "reject" : "legacy", pathname: null };
  }
  let aliasPath = decoded;
  if (!originForm) {
    try {
      if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(decoded)) aliasPath = new URL(decoded).pathname;
      else if (decoded.startsWith("//")) aliasPath = new URL(`http:${decoded}`).pathname;
    } catch {
      return { ownership: registryPathTrace(decoded).entered ? "reject" : "legacy", pathname: null };
    }
  }
  const trace = registryPathTrace(aliasPath);
  const directlyNamesRegistry = trace.normalized === "/registry" || trace.normalized.startsWith(REGISTRY_PREFIX);
  const literalRegistry = rawPathname === "/registry" || rawPathname.startsWith(REGISTRY_PREFIX);
  const canonicalSegments = originForm && literalRegistry && decoded === rawPathname && !suffix.includes("#") &&
    !rawPathname.includes("\\") && rawPathname.split("/").every((segment, index, all) =>
      index === 0 || segment !== "." && segment !== ".." && (segment || index === all.length - 1));
  if (canonicalSegments) return { ownership: "registry", pathname: rawPathname };
  if (trace.entered || trace.exits || directlyNamesRegistry) {
    return { ownership: "reject", pathname: null };
  }
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
        resource = resolvePackageResource(resourceOwner.packageRootReal, resourceOwner.packagePublicRootReal, relativeResource);
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
