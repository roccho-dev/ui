// A World on adrs#647 contract v3 (frames[i].gap / phase / journal /
// matched_until), one frame per hour on 2026-10-17:
// t0 purpose-changed  purpose set; no ideal state yet (gap null)
// t1 defining         ideal v1 being drafted (gap null)
// t2 matched          ideal v1 set; current = ideal; fresh until 02:41Z
// t3 approximating    only the ideal moves (v1 -> v2 adds c3); a past evaluation
// t4 approximating    c1 regresses (no owner), c4 unobserved, c3 carries on
// t5 matched          all satisfied again; fresh until 05:41Z; evaluated
// t6 approximating    c1's observation went stale; c4's cannot be matched (v5)
// t7 ended            the purpose ends; c1 closes as purpose-ended
// (t0/t1/t7 carry v4's gap with parts null: UNKNOWN, closed kept)
const ref = (kind, id) => ({ space: 'fixture:gap', kind, id });
const purpose = ref('purpose', 'hq');
const agent = (id, order) => ({ ref: ref('agent', id), label: id + '\n担当', area: 'agents', order, visible: true, activity: 'none', flags: ['synthetic'] });
const part = (condition, label, state, cause, since, scope, refs = []) => ({ condition, label, state, cause, since, scope, refs });
const sha = n => n.repeat(64);
const entry = (kind, recordedAt, fields = {}) => ({ kind, recordedAt, actor: kind === 'observation' ? 'atlas.events' : 'roccho',
  source: { ref: kind === 'observation' ? 'hq:observations.jsonl' : 'adrs#647', commentId: 6230983530, sha256: sha('a') }, ...fields });
const JOURNAL = [
  entry('purpose.set', '2026-10-16T23:30:00Z', { purpose: { id: 'hq', label: '宣言だけで回る組織' }, rev: 1 }),
  entry('ideal.drafting', '2026-10-17T00:30:00Z', { purpose_id: 'hq', version: 1 }),
  entry('ideal.set', '2026-10-17T01:30:00Z', { purpose_id: 'hq', purpose_rev: 1, version: 1, requires: ['c1', 'c2'] }),
  entry('observation', '2026-10-17T01:40:00Z', { target: 'c1', value: true }),
  entry('ideal.set', '2026-10-17T02:30:00Z', { purpose_id: 'hq', purpose_rev: 1, version: 2, requires: ['c1', 'c2', 'c3'] }),
  entry('purpose.evaluated', '2026-10-17T02:50:00Z', { purpose_id: 'hq', purpose_rev: 1, ideal_version: 1, verdict: 'ideal-insufficient', note: '一致したが不十分' }),
  entry('plan.set', '2026-10-17T03:10:00Z', { plan: 'resources#25:migration', serves: ['c3'] }),
  entry('purpose.evaluated', '2026-10-17T04:50:00Z', { purpose_id: 'hq', purpose_rev: 1, ideal_version: 2, verdict: 'achieved', note: '到達' }),
];
const journalUntil = asOf => structuredClone(JOURNAL.filter(item => Date.parse(item.recordedAt) <= Date.parse(asOf)));
const summaryOf = (parts, conditions, satisfied) => ({ open: parts.length, conditions, satisfied,
  by_cause: parts.flatMap(item => item.cause).reduce((counts, cause) => ({ ...counts, [cause]: (counts[cause] ?? 0) + 1 }), {}) });
const frame = (id, rev, asOf, phase, gap, matchedUntil = null) => ({
  id, rev, asOf, sourceState: 'synthetic',
  entities: [{ ref: purpose, label: '目的\n宣言だけで回る組織', area: 'purpose', order: 0, visible: true, activity: 'none' }, agent('atlas.W', 0), agent('envs.W', 1)],
  relations: [], phase, gap, journal: journalUntil(asOf), matched_until: matchedUntil,
});
const gap = (version, prev, parts, closed, conditions, satisfied) => ({
  basis: { purpose_id: 'hq', purpose_rev: 1, ideal_version: version, prev_frame: prev }, parts, closed, summary: summaryOf(parts, conditions, satisfied),
});
// v4: with no ideal state to compare with, parts are null (UNKNOWN) and the
// closed history is kept.
const noIdeal = (prev, closed = []) => ({ basis: { purpose_id: 'hq', purpose_rev: 1, ideal_version: null, prev_frame: prev }, parts: null, closed,
  summary: { open: null, by_cause: {}, conditions: null, satisfied: null } });
