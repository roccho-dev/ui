import {
  MAX_PLACEMENTS,
  MAX_RESOURCES,
  RESOURCE_COMPOSITION_SCHEMA,
  exactKeys,
  invariant,
  normalizePlacementShape,
  normalizeResourceShape,
  parseTargetRef,
  plainObject,
  text,
  uniqueBy,
} from './contract.js';

export const RESOURCE_CONTRACTS = Object.freeze([
  'image/1',
  'semantic-map-envelope/3',
  'document/1',
  'video/1',
]);

export const RESOURCE_FITS = Object.freeze(['contain', 'cover', 'fill']);

const finiteOpacity = (value, name) => {
  invariant(typeof value === 'number' && Number.isFinite(value), `${name} must be finite`);
  invariant(value >= 0 && value <= 1, `${name} must be between 0 and 1`);
  return Object.is(value, -0) ? 0 : value;
};

const fit = (value, name, fallback) => {
  if (value === undefined) return fallback;
  invariant(RESOURCE_FITS.includes(value), `${name} is unsupported`);
  return value;
};

const normalizeImageView = (input, name, context) => {
  const value = plainObject(input, name);
  exactKeys(value, ['alt'], ['title', 'fit', 'opacity'], name);
  const result = {
    alt: text(value.alt, `${name}.alt`, { empty: true, max: 240 }),
    fit: fit(value.fit, `${name}.fit`, context.slot === 'background' ? 'cover' : 'contain'),
    opacity: Object.hasOwn(value, 'opacity') ? finiteOpacity(value.opacity, `${name}.opacity`) : 1,
  };
  if (Object.hasOwn(value, 'title')) result.title = text(value.title, `${name}.title`, { max: 240 });
  return Object.freeze(result);
};

const normalizeVideoView = (input, name, context) => {
  const value = plainObject(input, name);
  exactKeys(value, ['title'], ['fit', 'opacity'], name);
  return Object.freeze({
    title: text(value.title, `${name}.title`, { max: 240 }),
    fit: fit(value.fit, `${name}.fit`, context.slot === 'background' ? 'cover' : 'contain'),
    opacity: Object.hasOwn(value, 'opacity') ? finiteOpacity(value.opacity, `${name}.opacity`) : 1,
  });
};

const normalizeTitledView = (input, name) => {
  const value = plainObject(input, name);
  exactKeys(value, ['title'], [], name);
  return Object.freeze({ title: text(value.title, `${name}.title`, { max: 240 }) });
};

const validateSemanticMapSource = (source, name) => {
  const parsed = new URL(source.href, 'https://semantic-map.invalid/app');
  invariant(
    /^#smap=[A-Za-z0-9_-]+$/u.test(parsed.hash),
    `${name}.href must contain exactly one #smap token`,
  );
};

const CONTRACTS = Object.freeze({
  'image/1': Object.freeze({ normalizeView: normalizeImageView, provenanceRequired: true }),
  'semantic-map-envelope/3': Object.freeze({
    normalizeView: normalizeTitledView,
    provenanceRequired: false,
    validateSource: validateSemanticMapSource,
  }),
  'document/1': Object.freeze({ normalizeView: normalizeTitledView, provenanceRequired: false }),
  'video/1': Object.freeze({ normalizeView: normalizeVideoView, provenanceRequired: true }),
});

