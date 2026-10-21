// The supplied decomposition of the difference between the current state (an
// observation at a frame) and the ideal state (a declared, versioned,
// observable approximation of the purpose achieved): adrs#647 contract v3-v6.
// Per frame: `gap` (null = no ideal state to compare with yet: UNKNOWN, never
// zero), `phase`, `journal` (v6: only the entries new at the frame; the ui
// accumulates them) and `matched_until`. Read exactly as supplied; nothing is
// inferred.
// A frame carrying any of them is drawn from them in two areas: the purpose
// area holds 目的, 理想状態, 差 (whose heading names the phase) and 現在状態, and the next area
// holds the Scopes the frame supplies there (as supplied, nesting included) or,
// when it supplies none, one Scope per open part plus the conditions closed so
// far as history.
// Other areas keep their supplied entities. Plans never enter a gap.

const check = (condition, message) => { if (!condition) throw new Error('atlas-world: ' + message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, required, at, optional = []) => {
  check(plain(value), at + ' must be an object');
  for (const key of Object.keys(value)) check(required.includes(key) || optional.includes(key), at + ': unknown field ' + key);
  for (const key of required) check(Object.hasOwn(value, key), at + '.' + key + ' is required');
};
const text = (value, at) => { check(typeof value === 'string' && value.length > 0, at + ' must be non-empty text'); return value; };
const count = (value, at) => { check(Number.isSafeInteger(value) && value >= 0, at + ' must be a non-negative integer'); return value; };
const instant = (value, at) => { text(value, at); check(Number.isFinite(Date.parse(value)), at + ' must be a parseable instant'); return value; };
const version = (value, at) => {
  check((typeof value === 'string' && value.length > 0) || (Number.isSafeInteger(value) && value >= 0), at + ' must be text or a non-negative integer');
  return value;
};
const json = (value, at) => {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { check(Number.isFinite(value), at + ' must be finite'); return value; }
  if (Array.isArray(value)) return Object.freeze(value.map((item, index) => json(item, at + '[' + index + ']')));
  check(plain(value), at + ' must be JSON');
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, json(item, at + '.' + key)])));
};

export const GAP_CAUSES = Object.freeze(['initial', 'purpose-changed', 'ideal-added', 'ideal-revised', 'current-regressed',
  'current-unobserved', 'current-stale', 'current-confirmed-unmet', 'current-conflict', 'current-unmatchable', 'carried']);
// v6: a part's cause has two sides, each with 0-1 cause. `carried` is on
// neither side: it stands only when both sides are as before.
export const IDEAL_CAUSES = Object.freeze(['initial', 'purpose-changed', 'ideal-added', 'ideal-revised']);
export const CURRENT_CAUSES = Object.freeze(GAP_CAUSES.filter(cause => cause.startsWith('current-')));
export const GAP_CLOSED_BY = Object.freeze(['current-satisfied', 'ideal-removed', 'purpose-changed', 'purpose-ended']);
export const PHASES = Object.freeze(['purpose-changed', 'defining', 'approximating', 'matched', 'ended']);
export const JOURNAL_KINDS = Object.freeze(['purpose.set', 'ideal.drafting', 'ideal.set', 'plan.set', 'purpose.evaluated', 'purpose.ended', 'observation']);
export const CAUSE_LABEL = Object.freeze({ initial: '初回', 'purpose-changed': '目的の変更', 'ideal-added': '理想に追加',
  'ideal-revised': '理想の改訂', 'current-regressed': '現在の後退', 'current-unobserved': '未観測', 'current-stale': '鮮度切れ',
  'current-confirmed-unmet': '未達と確認', 'current-conflict': '観測の矛盾',
  'current-unmatchable': '照合不能', carried: '継続' });
export const PHASE_LABEL = Object.freeze({ 'purpose-changed': '目的変更', defining: '定義中', approximating: '近似中', matched: '一致・維持', ended: '目的の終了' });
export const JOURNAL_MARK = Object.freeze({ 'purpose.set': '◎', 'ideal.drafting': '△', 'ideal.set': '▲', 'plan.set': '◇',
  'purpose.evaluated': '★', 'purpose.ended': '■', observation: '·' });
export const JOURNAL_LABEL = Object.freeze({ 'purpose.set': '目的', 'ideal.drafting': '理想の定義開始', 'ideal.set': '理想の確定',
  'plan.set': '計画', 'purpose.evaluated': '評価', 'purpose.ended': '目的の終了', observation: '観測' });
// L3: a plan.set bound to no ideal state's requires[].plans.
export const UNBOUND_MARK = '（宣言に未結合）';
// v12: such entries in `journal` (up to a frame), each plan id once, leaving
// out an id the frame's plans carry. Counted only, never one of the plans.
export const unboundPlanCount = (journal, plans) => {
  const bound = new Set((plans ?? []).map(item => item.plan));
  return new Set(journal.filter(entry => entry.unbound === true && !bound.has(entry.plan)).map(entry => entry.plan)).size;
};
// A3 (apps#120): a decision's source observed but not admitted is marked
// where the decision is drawn. Display only: no judgment reads it. A value
// this ui does not know is shown as it is.
const ADMISSION_LABEL = Object.freeze({ observed_not_admitted: '未採択' });
export const admissionMark = entry => typeof entry?.source?.admission === 'string'
  ? '（' + (ADMISSION_LABEL[entry.source.admission] ?? entry.source.admission) + '）' : '';
const VERDICT_LABEL = Object.freeze({ achieved: '到達', 'not-yet': '未到達', 'ideal-insufficient': '理想状態が不十分' });
const CLOSED_LABEL = Object.freeze({ 'current-satisfied': '現在が充足', 'ideal-removed': '理想から削除', 'purpose-changed': '目的の変更', 'purpose-ended': '目的の終了' });

