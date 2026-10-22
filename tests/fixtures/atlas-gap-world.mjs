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
// v4 (adrs#647 c6339644103): the producer's one record that the current route
// is retired (apps step), between t5 and t6.
const RETIRED = [{ kind: 'observation', recordedAt: '2026-10-17T05:40:00Z', observedAt: '2026-10-17T05:40:00Z', actor: null,
  source: { ref: 'step:route sha256:' + sha('r'), commentId: null, sha256: null }, target: { kind: 'state', id: 'route:current' }, value: 'retired' }];
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
// `current: true` adds the current claims above (at t4 and t6); `retired: true`
// adds the record that the current route is retired (at t6).
// `admission: true` gives some decisions' sources an admission (A3, apps#120):
// the purpose.set and ideal.set v2 read observed_not_admitted, the first
// evaluation a value this ui does not know (shown as is).
const ADMISSION = { '2026-10-16T23:30:00Z': 'observed_not_admitted', '2026-10-17T02:30:00Z': 'observed_not_admitted', '2026-10-17T02:50:00Z': 'pending-review' };
// `unbound: true` adds plan.set entries no ideal state binds (L3, adrs#647), in
// the contract's shape {kind, plan, version, source, unbound: true}: two at t4
// (beside the bound plan of resources#25) and one at t6.
// v3: with their time (when appended to the ledger) and author (or null).
// t6 carries a newer version of resources#71.
const unboundPlan = (recordedAt, actor, plan, version, ref, commentId, digest) => ({ kind: 'plan.set', recordedAt, actor, plan, version,
  source: { ref, commentId, sha256: sha(digest) }, unbound: true });
const UNBOUND = {
  t4: [unboundPlan('2026-10-17T03:20:00Z', 'roccho-dev', 'resources#71:tool-split', 1, 'roccho-dev/resources#71', null, 'c'),
    unboundPlan('2026-10-17T03:30:00Z', null, 'nixos#12:fork-surface', 2, 'roccho-dev/nixos#12', 4100, 'd')],
  t6: [unboundPlan('2026-10-17T05:20:00Z', 'roccho-dev', 'mieru#3:release', 1, 'roccho-dev/mieru#3', 4200, 'e'),
    unboundPlan('2026-10-17T05:25:00Z', 'roccho-dev', 'resources#71:tool-split', 2, 'roccho-dev/resources#71', 4300, 'f')],
};
// `drafting: true` (case 14) starts drafting ideal v3 at 05:20, while v2 stays
// in force: t6 reads 改訂中 v3.
const DRAFTING = [entry('ideal.drafting', '2026-10-17T05:20:00Z', { purpose_id: 'hq', version: 3 })];
// `lastObserved: true` (case 26) gives each open part the observation the
// judge last matched for it (parts[i].last_observed): c1's 03:40Z line, by
// atlas.events; c3 and c4 were never observed (null).
const LAST_OBSERVED = { c1: { observedAt: '2026-10-17T03:40:00Z', source: { ref: 'hq:observations.jsonl' }, actor: 'atlas.events' } };
// `upkeep: true` gives frames[i].upkeep to each frame with a condition met
// (S7: matched or not): per condition met, the observation's time and when it
// goes stale (observedAt + maxAge, as the judge chose it); on a matched frame
// the earliest is its matched_until. t6 is approximating with c2, c3 met.
const UPKEEP = {
  t2: [{ condition: 'c2', observedAt: '2026-10-17T01:40:00Z', stale_at: '2026-10-17T03:40:00Z' },
    { condition: 'c1', observedAt: '2026-10-17T01:40:00Z', stale_at: '2026-10-17T02:41:00Z' }],
  t5: [{ condition: 'c3', observedAt: '2026-10-17T03:40:00Z', stale_at: '2026-10-17T06:10:00Z' },
    { condition: 'c1', observedAt: '2026-10-17T03:40:00Z', stale_at: '2026-10-17T05:41:00Z' }],
  t6: [{ condition: 'c3', observedAt: '2026-10-17T03:40:00Z', stale_at: '2026-10-17T07:10:00Z' },
    { condition: 'c2', observedAt: '2026-10-17T03:40:00Z', stale_at: '2026-10-17T07:40:00Z' }],
};
// `judged: true` gives each frame contract v12's `adequacy` (adrs#647) as the
// producer judges this story: no ideal at t0/t1, no evaluation at t2, the v1
// evaluation past at t3/t4 (versions compare as written: 1 is not 'v2'),
// achieved with nothing open at t5, achieved while open at t6 and the
// purpose ended at t7.
const evidenceOf = recordedAt => {
  const item = JOURNAL.find(each => each.kind === 'purpose.evaluated' && each.recordedAt === recordedAt);
  return { recordedAt, actor: item.actor, source: { ...item.source }, purpose_id: item.purpose_id, purpose_rev: item.purpose_rev,
    ideal_version: item.ideal_version, verdict: item.verdict, note: item.note };
};
const ADEQUACY = { t0: ['no-ideal', null], t1: ['no-ideal', null], t2: ['no-evaluation', null], t3: ['past', '2026-10-17T02:50:00Z'],
  t4: ['past', '2026-10-17T02:50:00Z'], t5: ['no-adequacy-verdict', '2026-10-17T04:50:00Z'], t6: ['achieved-while-open', '2026-10-17T04:50:00Z'],
  t7: ['purpose-ended', '2026-10-17T04:50:00Z'] };