const c3 = cause => part('c3', 'windows repo を退役する', 'unmet', cause, 't3', 'scope:atlas', ['resources#25']);
const c1 = (cause, since) => part('c1', '端末で直接入力できる', 'unmet', cause, since, null);
const c4 = cause => part('c4', 'envs のスコープ主張', 'unknown', cause, 't4', 'scope:envs');

// `v5: false` leaves out what contract v5 added (summary.before_ideal, the
// cause current-unmatchable), so an earlier ui can read the same story.
// `newPurpose: true` makes the purpose itself change at t3 (hq -> hq.v2)
// instead of only the ideal state.
export const gapWorld = ({ through = 't7', v5 = true, newPurpose = false } = {}) => {
  const matchedT5 = gap('v2', 't4', [], [
    { condition: 'c3', at: 't5', by: 'current-satisfied' }, { condition: 'c1', at: 't5', by: 'current-satisfied' },
    { condition: 'c4', at: 't5', by: 'current-satisfied' }], 4, 4);
  // t5: one satisfied condition rests on an observation older than ideal.set v2.
  if (v5) matchedT5.summary.before_ideal = 1;
  const t6Parts = [c1(['current-stale'], 't6'),
    ...(v5 ? [part('c4', 'envs のスコープ主張', 'unknown', ['current-unmatchable'], 't6', 'scope:envs')] : [])];
  const frames = [
    frame('t0', 1, '2026-10-17T00:00:00Z', 'purpose-changed', noIdeal(null)),
    frame('t1', 2, '2026-10-17T01:00:00Z', 'defining', noIdeal('t0')),
    frame('t2', 3, '2026-10-17T02:00:00Z', 'matched', gap('v1', 't1', [], [], 2, 2), '2026-10-17T02:41:00Z'),
    frame('t3', 4, '2026-10-17T03:00:00Z', 'approximating', gap('v2', 't2', [c3(['ideal-added'])], [], 3, 2)),
    frame('t4', 5, '2026-10-17T04:00:00Z', 'approximating', gap('v2', 't3',
      [c3(['carried']), c1(['current-regressed'], 't4'), c4(['current-unobserved'])], [], 4, 1)),
    frame('t5', 6, '2026-10-17T05:00:00Z', 'matched', matchedT5, '2026-10-17T05:41:00Z'),
    frame('t6', 7, '2026-10-17T06:00:00Z', 'approximating', gap('v2', 't5', t6Parts, [], 4, 4 - t6Parts.length)),
    frame('t7', 8, '2026-10-17T07:00:00Z', 'ended', noIdeal('t6', [{ condition: 'c1', at: 't7', by: 'purpose-ended' }])),
  ];
  return {
    kind: 'ui.atlasWorldInput.v1',
    authority: false,
    note: 'Synthetic adrs#647 v3 fixture.',
    presentation: {
      areas: [{ id: 'purpose', label: 'Purpose', order: 0 }, { id: 'scopes', label: 'Scope', order: 1 }, { id: 'agents', label: 'Agent', order: 2 }],
      purposeAreaId: 'purpose',
      directionTargets: [purpose],
      defaultSelection: purpose,
    },
    frames: frames.slice(0, frames.findIndex(item => item.id === through) + 1).map((item, index) => {
      if (newPurpose && index >= 3 && item.gap) item.gap.basis.purpose_id = 'hq.v2';
      return item;
    }),
  };
};