// A cause is either the v6 sides {ideal, current}, each null, one cause or a
// list of at most one (carried stands alone: both sides as before), or the
// earlier non-empty list, still read.
const normalizeCause = (value, at) => {
  if (Array.isArray(value)) {
    check(value.length > 0, at + ' must be a non-empty array');
    for (const cause of value) check(GAP_CAUSES.includes(cause), at + ' has unknown cause ' + cause);
    check(new Set(value).size === value.length, at + ' must not repeat');
    return Object.freeze([...value]);
  }
  exact(value, [], at, ['ideal', 'current']);
  const side = (name, allowed) => {
    const list = Array.isArray(value[name]) ? value[name] : [value[name] ?? null].filter(item => item !== null);
    check(list.length <= 1, at + '.' + name + ' must hold at most one cause');
    check(list.every(item => allowed.includes(item)), at + '.' + name + ' must be ' + allowed.join('|') + ' or null');
    return list[0] ?? null;
  };
  const ideal = side('ideal', [...IDEAL_CAUSES, 'carried']);
  const current = side('current', [...CURRENT_CAUSES, 'carried']);
  check(ideal !== null || current !== null, at + ' must name a cause on at least one side');
  check(![ideal, current].includes('carried') || [ideal, current].every(item => item === null || item === 'carried'),
    at + ': carried stands only when neither side has another cause');
  return Object.freeze({ ideal, current });
};
// The causes of a part by side; an earlier list is split by the cause names.
const causeSides = cause => {
  const list = Array.isArray(cause) ? cause : [cause.ideal, cause.current];
  return Object.freeze({ ideal: list.filter(item => IDEAL_CAUSES.includes(item)), current: list.filter(item => CURRENT_CAUSES.includes(item)),
    carried: list.includes('carried') });
};
const causesOf = part => { const sides = causeSides(part.cause); return [...sides.ideal, ...sides.current, ...(sides.carried ? ['carried'] : [])]; };

const lastObserved = (value, at) => {
  exact(value, ['observedAt', 'source', 'actor'], at);
  instant(value.observedAt, at + '.observedAt');
  exact(value.source, ['ref'], at + '.source');
  text(value.source.ref, at + '.source.ref');
  if (value.actor !== null) text(value.actor, at + '.actor');
  return json(value, at);
};

export const normalizeGap = (value, at) => {
  if (value === null) return null;
  exact(value, ['basis', 'parts', 'closed', 'summary'], at);
  exact(value.basis, ['purpose_id', 'purpose_rev', 'ideal_version', 'prev_frame'], at + '.basis', ['purpose_label']);
  const basis = Object.freeze({
    purpose_id: text(value.basis.purpose_id, at + '.basis.purpose_id'),
    purpose_label: value.basis.purpose_label === undefined || value.basis.purpose_label === null ? null : text(value.basis.purpose_label, at + '.basis.purpose_label'),
    purpose_rev: version(value.basis.purpose_rev, at + '.basis.purpose_rev'),
    ideal_version: value.basis.ideal_version === null ? null : version(value.basis.ideal_version, at + '.basis.ideal_version'),
    prev_frame: value.basis.prev_frame === null ? null : text(value.basis.prev_frame, at + '.basis.prev_frame'),
  });
  // parts null (v4): no ideal state to compare with (UNKNOWN, not empty);
  // closed history is kept. An ideal version exists exactly when parts do.
  check(value.parts === null || Array.isArray(value.parts), at + '.parts must be an array or null');
  check((value.parts === null) === (basis.ideal_version === null), at + ': parts and basis.ideal_version must both be null or both be present');
  const parts = value.parts === null ? null : value.parts.map((part, index) => {
    const where = at + '.parts[' + index + ']';
    exact(part, ['condition', 'state', 'cause', 'since', 'scope', 'refs'], where, ['label', 'observed_before_ideal', 'last_observed']);
    check(part.state === 'unmet' || part.state === 'unknown', where + '.state must be unmet|unknown (satisfied conditions are not parts)');
    const cause = normalizeCause(part.cause, where + '.cause');
    check(Array.isArray(part.refs), where + '.refs must be an array');
    check(part.observed_before_ideal === undefined || typeof part.observed_before_ideal === 'boolean', where + '.observed_before_ideal must be boolean');
    return Object.freeze({
      condition: text(part.condition, where + '.condition'),
      label: part.label === undefined || part.label === null ? null : text(part.label, where + '.label'),
      state: part.state,
      cause,
      since: text(part.since, where + '.since'),
      scope: part.scope === null ? null : text(part.scope, where + '.scope'),
      refs: Object.freeze(part.refs.map((ref, n) => text(ref, where + '.refs[' + n + ']'))),
      observed_before_ideal: part.observed_before_ideal === true,
      // v12 (case 26): the observation the judge last matched for the part,
      // or null when it was never observed. Kept only when supplied.
      ...(part.last_observed === undefined ? {} : { last_observed: part.last_observed === null ? null : lastObserved(part.last_observed, where + '.last_observed') }),
    });
  });
  if (parts) check(new Set(parts.map(part => part.condition)).size === parts.length, at + '.parts: a condition appears twice');
  check(Array.isArray(value.closed), at + '.closed must be an array');
  const closed = value.closed.map((item, index) => {
    const where = at + '.closed[' + index + ']';
    exact(item, ['condition', 'at', 'by'], where);
    check(GAP_CLOSED_BY.includes(item.by), where + '.by must be ' + GAP_CLOSED_BY.join('|'));
    return Object.freeze({ condition: text(item.condition, where + '.condition'), at: text(item.at, where + '.at'), by: item.by });
  });
  exact(value.summary, ['open', 'by_cause'], at + '.summary', ['conditions', 'satisfied', 'before_ideal']);
  check(plain(value.summary.by_cause), at + '.summary.by_cause must be an object');
  for (const key of Object.keys(value.summary.by_cause)) check(GAP_CAUSES.includes(key), at + '.summary.by_cause has unknown cause ' + key);
  const optionalCount = key => value.summary[key] === undefined || value.summary[key] === null ? null : count(value.summary[key], at + '.summary.' + key);
  check(parts !== null || value.summary.open === null, at + '.summary.open must be null when parts is null');
  const summary = Object.freeze({
    open: parts === null ? null : count(value.summary.open, at + '.summary.open'),
    by_cause: Object.freeze(Object.fromEntries(Object.entries(value.summary.by_cause).map(([key, n]) => [key, count(n, at + '.summary.by_cause.' + key)]))),
    conditions: optionalCount('conditions'),
    satisfied: optionalCount('satisfied'),
    before_ideal: optionalCount('before_ideal'),
  });
  return Object.freeze({ basis, parts: parts === null ? null : Object.freeze(parts), closed: Object.freeze(closed), summary });
};

export const normalizePhase = (value, at) => {
  check(PHASES.includes(value), at + ' must be ' + PHASES.join('|'));
  return value;
};

export const normalizeJournal = (value, at) => {
  check(Array.isArray(value), at + ' must be an array');
  return Object.freeze(value.map((entry, index) => {
    const where = at + '[' + index + ']';
    check(plain(entry), where + ' must be an object');
    check(JOURNAL_KINDS.includes(entry.kind), where + '.kind must be ' + JOURNAL_KINDS.join('|'));
    // L3 (adrs#647): a plan.set no ideal state's requires[].plans binds carries
    // unbound: true, for display only; it needs its plan.
    if (entry.unbound !== undefined) {
      check(entry.kind === 'plan.set', where + '.unbound is for plan.set only');
      check(entry.unbound === true, where + '.unbound must be true');
      text(entry.plan, where + '.plan');
    }
    instant(entry.recordedAt, where + '.recordedAt');
    // An author the source does not name is null (shown as unknown), never guessed.
    if (entry.actor !== null) text(entry.actor, where + '.actor');
    exact(entry.source, ['ref'], where + '.source', ['commentId', 'sha256', 'updatedAt', 'admission']);
    text(entry.source.ref, where + '.source.ref');
    // A3: the source's admission, for display only (absent when it has none).
    if (entry.source.admission !== undefined) text(entry.source.admission, where + '.source.admission');
    return json(entry, where);
  }));
};