const POLICIES = Object.freeze({
  'image/1|surface|background': Object.freeze({
    adapter: 'dom-image', boundary: 'none', interaction: 'none', referrerPolicy: 'no-referrer', action: null,
  }),
  'image/1|node|content': Object.freeze({
    adapter: 'maxgraph-image', boundary: 'renderer-owned', interaction: 'selection', referrerPolicy: 'document-no-referrer', action: 'navigate',
  }),
  'image/1|element|content': Object.freeze({
    adapter: 'dom-image', boundary: 'shell-owned', interaction: 'content', referrerPolicy: 'no-referrer', action: 'navigate',
  }),
  'semantic-map-envelope/3|surface|content': Object.freeze({
    adapter: 'sandboxed-document', boundary: 'sandboxed', interaction: 'content', referrerPolicy: 'no-referrer', action: null,
  }),
  'semantic-map-envelope/3|node|content': Object.freeze({
    adapter: 'nested-semantic-map', boundary: 'validated-read-only', interaction: 'selection', referrerPolicy: 'not-applicable', action: null,
  }),
  'document/1|surface|content': Object.freeze({
    adapter: 'sandboxed-document', boundary: 'sandboxed', interaction: 'content', referrerPolicy: 'no-referrer', action: null,
  }),
  'document/1|element|content': Object.freeze({
    adapter: 'sandboxed-document', boundary: 'sandboxed', interaction: 'content', referrerPolicy: 'no-referrer', action: null,
  }),
  'video/1|surface|background': Object.freeze({
    adapter: 'dom-video', boundary: 'none', interaction: 'none', referrerPolicy: 'document-no-referrer', action: null,
  }),
  'video/1|element|content': Object.freeze({
    adapter: 'dom-video', boundary: 'shell-owned', interaction: 'content', referrerPolicy: 'document-no-referrer', action: null,
  }),
});

const policyKey = (contract, target, slot) => `${contract}|${target.catalog}|${slot}`;

const validateTarget = (target, name) => {
  invariant(['surface', 'node', 'element'].includes(target.catalog), `${name} uses an unknown target catalog`);
  if (target.catalog === 'surface') invariant(target.id === 'root', `${name} surface target must be surface:root`);
};

const policyFor = (resource, placement, name) => {
  const target = parseTargetRef(placement.targetRef, `${name}.targetRef`);
  validateTarget(target, `${name}.targetRef`);
  const policy = POLICIES[policyKey(resource.contract, target, placement.slot)];
  invariant(policy, `${resource.contract} cannot target ${target.catalog}/${placement.slot}`);
  return Object.freeze({ ...policy, target });
};

export const normalizeResourceComposition = (input) => {
  const value = plainObject(input, 'resourceComposition');
  exactKeys(value, ['schema', 'resources', 'placements'], [], 'resourceComposition');
  invariant(
    value.schema === RESOURCE_COMPOSITION_SCHEMA,
    `schema ${value.schema} is not ${RESOURCE_COMPOSITION_SCHEMA}`,
  );
  invariant(Array.isArray(value.resources), 'resourceComposition.resources must be an array');
  invariant(Array.isArray(value.placements), 'resourceComposition.placements must be an array');
  invariant(
    value.resources.length > 0 && value.resources.length <= MAX_RESOURCES,
    `resource count must be 1..${MAX_RESOURCES}`,
  );
  invariant(
    value.placements.length > 0 && value.placements.length <= MAX_PLACEMENTS,
    `placement count must be 1..${MAX_PLACEMENTS}`,
  );

  const resources = value.resources.map(normalizeResourceShape);
  uniqueBy(resources, item => item.id, 'duplicate resource id');
  uniqueBy(resources, item => item.source.href, 'duplicate resource source');
  for (const resource of resources) {
    const definition = CONTRACTS[resource.contract];
    invariant(definition, `resource ${resource.id} contract is unsupported: ${resource.contract}`);
    definition.validateSource?.(resource.source, `resource ${resource.id}.source`);
    invariant(
      !definition.provenanceRequired || resource.provenanceRef,
      `resource ${resource.id} requires provenanceRef`,
    );
  }

  const resourceIndex = new Map(resources.map(resource => [resource.id, resource]));
  const placements = value.placements.map((item, index) => {
    const shape = normalizePlacementShape(item, index);
    const name = `resourceComposition.placements[${index}]`;
    const resource = resourceIndex.get(shape.resourceRef);
    invariant(resource, `placement ${shape.id} references missing resource ${shape.resourceRef}`);
    const policy = policyFor(resource, shape, name);
    const view = CONTRACTS[resource.contract].normalizeView(shape.view, `${name}.view`, {
      slot: shape.slot,
      target: policy.target,
      policy,
    });
    if (shape.action) {
      invariant(policy.action === shape.action.kind, `placement ${shape.id} does not allow ${shape.action.kind}`);
    }
    return Object.freeze({
      id: shape.id,
      resourceRef: shape.resourceRef,
      targetRef: shape.targetRef,
      slot: shape.slot,
      view,
      ...(shape.action ? { action: shape.action } : {}),
    });
  });

  uniqueBy(placements, item => item.id, 'duplicate placement id');
  uniqueBy(placements, item => `${item.targetRef}\u0000${item.slot}`, 'duplicate target slot');
  const usedResources = new Set(placements.map(item => item.resourceRef));
  for (const resource of resources) invariant(usedResources.has(resource.id), `resource ${resource.id} is not placed`);

  return Object.freeze({
    schema: RESOURCE_COMPOSITION_SCHEMA,
    resources: Object.freeze(resources),
    placements: Object.freeze(placements),
  });
};