const adequacyOf = (id, basis) => {
  const [reason, at] = ADEQUACY[id];
  return { basis: { purpose_id: basis.purpose_id, purpose_rev: basis.purpose_rev, ideal_version: basis.ideal_version },
    state: reason === 'evaluated' ? 'unmet' : 'unknown', reason, evidence: at === null ? null : evidenceOf(at) };
};
// `held: true` gives each frame contract v12's `held`: the declarations held
// back that entered at it (an actor mismatch at t3, a machine proposal and an
// unknown author at t5), `[]` elsewhere.
const heldEntry = (reason, kind, recordedAt, sourceRef, commentId = null, sha256 = null) => ({ reason, kind, recordedAt, source: { ref: sourceRef, commentId, sha256 } });
const HELD = {
  t3: [heldEntry('actor-mismatch', 'ideal.set', '2026-10-17T02:40:00Z', 'adrs#647', 6230983531, sha('9'))],
  t5: [heldEntry('proposal', 'ideal.set', '2026-10-17T04:20:00Z', 'ops#552'), heldEntry('author-unknown', null, '2026-10-17T04:30:00Z', 'adrs#647', 6230983532)],
};
// `evaluator: true` adds an evaluator's (Jev's) unverified evaluations of the
// purpose as `evaluation:` observations (S4): problem at t3, ok at t6.
const evaluation = (recordedAt, value) => ({ kind: 'observation', recordedAt, observedAt: recordedAt, actor: 'jev',
  source: { ref: 'jev:ops#573', commentId: null, sha256: null }, target: { kind: 'state', id: 'evaluation:hq:adequacy' }, value });