// v12: a frame's `adequacy` is GapA (目的↔理想の差) as the producer judged it,
// read exactly: its basis is the gap's, its state is unmet only for the reason
// evaluated, and its evidence is the evaluation (none for no-evaluation).
// Display only: nothing here judges it or counts it.
export const ADEQUACY_REASONS = Object.freeze(['purpose-ended', 'no-ideal', 'no-evaluation', 'past', 'evaluated',
  'not-yet-while-matched', 'achieved-while-open', 'no-adequacy-verdict']);
const optionalRef = (value, at) => value === null || Number.isSafeInteger(value) || (typeof value === 'string' && value.length > 0) ? value
  : check(false, at + ' must be text, an integer or null');
const sourceOf = (value, at, optional = []) => {
  exact(value, ['ref', 'commentId', 'sha256'], at, optional);
  text(value.ref, at + '.ref');
  optionalRef(value.commentId, at + '.commentId');
  check(value.sha256 === null || typeof value.sha256 === 'string', at + '.sha256 must be text or null');
  if (value.admission !== undefined) text(value.admission, at + '.admission');
};
export const normalizeAdequacy = (value, at, gap) => {
  check(gap, at + ' needs a gap');
  exact(value, ['basis', 'state', 'reason', 'evidence'], at);
  exact(value.basis, ['purpose_id', 'purpose_rev', 'ideal_version'], at + '.basis');
  check(['purpose_id', 'purpose_rev', 'ideal_version'].every(name => value.basis[name] === gap.basis[name]), at + '.basis must be the gap\'s basis');
  check(value.state === 'unmet' || value.state === 'unknown', at + '.state must be unmet|unknown');
  check(ADEQUACY_REASONS.includes(value.reason), at + '.reason must be ' + ADEQUACY_REASONS.join('|'));
  check((value.state === 'unmet') === (value.reason === 'evaluated'), at + '.state is unmet exactly when reason is evaluated');
  if (value.reason === 'no-evaluation') check(value.evidence === null, at + '.evidence must be null for reason no-evaluation');
  else if (!['purpose-ended', 'no-ideal'].includes(value.reason)) check(value.evidence !== null, at + '.evidence is required for reason ' + value.reason);
  if (value.evidence !== null) {
    const where = at + '.evidence';
    exact(value.evidence, ['recordedAt', 'actor', 'source', 'purpose_id', 'purpose_rev', 'ideal_version', 'verdict'], where, ['declaredAt', 'note']);
    instant(value.evidence.recordedAt, where + '.recordedAt');
    if (value.evidence.declaredAt !== undefined) instant(value.evidence.declaredAt, where + '.declaredAt');
    if (value.evidence.actor !== null) text(value.evidence.actor, where + '.actor');
    sourceOf(value.evidence.source, where + '.source', ['admission']);
    text(value.evidence.purpose_id, where + '.purpose_id');
    text(value.evidence.verdict, where + '.verdict');
  }
  return json(value, at);
};
// Contract 3, revised: `upkeep` lists, on a matched frame, each condition met
// with the time of the observation the judge chose and when it goes stale.
// Read exactly; the present's upkeep gives the steps past it (S7,
// atlas-timeline.mjs forecastSteps). Display only.
export const normalizeUpkeep = (value, at) => {
  check(Array.isArray(value), at + ' must be an array');
  return Object.freeze(value.map((item, index) => {
    const where = at + '[' + index + ']';
    exact(item, ['condition', 'observedAt', 'stale_at'], where);
    text(item.condition, where + '.condition');
    instant(item.observedAt, where + '.observedAt');
    instant(item.stale_at, where + '.stale_at');
    return json(item, where);
  }));
};
// v12: `held` lists the declarations held back that entered at the frame.
// Display only.
export const normalizeHeld = (value, at) => {
  check(Array.isArray(value), at + ' must be an array');
  return Object.freeze(value.map((item, index) => {
    const where = at + '[' + index + ']';
    exact(item, ['reason', 'kind', 'recordedAt', 'source'], where);
    text(item.reason, where + '.reason');
    if (item.kind !== null) text(item.kind, where + '.kind');
    instant(item.recordedAt, where + '.recordedAt');
    sourceOf(item.source, where + '.source');
    return json(item, where);
  }));
};

// v6: frames[i].journal holds only the entries new at that frame; the journal
// up to a frame is the entries of it and every frame before it. An entry that
// a later frame carries again (an earlier producer's whole list) is refused,
// never counted twice.
const journalThrough = frames => frames.flatMap(frame => frame.journal ?? []);
export const checkJournalDeltas = frames => {
  const seen = new Map();
  frames.forEach(frame => (frame.journal ?? []).forEach((entry, index) => {
    const entryKey = JSON.stringify(entry);
    check(!seen.has(entryKey), frame.id + ': journal[' + index + '] repeats an entry of frame ' + seen.get(entryKey)
      + ' (v6: a frame carries only the entries new at it)');
    seen.set(entryKey, frame.id);
  }));
};

// Counts are taken from the parts themselves; a summary that disagrees is
// shown as disagreeing, never trusted over the rows.
export const gapCounts = gap => {
  const byCause = Object.fromEntries(GAP_CAUSES.map(cause => [cause, gap.parts.filter(part => causesOf(part).includes(cause)).length]));
  const agrees = gap.summary.open === gap.parts.length
    && GAP_CAUSES.every(cause => (gap.summary.by_cause[cause] ?? 0) === byCause[cause]);
  return Object.freeze({
    open: gap.parts.length, unmet: gap.parts.filter(part => part.state === 'unmet').length,
    unknown: gap.parts.filter(part => part.state === 'unknown').length,
    byCause: Object.freeze(byCause), agrees,
  });
};

const versionText = value => typeof value === 'string' && /^v/u.test(value) ? value : 'v' + value;
const clockText = asOf => {
  const match = /T(\d\d:\d\d)/u.exec(asOf);
  return match ? match[1] + (/Z$/u.test(asOf) ? 'Z' : '') : asOf;
};
// Month, day and time: a claim's age must show, whatever day it is read.
export const dayClockText = at => {
  const match = /^\d{4}-(\d\d-\d\d)T(\d\d:\d\d)/u.exec(String(at));
  return match ? match[1] + ' ' + match[2] + (/Z$/u.test(at) ? 'Z' : '') : String(at ?? '時刻不明');
};

