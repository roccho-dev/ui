// A World on adrs#647 contract v3-v6 (frames[i].gap / phase / journal /
// matched_until), one frame per hour on 2026-10-17:
// t0 purpose-changed  purpose set; no ideal state yet (gap null)
// t1 defining         ideal v1 being drafted (gap null)
// t2 matched          ideal v1 set; current = ideal; fresh until 02:41Z
// t3 approximating    only the ideal moves (v1 -> v2 adds c3, not yet observed:
//                     both sides); a past evaluation
// t4 approximating    c1 regresses (observed 03:40Z, no owner), c4 unobserved, c3 carries on
// t5 matched          all satisfied again; fresh until 05:41Z; evaluated
// t6 approximating    c1's observation went stale; c4's cannot be matched (v5)
// t7 ended            the purpose ends; c1 closes as purpose-ended
// (t0/t1/t7 carry v4's gap with parts null: UNKNOWN, closed kept)
// v6: each frame's journal holds only the entries recorded since the frame
// before it; a part's cause is {ideal, current}.
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
  entry('observation', '2026-10-17T03:40:00Z', { target: 'c1', value: false }),
  entry('purpose.evaluated', '2026-10-17T04:50:00Z', { purpose_id: 'hq', purpose_rev: 1, ideal_version: 2, verdict: 'achieved', note: '到達' }),
];
// current = record(agent) as the HQ World carries it (apps#122/#124): `work:`
// and `evidence:` observations of target kind state, from `current:P#L<n>`
// sources with no actor. b's later line wins (LWW); c's latest line was
// invalid, so it has no value; a's evidence comes from another line than its
// state (as atlas.current-c2's L2/L3 in the HQ World).
const claim = (recordedAt, id, value, line) => ({ kind: 'observation', recordedAt, observedAt: recordedAt, actor: null,
  source: { ref: 'current:P#L' + line + ' sha256:' + sha('b'), commentId: null, sha256: null }, target: { kind: 'state', id }, value });
const CURRENT = [
  claim('2026-10-17T03:50:00Z', 'work:b', 'progressed', 2),
  claim('2026-10-17T03:50:00Z', 'work:c', 'progressed', 3),
  claim('2026-10-17T05:30:00Z', 'work:a', 'created', 1),
  claim('2026-10-17T05:30:00Z', 'evidence:a', 'roccho-dev/apps#124', 4),
  claim('2026-10-17T05:30:00Z', 'work:b', 'reported-done', 2),
  claim('2026-10-17T05:30:00Z', 'work:c', null, 3),
];
// v6: the entries recorded after the previous frame's asOf, up to this one's.
const journalBetween = (entries, after, asOf) => structuredClone(entries.filter(item => Date.parse(item.recordedAt) <= Date.parse(asOf)
  && (after === null || Date.parse(item.recordedAt) > Date.parse(after))));
const causesOf = cause => Array.isArray(cause) ? cause : [...new Set([cause.ideal, cause.current])].filter(item => item !== null);
const summaryOf = (parts, conditions, satisfied) => ({ open: parts.length, conditions, satisfied,
  by_cause: parts.flatMap(item => causesOf(item.cause)).reduce((counts, cause) => ({ ...counts, [cause]: (counts[cause] ?? 0) + 1 }), {}) });
const frame = (id, rev, asOf, phase, gap, matchedUntil = null) => ({
  id, rev, asOf, sourceState: 'synthetic',
  entities: [{ ref: purpose, label: '目的\n宣言だけで回る組織', area: 'purpose', order: 0, visible: true, activity: 'none' }, agent('atlas.W', 0), agent('envs.W', 1)],
  relations: [], phase, gap, matched_until: matchedUntil,
});
const gap = (version, prev, parts, closed, conditions, satisfied) => ({
  basis: { purpose_id: 'hq', purpose_rev: 1, ideal_version: version, prev_frame: prev }, parts, closed, summary: summaryOf(parts, conditions, satisfied),
});
// v4: with no ideal state to compare with, parts are null (UNKNOWN) and the
// closed history is kept.
const noIdeal = (prev, closed = []) => ({ basis: { purpose_id: 'hq', purpose_rev: 1, ideal_version: null, prev_frame: prev }, parts: null, closed,
  summary: { open: null, by_cause: {}, conditions: null, satisfied: null } });
const c3 = cause => part('c3', 'windows repo を退役する', 'unmet', cause, 't3', 'scope:atlas', ['resources#25']);

