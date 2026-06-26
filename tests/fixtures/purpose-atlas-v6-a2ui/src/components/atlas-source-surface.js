import {html, nothing, unsafeCSS} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';
import sourceUiCss from '../styles/source-ui.css?inline';
import {AtlasSourceSurfaceApi} from '../a2ui/apis.js';
import {CachedAtlasRenderer, actorColor} from '../ui/cached-atlas-renderer.js';
import {labelFromId} from '../domain/atlas-engine.js';

const MODE_LABELS = Object.freeze({
  purpose: '目的距離',
  responsibility: '責務構成',
  focus: '選択経路',
});

const ACTORS = Object.freeze(['CEO', 'CPO', 'CTO', 'COO', 'CFO', 'REVIEW', 'OPS']);
const KEY_STEPS = new Set([2, 7, 20, 39]);
const OP_ICONS = Object.freeze({mismatch: '⚠', request: '👤', hold: '⏸'});

function normalizeSelection(value) {
  return value?.nodeId ? value : null;
}

function selectionKey(value) {
  if (!value?.nodeId) return '';
  return value.type === 'responsibility'
    ? `r:${value.nodeId}:${value.actor || ''}`
    : `n:${value.nodeId}`;
}

function percent(value) {
  return Math.round(Number(value || 0) * 100);
}

export class AtlasSourceSurfaceElement extends A2uiLitElement {
  static styles = unsafeCSS(sourceUiCss);

  constructor() {
    super();
    this.renderer = null;
    this.hoverSelection = null;
    this.renderStats = {sceneBuilds: 0, frames: 0};
    this.toastVisible = false;
    this.toastTimer = null;
    this.lastToastNonce = null;
  }

  createController() {
    return new A2uiController(this, AtlasSourceSurfaceApi);
  }

  get props() {
    return this.controller?.props || {};
  }

  get snapshot() {
    return this.props.snapshot || {};
  }

  get selection() {
    return normalizeSelection(this.props.selection);
  }

  get visibleSelection() {
    return this.selection || this.hoverSelection;
  }

  firstUpdated() {
    const stage = this.renderRoot.querySelector('#stage');
    const sceneCanvas = this.renderRoot.querySelector('#atlasScene');
    const overlayCanvas = this.renderRoot.querySelector('#atlasOverlay');
    this.renderer = new CachedAtlasRenderer({
      stage,
      sceneCanvas,
      overlayCanvas,
      onViewport: (viewport) => this.commitViewport(viewport),
      onSelection: (selection) => this.commitSelection(selection),
      onHover: (selection) => this.setHover(selection),
      onStats: (stats) => {
        const buildsChanged = stats.sceneBuilds !== this.renderStats.sceneBuilds;
        this.renderStats = stats;
        if (buildsChanged) this.requestUpdate();
      },
    });
    this.publishRendererState();
    window.__purposeAtlasSourceSurface = this;
  }

  updated() {
    this.renderer?.update({
      snapshot: this.snapshot,
      viewMode: this.props.viewMode,
      viewport: this.props.viewport,
      selection: this.selection,
    });
    this.publishRendererState();

    const toast = this.props.toast || {};
    if (toast.nonce !== this.lastToastNonce) {
      this.lastToastNonce = toast.nonce;
      clearTimeout(this.toastTimer);
      this.toastVisible = Boolean(toast.message);
      if (this.toastVisible) {
        this.toastTimer = window.setTimeout(() => {
          this.toastVisible = false;
          this.requestUpdate();
        }, 1450);
      }
      this.requestUpdate();
    }
  }

  disconnectedCallback() {
    this.renderer?.dispose();
    this.renderer = null;
    clearTimeout(this.toastTimer);
    if (window.__purposeAtlasSourceSurface === this) delete window.__purposeAtlasSourceSurface;
    super.disconnectedCallback();
  }

  publishRendererState() {
    if (window.__purposeAtlas) window.__purposeAtlas.ui = this;
  }