const EVALUATIONS = [evaluation('2026-10-17T02:45:00Z', 'problem'), evaluation('2026-10-17T05:10:00Z', 'ok')];
// `physical: true` adds the physical Scope as contract v12 (S4) declares it:
// one relation from the physical thing to a condition id, in the producer's
// shape. development: apps packages/atlas (c3, c1) and ui packages/control
// (c3), while a part is open. operation: the native serve-static service
// keeps c1, related to the producer's purpose-state-target while the ideal
// has c1, and to the part too while c1 is open. c4 has no declaration.
const PHYSICAL = [
  { ref: ref('package', 'roccho-dev/apps:packages/atlas'), label: 'packages/atlas\nroccho-dev/apps', flags: ['repo=roccho-dev/apps', 'package=packages/atlas'],
    lifetime: 'development', conditions: ['c3', 'c1'], repo: 'roccho-dev/apps' },
  { ref: ref('package', 'roccho-dev/ui:packages/control'), label: 'packages/control\nroccho-dev/ui', flags: ['repo=roccho-dev/ui', 'package=packages/control'],
    lifetime: 'development', conditions: ['c3'], repo: 'roccho-dev/ui' },
  { ref: ref('service', 'native:serve-static'), label: 'serve-static\nnative', flags: ['host=native', 'service=serve-static'],
    lifetime: 'operation', conditions: ['c1'], repo: null },
];
const physicalScopes = (frameId, gap) => {
  const entities = [], relations = [];
  const link = (id, from, to, context, containment = null) => relations.push({ ref: ref('declared-relation', frameId + ':' + id), from, to,
    kind: 'declared-relation', label: containment ? '含む' : context.lifetime === 'operation' ? 'この条件を保つもの' : 'この差を埋める対象', context, path: false, containment });
  const target = ref('purpose-state-target', gap.basis.purpose_id + ':target');
  if (gap.parts !== null) entities.push({ ref: target, label: '理想状態', area: 'purpose', order: 8, visible: true, activity: 'none' });
  for (const [index, item] of PHYSICAL.entries()) {
    const open = item.conditions.filter(condition => (gap.parts ?? []).some(each => each.condition === condition));
    const keeps = item.lifetime === 'operation' && gap.parts !== null ? item.conditions : [];
    if (!open.length && !keeps.length) continue;
    entities.push({ ref: item.ref, label: item.label, area: 'scopes', order: 30 + index, visible: true, activity: 'none',
      source: { sourceRef: 'atlas.control-norms/1#phys.' + index, sourceDigest: null, kind: 'declared' }, flags: ['physical-scope', ...item.flags] });
    if (item.repo) {
      const repoRef = ref('repository', item.repo);
      entities.push({ ref: repoRef, label: item.repo + '\nrepo', area: 'scopes', order: 20 + index, visible: true, activity: 'none', flags: ['physical-scope', 'repo=' + item.repo] });
      link('contains:' + index, repoRef, item.ref, { declared_by: 'physical-scope' }, 'from-contains-to');
    }
    for (const condition of keeps) link('keep:' + index + ':' + condition, item.ref, target, { condition, lifetime: 'operation' });
    for (const condition of open) link('part:' + index + ':' + condition, item.ref, ref('semantic-scope', condition), { condition, lifetime: item.lifetime });
  }
  return { entities, relations };
};
export const gapWorld = ({ through = 't7', v5 = true, sides = true, newPurpose = false, groups = false, current = false, admission = false, unbound = false,
  judged = false, held = false, evaluator = false, physical = false, drafting = false, lastObserved = false, upkeep = false, retired = false } = {}) => {
  const decided = admission ? JOURNAL.map(item => ADMISSION[item.recordedAt] ? { ...item, source: { ...item.source, admission: ADMISSION[item.recordedAt] } } : item) : JOURNAL;
  const extra = [...(current ? CURRENT : []), ...(retired ? RETIRED : []), ...(evaluator ? EVALUATIONS : []), ...(drafting ? DRAFTING : [])];
  const entries = extra.length ? [...decided, ...extra].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)) : decided;
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
      if (lastObserved) for (const part of item.gap.parts ?? []) part.last_observed = structuredClone(LAST_OBSERVED[part.condition] ?? null);
      const nested = groups && item.gap.parts?.length
        ? groupedScopes(item.id, item.gap.parts, frames.slice(0, index + 1).flatMap(each => each.gap.closed), groups === 'unplaced' ? 'c4' : null) : null;
      const declared = physical ? physicalScopes(item.id, item.gap) : { entities: [], relations: [] };
      const supplied = nested ?? { entities: [], relations: [] };
      return { ...item, journal: [...journalBetween(entries, frames[index - 1]?.asOf ?? null, item.asOf), ...(unbound ? structuredClone(UNBOUND[item.id] ?? []) : [])],
        entities: [...item.entities, ...supplied.entities, ...declared.entities],
        ...(upkeep && UPKEEP[item.id] ? { upkeep: structuredClone(UPKEEP[item.id]) } : {}),
        relations: [...item.relations, ...supplied.relations, ...declared.relations],
        ...(judged ? { adequacy: adequacyOf(item.id, item.gap.basis) } : {}), ...(held ? { held: structuredClone(HELD[item.id] ?? []) } : {}) };
    }),
  };
};

// D6 (apps#73; adrs#647 c6342302345): t4 with more Scopes than the projection
// draws in one area (its limit is 40), and one Scope that is not visible and is
// not history. The rest is the grouped story.
export const crowdedGapWorld = () => {
  const raw = gapWorld({ groups: true });
  const t4 = raw.frames.find(item => item.id === "t4");
  for (let index = 0; index < 41; index += 1) t4.entities.push({ ref: ref("semantic-scope", "crowd-" + String(index).padStart(2, "0")),
    label: "群 " + index, area: "scopes", order: 200 + index, visible: true, activity: "none", flags: [] });
  t4.entities.push({ ref: ref("semantic-scope", "quiet"), label: "描かない Scope", area: "scopes", order: 300, visible: false, activity: "none", flags: [] });
  return raw;
};