// current = record(agent) (apps#122): each work's state is a `work:<id>`
// observation and its evidence an `evidence:<id>` one, from `current:...`
// sources. They are the author's claims, never achievements: shown as
// reported, with source and time, in the current state; no verdict, no
// satisfied count. The latest observation per id stands (the producer applies
// last-write-wins); no value is its latest line being invalid (apps#124).
const CLAIM_LABEL = Object.freeze({ created: '作成', progressed: '進行', 'reported-done': '完了と報告',
  'reported-blocked': '阻害と報告', 'reported-stopped': '中止と報告' });
const currentClaims = journal => {
  const latest = new Map();
  for (const entry of journal) {
    const id = entry.kind === 'observation' && typeof entry.target?.id === 'string' ? /^(work|evidence):(.+)$/u.exec(entry.target.id) : null;
    if (id) latest.set(id[1] + ':' + id[2], entry);
  }
  const ids = [...new Set([...latest.keys()].map(item => item.replace(/^(work|evidence):/u, '')))];
  return ids.map(id => {
    const work = latest.get('work:' + id) ?? null, evidence = latest.get('evidence:' + id) ?? null;
    const state = work === null ? '状態の行なし' : work.value === null || work.value === undefined ? '不明（最新の行が不正）'
      : CLAIM_LABEL[work.value] ?? String(work.value) + '（未知の値）';
    // The state and the evidence may come from different lines: each names its own.
    const from = entry => '（出所 ' + entry.source.ref.split(' ')[0] + (entry.actor ? ' · ' + entry.actor : '') + '）';
    const proof = evidence === null ? '' : ' · 証拠 ' + (evidence.value === null || evidence.value === undefined ? '不明' : String(evidence.value)) + from(evidence);
    const said = work ?? evidence;
    return id + ' · ' + state + (work ? from(work) : '') + proof + ' · ' + dayClockText(said.observedAt ?? said.recordedAt);
  });
};

// A digest revision is shown by its first 8 hex digits, named as shortened;
// the whole value is in the record.
const revText = rev => {
  const digest = /^sha256:([0-9a-f]{64})$/u.exec(String(rev));
  return digest ? 'rev ' + digest[1].slice(0, 8) + '（短縮）' : 'rev ' + rev;
};

// The two areas a gap frame is drawn in: the purpose area and the area that
// follows it in presentation order.
export const gapAreas = presentation => {
  const index = presentation.areas.findIndex(area => area.id === presentation.purposeAreaId);
  const scope = presentation.areas[index + 1];
  check(scope, 'a frame with gap needs an area after the purpose area for its Scopes');
  return Object.freeze({ purpose: presentation.purposeAreaId, scope: scope.id });
};

export const hasGapView = frame => Object.hasOwn(frame, 'gap') || Object.hasOwn(frame, 'phase');

// The newest evaluation of this purpose recorded up to the frame, and whether
// the purpose or the ideal state moved after it (a past evaluation).
const evaluationOf = (journal, purposeId, basis) => {
  const evaluation = journal.filter(entry => entry.kind === 'purpose.evaluated' && entry.purpose_id === purposeId).at(-1);
  if (!evaluation) return null;
  // Versions compare as written with or without a leading v (2 and 'v2' are the same version).
  const past = basis !== null && ((evaluation.purpose_rev !== undefined && String(evaluation.purpose_rev) !== String(basis.purpose_rev))
    || (evaluation.ideal_version !== undefined && versionText(evaluation.ideal_version) !== versionText(basis.ideal_version)));
  return { verdict: VERDICT_LABEL[evaluation.verdict] ?? String(evaluation.verdict ?? '不明'), mark: admissionMark(evaluation), past, recordedAt: evaluation.recordedAt };
};

// v12: GapA's state and reason as drawn; the record names the evaluation.
const ADEQUACY_STATE_LABEL = Object.freeze({ unmet: '不十分', unknown: '不明' });
const ADEQUACY_REASON_LABEL = Object.freeze({ 'purpose-ended': '目的は終了した', 'no-ideal': '照らす理想状態が無い', 'no-evaluation': '人の評価なし',
  past: '過去の評価（版が違う）', evaluated: '人の評価：理想状態が不十分', 'not-yet-while-matched': '一致のまま未到達と評価',
  'achieved-while-open': '差が開いたまま到達と評価', 'no-adequacy-verdict': '十分性の評価なし' });
const adequacySummary = value => 'GapA（目的↔理想の差）· state=' + value.state + ' · reason=' + value.reason
  + ' · basis purpose_rev=' + value.basis.purpose_rev + ' ideal_version=' + (value.basis.ideal_version ?? 'null')
  + (value.evidence ? ' · 評価 ' + value.evidence.verdict + '（' + value.evidence.recordedAt + ' · 作者 ' + (value.evidence.actor ?? '不明')
    + ' · 出所 ' + value.evidence.source.ref + '）' : ' · 評価なし') + '。判定・件数には使わない。評価者の評価は未検証。';
// S4: an evaluator's (e.g. Jev's) `evaluation:<purpose_id>:<question>`
// observations, the latest per question, as reported: unverified, never a
// judgment and never GapA's state.
const evaluationSigns = (journal, purposeId) => {
  const prefix = 'evaluation:' + purposeId + ':';
  const latest = new Map();
  for (const entry of journal) {
    if (entry.kind === 'observation' && typeof entry.target?.id === 'string' && entry.target.id.startsWith(prefix)) latest.set(entry.target.id, entry);
  }
  return [...latest].map(([id, entry]) => '評価者の評価（未検証） ' + id.slice(prefix.length) + '='
    + (entry.value === null || entry.value === undefined ? '不明' : String(entry.value))
    + '（出所 ' + entry.source.ref.split(' ')[0] + (entry.actor ? ' · ' + entry.actor : '') + ' · ' + dayClockText(entry.observedAt ?? entry.recordedAt) + '）');
};

