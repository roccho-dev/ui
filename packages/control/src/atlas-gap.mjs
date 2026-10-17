// The supplied decomposition of the difference between the current state (an
// observation at a frame) and the ideal state (a declared, versioned,
// observable approximation of the purpose achieved): `frames[i].gap`.
// Read exactly as supplied; nothing is inferred. A frame with a gap is drawn
// from it in two areas: the purpose area holds 目的, 理想状態, 差 and 現在状態,
// and the next area holds one Scope per open part (an unmet or unknown
// condition and its owner) plus the conditions closed so far as history.
// Other areas keep their supplied entities. Plans never enter a gap.

const check = (condition, message) => { if (!condition) throw new Error('atlas-world: ' + message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys, at) => {
  check(plain(value), at + ' must be an object');
  for (const key of Object.keys(value)) check(keys.includes(key), at + ': unknown field ' + key);
  for (const key of keys) check(Object.hasOwn(value, key), at + '.' + key + ' is required');
};
const text = (value, at) => { check(typeof value === 'string' && value.length > 0, at + ' must be non-empty text'); return value; };
const count = (value, at) => { check(Number.isSafeInteger(value) && value >= 0, at + ' must be a non-negative integer'); return value; };
const version = (value, at) => {
  check((typeof value === 'string' && value.length > 0) || (Number.isSafeInteger(value) && value >= 0), at + ' must be text or a non-negative integer');
  return value;
};

export const GAP_CAUSES = Object.freeze(['initial', 'purpose-changed', 'ideal-added', 'ideal-revised',
  'current-regressed', 'current-unobserved', 'current-stale', 'carried']);
export const GAP_CLOSED_BY = Object.freeze(['current-satisfied', 'ideal-removed', 'purpose-changed']);
export const CAUSE_LABEL = Object.freeze({ initial: '初回', 'purpose-changed': '目的の変更', 'ideal-added': '理想に追加',
  'ideal-revised': '理想の改訂', 'current-regressed': '現在の後退', 'current-unobserved': '未観測',
  'current-stale': '鮮度切れ', carried: '継続' });
const CLOSED_LABEL = Object.freeze({ 'current-satisfied': '現在が充足', 'ideal-removed': '理想から削除', 'purpose-changed': '目的の変更' });

export const normalizeGap = (value, at) => {
  exact(value, ['basis', 'parts', 'closed', 'summary'], at);
  exact(value.basis, ['purpose_id', 'purpose_rev', 'ideal_version', 'prev_frame'], at + '.basis');
  const basis = Object.freeze({
    purpose_id: text(value.basis.purpose_id, at + '.basis.purpose_id'),
    purpose_rev: version(value.basis.purpose_rev, at + '.basis.purpose_rev'),
    ideal_version: version(value.basis.ideal_version, at + '.basis.ideal_version'),
    prev_frame: value.basis.prev_frame === null ? null : text(value.basis.prev_frame, at + '.basis.prev_frame'),
  });
  check(Array.isArray(value.parts), at + '.parts must be an array');
  const parts = value.parts.map((part, index) => {
    const where = at + '.parts[' + index + ']';
    exact(part, ['condition', 'state', 'cause', 'since', 'scope', 'refs'], where);
    check(part.state === 'unmet' || part.state === 'unknown', where + '.state must be unmet|unknown (satisfied conditions are not parts)');
    check(Array.isArray(part.cause) && part.cause.length > 0, where + '.cause must be a non-empty array');
    for (const cause of part.cause) check(GAP_CAUSES.includes(cause), where + '.cause has unknown cause ' + cause);
    check(new Set(part.cause).size === part.cause.length, where + '.cause must not repeat');
    check(Array.isArray(part.refs), where + '.refs must be an array');
    return Object.freeze({
      condition: text(part.condition, where + '.condition'),
      state: part.state,
      cause: Object.freeze([...part.cause]),
      since: text(part.since, where + '.since'),
      scope: part.scope === null ? null : text(part.scope, where + '.scope'),
      refs: Object.freeze(part.refs.map((ref, n) => text(ref, where + '.refs[' + n + ']'))),
    });
  });
  check(new Set(parts.map(part => part.condition)).size === parts.length, at + '.parts: a condition appears twice');
  check(Array.isArray(value.closed), at + '.closed must be an array');
  const closed = value.closed.map((item, index) => {
    const where = at + '.closed[' + index + ']';
    exact(item, ['condition', 'at', 'by'], where);
    check(GAP_CLOSED_BY.includes(item.by), where + '.by must be ' + GAP_CLOSED_BY.join('|'));
    return Object.freeze({ condition: text(item.condition, where + '.condition'), at: text(item.at, where + '.at'), by: item.by });
  });
  exact(value.summary, ['open', 'by_cause'], at + '.summary');
  check(plain(value.summary.by_cause), at + '.summary.by_cause must be an object');
  for (const key of Object.keys(value.summary.by_cause)) check(GAP_CAUSES.includes(key), at + '.summary.by_cause has unknown cause ' + key);
  const summary = Object.freeze({
    open: count(value.summary.open, at + '.summary.open'),
    by_cause: Object.freeze(Object.fromEntries(Object.entries(value.summary.by_cause).map(([key, n]) => [key, count(n, at + '.summary.by_cause.' + key)]))),
  });
  return Object.freeze({ basis, parts: Object.freeze(parts), closed: Object.freeze(closed), summary });
};

// Counts are taken from the parts themselves; a summary that disagrees is
// shown as disagreeing, never trusted over the rows.
export const gapCounts = gap => {
  const byCause = Object.fromEntries(GAP_CAUSES.map(cause => [cause, gap.parts.filter(part => part.cause.includes(cause)).length]));
  const agrees = gap.summary.open === gap.parts.length
    && GAP_CAUSES.every(cause => (gap.summary.by_cause[cause] ?? 0) === byCause[cause]);
  return Object.freeze({
    open: gap.parts.length, unmet: gap.parts.filter(part => part.state === 'unmet').length,
    unknown: gap.parts.filter(part => part.state === 'unknown').length,
    idealMoved: gap.parts.filter(part => part.cause.includes('ideal-added') || part.cause.includes('ideal-revised')).length,
    byCause: Object.freeze(byCause), agrees,
  });
};

const versionText = value => typeof value === 'string' && /^v/u.test(value) ? value : 'v' + value;
const clockText = asOf => {
  const match = /T(\d\d:\d\d)/u.exec(asOf);
  return match ? match[1] + (/Z$/u.test(asOf) ? 'Z' : '') : asOf;
};

// The two areas a gap frame is drawn in: the purpose area and the area that
// follows it in presentation order.
export const gapAreas = presentation => {
  const index = presentation.areas.findIndex(area => area.id === presentation.purposeAreaId);
  const scope = presentation.areas[index + 1];
  check(scope, 'a frame with gap needs an area after the purpose area for its Scopes');
  return Object.freeze({ purpose: presentation.purposeAreaId, scope: scope.id });
};

// Entities and relations of a gap frame, in the normalized World shape.
// `earlier` are the frames before it (for the previous basis and history).
export const gapView = ({ frame, earlier, presentation, key }) => {
  const { gap } = frame;
  const areas = gapAreas(presentation);
  const ids = new Set([...earlier.map(item => item.id), frame.id]);
  if (gap.basis.prev_frame !== null) check(earlier.some(item => item.id === gap.basis.prev_frame), frame.id + ': gap.basis.prev_frame must name an earlier frame');
  for (const part of gap.parts) check(ids.has(part.since), frame.id + ': gap part ' + part.condition + ' since must name this or an earlier frame');
  const previous = gap.basis.prev_frame === null ? null : earlier.find(item => item.id === gap.basis.prev_frame);
  const prevGap = previous?.gap ?? null;
  const counts = gapCounts(gap);
  const purposeRef = presentation.directionTargets[0];
  const space = purposeRef.space;
  const ref = (kind, id) => Object.freeze({ space, kind, id });
  const time = Object.freeze({ acquiredAt: null, observedAt: null, effectiveAt: null });
  const entity = (entityRef, label, area, order, summary, flags = []) => Object.freeze({ ref: entityRef, label, area, order,
    visible: true, activity: 'none', summary, source: null, time, flags: Object.freeze(flags) });
  const relation = (id, from, to, label, path = true) => Object.freeze({ ref: ref('gap-relation', frame.id + ':' + id), from, to,
    kind: 'gap', label, context: Object.freeze({}), source: null, time, flags: Object.freeze(['authority=false']), path,
    visible: true, activity: 'none', containment: null });

  const idealRef = ref('ideal-state', gap.basis.purpose_id);
  const currentRef = ref('current-state', gap.basis.purpose_id);
  const deltaRef = ref('gap', gap.basis.purpose_id);
  const prevVersion = prevGap?.basis.ideal_version ?? null;
  const moved = prevVersion !== null && String(prevVersion) !== String(gap.basis.ideal_version);
  const idealLine = (moved ? versionText(prevVersion) + '→' + versionText(gap.basis.ideal_version) + ' 移動' : versionText(gap.basis.ideal_version))
    + ' · 追加 ' + counts.byCause['ideal-added'] + ' · 改訂 ' + counts.byCause['ideal-revised'];
  const prevOpen = gap.basis.prev_frame === null ? '初回' : prevGap ? '前 ' + prevGap.parts.length : '前 不明';
  const others = ['current-stale', 'purpose-changed', 'initial', 'carried'].filter(cause => counts.byCause[cause] > 0)
    .map(cause => CAUSE_LABEL[cause] + ' ' + counts.byCause[cause]);
  const deltaLine = ['理想の移動 ' + counts.idealMoved, '現在の後退 ' + counts.byCause['current-regressed'],
    '未観測 ' + counts.byCause['current-unobserved'], ...others].join('・');
  const deltaFlags = counts.open === 0 ? ['standing=completed-history'] : counts.unknown > 0 ? ['scope_status=unknown'] : ['scope_status=unmet'];

  const entities = [
    entity(purposeRef, '目的\n' + gap.basis.purpose_id + ' · rev ' + gap.basis.purpose_rev, areas.purpose, 0,
      '目的は観測では判定しない（人が評価する）。purpose_id=' + gap.basis.purpose_id + ' · purpose_rev=' + gap.basis.purpose_rev),
    entity(idealRef, '理想状態\n' + idealLine, areas.purpose, 1,
      '理想状態 ' + versionText(gap.basis.ideal_version) + (moved ? '（直前 ' + versionText(prevVersion) + '）' : '')
        + '。追加・改訂は開いている差の原因の件数。条件の総数は供給されていない。'),
    entity(deltaRef, '差 ' + counts.open + '（' + prevOpen + '）' + (counts.agrees ? '' : ' · 集計不一致') + '\n' + deltaLine, areas.purpose, 2,
      '現在状態と理想状態の差。原因ごとの件数は parts から数えた値（1 件が複数の原因を持てる）。'
        + (counts.agrees ? '' : ' 供給された summary は parts と一致しない: ' + JSON.stringify(gap.summary)), deltaFlags),
    entity(currentRef, '現在状態\n' + clockText(frame.asOf) + ' · ?' + counts.unknown + ' !' + counts.unmet + ' · ✓ 未供給', areas.purpose, 3,
      '現在状態は時刻 ' + frame.asOf + ' の観測。?=不明 !=未達。充足した条件の数は供給されていない。'),
  ];
  const relations = [
    relation('current-delta', currentRef, deltaRef, '差'),
    relation('delta-ideal', deltaRef, idealRef, '理想状態との差'),
    relation('ideal-purpose', idealRef, purposeRef, '近似'),
  ];
  gap.parts.forEach((part, index) => {
    const partRef = ref('gap-part', part.condition);
    const flags = [part.state === 'unmet' ? 'scope_status=unmet' : 'scope_status=unknown', ...(part.scope === null ? ['unassigned'] : [])];
    entities.push(entity(partRef, part.condition + '\n' + (part.state === 'unmet' ? '未達' : '不明') + ' · '
      + part.cause.map(cause => CAUSE_LABEL[cause]).join('・') + ' · since ' + part.since + ' · ' + (part.scope ?? '担当なし'),
    areas.scope, index, 'condition=' + part.condition + ' · state=' + part.state + ' · cause=' + part.cause.join(',')
      + ' · since=' + part.since + ' · scope=' + (part.scope ?? 'null（担当なし）') + ' · refs=' + (part.refs.join(', ') || 'なし'), flags));
    relations.push(relation('part-' + part.condition, partRef, deltaRef, '差'));
  });
  // History: every condition closed in this or an earlier frame. Kept, never
  // erased, drawn as one quiet node; the full list is its summary.
  const history = [...earlier, frame].flatMap(item => item.gap?.closed ?? []);
  if (history.length) {
    const now = gap.closed.length;
    entities.push(entity(ref('gap-closed', frame.id), '閉じた差 ' + history.length + '（この時点 ' + now + '）\n'
      + history.slice(-2).map(item => item.condition + ' ' + CLOSED_LABEL[item.by]).join('・'), areas.scope, gap.parts.length,
    history.map(item => item.condition + ' · at ' + item.at + ' · ' + CLOSED_LABEL[item.by]).join(' / '), ['history-preserved']));
  }

  // Keep the other areas' entities and the relations among them.
  const kept = frame.entities.filter(item => item.area !== areas.purpose && item.area !== areas.scope);
  const keptKeys = new Set(kept.map(item => key(item.ref)));
  const keptRelations = frame.relations.filter(item => keptKeys.has(key(item.from)) && keptKeys.has(key(item.to)));
  return Object.freeze({ entities: Object.freeze([...entities, ...kept]), relations: Object.freeze([...relations, ...keptRelations]) });
};