// `v5: false` leaves out what contract v5 added (summary.before_ideal, the
// cause current-unmatchable), so an earlier ui can read the same story.
// A frame's Scope area as a producer supplies it nested (K8, contract v7): one
// frame per owner, one for 担当なし and one for the closed history, each
// containing its Scopes through from-contains-to relations.
// `leaveOut` names a condition whose Scope the producer does not supply, so
// that open part matches no Scope.
const groupedScopes = (frameId, parts, closed, leaveOut = null) => {
  const entities = [], relations = [];
  const scopeEntity = (kind, id, label, order, flags) => entities.push({ ref: ref(kind, id), label, area: 'scopes', order, visible: true, activity: 'none', flags });
  const group = (id, label, children) => {
    scopeEntity('scope-group', id, label, 100 + entities.length, ['group']);
    for (const child of children) relations.push({ ref: ref('scope-contains', frameId + ':' + id + ':' + child.id), from: ref('scope-group', id), to: ref(child.kind, child.id),
      kind: 'contains', path: false, containment: 'from-contains-to' });
  };
  const items = parts.filter(item => item.condition !== leaveOut).map((item, order) => {
    const kind = item.scope === null ? 'unassigned-change' : 'semantic-scope';
    scopeEntity(kind, item.condition, item.label + '\n' + (item.state === 'unmet' ? '未達' : '未確認'), order, ['scope_status=' + item.state]);
    return { kind, id: item.condition, scope: item.scope };
  });
  const history = closed.map((item, order) => {
    scopeEntity('closed-change', item.condition + '@' + item.at, item.condition + '\n' + item.by, 50 + order, ['standing=completed-history']);
    return { kind: 'closed-change', id: item.condition + '@' + item.at };
  });
  for (const scope of [...new Set(items.map(item => item.scope).filter(item => item !== null))]) group('owner:' + scope, '担当\n' + scope, items.filter(item => item.scope === scope));
  if (items.some(item => item.scope === null)) group('owner:none', '担当なし', items.filter(item => item.scope === null));
  if (history.length) group('history', '閉じた差（履歴）', history);
  return { entities, relations };
};

// `sides: false` writes each cause as the earlier list instead of v6's
// {ideal, current}. `newPurpose: true` makes the purpose itself change at t3
// (hq -> hq.v2) instead of only the ideal state. `groups: true` adds, to each
// frame with open parts, the Scope area nested as a producer supplies it;
// `groups: 'unplaced'` does so without c4's Scope (c4 then matches none).
// `current: true` adds the current claims above (at t4 and t6).
export const gapWorld = ({ through = 't7', v5 = true, sides = true, newPurpose = false, groups = false, current = false } = {}) => {
  const entries = current ? [...JOURNAL, ...CURRENT].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)) : JOURNAL;
  const cause = (ideal, current) => sides ? { ideal, current } : causesOf({ ideal, current });
  const c1 = (current, since) => part('c1', '端末で直接入力できる', 'unmet', cause(null, current), since, null);
  const c4 = (current, since) => part('c4', 'envs のスコープ主張', 'unknown', cause(null, current), since, 'scope:envs');
  const matchedT5 = gap('v2', 't4', [], [
    { condition: 'c3', at: 't5', by: 'current-satisfied' }, { condition: 'c1', at: 't5', by: 'current-satisfied' },
    { condition: 'c4', at: 't5', by: 'current-satisfied' }], 4, 4);
  // t5: one satisfied condition rests on an observation older than ideal.set v2.
  if (v5) matchedT5.summary.before_ideal = 1;
  const t6Parts = [c1('current-stale', 't6'), ...(v5 ? [c4('current-unmatchable', 't6')] : [])];
  const frames = [
    frame('t0', 1, '2026-10-17T00:00:00Z', 'purpose-changed', noIdeal(null)),
    frame('t1', 2, '2026-10-17T01:00:00Z', 'defining', noIdeal('t0')),
    frame('t2', 3, '2026-10-17T02:00:00Z', 'matched', gap('v1', 't1', [], [], 2, 2), '2026-10-17T02:41:00Z'),
    frame('t3', 4, '2026-10-17T03:00:00Z', 'approximating', gap('v2', 't2', [c3(cause('ideal-added', 'current-unobserved'))], [], 3, 2)),
    frame('t4', 5, '2026-10-17T04:00:00Z', 'approximating', gap('v2', 't3',
      [c3(cause('carried', 'carried')), c1('current-regressed', 't4'), c4('current-unobserved', 't4')], [], 4, 1)),
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
      const nested = groups && item.gap.parts?.length
        ? groupedScopes(item.id, item.gap.parts, frames.slice(0, index + 1).flatMap(each => each.gap.closed), groups === 'unplaced' ? 'c4' : null) : null;
      return { ...item, journal: journalBetween(entries, frames[index - 1]?.asOf ?? null, item.asOf),
        ...(nested ? { entities: [...item.entities, ...nested.entities], relations: [...item.relations, ...nested.relations] } : {}) };
    }),
  };
};
