import {
  MAP_PATTERN,
  normalizePattern,
  normalizePatternConfig,
  patternConfigKey,
  relationVisualForPattern,
  shapeForPattern,
  getViewTypeProjection,
} from '../pattern/index.js';
import { projectSetOverlay } from './set-overlay.js';
import { applyPresentationLayout, normalizePresentationProjection } from './presentation-projection.js';
import { voronoiCells } from './terrain.js';
import { normalizeResourceComposition, parseTargetRef, resolveResourceEntries } from '../resource-composition/index.js';

const DETAIL_AREA_PX2 = 160_000;
const VIEWPORT_MARGIN_PX = 80;
export const MAX_SCENE_PRIMITIVES = 2_048;

function assertScenePrimitiveBudget(count) {
  if (count > MAX_SCENE_PRIMITIVES) {
    throw new Error(`semantic-projection: scene primitive count exceeds ${MAX_SCENE_PRIMITIVES}`);
  }
}

function projectionView(input) {
  const value = typeof input === 'string' ? { pattern: input } : input;
  invariant(value && typeof value === 'object', 'View is required');
  const pattern = normalizePattern(value.pattern);
  const result = { pattern };
  const configKey = patternConfigKey(pattern);
  if (configKey !== null) {
    invariant(Object.hasOwn(value, configKey), `View.${configKey} is required for Pattern ${pattern}`);
    result[configKey] = normalizePatternConfig(pattern, value[configKey]);
  }
  if (value.resourceComposition) result.resourceComposition = normalizeResourceComposition(value.resourceComposition);
  return Object.freeze(result);
}

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-projection: ${message}`);
}

function intersect(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function clippedBounds(bounds, clipBounds) {
  return clipBounds ? intersect(bounds, clipBounds) : bounds;
}

function inflate(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function area(rect) {
  return rect.width * rect.height;
}

function identityTransform() {
  return Object.freeze({ scale: 1, translateX: 0, translateY: 0 });
}

function transformBounds(bounds, transform) {
  return Object.freeze({
    x: bounds.x * transform.scale + transform.translateX,
    y: bounds.y * transform.scale + transform.translateY,
    width: bounds.width * transform.scale,
    height: bounds.height * transform.scale,
  });
}

function mountedTransform(rootBounds, targetBounds) {
  const smallest = Math.min(targetBounds.width, targetBounds.height);
  const padding = Math.min(20, Math.max(3, smallest * 0.06));
  const content = {
    x: targetBounds.x + padding,
    y: targetBounds.y + padding,
    width: Math.max(1, targetBounds.width - padding * 2),
    height: Math.max(1, targetBounds.height - padding * 2),
  };
  const scale = Math.min(content.width / rootBounds.width, content.height / rootBounds.height);
  const renderedWidth = rootBounds.width * scale;
  const renderedHeight = rootBounds.height * scale;
  return Object.freeze({
    scale,
    translateX: content.x + (content.width - renderedWidth) / 2 - rootBounds.x * scale,
    translateY: content.y + (content.height - renderedHeight) / 2 - rootBounds.y * scale,
  });
}

function encoded(value) {
  return encodeURIComponent(value);
}

function sceneId(node) {
  return node.namespace || 'root';
}

function regionProjectionId(node, regionId) {
  return node.namespace ? `${node.namespace}/region/${encoded(regionId)}` : regionId;
}

function relationProjectionId(node, relationId) {
  return node.namespace ? `${node.namespace}/relation/${encoded(relationId)}` : relationId;
}

function guideProjectionId(node, guideId) {
  return `${node.namespace || '@root'}/guide/${encoded(guideId)}`;
}

function fallbackModules(domain, view) {
  return Object.freeze({
    root: Object.freeze({
      namespace: '',
      source: null,
      mapId: null,
      head: null,
      domain,
      view,
      mounts: new Map(),
      mountSources: new Map(),
    }),
    moduleCount: 0,
    regionCount: domain.regions.size,
    maxDepth: 0,
  });
}

function createPlan(node) {
  return getViewTypeProjection(node.view.pattern).createPlan(node.domain, node.view);
}

function planKey(view) {
  return getViewTypeProjection(view.pattern).planKey(view);
}

function validateNode(node, resolvePlan = createPlan) {
  invariant(node.view, `Scene ${sceneId(node)} has no View`);
  projectionView(node.view);
  resolvePlan(node);
  for (const child of node.mounts.values()) validateNode(child, resolvePlan);
}

export function validateSceneGraph(domain, modules, view) {
  const normalized = projectionView(view);
  const resolved = modules ?? fallbackModules(domain, normalized);
  const root = Object.freeze({ ...resolved.root, domain, view: normalized });
  validateNode(root);
  return Object.freeze({
    rootPattern: normalized.pattern,
    scenes: resolved.moduleCount + 1,
  });
}

export class SemanticProjector {
  constructor(domain, modules = null, view, options = {}) {
    this.domain = domain;
    this.modules = modules;
    this.view = projectionView(view);
    this.presentationProjection = normalizePresentationProjection(options.presentationProjection ?? null);
    this.geoFeatureCache = new WeakMap();
    this.planCache = new WeakMap();
    this.presentationPlanCache = new WeakMap();
  }

  planForNode(node) {
    let plans = this.planCache.get(node.domain);
    if (!plans) {
      plans = new Map();
      this.planCache.set(node.domain, plans);
    }
    const key = planKey(node.view);
    if (!plans.has(key)) plans.set(key, createPlan(node));
    const plan = plans.get(key);
    if (node.namespace || !this.presentationProjection) return plan;
    let projectedPlans = this.presentationPlanCache.get(plan);
    if (!projectedPlans) {
      projectedPlans = new WeakMap();
      this.presentationPlanCache.set(plan, projectedPlans);
    }
    if (!projectedPlans.has(this.presentationProjection)) {
      projectedPlans.set(
        this.presentationProjection,
        applyPresentationLayout(plan, node.domain, this.presentationProjection),
      );
    }
    return projectedPlans.get(this.presentationProjection);
  }

  geoFeatureIdsFor(domain) {
    if (!this.geoFeatureCache.has(domain)) {
      this.geoFeatureCache.set(
        domain,
        new Set((domain.meta.geoSpec?.features ?? []).map((feature) => feature.id)),
      );
    }
    return this.geoFeatureCache.get(domain);
  }

  setDomain(domain) {
    this.domain = domain;
  }

  setModules(modules) {
    this.modules = modules;
  }

  setPresentationProjection(projection) {
    this.presentationProjection = normalizePresentationProjection(projection);
  }

  setView(view) {
    this.view = projectionView(view);
  }

  project({ scale, viewport }) {
    invariant(typeof scale === 'number' && Number.isFinite(scale) && scale > 0, 'scale must be positive');
    const modules = this.modules ?? fallbackModules(this.domain, this.view);
    const rootNode = Object.freeze({ ...modules.root, domain: this.domain, view: this.view });
    validateNode(rootNode, (node) => this.planForNode(node));

    const visibleViewport = inflate(viewport, VIEWPORT_MARGIN_PX / scale);
    const representations = [];
    const representationsById = new Map();
    const guides = [];
    const scenes = [];
    const contexts = [];
    const visibleIds = new Set();
    const aggregate = new Map();
    const selectionProxies = Object.create(null);
    const detailIds = new Set();
    const nodePlan = (node) => this.planForNode(node);

    const resourceIndexes = new WeakMap();
    const resourceIndexFor = (node) => {
      if (!resourceIndexes.has(node)) {
        const index = new Map();
        for (const entry of resolveResourceEntries(node.view.resourceComposition)) {
          const target = parseTargetRef(entry.placement.targetRef);
          if (target.catalog !== 'node') continue;
          index.set(target.id, entry);
        }
        resourceIndexes.set(node, index);
      }
      return resourceIndexes.get(node);
    };

    const mountedChild = (node, region) => {
      const source = node.mountSources?.get(region.id) ?? region.mount?.src ?? null;
      if (!source) return null;
      const child = node.mounts.get(region.id) ?? null;
      return child?.source === source ? child : null;
    };

    const addRepresentation = (node, region, bounds, mode, depth, extra = {}) => {
      const regionId = regionProjectionId(node, region.id);
      const geographic = this.geoFeatureIdsFor(node.domain).has(region.id);
      const resourceEntry = resourceIndexFor(node).get(region.id) ?? null;
      const imageResource = resourceEntry?.resource.contract === 'image/1' ? resourceEntry : null;
      const representation = Object.freeze({
        regionId,
        sourceRegionId: region.id,
        parentRegionId: region.parent === null ? null : regionProjectionId(node, region.parent),
        representationId: `${regionId}@${mode}`,
        sceneId: sceneId(node),
        pattern: node.view.pattern,
        moduleNamespace: node.namespace || null,
        mode,
        shape: shapeForPattern(node.view.pattern, region, mode),
        label: Object.hasOwn(extra, 'label') ? extra.label : region.label,
        kind: region.kind,
        summary: region.summary,
        href: imageResource?.placement.action?.href ?? region.href ?? null,
        image: region.image ?? null,
        resource: imageResource ? Object.freeze({
          id: imageResource.resource.id,
          placementId: imageResource.placement.id,
          contract: imageResource.resource.contract,
          src: imageResource.resource.source.href,
          alt: imageResource.placement.view.alt,
          fit: imageResource.placement.view.fit,
          opacity: imageResource.placement.view.opacity,
        }) : null,
        bounds,
        depth,
        isRoot: node.namespace === '' && region.id === this.domain.meta.root,
        isPortal: Boolean(node.mountSources?.get(region.id) ?? region.mount),
        readOnly: node.namespace !== '' || Boolean(extra.readOnly) || Boolean(region.image) || geographic,
        geometryEditable: Boolean(extra.geometryEditable) && !geographic && !region.image,
        labelEditable: node.namespace === ''
          && !geographic
          && !region.image
          && region.id !== this.domain.meta.root
          && (mode !== 'boundary' || Boolean(extra.geometryEditable)),
        hasChildren: Boolean(extra.hasChildren),
        detailsVisible: Boolean(extra.detailsVisible),
        temporalEdit: extra.temporalEdit ?? null,
        activation: extra.activation ?? null,
        visual: extra.visual ?? null,
        zIndex: Number.isFinite(extra.zIndex) ? extra.zIndex : null,
        isGuide: false,
      });
      representations.push(representation);
      assertScenePrimitiveBudget(representations.length);
      representationsById.set(regionId, representation);
      visibleIds.add(regionId);
      return representation;
    };

    const addGuide = (node, guide, bounds, depth) => {
      const regionId = guideProjectionId(node, guide.id);
      const representation = Object.freeze({
        regionId,
        sourceRegionId: null,
        representationId: `${regionId}@guide`,
        sceneId: sceneId(node),
        pattern: node.view.pattern,
        moduleNamespace: node.namespace || null,
        mode: 'guide',
        shape: 'guide',
        label: guide.label,
        kind: guide.kind,
        summary: '',
        bounds,
        depth,
        isRoot: false,
        isPortal: false,
        readOnly: true,
        hasChildren: false,
        detailsVisible: false,
        temporalEdit: null,
        visual: null,
        zIndex: null,
        isGuide: true,
      });
      guides.push(representation);
      representations.push(representation);
      assertScenePrimitiveBudget(representations.length);
      visibleIds.add(regionId);
    };

    const addRelation = (node, relation, from, to) => {
      if (!from || !to || from === to) return;
      const readOnly = node.namespace !== '' || Boolean(relation.readOnly);
      const relationId = relationProjectionId(node, relation.id);
      const visual = relationVisualForPattern(node.view.pattern, relation);
      const key = `${sceneId(node)}\u0000${from}\u0000${to}\u0000${relation.kind}\u0000${readOnly}\u0000${visual.directed}\u0000${visual.line}`;
      const existing = aggregate.get(key);
      if (existing) {
        existing.count += 1;
        existing.relationIds.push(relationId);
      } else {
        aggregate.set(key, {
          id: relationId,
          relationIds: [relationId],
          sceneId: sceneId(node),
          pattern: node.view.pattern,
          from,
          to,
          kind: relation.kind,
          label: relation.label,
          count: 1,
          readOnly,
          directed: visual.directed,
          line: visual.line,
          foreground: Boolean(visual.foreground),
          zIndex: Number.isFinite(visual.zIndex) ? visual.zIndex : null,
        });
      }
    };

    const detailsVisible = (node, region, bounds, hasChildren, force = false) => {
      if (force) return true;
      if (!hasChildren) return false;
      const projectedArea = area(bounds) * scale * scale;
      return projectedArea >= DETAIL_AREA_PX2;
    };

    const addScene = (node, rootBounds, transform, axis = null, clipBounds = null) => {
      scenes.push({
        id: sceneId(node),
        pattern: node.view.pattern,
        space: nodePlan(node).space,
        readOnly: node.namespace !== '',
        bounds: clippedBounds(transformBounds(rootBounds, transform), clipBounds),
        axis,
      });
    };

    const projectNode = (node, targetBounds = null, depthOffset = 0, rootProxy = null, clipBounds = null) => {
      const plan = nodePlan(node);
      const transform = targetBounds ? mountedTransform(plan.rootBounds, targetBounds) : identityTransform();
      contexts.push(Object.freeze({ node, domain: node.domain, layout: plan, transform }));
      addScene(node, plan.rootBounds, transform, plan.axis ?? null, clipBounds);
      const definition = getViewTypeProjection(plan.pattern);
      return definition.project({
        node,
        plan,
        transform,
        depthOffset,
        rootProxy,
        clipBounds,
        api: Object.freeze({
          addGuide,
          addRelation,
          addRepresentation,
          area,
          clippedBounds,
          detailIds,
          detailsVisible,
          intersect,
          mountedChild,
          nodePlan,
          projectMounted,
          selectionProxies,
          transformBounds,
          visibleViewport,
        }),
      });
    };

    const projectMounted = (node, region, bounds, depth, projectedId) => {
      const mounted = mountedChild(node, region);
      if (!mounted) return;
      projectNode(mounted, bounds, depth + 1, projectedId, bounds);
    };

    projectNode(rootNode);

    const relations = [...aggregate.values()].map((relation) => Object.freeze({
      ...relation,
      relationIds: Object.freeze([...relation.relationIds]),
      label: relation.count > 1 ? `${relation.label || relation.kind} ×${relation.count}` : relation.label,
    }));
    assertScenePrimitiveBudget(representations.length + relations.length);

    const frozenScenes = scenes.map((scene) => Object.freeze({
      ...scene,
      representationIds: Object.freeze(
        representations.filter((item) => item.sceneId === scene.id).map((item) => item.representationId),
      ),
      relationIds: Object.freeze(
        relations.filter((item) => item.sceneId === scene.id).flatMap((item) => item.relationIds),
      ),
    }));

    const maxDepth = representations.reduce(
      (maximum, representation) => Math.max(maximum, representation.depth),
      0,
    );

    const terrain = [];
    for (const parent of representations) {
      if (parent.pattern !== MAP_PATTERN || !parent.detailsVisible) continue;
      const children = representations.filter((item) => (
        item.sceneId === parent.sceneId
        && item.parentRegionId === parent.regionId
        && !['set', 'map-background', 'map-control-point', 'map-poi', 'map-attribution'].includes(item.kind)
        && !item.isPortal
      ));
      assertScenePrimitiveBudget(
        representations.length + relations.length + terrain.length + children.length,
      );
      for (const cell of voronoiCells(parent.bounds, children.map((item) => ({ id: item.regionId, bounds: item.bounds })))) {
        if (cell.points.length < 3) continue;
        terrain.push(Object.freeze({
          sceneId: parent.sceneId,
          parentRegionId: parent.regionId,
          regionId: cell.id,
          points: cell.points,
        }));
      }
    }
    const setOverlay = projectSetOverlay(contexts, representationsById, regionProjectionId);
    assertScenePrimitiveBudget(
      representations.length + relations.length + terrain.length + setOverlay.sets.length,
    );

    return Object.freeze({
      pattern: this.view.pattern,
      resourceComposition: this.view.resourceComposition ?? null,
      activeSceneId: 'root',
      scale,
      viewport: Object.freeze({ ...viewport }),
      bounds: frozenScenes.find((scene) => scene.id === 'root')?.bounds ?? this.domain.regions.get(this.domain.meta.root).bounds,
      scenes: Object.freeze(frozenScenes),
      representations: Object.freeze(representations),
      guides: Object.freeze(guides),
      relations: Object.freeze(relations),
      terrain: Object.freeze(terrain),
      setOverlay,
      maxDepth,
      detailIds: Object.freeze([...detailIds].sort()),
      selectionProxies: Object.freeze(selectionProxies),
      modules: Object.freeze({
        mounted: modules.moduleCount,
        regions: modules.regionCount,
        maxDepth: modules.maxDepth,
      }),
    });
  }
}

export const projectorThresholds = Object.freeze({
  detailAreaPx2: DETAIL_AREA_PX2,
});