  commitViewport(viewport) {
    this.props.setViewport?.({...viewport});
  }

  commitSelection(selection) {
    this.hoverSelection = null;
    this.props.setSelection?.(selection ? {...selection} : null);
    queueMicrotask(() => this.props.onSelect?.());
    this.requestUpdate();
  }

  clearSelection() {
    this.hoverSelection = null;
    this.props.setSelection?.(null);
    queueMicrotask(() => this.props.onClearSelection?.());
    this.requestUpdate();
  }

  setHover(selection) {
    if (selectionKey(selection) === selectionKey(this.hoverSelection)) return;
    this.hoverSelection = selection ? {...selection} : null;
    this.requestUpdate();
  }

  commitStep(value) {
    const bounded = Math.max(0, Math.min(Number(this.props.maxStep || 0), Number(value) || 0));
    this.props.setStep?.(bounded);
    queueMicrotask(() => this.props.onStepChanged?.());
  }

  commitMode(mode) {
    if (!['purpose', 'responsibility', 'focus'].includes(mode)) return;
    this.hoverSelection = null;
    this.props.setViewMode?.(mode);
    queueMicrotask(() => this.props.onModeChanged?.());
  }

  node(nodeId) {
    return (this.snapshot.nodes || []).find((candidate) => candidate.id === nodeId) || null;
  }

  nodeLabel(nodeId) {
    return this.node(nodeId)?.label || labelFromId(nodeId);
  }

  responsibility(nodeId) {
    return this.snapshot.responsibility?.[nodeId] || {composition: [], branches: {}};
  }

  currentComposition() {
    return this.snapshot.currentComposition || [];
  }

  selectionDetails() {
    const focus = this.visibleSelection;
    if (!focus?.nodeId) return null;
    const node = this.node(focus.nodeId);
    if (!node) return null;
    if (focus.type === 'responsibility' && focus.actor) {
      const branch = this.responsibility(node.id).branches?.[focus.actor] || {nodeIds: [], edgeIds: []};
      return {
        kind: 'responsibility',
        kicker: 'Responsibility projection',
        title: `${focus.actor}責務 · ${node.label}`,
        copy: 'この目的を支えるsubgraphから再帰集約された責務です。目的配置は変えず、外周と支援経路だけを強調しています。',
        chips: [
          {label: `coverage ${(branch.nodeIds || []).length} nodes`, tone: 'info'},
          ...(branch.nodeIds || []).slice(0, 5).map((id) => ({label: this.nodeLabel(id), tone: ''})),
        ],
        composition: [{actor: focus.actor, value: (branch.nodeIds || []).length, ratio: 1}],
        pinned: Boolean(this.selection),
      };
    }
    return {
      kind: 'node',
      kicker: 'Node inspector',
      title: node.label,
      copy: `${node.labelText || node.purposeLabel || node.kind || ''}${node.status === 'archived' ? '。archiveとして残っています。' : ''}`,
      chips: [
        {label: `${node.actor || 'CEO'}責務`, tone: 'info'},
        {label: node.kind || 'node', tone: 'info'},
        {label: `meta ${node.metaRank}`, tone: 'info'},
      ],
      composition: this.responsibility(node.id).composition || [],
      pinned: Boolean(this.selection),
    };
  }

  renderComposition(composition) {
    if (!composition?.length) return html`<p class="inspector-copy">責務構成はまだ計算できません。</p>`;
    return html`
      <div class="comp-list">
        ${composition.map((entry) => {
          const value = percent(entry.ratio);
          return html`
            <div class="comp-row">
              <span>${entry.actor}</span>
              <span class="comp-track"><i class="comp-fill" style=${`width:${Math.max(4, value)}%;background:${actorColor(entry.actor, 0.92)}`}></i></span>
              <b>${value}%</b>
            </div>
          `;
        })}
      </div>
    `;
  }