// Entities and relations of a gap frame, in the normalized World shape.
// `earlier` are the frames before it (for the previous gap and history).
export const gapView = ({ frame, earlier, presentation, key }) => {
  const gap = frame.gap ?? null;
  // The parts are known only with an ideal state (v4: parts null otherwise).
  const g = gap !== null && gap.parts !== null ? gap : null;
  const areas = gapAreas(presentation);
  const order = [...earlier.map(item => item.id), frame.id];
  if (gap?.basis.prev_frame) check(earlier.some(item => item.id === gap.basis.prev_frame), frame.id + ': gap.basis.prev_frame must name an earlier frame');
  for (const part of g?.parts ?? []) check(order.includes(part.since), frame.id + ': gap part ' + part.condition + ' since must name this or an earlier frame');
  // Causes compare with the latest earlier frame that has a gap (contract v2).
  const prevGap = [...earlier].reverse().find(item => item.gap?.parts)?.gap ?? null;
  const counts = g ? gapCounts(g) : null;
  // v6: the journal up to this frame, accumulated from each frame's new entries.
  const journal = journalThrough([...earlier, frame]);
  // The purpose node is the declared target unless this frame's gap names
  // another purpose (an earlier one), which then gets its own node.
  const target = presentation.directionTargets[0];
  const purposeId = gap?.basis.purpose_id ?? target.id;
  const space = target.space;
  const purposeRef = purposeId === target.id ? target : Object.freeze({ space, kind: 'purpose', id: purposeId });
  const supplied = frame.entities.find(item => key(item.ref) === key(purposeRef));
  const ref = (kind, id) => Object.freeze({ space, kind, id });
  const time = Object.freeze({ acquiredAt: null, observedAt: null, effectiveAt: null });
  const entity = (entityRef, label, area, order, summary, flags = []) => Object.freeze({ ref: entityRef, label, area, order,
    visible: true, activity: 'none', summary, source: null, time, flags: Object.freeze(flags) });
  const relation = (id, from, to, label, context = {}) => Object.freeze({ ref: ref('gap-relation', frame.id + ':' + id), from, to,
    kind: 'gap', label, context: Object.freeze(context), source: null, time, flags: Object.freeze(['authority=false']), path: true,
    visible: true, activity: 'none', containment: null });

  const idealRef = ref('ideal-state', purposeId);
  const currentRef = ref('current-state', purposeId);
  const deltaRef = ref('gap', purposeId);
  // GapA (目的↔理想の差) is never judged here: the frame's `adequacy` (v12),
  // drawn as its state and reason (no count) with the evaluators' unverified
  // signs. Without it, no GapA.
  const adequacy = frame.adequacy
    ? entity(ref('purpose-adequacy', purposeId), '目的↔理想の差\n' + ADEQUACY_STATE_LABEL[frame.adequacy.state] + ' · '
      + ADEQUACY_REASON_LABEL[frame.adequacy.reason] + admissionMark(frame.adequacy.evidence)
      + evaluationSigns(journal, purposeId).map(line => '\n' + line).join(''), areas.purpose, 2, adequacySummary(frame.adequacy),
      ['scope_status=' + frame.adequacy.state])
    : null;
  // The newest decision of a kind, up to this frame, for the purpose drawn (and,
  // for an ideal.set, the version drawn): its source's admission marks it (A3).
  const decided = (kind, version = null) => journal.filter(entry => entry.kind === kind && (entry.purpose_id ?? entry.purpose?.id) === purposeId
    && (version === null || versionText(entry.ideal_version ?? entry.version) === versionText(version))).at(-1) ?? null;

  // S6 (adrs#647 comment 6306887827): no phase box. 理想↔現在の差's heading
  // names the supplied phase, when it began (the first received frame, going
  // back from this one, in the same phase), a matched phase's next stale time
  // and whether the phase disagrees with the gap. The phase itself is read
  // here and on 理想状態; what was held is in the frame's changes (frameChangeLabel).
  const phase = frame.phase ?? null;
  const consistent = phase === null ? true : (phase === 'approximating' ? g !== null && g.parts.length > 0
    : phase === 'matched' ? g !== null && g.parts.length === 0 : g === null);
  const phaseDecision = phase === 'defining' ? decided('ideal.drafting') : phase === 'ended' ? decided('purpose.ended') : null;
  let phaseStart = frame;
  for (const item of [...earlier].reverse()) {
    if (item.phase !== phase) break;
    phaseStart = item;
  }
  const deltaHeading = '理想↔現在の差' + (phase === null ? '' : '（' + PHASE_LABEL[phase] + admissionMark(phaseDecision) + '・' + dayClockText(phaseStart.asOf) + ' から'
    + (phase === 'matched' ? '・次の鮮度切れ ' + (frame.matched_until ? dayClockText(frame.matched_until) : '不明') : '') + '）')
    + (consistent ? '' : ' · gap と不整合');
  // v5: satisfied conditions whose evidence predates the ideal.set are shown,
  // not hidden: a match that may be a false positive.
  const beforeIdeal = g?.summary.before_ideal ? '\n理想状態の確定前の観測で一致 ' + g.summary.before_ideal + ' 件' : '';

  const prevVersion = prevGap?.basis.ideal_version ?? null;
  // The ideal state moves only within one purpose; a new purpose's ideal is
  // not a move of the previous purpose's.
  const moved = g !== null && prevVersion !== null && prevGap.basis.purpose_id === g.basis.purpose_id
    && versionText(prevVersion) !== versionText(g.basis.ideal_version);
  const conditionsText = g === null || g.summary.conditions === null ? '条件 未供給' : '条件 ' + g.summary.conditions;
  // Case 14: with an ideal in force, the newest ideal.drafting whose version
  // has no ideal.set up to this frame reads 改訂中. Display only.
  const drafting = g === null ? null : decided('ideal.drafting');
  const revisingText = drafting && versionText(drafting.version) !== versionText(g.basis.ideal_version)
    && decided('ideal.set', drafting.version) === null ? ' · 改訂中 ' + versionText(drafting.version) : '';
  const idealLine = g === null ? '照らし合わせる理想状態なし（' + (phase === 'defining' ? '定義中' : phase === 'ended' ? '目的は終了' : '未定義') + '）'
    : (moved ? versionText(prevVersion) + '→' : '') + versionText(g.basis.ideal_version) + admissionMark(decided('ideal.set', g.basis.ideal_version))
      + (moved ? ' 移動' : '') + ' · ' + conditionsText + revisingText;
  const prevOpen = g === null ? '' : g.basis.prev_frame === null ? '初回' : prevGap ? '前 ' + prevGap.parts.length : '前 不明';
  // The cause of each side of a part (v6: ideal side first; a side without one is left out).
  const causeText = part => {
    const sides = causeSides(part.cause);
    return [sides.ideal, sides.current, sides.carried ? ['carried'] : []].filter(list => list.length)
      .map(list => list.map(cause => CAUSE_LABEL[cause]).join('・')).join(' · ');
  };
  const partRecord = part => 'condition=' + part.condition + ' · state=' + part.state + ' · cause='
    + (Array.isArray(part.cause) ? part.cause.join(',') : 'ideal:' + (part.cause.ideal ?? 'なし') + ',current:' + (part.cause.current ?? 'なし'))
    + ' · since=' + part.since + ' · scope=' + (part.scope ?? 'null（担当未確定）') + ' · refs=' + (part.refs.join(', ') || 'なし');
  // A Scope area the frame supplies itself (e.g. nested per owner, with its
  // containment) is drawn as supplied; Scopes are derived from the parts only
  // when it supplies none. The kinds derived here are never counted as supplied.
  const suppliedScopes = frame.entities.filter(item => item.area === areas.scope && !['gap-part', 'gap-closed'].includes(item.ref.kind))
    .map(item => item.flags.includes('gap-view') && item.ref.kind !== 'package'
      ? Object.freeze({ ...item, label: item.label.split('\n').slice(0, -1).join('\n'), summary: item.summary?.split('\n').slice(0, -1).join('\n') || null,
        flags: Object.freeze(item.flags.filter(flag => flag !== 'gap-view')) })
      : item);
  // Physical Scope (contract v12, S4): a declared physical thing (a package, a
  // service) is a Scope card through its one relation to a condition id, read
  // from the supplied relations alone: to an open part (development: この差を
  // 埋める対象, operation: この条件を保つもの) and, for operation, to the
  // producer's purpose-state-target, drawn on 理想状態 (この条件を保つもの).
  // Nothing is matched by name, owner or scope, and nothing points at GapA.
  // The abstract semantic-scope cards are not shown as separate Scope cards;
  // a part with no declaration is 未特定.
  const keepTarget = ref('purpose-state-target', purposeId + ':target');
  const linksOf = item => frame.relations.filter(relation => key(relation.from) === key(item.ref) && !relation.containment)
    .flatMap(relation => (relation.context?.conditions ?? [relation.context?.condition]).filter(condition => typeof condition === 'string')
      .map(condition => ({ condition, lifetime: relation.context.lifetime === 'operation' ? 'operation' : 'development',
        // Matched by kind and id alone: the producer's space for its target may differ.
        keeps: [keepTarget, idealRef].some(target => relation.to.kind === target.kind && relation.to.id === target.id) })));
  const keepsOf = item => [...new Set(linksOf(item).filter(link => link.keeps && link.lifetime === 'operation').map(link => link.condition))];
  const partLinksOf = item => linksOf(item).filter(link => !link.keeps && (g?.parts ?? []).some(part => part.condition === link.condition));
  const physicalParts = item => (g?.parts ?? []).filter(part => partLinksOf(item).some(link => link.condition === part.condition));
  const physicalPackages = suppliedScopes.filter(item => item.flags.includes('physical-scope') && (keepsOf(item).length || physicalParts(item).length));
  const physical = physicalPackages.length > 0;
  const ownerByUnit = new Map();
  for (const relation of frame.relations) {
    if (!relation.containment || relation.from.kind !== 'scope-group' || !relation.from.id.startsWith('owner:')) continue;
    const group = frame.entities.find(item => key(item.ref) === key(relation.from));
    ownerByUnit.set(key(relation.to), group?.label.split('\n').at(-1) ?? relation.from.id.slice('owner:'.length));
  }
  const physicalRepo = item => item.flags.find(flag => flag.startsWith('repo='))?.slice('repo='.length) ?? null;
  const physicalPath = item => item.flags.find(flag => flag.startsWith('package='))?.slice('package='.length) ?? null;
  const physicalHeading = item => physicalRepo(item) && physicalPath(item) ? [physicalRepo(item), physicalPath(item)] : [item.ref.id];
  const physicalName = item => physicalHeading(item).join('/');
  const ownerOf = part => part.scope === null ? null
    : ownerByUnit.get(key(Object.freeze({ space, kind: 'semantic-scope', id: part.scope }))) ?? part.scope;
  const ownerLine = part => ownerOf(part) === null ? '担当未確定' : '担当 ' + ownerOf(part);
  const physicalTargets = part => physicalPackages.filter(item => physicalParts(item).includes(part));
  // Each open part is shown on the one supplied Scope whose id is its scope or
  // its condition; a part matching none or several, or sharing its Scope with
  // another part, is shown on none (never attached by guess). Those are
  // counted on 差 and listed in its record, never dropped in silence.
  const matches = new Map();
  let unplaced = [];
  if (!physical) {
    for (const part of suppliedScopes.length ? g?.parts ?? [] : []) {
      const hits = suppliedScopes.filter(item => item.ref.id === part.scope || item.ref.id === part.condition);
      if (hits.length === 1) matches.set(key(hits[0].ref), [...(matches.get(key(hits[0].ref)) ?? []), part]);
    }
    const placed = new Set([...matches.values()].filter(list => list.length === 1).flat());
    unplaced = suppliedScopes.length ? (g?.parts ?? []).filter(part => !placed.has(part)) : [];
  }
  const physicalMark = part => {
    const hits = physicalTargets(part);
    return hits.length ? ' · 物理Scope ' + hits.map(physicalName).join(' / ') : ' · 物理Scope 未特定';
  };
  // 差 is the difference only: which conditions differ (! unmet, ? unknown)
  // and why, and the previous frame's count. The ideal's and the current
  // state's contents are in their nodes. It is named 理想↔現在の差, apart from
  // GapA. With physical Scope declarations each row names its repo/package, or
  // 未特定 when none is declared.
  const deltaText = g === null ? deltaHeading + (phase === 'ended' ? '\n差 対象外\n目的は終了した' : '\n差 不明\n照らし合わせる理想状態がまだ無い')
    : deltaHeading + '\n' + prevOpen + (counts.agrees ? '' : ' · 集計不一致')
      + g.parts.map(part => '\n' + (part.state === 'unmet' ? '!' : '?') + ' ' + part.condition + ' · ' + causeText(part)
        + (physical ? physicalMark(part) : '')).join('')
      + (physical ? '' : unplaced.length ? '\nScope に付かない差 ' + unplaced.length + ' 件' : '');
  const deltaFlags = g === null ? ['scope_status=unknown'] : counts.open === 0 ? ['standing=completed-history'] : counts.unknown > 0 ? ['scope_status=unknown'] : ['scope_status=unmet'];
  // The current state: observations (journal entries of kind observation up
  // to this frame; none recorded reads so, never 0 observed), the matches
  // resting on observations older than the ideal, and the current claims.
  // The other matches are the ideal's conditions less 差's rows (S6).
  const observations = journal.filter(entry => entry.kind === 'observation');
  const lastObserved = observations.map(entry => entry.observedAt ?? entry.recordedAt).sort().at(-1);
  const claims = currentClaims(journal);
  // Plans are an attribute of the ideal state (v12): 理想状態 ends with the
  // frame's plans and the plans bound to no ideal state, so every chrome shows
  // them (the HUD's plan cell too). No line when neither is there (no zero
  // count); never in 現在状態 and never a judgment.
  const unbound = unboundPlanCount(journal, frame.plans);
  const plans = frame.plans ?? null;
  const planLine = plans === null && !unbound ? '' : '\n計画：' + (plans === null ? '未宣言（UNKNOWN）' : plans.length ? plans.length + ' 件' : '有効な計画 0 件')
    + (unbound ? ' · 未結合 ' + unbound + ' 件' : '')
    // S7: each plan of the frame, one line: what it is, what it serves, its
    // content as supplied and where it was read from (the only place it is read).
    + (plans ?? []).map(plan => '\n計画 ' + plan.label + ' · 寄与 ' + (plan.serves.length ? plan.serves.join('、') : 'なし')
      + ' · 内容 ' + (plan.nodes === null ? 'UNKNOWN' : 'ノード ' + plan.nodes.length + ' 件')
      + ' · 出所 ' + plan.source.repo + (plan.source.commentId === null || plan.source.commentId === undefined ? '' : ' comment ' + plan.source.commentId)).join('');
  const currentLine = (observations.length ? '観測 ' + observations.length + ' 件 · 最新 ' + clockText(lastObserved) : '観測の仕訳なし') + beforeIdeal
    + (claims.length ? '\n作業の主張（current） ' + claims.length + ' 件\n' + claims.join('\n') : '');

  // The supplied purpose label; when this frame was already drawn from its
  // gap (the World is normalized twice in the app), drop the line added here.
  // The gap's own purpose_label comes first when supplied.
  const purposeLabel = gap?.basis.purpose_label ? '目的\n' + gap.basis.purpose_label
    : supplied?.flags.includes('gap-view') ? supplied.label.split('\n').slice(0, -1).join('\n')
      : supplied?.label ?? '目的\n' + purposeId;
  const evaluation = evaluationOf(journal, purposeId, gap?.basis ?? null);
  const purposeLines = [purposeLabel, (gap ? revText(gap.basis.purpose_rev) : 'rev 不明') + admissionMark(decided('purpose.set'))
    + (evaluation ? ' · ' + (evaluation.past ? '過去の評価：' : '評価：') + evaluation.verdict + evaluation.mark : '')];

  const entities = [
    entity(purposeRef, purposeLines.join('\n'), areas.purpose, 1,
      '目的は観測では判定しない（人が評価する）。purpose_id=' + purposeId + (gap ? ' · purpose_rev=' + gap.basis.purpose_rev : '')
        + (evaluation ? ' · ' + (evaluation.past ? '過去の評価' : '評価') + '=' + evaluation.verdict + ' (' + evaluation.recordedAt + ')' : ''),
      ['gap-view']),
    // Declared in the order of their chain: 目的–GapA–理想状態–差–現在状態.
    ...(adequacy ? [Object.freeze({ ...adequacy, area: areas.purpose, order: 2 })] : []),
    entity(idealRef, '理想状態\n' + idealLine + planLine, areas.purpose, 3,
      g === null ? '照らし合わせる理想状態が無い（parts=null: UNKNOWN）。'
        : '理想状態 ' + versionText(g.basis.ideal_version) + (moved ? '（直前 ' + versionText(prevVersion) + '）' : '') + '。'),
    entity(deltaRef, deltaText, areas.purpose, 4, (phase === null ? '' : '局面は供給された phase。matched は理想状態との一致で、目的の達成ではない。'
      + (frame.matched_until ? ' matched_until=' + frame.matched_until : '') + '\n') + (g === null ? '差は不明（0 ではない）。'
      : '現在状態と理想状態の差。原因ごとの件数は parts から数えた値（1 件が複数の原因を持てる）。'
        + (counts.agrees ? '' : ' 供給された summary は parts と一致しない: ' + JSON.stringify(g.summary))
        + unplaced.map(part => '\nScope に付かない差: ' + partRecord(part)).join('')), deltaFlags),
    entity(currentRef, '現在状態\n' + currentLine, areas.purpose, 5, '現在状態は観測だけ（frame ' + frame.asOf + '）。判定（✓=充足 ?=不明 !=未達）は差に置く。'),
  ];
  const relations = [
    relation('current-delta', currentRef, deltaRef, '差'),
    relation('delta-ideal', deltaRef, idealRef, '理想状態との差'),
    ...(adequacy ? [relation('ideal-adequacy', idealRef, adequacy.ref, '照らす'), relation('adequacy-purpose', adequacy.ref, purposeRef, '十分性')]
      : [relation('ideal-purpose', idealRef, purposeRef, '近似')]),
  ];
  const sinceText = since => {
    const ago = order.length - 1 - order.indexOf(since);
    const sinceFrame = [...earlier, frame].find(item => item.id === since);
    return (ago === 0 ? 'この時点から' : ago + ' 時点前から') + '（' + clockText(sinceFrame.asOf) + '）';
  };
  // A part's card line: since when it is open. Its state and causes are 差's
  // row (S6: not repeated on the card).
  const partLine = part => sinceText(part.since);
  const beforeIdealMark = part => part.observed_before_ideal ? ' · 理想状態の確定前の観測' : '';
  // Case 26: the part's last matched observation, as supplied; none supplied, nothing.
  const observedMark = part => part.last_observed === undefined ? '' : part.last_observed === null ? ' · 最後の観測なし'
    : ' · 最後の観測 ' + dayClockText(part.last_observed.observedAt) + '（' + part.last_observed.source.ref
      + (part.last_observed.actor ? ' · ' + part.last_observed.actor : '') + '）';
  const packageLabel = item => {
    const parts = physicalParts(item), keeps = keepsOf(item);
    return [...physicalHeading(item), ...(keeps.length ? ['保つ: ' + keeps.join('・')] : []), ...(parts.length ? ['対象: 理想↔現在の差'] : []),
      ...parts.map(part => (part.state === 'unmet' ? '!' : '?') + ' ' + part.condition + ' · ' + ownerLine(part) + observedMark(part))].join('\n');
  };
  const packageSummary = item => {
    const parts = physicalParts(item), keeps = keepsOf(item);
    return '物理Scope · ' + physicalName(item) + ' · 宣言=' + (item.source?.sourceRef ?? 'source unknown')
      + (keeps.length ? '\n保つ条件（operation）: ' + keeps.join(', ') : '')
      + (parts.length ? '\n' + parts.map(part => partRecord(part) + ' · ' + ownerLine(part)).join('\n') : '')
      + '\n抽象Scopeカードは複製しない。宣言の無い差は物理Scope未特定。';
  };
  const shownScopes = physical
    ? [...physicalPackages.map(item => Object.freeze({ ...item, label: packageLabel(item), summary: packageSummary(item),
        flags: Object.freeze([...item.flags.filter(flag => flag !== 'gap-view'), 'gap-view']) })),
      ...suppliedScopes.filter(item => item.ref.kind === 'obligation' || item.ref.kind === 'closed-change'
        || (item.ref.kind === 'scope-group' && item.ref.id === 'history'))]
    : suppliedScopes.map(item => {
      const parts = matches.get(key(item.ref));
      if (parts?.length !== 1) return item;
      const [part] = parts;
      relations.push(relation('part-' + part.condition, item.ref, deltaRef, '差'));
      return Object.freeze({ ...item, label: item.label + '\n' + partLine(part) + (part.scope === null ? ' · 担当未確定' : '') + beforeIdealMark(part) + observedMark(part),
        summary: (item.summary ?? '') + '\n' + partRecord(part), flags: Object.freeze([...item.flags, 'gap-view']) });
    });
  // One relation per lifetime to 理想↔現在の差 and one to 理想状態 for the
  // conditions kept; each carries its conditions, so normalizing again is the same.
  const LIFETIME_LABEL = { development: 'この差を埋める対象', operation: 'この条件を保つもの' };
  if (physical) for (const item of physicalPackages) {
    for (const lifetime of ['development', 'operation']) {
      const conditions = physicalParts(item).filter(part => partLinksOf(item).some(link => link.condition === part.condition && link.lifetime === lifetime))
        .map(part => part.condition);
      if (conditions.length) relations.push(relation('physical-' + lifetime + '-' + item.ref.id, item.ref, deltaRef, LIFETIME_LABEL[lifetime],
        { lifetime, conditions: Object.freeze(conditions) }));
    }
    const keeps = keepsOf(item);
    if (keeps.length) relations.push(relation('physical-keep-' + item.ref.id, item.ref, idealRef, LIFETIME_LABEL.operation,
      { lifetime: 'operation', conditions: Object.freeze(keeps) }));
  }
  (suppliedScopes.length ? [] : g?.parts ?? []).forEach((part, index) => {
    const partRef = ref('gap-part', part.condition);
    const flags = [part.state === 'unmet' ? 'scope_status=unmet' : 'scope_status=unknown', ...(part.scope === null ? ['unassigned'] : [])];
    entities.push(entity(partRef, (part.label ?? part.condition) + '\n' + partLine(part) + ' · ' + (part.scope ?? '担当未確定') + beforeIdealMark(part) + observedMark(part),
      areas.scope, index, partRecord(part), flags));
    relations.push(relation('part-' + part.condition, partRef, deltaRef, '差'));
  });
  // History: every condition closed in this or an earlier frame. Kept, never
  // erased, drawn as one quiet node; the full list is its summary.
  const history = [...earlier, frame].flatMap(item => item.gap?.closed ?? []);
  if (history.length && !suppliedScopes.length) {
    entities.push(entity(ref('gap-closed', frame.id), '閉じた差 ' + history.length + '（この時点 ' + (gap?.closed.length ?? 0) + '）\n'
      + history.slice(-2).map(item => item.condition + ' ' + CLOSED_LABEL[item.by]).join('・'), areas.scope, g?.parts.length ?? 0,
    history.map(item => item.condition + ' · at ' + item.at + ' · ' + CLOSED_LABEL[item.by]).join(' / '), ['history-preserved']));
  }

  // Keep the other areas' entities, any supplied Scopes, and the relations among them.
  const kept = [...shownScopes, ...frame.entities.filter(item => item.area !== areas.purpose && item.area !== areas.scope)];
  const keptKeys = new Set(kept.map(item => key(item.ref)));
  const keptRelations = frame.relations.filter(item => keptKeys.has(key(item.from)) && keptKeys.has(key(item.to)));
  return Object.freeze({ entities: Object.freeze([...entities, ...kept]), relations: Object.freeze([...relations, ...keptRelations]) });
};

