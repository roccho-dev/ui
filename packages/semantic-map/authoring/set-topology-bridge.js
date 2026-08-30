import {
  SemanticDomainStore,
  classifySetBounds,
  classifySetBoundsNeighborhood,
  deriveSetSemantics,
} from '../domain/index.js';
import {
  compileTwoSetTopologyPresentation,
  interactionTargetFor,
} from '../projection/index.js';
import {
  createMeaningRecoveryResult,
  directMeaningCandidate,
  evaluateMeaningRecovery,
} from './meaning-recovery.js';

const TOPOLOGY_RELATION_KINDS = new Set(['subsetOf', 'disjointWith', 'overlapsWith']);
const SET_TOPOLOGY_EDIT_KIND = 'set-topology';
export const SET_TOPOLOGY_SCREEN_TOLERANCE = 4;

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-set-topology-bridge: ${message}`);
}

function safeId(value) {
  return encodeURIComponent(value).replaceAll('%', '_');
}

function pairId(left, right) {
  return [left, right].sort().map(safeId).join('.');
}

function relationId(left, right, topology) {
  if (topology === 'subset') return `set-topology.${safeId(left)}.subset-of.${safeId(right)}`;
  return `set-topology.${pairId(left, right)}.${topology}`;
}

function connect(from, to, kind, topology) {
  return Object.freeze({
    type: 'ConnectRegions',
    relationId: relationId(from, to, topology),
    from,
    to,
    kind,
    label: '',
  });
}

function topologyOperations(movedId, otherId, topology) {
  switch (topology) {
    case 'disjoint': {
      const [from, to] = [movedId, otherId].sort();
      return [connect(from, to, 'disjointWith', 'disjoint')];
    }
    case 'partial-overlap': {
      const [from, to] = [movedId, otherId].sort();
      return [connect(from, to, 'overlapsWith', 'partial-overlap')];
    }
    case 'subset':
      return [connect(movedId, otherId, 'subsetOf', 'subset')];
    case 'superset':
      return [connect(otherId, movedId, 'subsetOf', 'subset')];
    case 'equal':
      return [
        connect(movedId, otherId, 'subsetOf', 'subset'),
        connect(otherId, movedId, 'subsetOf', 'subset'),
      ];
    default:
      throw new Error(`unsupported topology ${topology}`);
  }
}

function sortedSetTargetIds(projection) {
  return projection.interactions
    .filter((target) => (
      target.role === 'set'
      && target.editKinds.includes(SET_TOPOLOGY_EDIT_KIND)
    ))
    .map((target) => target.regionId)
    .sort();
}

function isPairTopologyRelation(relation, leftId, rightId) {
  return TOPOLOGY_RELATION_KINDS.has(relation.kind)
    && [relation.from, relation.to].includes(leftId)
    && [relation.from, relation.to].includes(rightId);
}

function preservationSnapshot(domain, leftId, rightId) {
  return JSON.stringify({
    meta: domain.meta,
    regions: [...domain.regions.values()],
    relations: domain.relations.filter((relation) => !isPairTopologyRelation(relation, leftId, rightId)),
  });
}

function projectionProfile(projection) {
  const match = /^set-topology\/(horizontal|vertical)\/1$/u.exec(projection.id);
  invariant(match, `unsupported set topology projection ${projection.id}`);
  return match[1];
}

function projectedTopology(domain, profile, leftId, rightId) {
  const projection = compileTwoSetTopologyPresentation(domain, { profile });
  if (!projection) return null;
  const left = projection.layout.find((item) => item.regionId === leftId)?.bounds ?? null;
  const right = projection.layout.find((item) => item.regionId === rightId)?.bounds ?? null;
  if (!left || !right) return null;
  return classifySetBounds(left, right, { epsilon: 0 });
}

function topologyRelativeTo(pair, movedId, otherId) {
  invariant(
    [pair.left, pair.right].includes(movedId)
      && [pair.left, pair.right].includes(otherId)
      && movedId !== otherId,
    `set topology pair mismatch: ${movedId} / ${otherId}`,
  );
  if (pair.left === movedId) return pair.topology;
  if (pair.topology === 'subset') return 'superset';
  if (pair.topology === 'superset') return 'subset';
  return pair.topology;
}

function relationRemoval(domain, movedId, otherId) {
  const relationIds = domain.relations
    .filter((relation) => isPairTopologyRelation(relation, movedId, otherId))
    .map((relation) => relation.id)
    .sort();
  return relationIds.length
    ? [Object.freeze({ type: 'RemoveSelection', regionIds: [], relationIds })]
    : [];
}

function candidateForTopology(domain, movedId, otherId, topology, profile) {
  const operations = Object.freeze([
    ...relationRemoval(domain, movedId, otherId),
    ...topologyOperations(movedId, otherId, topology),
  ]);
  try {
    const before = preservationSnapshot(domain, movedId, otherId);
    const store = new SemanticDomainStore(domain);
    store.performBatch(operations);
    const semantics = deriveSetSemantics(store.domain);
    const pair = semantics.pairs.find((item) => (
      [item.left, item.right].includes(movedId)
      && [item.left, item.right].includes(otherId)
    ));
    const actual = pair ? topologyRelativeTo(pair, movedId, otherId) : null;
    const projected = projectedTopology(store.domain, profile, movedId, otherId);
    return Object.freeze({
      meaning: topology,
      operations,
      roundtrip: actual === topology && projected === topology,
      preserves: before === preservationSnapshot(store.domain, movedId, otherId),
      error: null,
    });
  } catch (error) {
    return Object.freeze({
      meaning: topology,
      operations,
      roundtrip: false,
      preserves: false,
      error: error.message,
    });
  }
}

function rejection(reason, evidence = null) {
  return createMeaningRecoveryResult({
    status: 'reject',
    reason,
    operations: [],
    evidence,
  });
}

export function recoverSetTopologyOperation(operation, context, options = {}) {
  if (operation.type !== 'MoveRegions') return directMeaningCandidate([operation]);

  const { domain, presentationProjection, view } = context ?? {};
  invariant(domain, 'semantic domain is required');
  if (view?.pattern !== 'map/1') return rejection('unsupported-pattern', { pattern: view?.pattern ?? null });
  if (!presentationProjection) return rejection('interaction-projection-missing');
  if (presentationProjection.pattern !== view.pattern) {
    return rejection('interaction-projection-pattern-mismatch', {
      pattern: view.pattern,
      projectionPattern: presentationProjection.pattern,
    });
  }
  if (!Array.isArray(operation.regionIds) || operation.regionIds.length !== 1) {
    return rejection('unsupported-multi-region-move', { regionIds: operation.regionIds ?? null });
  }

  const semantics = deriveSetSemantics(domain);
  if (semantics.sets.length !== 2 || semantics.pairs.length !== 1) {
    return rejection('unsupported-set-cardinality', {
      sets: semantics.sets.length,
      pairs: semantics.pairs.length,
    });
  }

  const semanticSetIds = semantics.sets.map((set) => set.id).sort();
  if (JSON.stringify(sortedSetTargetIds(presentationProjection)) !== JSON.stringify(semanticSetIds)) {
    return rejection('interaction-projection-set-mismatch', {
      semanticSetIds,
      interactionSetIds: sortedSetTargetIds(presentationProjection),
    });
  }

  const movedId = operation.regionIds[0];
  if (domain.regions.get(movedId)?.kind !== 'set') {
    return rejection('moved-region-is-not-set', { movedId });
  }
  const otherId = semanticSetIds.find((setId) => setId !== movedId) ?? null;
  if (!otherId) return rejection('other-set-missing', { movedId });

  const movedTarget = interactionTargetFor(
    presentationProjection,
    movedId,
    SET_TOPOLOGY_EDIT_KIND,
  );
  const otherTarget = interactionTargetFor(
    presentationProjection,
    otherId,
    SET_TOPOLOGY_EDIT_KIND,
  );
  if (movedTarget?.role !== 'set' || otherTarget?.role !== 'set') {
    return rejection('interaction-target-unavailable', { movedId, otherId });
  }

  const nextBounds = {
    x: movedTarget.bounds.x + operation.dx,
    y: movedTarget.bounds.y + operation.dy,
    width: movedTarget.bounds.width,
    height: movedTarget.bounds.height,
  };
  const presentationScale = context.presentationScale ?? 1;
  invariant(
    typeof presentationScale === 'number' && Number.isFinite(presentationScale) && presentationScale > 0,
    'presentation scale must be positive',
  );
  const screenTolerance = options.screenTolerance ?? SET_TOPOLOGY_SCREEN_TOLERANCE;
  invariant(
    typeof screenTolerance === 'number' && Number.isFinite(screenTolerance) && screenTolerance >= 0,
    'screen tolerance must be non-negative',
  );
  const positionTolerance = options.positionTolerance ?? screenTolerance / presentationScale;
  const neighborhood = classifySetBoundsNeighborhood(nextBounds, otherTarget.bounds, {
    positionTolerance,
    epsilon: 0,
  });
  const currentTopology = topologyRelativeTo(semantics.pairs[0], movedId, otherId);
  const profile = projectionProfile(presentationProjection);
  const changedTopologies = neighborhood.possible.filter((topology) => topology !== currentTopology);
  const candidates = changedTopologies.map((topology) => (
    candidateForTopology(domain, movedId, otherId, topology, profile)
  ));

  return evaluateMeaningRecovery({
    declared: true,
    identified: true,
    currentMeaning: currentTopology,
    observedMeaning: neighborhood.exact,
    possibleMeanings: neighborhood.possible,
    candidates,
    evidence: {
      profile,
      movedId,
      otherId,
      nextBounds,
      presentationScale,
      screenTolerance,
      positionTolerance,
      stable: neighborhood.stable,
      samples: neighborhood.samples,
    },
  });
}

export function translateSetTopologyOperation(operation, context) {
  return recoverSetTopologyOperation(operation, context);
}