  renderInspector() {
    const details = this.selectionDetails();
    const guard = this.snapshot.guard || {status: 'warn', owner: 'CEO', text: '確認中'};
    const eventLog = this.snapshot.eventLog || [];
    const pinned = Boolean(this.selection);
    if (details) {
      return html`
        <div class="inspector-head">
          <div><small>${details.kicker}</small><h2>${details.title}</h2></div>
          ${pinned ? html`<button class="close-inspector" aria-label="閉じる" @click=${() => this.clearSelection()}>×</button>` : nothing}
        </div>
        <div class="inspector-body">
          <p class="inspector-copy">${details.copy}</p>
          <div class="row">${details.chips.map((chip) => html`<span class=${`pill ${chip.tone || ''}`}>${chip.label}</span>`)}</div>
          <div class="section"><h3 class="section-title">Responsibility</h3>${this.renderComposition(details.composition)}</div>
          ${pinned ? html`
            <div class="actions">
              <button class="warn" data-action="record-mismatch" @click=${this.props.onRecordMismatch}>ズレとして記録</button>
              <button class="primary" data-action="request-owner" @click=${this.props.onRequestOwner}>担当へ検査依頼</button>
              <button data-action="step-forward" @click=${this.props.onStepForward}>Step JSONL</button>
              <button data-action="hold-decision" @click=${this.props.onHoldDecision}>CEO判断待ち</button>
            </div>
          ` : html`<p class="inspector-copy section">クリックすると固定し、判断アクションを表示します。</p>`}
          <div class="eventbox">${eventLog.slice(0, 5).join('\n')}</div>
        </div>
      `;
    }

    return html`
      <div class="inspector-head"><div><small>Inspector</small><h2>${this.snapshot.currentPurpose || '目的未設定'}</h2></div></div>
      <div class="inspector-body">
        <p class="inspector-copy">目的の支援経路と、同じnode群から再帰集約した責務を並列に確認します。</p>
        <div class="section">
          <h3 class="section-title">Current state</h3>
          <div class="metric-grid">
            <div class="metric-card"><small>guard</small><b>${guard.status === 'ok' ? '一致' : 'ズレ'}</b></div>
            <div class="metric-card"><small>next owner</small><b>${guard.owner || 'CEO'}</b></div>
            <div class="metric-card"><small>nodes</small><b>${this.snapshot.counts?.nodes || 0}</b></div>
            <div class="metric-card"><small>edges</small><b>${this.snapshot.counts?.edges || 0}</b></div>
          </div>
        </div>
        <div class="section"><h3 class="section-title">Responsibility composition</h3>${this.renderComposition(this.currentComposition())}</div>
        <div class="section"><h3 class="section-title">Recent projection</h3><div class="eventbox">${eventLog.slice(0, 6).join('\n') || 't0 initial projection'}</div></div>
      </div>
    `;
  }

  renderOpsQueue() {
    const operations = Array.isArray(this.props.operations) ? this.props.operations : [];
    return operations.slice(0, 2).map((item) => html`
      <div class="opsline"><b>${OP_ICONS[item.kind] || '•'} ${item.label}</b><br><small>t${item.t} · ${item.owner} → ${item.target}</small></div>
    `);
  }

  renderTimeline() {
    const step = Number(this.props.step || 0);
    const maxStep = Number(this.props.maxStep || 0);
    const events = Array.isArray(this.props.events) ? this.props.events : [];
    return html`
      <footer class="timeline">
        <div class="timeline-copy"><h3>Timeline replay</h3><small>v5の40件JSONLを維持し、UI層だけを再構成。</small></div>
        <div class="ticks" aria-label="40イベントのタイムライン">
          ${Array.from({length: maxStep}, (_, index) => index + 1).map((value) => {
            const classes = ['tick'];
            if (value <= step) classes.push('done');
            if (KEY_STEPS.has(value)) classes.push('key');
            if (value === step) classes.push('now');
            const event = events[value - 1] || {};
            return html`<button class=${classes.join(' ')} type="button" data-t=${String(value)} title=${`t${value} ${event.label || event.type || ''}`} aria-current=${value === step ? 'step' : 'false'} @click=${() => this.commitStep(value)}></button>`;
          })}
        </div>
        <small id="railSummary">${this.snapshot.lastEvent ? `last: ${this.snapshot.lastEventLabel}` : 't0'} / nodes ${this.snapshot.counts?.nodes || 0} / edges ${this.snapshot.counts?.edges || 0} / responsibility ${this.currentComposition().length}</small>
      </footer>
    `;
  }

