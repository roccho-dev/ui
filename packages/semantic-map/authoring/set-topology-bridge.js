import { SemanticDomainStore } from '../domain/domain-store.js';
import {
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
  const projection = context.presentationProjection;
  if (!projection || !String(projection.id).startsWith('set-topology/')) return directMeaningCandidate([operation]);
  const movedId = operation.regionIds?.length === 1 ? operation.regionIds[0] : null;
  if (!movedId) return rejection('set topology edit requires exactly one moved set');
  const targetIds = sortedSetTargetIds(projection);
  if (!targetIds.includes(movedId)) return rejection(`set topology target is not editable: ${movedId}`);
  const otherIds = targetIds.filter((id) => id !== movedId);
  if (otherIds.length !== 1) return rejection('set topology edit requires exactly two editable sets');
  const otherId = otherIds[0];
  const source = interactionTargetFor(projection, movedId, SET_TOPOLOGY_EDIT_KIND);
  const other = interactionTargetFor(projection, otherId, SET_TOPOLOGY_EDIT_KIND);
  if (!source || !other) return rejection('set topology interaction targets are incomplete');
  const dx = Number(operation.dx ?? 0);
  const dy = Number(operation.dy ?? 0);
  const movedBounds = {
    x: source.bounds.x + dx,
    y: source.bounds.y + dy,
    width: source.bounds.width,
    height: source.bounds.height,
  };
  const scale = Number(context.presentationScale ?? 1);
  const tolerance = Math.max(0, Number(options.screenTolerance ?? SET_TOPOLOGY_SCREEN_TOLERANCE)) / Math.max(scale, 0.000001);
  const neighborhood = classifySetBoundsNeighborhood(movedBounds, other.bounds, { tolerance });
  const profile = projectionProfile(projection);
  const candidates = neighborhood.map((topology) => candidateForTopology(context.domain, movedId, otherId, topology, profile));
  const evaluation = evaluateMeaningRecovery(candidates, {
    distinctBy: candidate => candidate.meaning,
    viable: candidate => candidate.roundtrip && candidate.preserves,
  });
  if (evaluation.status === 'reject') {
    return rejection('drag does not map to exactly one stable set meaning', {
      candidates,
      viableMeanings: evaluation.viable.map((candidate) => candidate.meaning),
    });
  }
  const accepted = evaluation.candidate;
  return createMeaningRecoveryResult({
    status: 'candidate',
    reason: 'visual set gesture recovered to semantic set topology',
    operations: accepted.operations,
    evidence: {
      meaning: accepted.meaning,
      toleranceWorld: tolerance,
      candidates,
    },
  });
}

export function translateSetTopologyOperation(operation, context, options = {}) {
  return recoverSetTopologyOperation(operation, context, options);
}
