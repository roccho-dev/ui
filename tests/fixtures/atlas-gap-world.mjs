// A four-frame World on the shared gap contract (frames[i].gap):
// t0  current = ideal (no open part)
// t1  only the ideal moves (v1 -> v2 adds c3): one part, cause ideal-added
// t2  same ideal; c1 regresses (no owner), c4 is unobserved; c3 carries on
// t3  c3 is satisfied and closes; c1 and c4 carry on
const ref = (kind, id) => ({ space: 'fixture:gap', kind, id });
const purpose = ref('purpose', 'hq');
const agent = (id, order) => ({ ref: ref('agent', id), label: id + '\n担当', area: 'agents', order, visible: true, activity: 'none', flags: ['synthetic'] });
const part = (condition, state, cause, since, scope, refs = []) => ({ condition, state, cause, since, scope, refs });
const frame = (id, rev, asOf, idealVersion, prev, parts, closed = []) => ({
  id, rev, asOf, sourceState: 'synthetic',
  entities: [{ ref: purpose, label: '目的', area: 'purpose', order: 0, visible: true, activity: 'none' }, agent('atlas.W', 0), agent('envs.W', 1)],
  relations: [],
  gap: {
    basis: { purpose_id: 'hq', purpose_rev: 1, ideal_version: idealVersion, prev_frame: prev },
    parts, closed,
    summary: { open: parts.length, by_cause: parts.flatMap(item => item.cause).reduce((counts, cause) => ({ ...counts, [cause]: (counts[cause] ?? 0) + 1 }), {}) },
  },
});

export const gapWorld = () => ({
  kind: 'ui.atlasWorldInput.v1',
  authority: false,
  note: 'Synthetic gap contract fixture.',
  presentation: {
    areas: [{ id: 'purpose', label: 'Purpose', order: 0 }, { id: 'scopes', label: 'Scope', order: 1 }, { id: 'agents', label: 'Agent', order: 2 }],
    purposeAreaId: 'purpose',
    directionTargets: [purpose],
    defaultSelection: purpose,
  },
  frames: [
    frame('t0', 1, '2026-10-17T00:00:00Z', 1, null, []),
    frame('t1', 2, '2026-10-17T01:00:00Z', 2, 't0', [part('c3', 'unmet', ['ideal-added'], 't1', 'scope:atlas', ['resources#25'])]),
    frame('t2', 3, '2026-10-17T02:00:00Z', 2, 't1', [
      part('c3', 'unmet', ['carried'], 't1', 'scope:atlas', ['resources#25']),
      part('c1', 'unmet', ['current-regressed'], 't2', null),
      part('c4', 'unknown', ['current-unobserved'], 't2', 'scope:envs'),
    ]),
    frame('t3', 4, '2026-10-17T03:00:00Z', 2, 't2', [
      part('c1', 'unmet', ['carried'], 't2', null),
      part('c4', 'unknown', ['carried'], 't2', 'scope:envs'),
    ], [{ condition: 'c3', at: 't3', by: 'current-satisfied' }]),
  ],
});
