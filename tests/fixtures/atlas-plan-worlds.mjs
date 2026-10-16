// A three-frame World carrying the three plan cases of the shared contract:
// frame 1 plans null (undeclared), frame 2 [] (declared, none in force),
// frame 3 two plans, the second with unknown content (nodes null).
import { worldWithFrames } from './atlas-timeline-frames.mjs';

export const PLAN_SHA = 'sha256:' + 'a'.repeat(64);
export const knownPlan = Object.freeze({
  ref: 'resources#25',
  plan: 'resources#25:windows-retirement-migration-20261016',
  version: 3,
  label: 'windows repo 退役の閉包グラフ（resources#25 v3）',
  serves: ['refactor-windows-retired'],
  nodes: [{ id: 'L', label: '台帳' }, { id: 'M', label: '同一出力' }],
  edges: [{ from: 'L', to: 'M', kind: 'dep' }],
  unknown: [],
  source: { repo: 'resources#25', commentId: 4411, updatedAt: '2026-10-16T09:00:00Z', sha256: PLAN_SHA },
});
export const unknownPlan = Object.freeze({
  ref: 'adrs#646',
  plan: 'adrs#646:atlas-closure-20261016',
  version: 1,
  label: 'Atlas 閉包グラフ（adrs#646 v1）',
  serves: ['atlas-hq-loop', 'input-semcmp'],
  nodes: null,
  edges: null,
  unknown: ['marker 付きの節が見つからない'],
  source: { repo: 'adrs#646', commentId: null, updatedAt: '2026-10-16T08:00:00Z', sha256: null },
});

export const planWorld = () => {
  const world = worldWithFrames(3);
  world.frames[0].plans = null;
  world.frames[1].plans = [];
  world.frames[2].plans = [structuredClone(knownPlan), structuredClone(unknownPlan)];
  return world;
};