  render() {
    const props = this.controller?.props;
    if (!props) return nothing;
    const snapshot = props.snapshot || {};
    const guard = snapshot.guard || {status: 'warn', text: '確認中', owner: 'CEO', missing: []};
    const step = Number(props.step || 0);
    const maxStep = Number(props.maxStep || 0);
    const viewMode = ['purpose', 'responsibility', 'focus'].includes(props.viewMode) ? props.viewMode : 'responsibility';
    const viewport = props.viewport || {zoom: 1};
    const nextTarget = guard.missing?.length ? ` → ${this.nodeLabel(guard.missing[0])}` : '';
    const inspectorVisible = Boolean(this.selection);
    const operations = Array.isArray(props.operations) ? props.operations : [];
    const toast = props.toast || {};

    return html`
      <div class="app" data-a2ui-root data-source-ui="latest-src/ui-shell.html">
        <header class="topbar">
          <section class="purpose-card" aria-live="polite">
            <div class="purpose-copy">
              <div class="eyebrow">Purpose Decision Atlas · v6 UI refactor</div>
              <div class="purpose-line"><h1 id="currentPurpose">${snapshot.currentPurpose || '—'}</h1><span id="statusBadge" class=${`pill ${guard.status === 'ok' ? 'ok' : 'warn'}`}>${guard.status === 'ok' ? '一致' : 'ズレあり'}</span></div>
              <p id="decisionCopy">${guard.text || '—'}${guard.action ? ` · ${guard.action}` : ''}</p>
              <div class="meta-row"><span id="eventProgress" class="pill info">t${step}/${maxStep}</span><span id="nextOwner" class="pill warn">次に: ${guard.owner || 'CEO'}${nextTarget}</span><span id="lastEvent" class="pill info">${snapshot.lastEventLabel || '初期投影'}</span></div>
            </div>
            <div id="opsQueue" aria-label="記録済みアクション">${this.renderOpsQueue()}</div>
          </section>

          <nav class="commandbar" aria-label="表示・再生コントロール">
            <div class="segmented" role="tablist" aria-label="表示モード">
              ${[
                ['purpose', '目的'],
                ['responsibility', '責務'],
                ['focus', '選択経路'],
              ].map(([mode, label]) => html`<button type="button" data-mode=${mode} role="tab" aria-selected=${viewMode === mode ? 'true' : 'false'} @click=${() => this.commitMode(mode)}>${label}</button>`)}
            </div>
            <div class="transport">
              <button data-action="reset" type="button" title="reset" aria-label="最初へ" @click=${props.onReset}>↺</button>
              <button data-action="previous" type="button" title="previous" aria-label="前のイベント" @click=${props.onPrevious}>‹</button>
              <button data-action="next" class="primary" type="button" @click=${props.onNext}>Step</button>
              <button data-action="play" type="button" title=${props.playing ? 'pause' : 'play'} aria-label=${props.playing ? '停止' : '再生'} @click=${props.onTogglePlay}>${props.playing ? 'Ⅱ' : '▶'}</button>
            </div>
            <div class="zoom-controls">
              <button data-action="fit" type="button" title="fit" aria-label="全体表示" @click=${props.onFit}>◎</button>
              <span class="progress" id="zoomLabel">${Math.round(Number(viewport.zoom || 1) * 100)}%</span>
              <button data-action="zoom-out" type="button" aria-label="縮小" @click=${props.onZoomOut}>−</button>
              <button data-action="zoom-in" type="button" aria-label="拡大" @click=${props.onZoomIn}>＋</button>
            </div>
          </nav>
        </header>

        <main class="workspace">
          <section class="stage" id="stage" aria-label="目的と責務の地図">
            <canvas id="atlasScene" aria-hidden="true"></canvas>
            <canvas id="atlasOverlay" tabindex="0" role="application" aria-label="ドラッグで移動、ホイールで拡大縮小、nodeをクリックして詳細を表示"></canvas>
            <div class="stage-hud">
              <span class="hud-chip" id="modeCopy">${MODE_LABELS[viewMode]}</span>
              <span class="hud-chip">左上 = meta</span>
              <span class="hud-chip">外周 = 再帰責務</span>
              <span class="hud-chip" id="renderState">cache ${this.renderStats.sceneBuilds || 0} · rAF</span>
              <span class="actor-legend" aria-label="責務カテゴリ">
                ${ACTORS.map((actor) => html`<span class="hud-chip actor-chip" style=${`color:${actorColor(actor, 1)}`}><i class="actor-dot"></i>${actor}</span>`)}
              </span>
            </div>
          </section>

          <aside class=${`inspector ${inspectorVisible ? 'show' : ''}`} id="tip" aria-live="polite">${this.renderInspector()}</aside>
        </main>

        ${this.renderTimeline()}
      </div>
      <div class=${`toast ${this.toastVisible ? 'show' : ''}`} id="toast">${toast.message || ''}</div>
      <div class="machine" aria-hidden="true">
        <span id="visibleNodes">${snapshot.counts?.nodes || 0}</span><span id="visibleEdges">${snapshot.counts?.edges || 0}</span><span id="guardText">${guard.text || ''}</span>
        <span id="opsState">${operations.length}</span><span id="responsibilityState">${JSON.stringify(this.currentComposition())}</span>
      </div>
    `;
  }

