// Live Agent Organization Atlas page. The far view is the existing maxGraph
// renderer; ordinary HTML carries the complete audit, inspector, search and
// timeline. The page reads data and draws it; it never writes back.
import { createClientAction, emitClientAction } from '../a2ui-browser/src/actions/client-action.mjs';
import { createMaxGraphAdapter } from '../semantic-map/renderer-maxgraph/adapter.js';
import { displayedRegionLabel } from '../semantic-map/renderer-maxgraph/labels.js';
import { DEFAULT_THEME } from '../semantic-map/renderer-maxgraph/theme.js';
import {
  currentness, currentRefs, descendants, sourceLines, summarizeScopes, timelineFor,
} from './src/live-atlas.mjs';
import { fitCamera } from '../semantic-map/camera-fit.js';
import { layoutTopology, lodFor, projectAtlas } from './src/live-atlas-projection.mjs';
import { entityKey, parseAtlasWorldInput, relationKey, worldPair } from './src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from './src/atlas-world-projection.mjs';
import { UPDATE_STALLED, forecastLines, heldLines, journalButtonText, journalLines, stepIndex, timelinePosition, transportOf, transportParts, updateStalled,
  viewedText } from './src/atlas-timeline.mjs';
import { searchAtlasWorld } from './src/atlas-world-search.mjs';

const STYLE = `
*{box-sizing:border-box}
body{margin:0;font:13px/1.4 system-ui,sans-serif;color:#1f2937;background:#f8f9fa}
#atlas-screen{display:flex;flex-direction:column;height:100vh}
#atlas-bar{flex:none;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:4px 8px;background:#fff;border-bottom:1px solid #dee2e6}
#atlas-bar button{font:inherit;padding:1px 8px}
#atlas-bar input[type=search]{font:inherit;width:14em}
#atlas-mode{font-weight:650}
#atlas-mode[data-current=false]{color:#c2255c}
#atlas-status{flex:none;display:flex;gap:10px;align-items:baseline;padding:2px 8px;background:#fff;border-bottom:1px solid #dee2e6;font-size:12px;min-width:0}
#atlas-summary{flex:none;color:#495057;white-space:nowrap}
#atlas-banners{flex:1;min-width:0}
#atlas-banners>summary{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#c2255c;cursor:pointer}
#atlas-banners[open]{max-height:30vh;overflow:auto}
#atlas-banners p{margin:2px 0;padding:2px 8px;border-left:4px solid #c2255c;background:#fff5f8}
#atlas{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;background:#fff}
#atlas-detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:12px}
#atlas-detail section{min-width:0}
#atlas-detail h2{font-size:14px;margin:8px 0}
table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #e9ecef;padding:2px 4px;text-align:left;vertical-align:top}
td code,pre{font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
tr[data-selected=true]{background:#fff3bf}
button.link{border:0;background:none;color:#1864ab;cursor:pointer;padding:0;font:inherit;text-align:left}
@media(max-width:800px){#atlas-detail{grid-template-columns:1fr}#atlas-status{flex-wrap:wrap}}
@keyframes atlas-pulse{50%{stroke-width:4px;stroke-opacity:.5}}
@keyframes atlas-flow{to{stroke-dashoffset:-14}}
@media (prefers-reduced-motion:no-preference){
  #atlas [data-visual-motion=pulse]>:first-child{animation:atlas-pulse 1.4s ease-in-out infinite}
  #atlas [data-visual-motion=flow]>path:first-of-type{stroke-dasharray:8 6;animation:atlas-flow 1s linear infinite}
}`;

