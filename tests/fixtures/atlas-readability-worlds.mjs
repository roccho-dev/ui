// Worlds for the readability checks, made from the bundled World.
// statusWorld: one entity per supplied status flag, so every display status is
// drawn. crossingWorld: two Scopes and two Agents whose supplied order makes
// one avoidable crossing (X -> B, Y -> A with A, B and X, Y in order).
import { bundledWorld } from './atlas-timeline-frames.mjs';

export const STATUS_FLAGS = Object.freeze({
  conflict: ['standing=active', 'scope_status=conflict', 'evaluation-disagreement'],
  unassigned: ['unassigned', 'owner-unassigned', 'source=unmet'],
  unknown: ['standing=unresolved', 'scope_status=declared_satisfied'],
  unmet: ['standing=active', 'scope_status=unmet'],
  satisfied: ['standing=completed-history', 'scope_status=declared_satisfied'],
  history: ['history-preserved'],
});

export const statusWorld = () => {
  const world = bundledWorld();
  // The same leading entities in every frame carry one status each; their
  // activity is cleared because live activity, when present, owns the look.
  for (const frame of world.frames) {
    Object.values(STATUS_FLAGS).forEach((flags, index) => {
      const entity = frame.entities[index];
      entity.activity = 'none';
      entity.flags = [...flags];
    });
  }
  return world;
};

const ref = (kind, id) => ({ space: 'fixture:crossing', kind, id });
export const crossingWorld = () => {
  const world = bundledWorld();
  const [purposeArea, scopeArea, agentArea] = world.presentation.areas.map(area => area.id);
  const source = world.frames[0].entities[0].source;
  const entity = (kind, id, area, order) => ({ ref: ref(kind, id), label: id, area, order, visible: true, activity: 'none', source, flags: [] });
  const relation = (id, from, to) => ({ ref: ref('declared-relation', id), from, to, kind: 'declared-relation', label: id, source, flags: [], path: false });
  const frame = {
    ...world.frames[0], id: 'crossing', rev: 1,
    entities: [entity('purpose', 'P', purposeArea, 0), entity('scope', 'A', scopeArea, 0), entity('scope', 'B', scopeArea, 1),
      entity('agent', 'X', agentArea, 0), entity('agent', 'Y', agentArea, 1)],
    relations: [relation('A-P', ref('scope', 'A'), ref('purpose', 'P')), relation('B-P', ref('scope', 'B'), ref('purpose', 'P')),
      relation('X-B', ref('agent', 'X'), ref('scope', 'B')), relation('Y-A', ref('agent', 'Y'), ref('scope', 'A'))],
  };
  world.frames = [frame];
  world.comparisons = [];
  world.presentation = { ...world.presentation, directionTargets: [ref('purpose', 'P')], defaultSelection: ref('purpose', 'P') };
  return world;
};