export const resolveResourceEntries = (input) => {
  if (!input) return Object.freeze([]);
  const normalized = normalizeResourceComposition(input);
  const resources = new Map(normalized.resources.map(resource => [resource.id, resource]));
  return Object.freeze(normalized.placements.map(placement => {
    const resource = resources.get(placement.resourceRef);
    return Object.freeze({
      placement,
      resource,
      policy: policyFor(resource, placement, `placement ${placement.id}`),
    });
  }));
};

export const entriesForTarget = (input, targetRef, slot = null) => Object.freeze(
  resolveResourceEntries(input).filter(entry => (
    entry.placement.targetRef === targetRef
    && (slot === null || entry.placement.slot === slot)
  )),
);

export const resourcePolicyForEntry = (entry) => {
  invariant(entry?.resource && entry?.placement, 'resolved resource entry is required');
  return policyFor(entry.resource, entry.placement, `placement ${entry.placement.id}`);
};

export const projectResourceComposition = (input, options = {}) => {
  const normalized = normalizeResourceComposition(input);
  const nodeIds = options.nodeIds ? new Set(options.nodeIds) : null;
  const placements = normalized.placements.filter((placement) => {
    const target = parseTargetRef(placement.targetRef);
    return target.catalog !== 'node' || !nodeIds || nodeIds.has(target.id);
  });
  invariant(placements.length > 0, 'resourceComposition has no remaining placements');
  const resourceIds = new Set(placements.map(placement => placement.resourceRef));
  const resources = normalized.resources.filter(resource => resourceIds.has(resource.id));
  return normalizeResourceComposition({
    schema: RESOURCE_COMPOSITION_SCHEMA,
    resources,
    placements,
  });
};

export const resourceRegistryManifest = () => {
  const placements = Object.create(null);
  for (const contract of RESOURCE_CONTRACTS) placements[contract] = [];
  for (const key of Object.keys(POLICIES).sort()) {
    const [contract, target, slot] = key.split('|');
    placements[contract].push(`${target}:${slot}`);
  }
  return Object.freeze({
    schema: 'typed-resource-registry/1',
    contracts: Object.freeze([...RESOURCE_CONTRACTS]),
    sourceTypes: Object.freeze(['url']),
    placements: Object.freeze(Object.fromEntries(
      Object.entries(placements).map(([contract, values]) => [contract, Object.freeze(values)]),
    )),
    serialized: Object.freeze(['resources', 'placements']),
    runtimeOwned: Object.freeze(['adapter', 'boundary', 'target-catalog']),
    integrity: Object.freeze({
      accepted: false,
      owner: 'verified-reference-adapter',
      reason: 'typed-resource-composition/1 has no byte-owning adapter that can enforce it',
    }),
    export: Object.freeze({
      sceneImage: 'same-origin-image-only',
      externalComposition: 'url-share-only',
    }),
  });
};