const el = (name, attrs = {}, ...children) => {
  const node = document.createElement(name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
};

export const mountAtlasUI = ({
  root = document.body,
  state,
  mode: initialMode = 'sample',
  connected = false,
  now = 0,
  selected = null,
  onSelect = null,
} = {}) => {
  if (!root?.append) throw new Error('live-atlas-ui: mount root required');
  if (!state) throw new Error('live-atlas-ui: initial state required');
  const style = el('style', { 'data-live-atlas-style': 'true', text: STYLE });
  root.append(style);
  const page = {
    mode: initialMode, connected, state, revIndex: null, expiredRev: null,
    selected, query: '', projection: null, fitScale: 1, readability: null, layouts: new Map(),
    now, drawing: false, destroyed: false,
  };

  const mode = el('span', { id: 'atlas-mode' });
  const summary = el('span', { id: 'atlas-summary' });
  const revInput = el('input', { type: 'range', id: 'atlas-rev', min: 0, max: 0, value: 0, 'aria-label': 'Snapshot revision' });
  const revLabel = el('span', { id: 'atlas-rev-label' });
  const search = el('input', { type: 'search', id: 'atlas-search', placeholder: 'Search every source row', 'aria-label': 'Search' });
  const bar = el('div', { id: 'atlas-bar' }, mode,
    el('button', { type: 'button', text: 'Fit', onclick: () => fit() }),
    el('button', { type: 'button', text: '+', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.6) }),
    el('button', { type: 'button', text: '−', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.6) }),
    revInput, revLabel, search);
  // One line for the far summary and notices, so the Atlas keeps the viewport;
  // the first notice stays readable and the full list opens on demand.
  const bannerSummary = el('summary');
  const bannerList = el('div');
  const banners = el('details', { id: 'atlas-banners', role: 'status' }, bannerSummary, bannerList);
  const status = el('div', { id: 'atlas-status' }, summary, banners);
  const container = el('div', { id: 'atlas', 'aria-label': 'Live Agent Organization Atlas (maxGraph)' });
  const scopeList = el('tbody');
  const inspector = el('div', { id: 'atlas-inspector' });
  const auditBody = el('tbody');
  const auditCount = el('span');
  const detail = el('div', { id: 'atlas-detail' },
    el('section', {},
      el('h2', { text: 'Selection' }), inspector,
      el('h2', { text: 'Scopes' }),
      el('table', { id: 'atlas-scopes' }, el('thead', {}, el('tr', {}, ...['status', 'scope', 'running', 'blocked', 'depth', 'control'].map(text => el('th', { text })))), scopeList)),
    el('section', {},
      el('h2', {}, 'Source audit ', auditCount),
      el('table', { id: 'atlas-audit' }, el('thead', {}, el('tr', {}, ...['source', 'line', 'state', 'claim', 'raw'].map(text => el('th', { text })))), auditBody)));
  const screen = el('div', { id: 'atlas-screen' }, bar, status, container);
  root.append(screen, detail);

  const adapter = createMaxGraphAdapter(container, { theme: DEFAULT_THEME });
  adapter.setTool('hand');
  adapter.setActivationHandler(activation => select(activation.id));

  const viewed = () => {
    const { history, held } = page.state;
    if (page.revIndex === null || page.revIndex >= history.length - 1) return held;
    return history[page.revIndex];
  };
  const viewMode = () => (page.revIndex !== null && page.revIndex < page.state.history.length - 1 ? 'history' : page.mode);
  const current = snapshot => currentness(snapshot, {
    mode: viewMode(), now: page.now, connected: page.connected, attempt: viewMode() === 'live' ? page.state.attempt : null,
  });
  const layoutOf = snapshot => {
    if (!page.layouts.has(snapshot.rev)) page.layouts.set(snapshot.rev, layoutTopology(snapshot.topology));
    return page.layouts.get(snapshot.rev);
  };
  const zoom = () => adapter.camera().scale / page.fitScale;

  const fit = () => {
    const snapshot = viewed();
    if (!snapshot) return;
    const camera = fitCamera(layoutOf(snapshot).world, { width: container.clientWidth, height: container.clientHeight });
    page.fitScale = camera.scale;
    adapter.setCamera(camera.scale, camera.translateX, camera.translateY);
    draw();
  };
  const zoomBy = (factor, at = { x: container.clientWidth / 2, y: container.clientHeight / 2 }) => {
    const { scale, translateX, translateY } = adapter.camera();
    const next = Math.min(Math.max(scale * factor, page.fitScale / 4), page.fitScale * 40);
    adapter.setCamera(next, translateX + at.x / next - at.x / scale, translateY + at.y / next - at.y / scale);
    draw();
  };
  const onResize = () => fit();
  const onWheel = event => {
    event.preventDefault();
    const box = container.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, { x: event.clientX - box.left, y: event.clientY - box.top });
  };
  window.addEventListener('resize', onResize);
  container.addEventListener('wheel', onWheel, { passive: false });

  const select = id => {
    page.selected = id;
    onSelect?.(id);
    emitClientAction({
      target: container,
      detail: createClientAction({ action: 'atlas.select', context: { id }, sourceComponentId: 'live-atlas', surfaceId: 'live-atlas' }),
    });
    draw();
    panels();
  };

  let lastLod = null;
  const draw = () => {
    const snapshot = viewed();
    const scale = adapter.camera().scale;
    if (!snapshot) {
      adapter.render({ pattern: 'graph/1', scale, resourceComposition: null, representations: [], relations: [], selectionProxies: {} });
      page.projection = null;
      return;
    }
    const view = { zoom: zoom(), scale, selected: page.selected, layout: layoutOf(snapshot) };
    const projection = projectAtlas(snapshot, current(snapshot), view);
    page.projection = projection;
    if (!projection.supported) {
      adapter.render({ pattern: 'graph/1', scale, resourceComposition: null, representations: [], relations: [], selectionProxies: {} });
      return;
    }
    adapter.render(projection.scene);
    const visible = new Set(projection.scene.representations.map(item => item.regionId));
    const actorGlyph = projection.aggregates.find(item => item.covers.includes(page.selected))?.id;
    adapter.setFocusMarker(visible.has(page.selected) ? page.selected : actorGlyph ?? null);
    // Readability of every scope chip at the fit scale, using the renderer's own label rule.
    const chips = projection.scene.representations.filter(item => item.atlas?.kind === 'scope');
    const hidden = chips.filter(item => !displayedRegionLabel(item, page.fitScale, DEFAULT_THEME, false));
    page.readability = { chips: chips.length, unreadable: hidden.map(item => item.regionId) };
    if (projection.lod !== lastLod) { lastLod = projection.lod; panels(); }
  };
  let cameraFrame = 0;
  const onCameraChange = () => {
    if (page.drawing || page.destroyed) return;
    page.drawing = true;
    cameraFrame = requestAnimationFrame(() => {
      cameraFrame = 0;
      page.drawing = false;
      if (page.destroyed) return;
      draw();
      banner();
    });
  };
  adapter.onCameraChange(onCameraChange);

  const banner = () => {
    const snapshot = viewed();
    const now = current(snapshot);
    const { state } = page;
    mode.dataset.current = String(now.current);
    const label = viewMode() === 'live'
      ? `LIVE · ${page.connected ? 'connected' : 'disconnected'}${snapshot ? ` · rev ${snapshot.rev} · as of ${snapshot.asOf}` : ' · waiting for producer'}`
      : `${viewMode() === 'history' ? 'HISTORY' : 'SAMPLE'}${snapshot ? ` · rev ${snapshot.rev} · as of ${snapshot.asOf}` : ''}`;
    // Activity comes first so a narrow bar never hides it.
    mode.textContent = `activity ${now.current ? 'current' : `UNKNOWN (${now.reason})`} · ${label}${page.projection?.lod ? ` · ${page.projection.lod}` : ''}`;
    revInput.max = String(Math.max(0, state.history.length - 1));
    revInput.value = String(page.revIndex ?? Math.max(0, state.history.length - 1));
    revLabel.textContent = `history ${state.history.length} rev${state.complete ? '' : ' · incomplete'}${state.gaps.length ? ` · gaps ${state.gaps.map(gap => `${gap.fromRev}→${gap.toRev}`).join(', ')}` : ''}`;
    // Notices that change what the picture means come first.
    const critical = [];
    const notes = [];
    if (page.expiredRev !== null && snapshot) critical.push(`Viewed revision ${page.expiredRev} expired from retained history. Showing oldest retained revision ${snapshot.rev}.`);
    if (page.projection && !page.projection.supported) critical.push(`Unsupported: ${page.projection.diagnostic}. Every source row stays in the audit below.`);
    if (page.readability?.unreadable.length) critical.push(`Degraded: ${page.readability.unreadable.length} of ${page.readability.chips} scope chips are not readable at fit in this viewport; use the scope table below.`);
    if (state.attempt && state.attempt.outcome !== 'accepted') {
      const attempt = state.attempt;
      critical.push(`Last update ${attempt.outcome}${attempt.evaluated.rev !== null ? ` (rev ${attempt.evaluated.rev})` : ''}: ${attempt.evaluated.diagnostic ?? 'not newer than the held revision'}. Showing the previous accepted revision.`);
    }
    for (const rejected of state.rejected ?? []) notes.push(`History snapshot ${rejected.outcome}: ${rejected.evaluated.diagnostic ?? `rev ${rejected.evaluated.rev}`}`);
    if (snapshot) {
      for (const name of ['observations', 'control', 'claims']) {
        const channel = snapshot.channels[name];
        if (channel.state !== 'accepted') (name === 'observations' ? critical : notes).push(`${name} ${channel.state}${channel.diagnostic ? `: ${channel.diagnostic}` : ''}`);
      }
      const unresolved = snapshot.joins.filter(join => !join.resolved);
      if (unresolved.length) notes.push(`${unresolved.length} Control joins unresolved because Control is ${snapshot.channels.control.state}`);
    }
    const coverage = page.projection?.coverage;
    if (coverage && coverage.works.shown < coverage.works.total) notes.push(`${coverage.works.total - coverage.works.shown} work items not drawn at this zoom; all are in the scope table and audit.`);
    const all = [...critical, ...notes];
    bannerSummary.textContent = all.length ? `${all.length} notice${all.length > 1 ? 's' : ''}: ${all[0]}` : 'no notices';
    bannerList.replaceChildren(...all.map(text => el('p', { text })));
    if (snapshot && page.projection?.supported) {
      const values = [...page.projection.status.values()];
      const count = tone => values.filter(item => item.tone === tone).length;
      const summaries = summarizeScopes(snapshot, now);
      const parallel = [...summaries.values()].filter(item => item.lanes >= 3).length;
      const refs = currentRefs(snapshot, now);
      const classes = {};
      for (const ref of refs) { const cls = snapshot.topology.targets.get(ref.target).class; classes[cls] = (classes[cls] ?? 0) + 1; }
      summary.textContent = `${values.length} scopes · running ${count('running')} · blocked ${count('blocked')} · missing ${count('missing')} · unknown ${count('unknown')} · parallel≥3 ${parallel} · refs ${Object.entries(classes).map(([key, value]) => `${key} ${value}`).join(', ') || 'none'}`;
    } else summary.textContent = '';
  };

  const selectButton = (id, text = id) => el('button', { type: 'button', class: 'link', text, onclick: () => select(id) });

  const panels = () => {
    banner();
    const snapshot = viewed();
    scopeList.replaceChildren();
    inspector.replaceChildren();
    auditBody.replaceChildren();
    if (!snapshot) return;
    const now = current(snapshot);
    const summaries = summarizeScopes(snapshot, now);
    const status = page.projection?.status;
    const severity = { blocked: 0, missing: 1, unknown: 2, running: 3, stopped: 4, residual: 5, created: 6, completed: 7, idle: 8 };
    const scopes = [...snapshot.topology.scopes.values()].sort((a, b) => (
      (severity[status?.get(a.id)?.tone] ?? 9) - (severity[status?.get(b.id)?.tone] ?? 9) || (a.id < b.id ? -1 : 1)));
    for (const scope of scopes) {
      const s = summaries.get(scope.id);
      const join = snapshot.joins.find(item => item.id === scope.id);
      scopeList.append(el('tr', { 'data-selected': page.selected === scope.id },
        el('td', { text: status?.get(scope.id)?.token ?? '?' }), el('td', {}, selectButton(scope.id, `${scope.label} (${scope.id})`)),
        el('td', { text: s.lanes ?? '?' }), el('td', { text: s.blocked ?? '?' }), el('td', { text: snapshot.topology.depth.get(scope.id) }),
        el('td', { text: join ? `${join.controlId}${join.resolved ? '' : ' (unresolved)'}` : '' })));
    }
    renderInspector(snapshot, now);
    renderAudit(snapshot);
  };

  const renderInspector = (snapshot, now) => {
    const id = page.selected;
    if (!id) { inspector.append(el('p', { text: 'Select a scope, actor, target or work item in the Atlas, the scope table or the audit.' })); return; }
    const { topology } = snapshot;
    const observations = snapshot.channels.observations.state === 'accepted' ? snapshot.channels.observations : null;
    const aggregate = page.projection?.aggregates?.find(item => item.id === id);
    const row = topology.byId.get(id) ?? observations?.work.find(item => item.id === id) ?? observations?.refs.find(item => item.id === id);
    inspector.append(el('h3', { text: id }));
    if (aggregate) inspector.append(el('p', {}, `Covers ${aggregate.covers.length} actors: `, ...aggregate.covers.flatMap(actor => [selectButton(actor), ' '])));
    if (!row && !aggregate) { inspector.append(el('p', { text: 'Not present in this revision.' })); }
    if (row) inspector.append(el('pre', { text: JSON.stringify(row, null, 1) }));
    if (row?.t === 'scope') {
      const s = summarizeScopes(snapshot, now).get(id);
      inspector.append(el('p', { text: `running ${s.lanes ?? '?'} · blocked ${s.blocked ?? '?'} · stopped ${s.stopped ?? '?'} · status ${s.status?.status ?? (s.known ? 'none reported' : 'unknown')}` }));
      const inside = new Set(descendants(topology, id));
      const works = observations ? observations.work.filter(work => inside.has(work.scope)) : [];
      if (works.length) inspector.append(el('ul', {}, ...works.map(work => el('li', {}, selectButton(work.id), ` ${work.status} · ${work.scope} · ${work.actors.join(', ')}`))));
      inspector.append(el('p', {}, 'Members: ', ...topology.members.filter(m => m.scope === id).flatMap(m => [selectButton(m.actor), ' '])));
    }
    if (row?.t === 'actor') {
      inspector.append(el('p', {}, 'Reports to: ', ...topology.orgs.filter(o => o.to === id).flatMap(o => [selectButton(o.from), ' ']),
        ' · Leads: ', ...topology.orgs.filter(o => o.from === id).flatMap(o => [selectButton(o.to), ' '])));
      inspector.append(el('p', {}, 'Scopes: ', ...topology.members.filter(m => m.actor === id).flatMap(m => [selectButton(m.scope), ' '])));
      const refs = observations ? observations.refs.filter(ref => ref.actor === id) : [];
      if (refs.length) inspector.append(el('p', {}, 'References: ', ...refs.flatMap(ref => [`${ref.id}→`, selectButton(ref.target), ' '])));
    }
    if (row?.evidence?.length) {
      inspector.append(el('ul', {}, ...row.evidence.map(item => el('li', {}, `${item.kind}: `,
        item.href ? el('a', { href: item.href, rel: 'noreferrer noopener', target: '_blank', text: item.ref }) : item.ref))));
    }
    const join = snapshot.joins.find(item => item.id === id);
    if (join) {
      const control = snapshot.channels.control;
      const record = control.state === 'accepted' ? control.records.find(item => item.id === join.controlId) : null;
      const claim = snapshot.channels.claims.state === 'accepted' ? snapshot.channels.claims.records.find(item => item.rel.parent === join.controlId) : null;
      const pin = control.state === 'accepted' ? control.pins.find(item => item.targetId === join.controlId) : null;
      inspector.append(el('p', { text: `Control ${join.controlId}: ${record ? record.title ?? record.id : join.resolved ? 'missing' : `unresolved (Control ${control.state})`} · claim ${claim ? `${claim.id} ${claim.state} by ${claim.by} at ${claim.at}` : '—'}${pin ? ` · 📍${pin.basis}: ${pin.reason}` : ''}` }));
    }
    const timeline = timelineFor(page.state.history, id);
    inspector.append(el('h3', { text: `Timeline (${page.state.history.length} revisions${page.state.complete ? '' : ', incomplete'})` }));
    if (!timeline.length) inspector.append(el('p', { text: 'No observed change in the held history.' }));
    else {
      inspector.append(el('table', { id: 'atlas-timeline' }, el('tbody', {}, ...timeline.map(change => el('tr', {},
        el('td', { text: `rev ${change.fromRev}→${change.toRev}${change.gap ? ' (gap)' : ''}` }),
        el('td', { text: change.at ? `at ${change.at}` : `between ${change.interval[0]} and ${change.interval[1]}` }),
        el('td', { text: `${change.entity} ${change.id ?? ''}` }),
        el('td', { text: `${change.kind}${change.change ? ` ${change.change}` : ''}${change.from !== undefined ? ` ${typeof change.from === 'object' ? JSON.stringify(change.from) : change.from}` : ''}${change.to !== undefined ? ` → ${typeof change.to === 'object' ? JSON.stringify(change.to) : change.to}` : ''}${change.status && !change.to ? ` ${change.status}` : ''}` }),
        el('td', { text: (change.evidence ?? []).map(item => item.ref).join(', ') }))))));
    }
  };

  const renderAudit = snapshot => {
    const rows = [];
    const add = (source, text, state, parsedId, claimFor) => {
      for (const { line, raw } of sourceLines(text)) {
        let id = null;
        try { id = JSON.parse(raw)?.id ?? null; } catch { id = null; }
        rows.push({ source, line, raw, state, id, claim: claimFor ? claimFor(id) : '' });
      }
    };
    const claims = snapshot.channels.claims.state === 'accepted' ? snapshot.channels.claims.records : [];
    const claimFor = id => { const claim = claims.find(item => item.rel.parent === id); return claim ? `${claim.id} ${claim.state}` : '—'; };
    for (const name of ['topology', 'control', 'claims', 'observations']) {
      if (snapshot.raw[name] === undefined) continue;
      const state = name === 'topology' ? 'accepted' : snapshot.channels[name].state;
      add(`rev ${snapshot.rev} ${name}`, snapshot.raw[name], state, null, name === 'control' ? claimFor : null);
    }
    const attempt = page.state.attempt;
    if (attempt && attempt.outcome !== 'accepted' && attempt.evaluated.rawInput) {
      const raw = attempt.evaluated.raw;
      if (Object.keys(raw).length) for (const [name, text] of Object.entries(raw)) add(`${attempt.outcome} rev ${attempt.evaluated.rev ?? '?'} ${name}`, text, attempt.outcome);
      else rows.push({ source: `${attempt.outcome} input`, line: 1, raw: attempt.evaluated.rawInput, state: attempt.outcome, id: null, claim: '' });
    }
    const query = page.query.toLowerCase();
    const shown = query ? rows.filter(row => `${row.source} ${row.raw} ${row.claim}`.toLowerCase().includes(query)) : rows;
    auditCount.textContent = `${shown.length} / ${rows.length} rows`;
    for (const row of shown) {
      auditBody.append(el('tr', { 'data-selected': row.id !== null && row.id === page.selected },
        el('td', { text: row.source }), el('td', { text: row.line }), el('td', { text: row.state }), el('td', { text: row.claim }),
        el('td', {}, row.id ? selectButton(row.id, '↗') : '', ' ', el('code', { text: row.raw }))));
    }
  };

  search.addEventListener('input', () => { page.query = search.value; panels(); });
  search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const snapshot = viewed();
    const query = search.value.trim();
    if (snapshot && query && (snapshot.topology.byId.has(query) || page.projection?.scene.representations.some(item => item.regionId === query))) select(query);
  });
  revInput.addEventListener('input', () => {
    const index = Number(revInput.value);
    page.revIndex = index >= page.state.history.length - 1 ? null : index;
    page.expiredRev = null;
    draw();
    panels();
  });

  const update = () => { draw(); panels(); };
  const setSession = ({
    state = page.state,
    mode = page.mode,
    connected = page.connected,
    now = page.now,
    latest = false,
  } = {}) => {
    if (page.destroyed) return;
    // Preserve the viewed identity when the bounded history shifts its indices.
    const previousRev = page.revIndex === null ? null : viewed()?.rev;
    page.state = state;
    page.mode = mode;
    page.connected = connected;
    page.now = now;
    if (latest) {
      page.revIndex = null;
      page.expiredRev = null;
    } else if (previousRev !== null && previousRev !== undefined) {
      const index = state.history.findIndex(snapshot => snapshot.rev === previousRev);
      page.revIndex = Math.max(0, index);
      if (index < 0) page.expiredRev = previousRev;
    }
    const retained = new Set(state.history.map(snapshot => snapshot.rev));
    if (state.held) retained.add(state.held.rev);
    for (const rev of page.layouts.keys()) if (!retained.has(rev)) page.layouts.delete(rev);
    update();
  };
  const tick = now => {
    if (page.destroyed) return;
    page.now = now;
    update();
  };
  const destroy = () => {
    if (page.destroyed) return;
    page.destroyed = true;
    window.removeEventListener('resize', onResize);
    container.removeEventListener('wheel', onWheel);
    if (cameraFrame) cancelAnimationFrame(cameraFrame);
    adapter.setActivationHandler(null);
    adapter.graph.getView().removeListener?.(onCameraChange);
    adapter.graph.destroy?.();
    screen.remove();
    detail.remove();
    style.remove();
  };

  fit();
  panels();
  return Object.freeze({
    adapter, page, select, fit, zoomBy, setSession, tick, destroy,
    get state() { return page.state; },
    get projection() { return page.projection; },
    lodFor,
  });
};


