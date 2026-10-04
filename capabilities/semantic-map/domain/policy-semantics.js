export const POLICY_MODEL_KIND = 'policy-model/1';

export const POLICY_NODE_KINDS = Object.freeze([
  'policy',
  'rule',
  'condition',
  'effect',
  'subject',
  'role',
  'capability',
  'resource',
]);

export const POLICY_RELATION_KINDS = Object.freeze([
  'holdsRole',
  'includesCapability',
  'actsOn',
  'governs',
  'requiresRole',
]);

const NODE_KINDS = new Set(POLICY_NODE_KINDS);
const TOP_LEVEL_KINDS = new Set(['policy', 'subject', 'role', 'capability', 'resource']);
const RELATION_ENDPOINTS = Object.freeze({
  holdsRole: Object.freeze(['subject', 'role']),
  includesCapability: Object.freeze(['role', 'capability']),
  actsOn: Object.freeze(['capability', 'resource']),
  governs: Object.freeze(['policy', 'capability']),
  requiresRole: Object.freeze(['effect', 'role']),
});

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-policy: ${message}`);
}

export function isPolicyModel(domain) {
  if (!domain?.meta?.root || !domain?.regions) return false;
  return domain.regions.get(domain.meta.root)?.kind === POLICY_MODEL_KIND;
}

function validateContainment(domain, region) {
  const parent = domain.regions.get(region.parent);
  invariant(parent, `${region.id}.parent not found: ${region.parent}`);

  if (TOP_LEVEL_KINDS.has(region.kind)) {
    invariant(
      parent.id === domain.meta.root && parent.kind === POLICY_MODEL_KIND,
      `${region.id}.${region.kind} must be a direct child of ${POLICY_MODEL_KIND}`,
    );
    return;
  }

  if (region.kind === 'rule') {
    invariant(parent.kind === 'policy', `${region.id}.rule must be contained by policy`);
    return;
  }

  invariant(
    (region.kind === 'condition' || region.kind === 'effect') && parent.kind === 'rule',
    `${region.id}.${region.kind} must be contained by rule`,
  );
}

export function validatePolicyModel(domain) {
  invariant(domain?.meta?.root && domain?.regions && domain?.relations, 'Domain is required');
  if (!isPolicyModel(domain)) return domain;

  const root = domain.regions.get(domain.meta.root);
  invariant(root.parent === null, `${root.id} root must not have a parent`);

  for (const region of domain.regions.values()) {
    if (region.id === root.id) continue;
    invariant(NODE_KINDS.has(region.kind), `${region.id}.kind ${region.kind} is not a policy-model node kind`);
    validateContainment(domain, region);
  }

  for (const relation of domain.relations) {
    const endpoints = RELATION_ENDPOINTS[relation.kind];
    invariant(endpoints, `${relation.id}.kind ${relation.kind} is not a policy-model relation kind`);
    const fromKind = domain.regions.get(relation.from).kind;
    const toKind = domain.regions.get(relation.to).kind;
    invariant(
      fromKind === endpoints[0] && toKind === endpoints[1],
      `${relation.id}.${relation.kind} must connect ${endpoints[0]} -> ${endpoints[1]}, not ${fromKind} -> ${toKind}`,
    );
  }

  return domain;
}
