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
import { entityKey, parseAtlasWorldInput, relationKey } from './src/atlas-world.mjs';
import { projectAtlasWorld } from './src/atlas-world-projection.mjs';

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
    mode: initialMode, connected, state, revIndex: null,
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
    page.state = state;
    page.mode = mode;
    page.connected = connected;
    page.now = now;
    if (latest) page.revIndex = null;
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
#atlas-world-screen{display:flex;flex-direction:column;height:100vh;background:#fff}
#atlas-world{position:relative;flex:1 1 auto;min-height:0;width:100%;overflow:hidden;background:#fff}
`;

export const mountAtlasWorldUI = ({
  root = document.body,
  input,
  mode: initialMode = 'sample',
  connected = false,
  now = 0,
  selected = null,
  onSelect = null,
} = {}) => {
  if (!root?.append) throw new Error('atlas-world-ui: mount root required');
  let worldInput = parseAtlasWorldInput(input);
  const style = el('style', { 'data-atlas-world-style': 'true', text: WORLD_STYLE });
  const container = el('div', { id: 'atlas-world', tabindex: 0, 'aria-label': 'Atlas a2 three-area world' });
  const screen = el('div', { id: 'atlas-world-screen' }, container);
  root.append(style, screen);

  const page = {
    kind: 'world',
    input: worldInput,
    frameIndex: worldInput.frames.length - 1,
    latest: true,
    selected: selected || entityKey(worldInput.presentation.defaultSelection),
    mode: initialMode,
    connected,
    now,
    projection: null,
    destroyed: false,
  };

  const adapter = createMaxGraphAdapter(container, { theme: DEFAULT_THEME });
  adapter.setTool('select');
  let suppressSelection = false;
  let cameraFrame = 0;

  const currentFrame = () => page.input.frames[page.frameIndex];
  const counterpartFrame = () => {
    if (page.input.frames.length < 2) return null;
    if (page.frameIndex > 0) return page.input.frames[page.frameIndex - 1];
    return page.input.frames[1];
  };

  const draw = () => {
    const projection = projectAtlasWorld({
      input: page.input,
      frame: currentFrame(),
      counterpart: counterpartFrame(),
      selected: page.selected,
      mode: page.mode,
      connected: page.connected,
      scale: adapter.camera().scale,
    });
    page.projection = projection;
    adapter.render(projection.scene);
    adapter.setFocusMarker(projection.selectedRegionId);
    return projection;
  };

  const fit = () => {
    const projection = page.projection ?? draw();
    const camera = fitCamera(projection.world, { width: container.clientWidth, height: container.clientHeight });
    adapter.setCamera(camera.scale, camera.translateX, camera.translateY);
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

  const selectRef = ref => select(entityKey(ref));
  const selectRelationRef = ref => select(relationKey(ref));

  const cycle = ids => {
    if (!ids?.length) return;
    const index = Math.max(-1, ids.indexOf(page.selected));
    select(ids[(index + 1) % ids.length]);
  };

  adapter.setActivationHandler(activation => {
    if (activation?.type === 'atlas.world.select') select(activation.id);
    else if (activation?.type === 'atlas.world.next-aggregate') cycle(page.projection?.aggregateRelationIds);
    else if (activation?.type === 'atlas.world.next-omitted') cycle(page.projection?.omittedRelationIds);
    else if (activation?.type === 'atlas.world.next-omitted-entity') cycle(page.projection?.omittedEntityIds);
    else if (activation?.type === 'atlas.world.frame-before') setFrame(0);
    else if (activation?.type === 'atlas.world.frame-after') setFrame(page.input.frames.length - 1, { latest: true });
    else if (activation?.type === 'atlas.world.fit') fit();
    else if (activation?.type === 'atlas.world.focus') focusSelected();
    else if (activation?.type === 'atlas.world.tool-select') adapter.setTool('select');
    else if (activation?.type === 'atlas.world.tool-hand') adapter.setTool('hand');
  });

  adapter.onSelectionChange(selection => {
    if (suppressSelection || !selection.relationIds.length) return;
    page.selected = selection.relationIds[0];
    onSelect?.(page.selected);
    draw();
  });

  const setFrame = (index, { latest = false } = {}) => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= page.input.frames.length) return;
    page.frameIndex = index;
    page.latest = latest || index === page.input.frames.length - 1;
    draw();
    syncGraphSelection(page.selected);
  };

  const setSession = ({
    input: nextInput = page.input,
    mode = page.mode,
    connected: nextConnected = page.connected,
    now: nextNow = page.now,
    latest = page.latest,
  } = {}) => {
    if (page.destroyed) return;
    const previousFrameId = currentFrame()?.id ?? null;
    page.input = parseAtlasWorldInput(nextInput);
    page.mode = mode;
    page.connected = nextConnected;
    page.now = nextNow;
    page.latest = latest;
    if (latest) page.frameIndex = page.input.frames.length - 1;
    else {
      const sameFrame = page.input.frames.findIndex(frame => frame.id === previousFrameId);
      page.frameIndex = sameFrame >= 0 ? sameFrame : Math.min(page.frameIndex, page.input.frames.length - 1);
    }
    draw();
    syncGraphSelection(page.selected);
  };

  const tick = nextNow => {
    if (page.destroyed) return;
    page.now = nextNow;
    draw();
  };

  const focusSelected = () => {
    const id = page.projection?.selectedRegionId;
    const cell = id ? adapter.cellsByRegionId.get(id) : null;
    const bounds = cell?.getGeometry?.();
    if (!bounds) return;
    const camera = fitCamera({ x: bounds.x - 24, y: bounds.y - 24, width: bounds.width + 48, height: bounds.height + 48 }, {
      width: container.clientWidth,
      height: container.clientHeight,
    });
    adapter.setCamera(camera.scale, camera.translateX, camera.translateY);
    draw();
  };

  const onKeyDown = event => {
    if (event.key === 's' || event.key === 'S') adapter.setTool('select');
    else if (event.key === 'h' || event.key === 'H') adapter.setTool('hand');
    else if (event.key === 'f' || event.key === 'F') focusSelected();
    else if (event.key === '0' || event.key === 'Escape') fit();
    else if (event.key === '[') setFrame(0);
    else if (event.key === ']') setFrame(page.input.frames.length - 1, { latest: true });
    else return;
    event.preventDefault();
  };
  container.addEventListener('keydown', onKeyDown);

  const onWheel = event => {
    event.preventDefault();
    const box = container.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, { x: event.clientX - box.left, y: event.clientY - box.top });
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
    window.removeEventListener('resize', onResize);
    adapter.setActivationHandler(null);
    adapter.graph.getView().removeListener?.(onCameraChange);
    adapter.graph.destroy?.();
    screen.remove();
    style.remove();
  };

  draw();
  fit();

  return Object.freeze({
    adapter,
    page,
    select,
    selectRef,
    selectRelationRef,
    setFrame,
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