// Stale: past matched_until on the ui's clock. Judged for the frame shown as
// the present only; the gap is not derived again.
export const phaseStale = (frame, now) => frame.phase === 'matched' && typeof frame.matched_until === 'string'
  && Number.isFinite(now) && now > Date.parse(frame.matched_until);
export const STALE_PHASE_LABEL = '鮮度切れ・最新か不明';
// One journal entry as a row: its mark and kind, the plan it names, when it
// was recorded, its author and its source (sha256 whole).
export const journalRow = entry => JOURNAL_MARK[entry.kind] + ' ' + JOURNAL_LABEL[entry.kind] + (entry.unbound === true ? UNBOUND_MARK : '')
  + (entry.kind === 'plan.set' && entry.plan ? ' ' + entry.plan + (entry.version === undefined ? '' : ' v' + entry.version) : '')
  + ' · ' + entry.recordedAt + ' · 作者 ' + (entry.actor ?? '不明')
  + ' · 出所 ' + entry.source.ref + admissionMark(entry) + (entry.source.commentId === undefined || entry.source.commentId === null ? '' : ' comment ' + entry.source.commentId)
  + ' · sha256 ' + (entry.source.sha256 ?? 'UNKNOWN');
// One declaration held back (v12) as a row.
const heldRow = item => '保持 ' + item.reason + ' · ' + (item.kind ?? '種類不明') + ' · ' + item.recordedAt + ' · 出所 ' + item.source.ref;
// S7c (adrs#647): the changes of a frame, shown in #atlas-world-change under
// the time controls: what entered at it (its journal entries, v6, and the
// declarations held at it, v12), every one, with when, by whom and from
// where; journal and held are reached nowhere else. The heading counts them
// and what was held up to the frame (P(a): counting it needs the earlier
// frames). `earlier` are the frames before it.
export const frameChangeLabel = (earlier, frame) => {
  const changes = [...(frame.journal ?? []).map(journalRow), ...(frame.held ?? []).map(heldRow)];
  const heldSoFar = [...earlier, frame].flatMap(item => item.held ?? []).length;
  return 'この時点の変化 ' + changes.length + ' 件' + (heldSoFar ? ' · 保持 累計 ' + heldSoFar : '') + changes.map(row => '\n' + row).join('');
};
// A step past the present (S7) in #atlas-world-change: its minute, and each
// condition that reads unknown then with no new observation.
export const forecastChangeLabel = step => '予定 ' + step.at + '（観測が無ければ unknown）'
  + step.items.map(item => '\n鮮度切れの予定 ' + item.condition + ' · 観測 ' + dayClockText(item.observedAt)).join('');
// The stale present's 理想↔現在の差 label (S6): its heading says it went stale
// in place of its next stale time; the lines below it stay.
export const staleDeltaLabel = (label, frame) => label.replace('・次の鮮度切れ ' + dayClockText(frame.matched_until) + '）',
  '・' + STALE_PHASE_LABEL + '（' + dayClockText(frame.matched_until) + ' を過ぎた））');
