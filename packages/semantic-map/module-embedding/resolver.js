import { createSemanticMap } from '../domain/index.js';
import { readSmapHash } from '../transport/index.js';
import { normalizeView } from '../protocol/index.js';
import { parseTargetRef, resolveResourceEntries } from '../resource-composition/index.js';

export const MAX_MODULE_DEPTH = 4;
export const MAX_MOUNTED_MODULES = 32;
export const MAX_MODULE_REGIONS = 512;

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-module: ${message}`);
}

function identity(mapId, head) {
  return `${mapId}\u0000${head}`;
}

function namespace(path) {
  return `@mount/${path.map((part) => encodeURIComponent(part)).join('/')}`;
}

export class ModuleResolver {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth ?? MAX_MODULE_DEPTH;
    this.maxModules = options.maxModules ?? MAX_MOUNTED_MODULES;
    this.maxRegions = options.maxRegions ?? MAX_MODULE_REGIONS;
    this.cache = new Map();
  }

  async inspectSource(src) {
    if (!this.cache.has(src)) {
      const pending = (async () => {
        const inspection = await readSmapHash(src);
        invariant(inspection, 'mount.src must contain #smap');
        invariant(inspection.envelope.proposal === null, 'mounted #smap must not contain a Proposal');
        const view = normalizeView(inspection.envelope.view);
        invariant(!view.frame, 'mounted #smap View may contain only Pattern configuration and node resourceComposition');
        for (const entry of resolveResourceEntries(view.resourceComposition)) {
          invariant(
            parseTargetRef(entry.placement.targetRef).catalog === 'node',
            'mounted #smap resourceComposition may target only child nodes',
          );
        }
        return Object.freeze({
          src,
          mapId: inspection.base.mapId,
          head: inspection.base.head,
          domain: createSemanticMap(inspection.base.records),
          view,
        });
      })();
      this.cache.set(src, pending);
      pending.catch(() => this.cache.delete(src));
    }
    return this.cache.get(src);
  }

  async resolveRecords(records, context) {
    return this.resolve(createSemanticMap(records), context);
  }

  async resolve(domain, context = {}) {
    const rootView = normalizeView(context.view ?? null);
    const rootMapId = String(context.mapId ?? 'semantic-map:root');
    const rootHead = String(context.head ?? 'root');
    const counters = { modules: 0, regions: 0, mountedRegions: 0, maxDepth: 0 };

    const build = async ({ currentDomain, mapId, head, view, path, depth, ancestry, source = null }) => {
      counters.regions += currentDomain.regions.size;
      // The root State is not introduced by mounting; only mounted child
      // regions consume the recursive module budget.
      if (depth > 0) {
        counters.mountedRegions += currentDomain.regions.size;
        invariant(
          counters.mountedRegions <= this.maxRegions,
          `mounted region count exceeds ${this.maxRegions}`,
        );
      }
      counters.maxDepth = Math.max(counters.maxDepth, depth);
      const mounts = new Map();
      const mountSources = new Map();
      for (const entry of resolveResourceEntries(view.resourceComposition)) {
        const target = parseTargetRef(entry.placement.targetRef);
        if (entry.resource.contract !== 'semantic-map-envelope/3' || target.catalog !== 'node') continue;
        mountSources.set(target.id, entry.resource.source.href);
      }

      for (const region of currentDomain.regions.values()) {
        const explicitSource = region.mount?.src ?? null;
        const resourceSource = mountSources.get(region.id) ?? null;
        invariant(
          !(explicitSource && resourceSource),
          `region.mount conflicts with resource semantic-map at ${region.id}`,
        );
        const sourceUrl = explicitSource ?? resourceSource;
        if (!sourceUrl) continue;
        mountSources.set(region.id, sourceUrl);
        invariant(depth < this.maxDepth, `mount depth exceeds ${this.maxDepth} at ${region.id}`);
        counters.modules += 1;
        invariant(counters.modules <= this.maxModules, `mounted module count exceeds ${this.maxModules}`);

        const inspected = await this.inspectSource(sourceUrl);
        const childIdentity = identity(inspected.mapId, inspected.head);
        invariant(!ancestry.has(childIdentity), `module cycle at ${region.id}`);
        const childPath = Object.freeze([...path, region.id]);
        const child = await build({
          currentDomain: inspected.domain,
          mapId: inspected.mapId,
          head: inspected.head,
          view: inspected.view,
          path: childPath,
          depth: depth + 1,
          ancestry: new Set([...ancestry, childIdentity]),
          source: inspected.src,
        });
        mounts.set(region.id, child);
      }

      return Object.freeze({
        namespace: path.length ? namespace(path) : '',
        source,
        mapId,
        head,
        domain: currentDomain,
        view,
        pattern: view.pattern,
        mounts,
        mountSources,
      });
    };

    const rootIdentity = identity(rootMapId, rootHead);
    const root = await build({
      currentDomain: domain,
      mapId: rootMapId,
      head: rootHead,
      view: rootView,
      path: Object.freeze([]),
      depth: 0,
      ancestry: new Set([rootIdentity]),
    });

    return Object.freeze({
      root,
      moduleCount: counters.modules,
      regionCount: counters.regions,
      maxDepth: counters.maxDepth,
    });
  }
}