const WORLD_STYLE = `
body{margin:0;overflow:hidden}
#atlas-world-screen{position:relative;display:flex;flex-direction:column;height:100vh;background:#fff}
#atlas-world-list{position:absolute;z-index:2;top:64px;left:8px;right:8px;max-height:45%;overflow:auto;box-sizing:border-box;padding:4px 8px;font:13px system-ui,sans-serif;background:#fff;border:1px solid #adb5bd;overflow-wrap:anywhere}
#atlas-world-list[hidden]{display:none}
#atlas-world{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;background:#fff}
#atlas-world svg text{white-space:pre}
#atlas-world-status-bar{box-sizing:border-box;flex:none;display:flex;align-items:center;height:24px;padding:2px 8px;min-width:0;font:13px system-ui,sans-serif;background:#fff;border-bottom:1px solid #dee2e6}
#atlas-world-status{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#atlas-world-search-bar{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:8px;height:36px;padding:4px 8px;min-width:0;font:13px system-ui,sans-serif;background:#fff;border-bottom:1px solid #dee2e6}
#atlas-world-search{width:20%;min-width:80px;font:inherit}
#atlas-world-search-results{width:30%;min-width:80px;font:inherit}
#atlas-world-search-count{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#atlas-world-search-bar button{flex:none;font:inherit}
`;