  debugState() {
    const snapshot = this.snapshot;
    const renderer = this.renderer?.debugState() || {};
    return {
      version: 'v6-a2ui-source-ui-refactor',
      t: snapshot.t,
      currentPurpose: snapshot.currentPurposeId ? snapshot.currentPurpose : null,
      guard: snapshot.guard?.status,
      guardText: snapshot.guard?.text,
      nextOwner: snapshot.guard?.owner,
      visibleNodes: snapshot.counts?.nodes || 0,
      visibleEdges: snapshot.counts?.edges || 0,
      roleNodeCount: snapshot.counts?.roleNodes || 0,
      responsibilityComposition: (snapshot.currentComposition || []).map((entry) => ({actor: entry.actor, ratio: Math.round(Number(entry.ratio || 0) * 1000) / 1000})),
      totalOpsRecorded: Array.isArray(this.props.operations) ? this.props.operations.length : 0,
      tipVisible: Boolean(this.selection) || !window.matchMedia('(max-width:760px)').matches,
      lastEvent: snapshot.lastEvent?.type || null,
      metaOrder: (snapshot.nodes || [])
        .filter((node) => node.kind === 'purpose' || node.contract || node.id === snapshot.currentPurposeId)
        .map((node) => ({id: node.id, label: node.label, rank: node.metaRank, x: Math.round(node.x), y: Math.round(node.y), actor: node.actor, status: node.status}))
        .sort((first, second) => first.rank - second.rank || first.x - second.x),
      ...renderer,
    };
  }
}

if (!customElements.get('purpose-atlas-source-surface')) {
  customElements.define('purpose-atlas-source-surface', AtlasSourceSurfaceElement);
}

export const AtlasSourceSurface = {...AtlasSourceSurfaceApi, tagName: 'purpose-atlas-source-surface'};