// A supplied World input the page refused: the last accepted one stays drawn.
const INPUT_REFUSED = '入力を拒否・前に受け付けた入力を表示中';

export const mountAtlasWorldUI = ({
  root = document.body,
  input,
  mode: initialMode = 'sample',
  connected = false,
  now = 0,
  selected = null,
  onSelect = null,
  frameId: initialFrameId = '',
  onView = null,
  updateIntervalMs = null,
} = {}) => {
  if (!root?.append) throw new Error('atlas-world-ui: mount root required');
  if (updateIntervalMs !== null && !(Number.isFinite(updateIntervalMs) && updateIntervalMs > 0)) throw new Error('atlas-world-ui: updateIntervalMs must be a positive number or null');
  const worldInput = parseAtlasWorldInput(input);
  const style = el('style', { 'data-atlas-world-style': 'true', text: WORLD_STYLE });
  const container = el('div', { id: 'atlas-world', tabindex: 0, 'aria-label': 'Atlas a2 three-area world' });
  const search = el('input', { type: 'search', id: 'atlas-world-search', placeholder: 'Search supplied records', 'aria-label': 'Search displayed World records' });
  const choices = el('select', { id: 'atlas-world-search-results', 'aria-label': 'World search results' });
  const searchCount = el('span', { id: 'atlas-world-search-count' });
  // Contract 3 (revised): row 1 is the status, warnings first so a narrow
  // window cuts only its tail; row 2 holds the search and the time controls,
  // the visible form of [ ] L.
  const status = el('span', { id: 'atlas-world-status', role: 'status' });
  const statusBar = el('div', { id: 'atlas-world-status-bar' }, status);
  const back = el('button', { type: 'button', id: 'atlas-world-step-back', text: '◀ 前へ', onclick: () => stepFrame(-1) });
  const forward = el('button', { type: 'button', id: 'atlas-world-step-forward', text: '次へ ▶', onclick: () => stepFrame(1) });
  const toPresent = el('button', { type: 'button', id: 'atlas-world-present', text: '現在へ', onclick: () => followLatest() });
  // 予定 ▸ (t+1: the latest frame's planned side, not a frame) and 仕訳 n ·
  // 保持 m（累計）▸ (the entries the displayed frame carries and what was held up to
  // it) open one list over the graph.
  const forecast = el('button', { type: 'button', id: 'atlas-world-forecast', onclick: () => toggleList('forecast') });
  const journalButton = el('button', { type: 'button', id: 'atlas-world-journal', onclick: () => toggleList('journal') });
  const list = el('div', { id: 'atlas-world-list', role: 'region', 'aria-label': '予定・仕訳', hidden: 'hidden' });
  const searchBar = el('div', { id: 'atlas-world-search-bar' }, search, choices, searchCount, back, forward, toPresent, forecast, journalButton);
  const screen = el('div', { id: 'atlas-world-screen' }, statusBar, searchBar, list, container);
  root.append(style, screen);

  const page = {
    kind: 'world',
    query: '',
    searchResults: [],
    input: worldInput,
    frameIndex: worldInput.frames.length - 1,
    latest: true,
    pair: worldPair(worldInput),
    side: 'after',
    admission: null,
    selected: selected || entityKey(worldInput.presentation.defaultSelection),
    mode: initialMode,
    connected,
    now,
    receivedAt: null,
    snapshotBytes: null,
    heartbeatBytes: null,
    projection: null,
    listOpen: null,
    updateIntervalMs,
    destroyed: false,
  };

  const adapter = createMaxGraphAdapter(container, { theme: { ...DEFAULT_THEME,
    vertex: { ...DEFAULT_THEME.vertex, fontSize: 13, deepFontSize: 13, fontStyle: 0 } } });
  adapter.setTool('select');
  let suppressSelection = false;
  let cameraFrame = 0;

  // The frame shown. A received pair keeps a held past frame (and the input it
  // came from) while newer input arrives; the first frame is the pair's Before side.
  const currentFrame = () => page.side === 'before' && page.pair.before ? page.pair.before : page.pair.after;
  const viewport = () => ({ width: container.clientWidth, height: container.clientHeight });
  const graphView = () => worldViewport(viewport()).graph;
  const stalled = () => updateStalled({ mode: page.mode, now: page.now, asOf: page.input.frames.at(-1).asOf, updateIntervalMs: page.updateIntervalMs });
  const renderSearch = () => {
    const frame = currentFrame();
    page.searchResults = searchAtlasWorld(frame, page.query);
    choices.replaceChildren(el('option', { value: '', text: 'Select a supplied record' }),
      ...page.searchResults.map(({ key, record }) => el('option', {
        value: key, text: (record.label || record.kind || key) + ' · ' + key,
      })));
    choices.value = page.searchResults.some(row => row.key === page.selected) ? page.selected : '';
    // The frame searched is the one the status row names (S6).
    searchCount.textContent = page.searchResults.length + ' results';
    searchCount.title = searchCount.textContent;
    // The status row: warnings first (the World stopped updating, a supplied
    // input was refused, the stream state), then LATEST / HELD, the frame shown
    // and the last receipt. LATEST is the newest supplied frame; while the live
    // stream cannot vouch for that supply, or the World stopped updating, it is qualified.
    const { warning, last } = transportParts(page);
    status.textContent = [stalled() ? UPDATE_STALLED + '（最後の frame ' + page.input.frames.at(-1).asOf + '）' : null,
      page.admission?.status === 'rejected' ? INPUT_REFUSED : null, warning,
      page.latest ? (['sample', 'live'].includes(transportOf(page)) && !stalled() ? 'LATEST' : 'LATEST（最新か不明）') : 'HELD',
      viewedText(page.input.frames, frame), last].filter(Boolean).join(' · ');
    status.title = status.textContent;
    // A control that would change nothing is shown disabled, never hidden.
    const position = timelinePosition(page.input.frames, frame.id);
    back.disabled = position.index < 0 || stepIndex(position, -1) === position.index;
    forward.disabled = position.index < 0 || stepIndex(position, 1) === position.index;
    toPresent.disabled = position.present && page.latest;
    // The open list, drawn again with the frame shown (仕訳) or the latest (予定).
    const entries = journalLines(frame), held = heldLines(page.input.frames, frame);
    forecast.textContent = '予定 ' + (page.listOpen === 'forecast' ? '▾' : '▸');
    journalButton.textContent = journalButtonText(entries.length, held.length, page.listOpen === 'journal');
    const lines = page.listOpen === 'forecast' ? forecastLines(page.input.frames)
      : page.listOpen === 'journal' ? (entries.length + held.length ? [...entries, ...held] : ['この時点の仕訳はない']) : [];
    list.replaceChildren(...lines.map(line => el('div', { text: line })));
    list.hidden = page.listOpen === null;
  };
  const toggleList = which => {
    page.listOpen = page.listOpen === which ? null : which;
    draw();
  };

  // There is no Fit control on screen, so the camera may not carry the World
  // out of view: on each axis a World larger than the graph view must cover
  // it, and a smaller one must stay inside it.
  const clampCamera = world => {
    const { scale, translateX, translateY } = adapter.camera();
    const view = graphView();
    const axis = (translate, start, size, worldStart, worldSize) => {
      const a = start / scale - worldStart, b = (start + size) / scale - worldStart - worldSize;
      return Math.min(Math.max(translate, Math.min(a, b)), Math.max(a, b));
    };
    const x = axis(translateX, view.x, view.width, world.x, world.width);
    const y = axis(translateY, view.y, view.height, world.y, world.height);
    if (Math.abs(x - translateX) < 1e-9 && Math.abs(y - translateY) < 1e-9) return false;
    adapter.setCamera(scale, x, y);
    return true;
  };

  const draw = () => {
    const project = () => projectAtlasWorld({
      input: page.pair.input,
      receivedInput: page.input,
      frame: currentFrame(),
      selected: page.selected,
      mode: page.mode,
      connected: page.connected,
      latest: page.latest,
      scale: adapter.camera().scale,
      viewport: viewport(),
      admission: page.admission,
      now: page.now,
    });
    let projection = project();
    if (clampCamera(projection.world)) projection = project();
    page.projection = projection;
    adapter.render(projection.scene);
    adapter.setFocusMarker(projection.selectedRegionId);
    renderSearch();
    reportView();
    return projection;
  };

  // The viewed frame is reported only while a past frame is held; following
  // the present reports none, so a reload returns to whatever is latest then.
  let reportedView = null;
  const reportView = () => {
    const view = { selected: page.selected, frameId: page.latest ? '' : currentFrame().id };
    const key = JSON.stringify(view);
    if (key === reportedView) return;
    reportedView = key;
    onView?.(view);
  };

  // Fit the World as projected for the current viewport (never a projection
  // kept from an earlier size). When the projection sets a minimum scale (its
  // boxes hold their text only at that scale) and the whole World would need
  // less, show it at that scale from its top, centred if it is narrower than
  // the view; the rest is reached by panning.
  const fit = () => {
    const projection = draw();
    const view = graphView();
    const fitted = fitCamera(projection.world, view, 0.94);
    const scale = Math.max(fitted.scale, projection.minScale ?? 0);
    const { world } = projection;
    const translateX = scale === fitted.scale ? fitted.translateX : Math.max((view.width / scale - world.width) / 2, 0) - world.x;
    const translateY = scale === fitted.scale ? fitted.translateY : -world.y;
    adapter.setCamera(scale, translateX + view.x / scale, translateY + view.y / scale);
    draw();
  };

  const zoomBy = (factor, at = { x: container.clientWidth / 2, y: container.clientHeight / 2 }) => {
    const { scale, translateX, translateY } = adapter.camera();
    const next = Math.max(0.05, Math.min(20, scale * factor));
    adapter.setCamera(next, translateX + at.x / next - at.x / scale, translateY + at.y / next - at.y / scale);
    draw();
  };

  const syncGraphSelection = key => {
    suppressSelection = true;
    try {
      if (String(key).startsWith('relation:')) adapter.setSelection({ relationIds: [key] });
      else adapter.setSelection({});
    } finally {
      suppressSelection = false;
    }
  };

  const select = (key, { sync = true } = {}) => {
    if (typeof key !== 'string' || !key) return;
    page.selected = key;
    onSelect?.(key);
    draw();
    if (sync) syncGraphSelection(key);
  };

  const onSearchInput = () => {
    if (page.destroyed) return;
    page.query = search.value;
    // A fixed-height native bar leaves camera, pair and qualified selection intact.
    draw();
  };
  const onSearchSelection = () => {
    if (page.destroyed) return;
    const key = choices.value;
    if (!page.searchResults.some(row => row.key === key)) return;
    select(key);
    // Bring the chosen record's box (a relation: its drawn end) into view.
    focusSelected();
  };
  search.addEventListener('input', onSearchInput);
  choices.addEventListener('change', onSearchSelection);

  const selectRef = ref => select(entityKey(ref));
  const selectRelationRef = ref => select(relationKey(ref));

  // A box of the three areas is the only thing on the graph to activate.
  adapter.setActivationHandler(activation => {
    if (activation?.type === 'atlas.world.select') select(activation.id);
  });

  adapter.onSelectionChange(selection => {
    if (suppressSelection || !selection.relationIds.length) return;
    select(selection.relationIds[0], { sync: false });
  });

  const updateFrameIndex = () => { page.frameIndex = page.input.frames.findIndex(frame => frame.id === currentFrame().id); };
  const showSide = side => {
    page.side = side === 'before' && page.pair.before ? 'before' : 'after';
    page.latest = false;
    updateFrameIndex();
    draw();
    syncGraphSelection(page.selected);
  };
  const followLatest = () => {
    page.pair = worldPair(page.input);
    page.side = 'after';
    page.latest = true;
    updateFrameIndex();
    draw();
    syncGraphSelection(page.selected);
  };
  const setFrame = (index, { latest = false } = {}) => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= page.input.frames.length) return;
    if (latest) { followLatest(); return; }
    if (index === 0) showSide('before');
    else if (index === page.input.frames.length - 1) showSide('after');
    else { page.pair = worldPair(page.input, index); showSide('after'); }
  };
  // Show one received frame, held. The first frame keeps the Before side of
  // the pair against the latest; any later one is the After of its own pair.
  const showFrame = index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= page.input.frames.length) return;
    if (index === 0 && page.input.frames.length > 1) { page.pair = worldPair(page.input); showSide('before'); }
    else { page.pair = worldPair(page.input, index); showSide('after'); }
  };
  // One step through the past. A forward step at the present changes nothing.
  const stepFrame = delta => {
    const position = timelinePosition(page.input.frames, currentFrame().id);
    const next = stepIndex(position, delta);
    if (next === position.index) return;
    showFrame(next);
  };
  const rejectInput = reason => {
    if (page.destroyed) return;
    // No state supplied by the rejected payload is admitted. This receipt is UI
    // status; it never becomes observation time or owner comparison evidence.
    page.admission = Object.freeze({ status: 'rejected', reason: String(reason) });
    draw();
  };
  const setSession = ({
    input: nextInput = page.input,
    mode = page.mode,
    connected: nextConnected = page.connected,
    now: nextNow = page.now,
    latest = page.latest,
    receivedAt = page.receivedAt,
    snapshotBytes = page.snapshotBytes,
    heartbeatBytes = page.heartbeatBytes,
    reportInvalid = false,
  } = {}) => {
    if (page.destroyed) return false;
    const supplied = nextInput !== page.input;
    // Validate before any mutation. The app requests a visible admission
    // receipt; direct callers still detect invalid input by throw. Rendering
    // failures are not mislabeled as input rejection.
    let accepted;
    try { accepted = supplied ? parseAtlasWorldInput(nextInput) : page.input; }
    catch (error) {
      if (!reportInvalid) throw error;
      rejectInput(error.message);
      return false;
    }
    page.input = accepted;
    if (supplied) page.admission = null;
    page.mode = mode;
    page.connected = nextConnected;
    page.now = nextNow;
    page.receivedAt = receivedAt;
    page.snapshotBytes = snapshotBytes;
    page.heartbeatBytes = heartbeatBytes;
    page.latest = latest;
    if (latest) { page.pair = worldPair(accepted); page.side = 'after'; }
    // Held input, both frame contents, presentation and owner receipts stay
    // referenced as one immutable pair, even when absent in the next payload.
    updateFrameIndex();
    draw();
    syncGraphSelection(page.selected);
    return true;
  };

  // Time passing can change what the screen may claim (receiving -> no
  // response), so redraw when the stated connection changes.
  // `force` redraws regardless, for a deadline the caller waited for (a
  // matched phase's matched_until).
  const tick = (nextNow, force = false) => {
    if (page.destroyed) return;
    const before = transportOf(page);
    page.now = nextNow;
    if (force || transportOf(page) !== before) draw();
  };

  const focusSelected = () => {
    const id = page.projection?.selectedRegionId;
    const cell = id ? adapter.cellsByRegionId.get(id) : null;
    const bounds = cell?.getGeometry?.();
    if (!bounds) return;
    if (cell.semantic?.zIndex >= 10000) return;
    const view = graphView();
    const camera = fitCamera({ x: bounds.x - 24, y: bounds.y - 24, width: bounds.width + 48, height: bounds.height + 48 }, view, 0.94);
    adapter.setCamera(camera.scale, camera.translateX + view.x / camera.scale, camera.translateY + view.y / camera.scale);
    draw();
  };

  // Keys are only shortcuts of visible controls: [ ◀ 前へ, ] 次へ ▶, L 現在へ.
  const onKeyDown = event => {
    if (event.key === '[') stepFrame(-1);
    else if (event.key === ']') stepFrame(1);
    else if (event.key === 'l' || event.key === 'L') followLatest();
    else return;
    event.preventDefault();
  };
  container.addEventListener('keydown', onKeyDown);

  const onWheel = event => {
    event.preventDefault();
    const box = container.getBoundingClientRect();
    // The World may be larger than the view at its minimum scale: a plain
    // wheel scrolls it, and Ctrl/⌘ + wheel zooms.
    if (!event.ctrlKey && !event.metaKey) panBy(event.deltaX, event.deltaY);
    else zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, { x: event.clientX - box.left, y: event.clientY - box.top });
  };
  const panBy = (dx, dy) => {
    const { scale, translateX, translateY } = adapter.camera();
    adapter.setCamera(scale, translateX - dx / scale, translateY - dy / scale);
    draw();
  };
  const onResize = () => fit();
  const onCameraChange = () => {
    if (page.destroyed || cameraFrame) return;
    cameraFrame = requestAnimationFrame(() => {
      cameraFrame = 0;
      if (!page.destroyed) draw();
    });
  };
  container.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);
  adapter.onCameraChange(onCameraChange);

  const destroy = () => {
    if (page.destroyed) return;
    page.destroyed = true;
    if (cameraFrame) cancelAnimationFrame(cameraFrame);
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('keydown', onKeyDown);
    search.removeEventListener('input', onSearchInput);
    choices.removeEventListener('change', onSearchSelection);
    window.removeEventListener('resize', onResize);
    adapter.setActivationHandler(null);
    adapter.graph.getView().removeListener?.(onCameraChange);
    adapter.graph.destroy?.();
    screen.remove();
    style.remove();
  };

  // A held past frame named by the caller (a reload) is restored when it is
  // still supplied; otherwise the present is shown.
  const initialIndex = initialFrameId ? page.input.frames.findIndex(frame => frame.id === initialFrameId) : -1;
  if (initialIndex >= 0) showFrame(initialIndex);
  else draw();
  fit();

  return Object.freeze({
    adapter,
    page,
    select,
    selectRef,
    selectRelationRef,
    setFrame,
    stepFrame,
    setSession,
    tick,
    fit,
    focusSelected,
    zoomBy,
    destroy,
    get input() { return page.input; },
    get projection() { return page.projection; },
  });
};
