import {html, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';
import {A2uiSduiSurfaceApi, AtlasSourceSurfaceApi} from '../a2ui/apis.js';
import {CachedAtlasRenderer} from '../ui/cached-atlas-renderer.js';

const FORBIDDEN_CSS = /@import|url\s*\(|expression\s*\(/i;
const KEY_RE = /\{\{\s*([a-zA-Z0-9_./-]+)\s*\}\}/g;
const DEFAULT_DOC = Object.freeze({styles: {css: ''}, tree: {type: 'box', children: [{type: 'text', text: 'A2UI SDUI document missing'}]}});

function cleanCss(css) {
  const text = String(css || '');
  if (FORBIDDEN_CSS.test(text)) throw new Error('A2UI SDUI css contains a forbidden token');
  return text;
}
function parts(path) { return String(path || '').replace(/^\//, '').split(/[./]/).filter(Boolean); }
function read(ctx, path) {
  const keys = parts(path);
  let value = keys[0] === 'item' ? ctx.item : keys[0] === 'index' ? ctx.index : ctx.props;
  if (keys[0] === 'item' || keys[0] === 'index') keys.shift();
  for (const key of keys) value = value?.[key];
  return value;
}
function text(ctx, value) {
  if (value && typeof value === 'object' && 'path' in value) return read(ctx, value.path) ?? value.fallback ?? '';
  return String(value ?? '').replace(KEY_RE, (_, path) => {
    const found = read(ctx, path);
    return found == null ? '' : typeof found === 'object' ? JSON.stringify(found) : String(found);
  });
}
function cls(ctx, node) { return text(ctx, node.className || node.class || '').trim(); }
function selectionKey(value) { return value?.nodeId ? `${value.type || 'node'}:${value.nodeId}:${value.actor || ''}` : ''; }
function activeNodes(snapshot, kind) { return (snapshot.nodes || []).filter((node) => (!kind || node.kind === kind) && node.status !== 'archived'); }
function firstNode(snapshot, kind) { return activeNodes(snapshot, kind)[0] || null; }
function asText(value) { return Array.isArray(value) ? value.join(' / ') : value == null ? '' : String(value); }
function nodeById(snapshot, id) { return (snapshot.nodes || []).find((item) => item.id === id) || null; }
function relatedWorkOrder(snapshot, gap) {
  const orders = activeNodes(snapshot, 'work_order');
  if (!gap) return orders[0] || null;
  return orders.find((node) => node.primary_gap_id === gap.id || node.gap_id === gap.id || node.gapId === gap.id) || orders[0] || null;
}
function relatedReceipt(snapshot, workOrder) {
  const receipts = activeNodes(snapshot, 'receipt');
  if (!workOrder) return receipts[0] || null;
  return receipts.find((node) => node.work_order_id === workOrder.id || node.workOrderId === workOrder.id) || receipts[0] || null;
}
function relatedResidual(snapshot, receipt) {
  const residuals = activeNodes(snapshot, 'residual');
  if (!receipt) return residuals[0] || null;
  return residuals.find((node) => node.receipt_id === receipt.id || node.receiptId === receipt.id) || residuals[0] || null;
}

export class A2uiSduiSurfaceElement extends A2uiLitElement {
  static properties = {hoverSelection: {state: true}, renderStats: {state: true}, toastVisible: {state: true}};
  constructor() {
    super();
    this.hoverSelection = null;
    this.renderStats = {sceneBuilds: 0, frames: 0};
    this.toastVisible = false;
    this.renderer = null;
    this.stage = null;
    this.toastTimer = null;
    this.lastToastNonce = null;
  }
  createController() { return new A2uiController(this, A2uiSduiSurfaceApi); }
  get props() { return this.controller?.props || {}; }
  get document() { return this.props.document || DEFAULT_DOC; }
  get snapshot() { return this.props.snapshot || {}; }
  get selection() { return this.props.selection?.nodeId ? this.props.selection : null; }
  firstUpdated() { window.__purposeAtlasSourceSurface = this; this.ensureStage(); }
  updated() { this.ensureStage(); this.updateStage(); this.updateToast(); if (window.__purposeAtlas) window.__purposeAtlas.ui = this; }
  disconnectedCallback() {
    this.renderer?.dispose();
    clearTimeout(this.toastTimer);
    if (window.__purposeAtlasSourceSurface === this) delete window.__purposeAtlasSourceSurface;
    super.disconnectedCallback();
  }
  ensureStage() {
    const stage = this.renderRoot.querySelector('[data-sdui-port="atlasStage"]');
    if (!stage) { this.renderer?.dispose(); this.renderer = null; this.stage = null; return; }
    if (stage === this.stage && this.renderer) return;
    this.renderer?.dispose();
    this.stage = stage;
    this.renderer = new CachedAtlasRenderer({
      stage,
      sceneCanvas: stage.querySelector('[data-sdui-canvas="scene"]'),
      overlayCanvas: stage.querySelector('[data-sdui-canvas="overlay"]'),
      onViewport: (viewport) => this.props.setViewport?.({...viewport}),
      onSelection: (selection) => this.commitSelection(selection),
      onHover: (selection) => this.setHover(selection),
      onStats: (stats) => { this.renderStats = stats; this.requestUpdate(); },
    });
  }
  updateStage() {
    this.renderer?.update({snapshot: this.snapshot, viewMode: this.props.viewMode, viewport: this.props.viewport, selection: this.selection});
  }
  updateToast() {
    const toast = this.props.toast || {};
    if (toast.nonce === this.lastToastNonce) return;
    this.lastToastNonce = toast.nonce;
    clearTimeout(this.toastTimer);
    this.toastVisible = Boolean(toast.message);
    if (this.toastVisible) this.toastTimer = window.setTimeout(() => { this.toastVisible = false; this.requestUpdate(); }, 1450);
  }
  commitSelection(selection) { this.hoverSelection = null; this.props.setSelection?.(selection ? {...selection} : null); queueMicrotask(() => this.props.onSelect?.()); this.requestUpdate(); }
  setHover(selection) { if (selectionKey(selection) === selectionKey(this.hoverSelection)) return; this.hoverSelection = selection ? {...selection} : null; this.requestUpdate(); }
  setBound(name, value, action) { this.props[`set${name[0].toUpperCase()}${name.slice(1)}`]?.(value); if (action) queueMicrotask(() => this.props[action]?.()); }
  invoke(action) { this.props[action]?.(); }
  ctx(extra = {}) {
    const focus = this.selection || this.hoverSelection;
    const selected = nodeById(this.snapshot, focus?.nodeId);
    const selectedGap = selected?.kind === 'gap' ? selected : firstNode(this.snapshot, 'gap');
    const workOrder = selected?.kind === 'work_order' ? selected : relatedWorkOrder(this.snapshot, selectedGap);
    const receipt = selected?.kind === 'receipt' ? selected : relatedReceipt(this.snapshot, workOrder);
    const residual = selected?.kind === 'residual' ? selected : relatedResidual(this.snapshot, receipt);
    const node = selected || nodeById(this.snapshot, focus?.nodeId);
    return {
      props: {
        ...this.props,
        focus,
        selected,
        selectedKind: selected?.kind || '',
        selectedRoute: selected?.route || selectedGap?.route || '',
        selectedSummary: selected?.summary || selectedGap?.summary || '',
        selectedIdeal: selectedGap?.ideal || selectedGap?.ideal_ref || '',
        selectedCurrent: selectedGap?.current || selectedGap?.current_ref || '',
        selectedDelta: selectedGap?.delta || selectedGap?.summary || '',
        selectedOwnerRole: selectedGap?.owner_role || selectedGap?.actorCategory || '',
        selectedProofRequirement: selectedGap?.proof_requirement || selectedGap?.proof || '',
        selectedWorkOrderLabel: workOrder?.label || '',
        selectedWorkOrderScope: asText(workOrder?.scope || workOrder?.scope_text),
        selectedWorkOrderNonScope: asText(workOrder?.non_scope || workOrder?.non_scope_text),
        selectedWorkOrderRoute: workOrder?.route || '',
        selectedWorkOrderDependency: asText(workOrder?.dependency || workOrder?.dependencies),
        selectedWorkOrderClosureCriteria: asText(workOrder?.closure_criteria || workOrder?.closure_criteria_text),
        receiptStatus: receipt?.status || '',
        receiptClosed: asText(receipt?.closed || receipt?.closed_text),
        receiptReduced: asText(receipt?.reduced || receipt?.reduced_text),
        receiptResiduals: asText(receipt?.residuals || receipt?.residual_text),
        residualLabel: residual?.label || residual?.id || '',
        residualNextInput: residual?.next_input || residual?.next || '',
        closureObjectKind: selected?.kind || selectedGap?.kind || '',
        inspectorTitle: node?.label || this.snapshot.currentPurpose || '目的未設定',
        guardText: this.snapshot.guard?.text || '',
        guardOwner: this.snapshot.guard?.owner || 'CEO',
        guardStatus: this.snapshot.guard?.status || 'warn',
        nodeCount: this.snapshot.counts?.nodes || 0,
        edgeCount: this.snapshot.counts?.edges || 0,
        activeGapCount: activeNodes(this.snapshot, 'gap').length,
        renderSceneBuilds: this.renderStats.sceneBuilds || 0,
      },
      ...extra,
    };
  }
  renderNode(node, ctx) {
    if (!node) return nothing;
    if (node.when && !read(ctx, node.when)) return nothing;
    if (node.type === 'box') return html`<div class=${cls(ctx, node)}>${(node.children || []).map((child) => this.renderNode(child, ctx))}</div>`;
    if (node.type === 'text') return html`<span class=${cls(ctx, node)}>${text(ctx, node.text)}</span>`;
    if (node.type === 'button') return html`<button class=${cls(ctx, node)} type="button" aria-label=${node.ariaLabel || nothing} @click=${() => this.invoke(node.action)}>${text(ctx, node.text)}</button>`;
    if (node.type === 'segmented') return html`<div class=${cls(ctx, node)} role="tablist">${(node.options || []).map((option) => html`<button type="button" role="tab" aria-selected=${read(ctx, node.bind) === option.value ? 'true' : 'false'} @click=${() => this.setBound(node.bind, option.value, node.onChange)}>${option.label}</button>`)}</div>`;
    if (node.type === 'slider') return html`<input class=${cls(ctx, node)} type="range" min=${node.min ?? 0} max=${read(ctx, node.maxPath) ?? 0} step=${node.step ?? 1} .value=${String(read(ctx, node.bind) ?? 0)} @input=${(event) => this.setBound(node.bind, Number(event.currentTarget.value), node.onInput)}>`;
    if (node.type === 'repeat') return html`${(read(ctx, node.itemsPath) || []).slice(0, node.limit || 50).map((item, index) => this.renderNode(node.template, {...ctx, item, index}))}`;
    if (node.type === 'port' && node.port === 'atlasStage') return html`<div class=${cls(ctx, node)} data-sdui-port="atlasStage"><canvas data-sdui-canvas="scene" aria-hidden="true"></canvas><canvas data-sdui-canvas="overlay" tabindex="0" role="application" aria-label="ドラッグで移動、ホイールで拡大縮小、nodeをクリックして詳細を表示"></canvas></div>`;
    return nothing;
  }
  render() {
    if (!this.controller?.props) return nothing;
    const css = cleanCss(this.document.styles?.css);
    return html`<style>${css}</style>${this.renderNode(this.document.tree, this.ctx())}<div class=${`sdui-toast ${this.toastVisible ? 'show' : ''}`}>${this.props.toast?.message || ''}</div><div class="sdui-machine" aria-hidden="true"><span id="visibleNodes">${this.snapshot.counts?.nodes || 0}</span><span id="visibleEdges">${this.snapshot.counts?.edges || 0}</span><span id="guardText">${this.snapshot.guard?.text || ''}</span></div>`;
  }
  debugState() {
    return {version: 'v6-a2ui-sdui-closure-ui', t: this.snapshot.t, currentPurpose: this.snapshot.currentPurpose || null, guard: this.snapshot.guard?.status, visibleNodes: this.snapshot.counts?.nodes || 0, visibleEdges: this.snapshot.counts?.edges || 0, activeGapCount: activeNodes(this.snapshot, 'gap').length, tipVisible: Boolean(this.selection), selectedKind: this.selection?.nodeId ? nodeById(this.snapshot, this.selection.nodeId)?.kind || null : null, ...(this.renderer?.debugState() || {})};
  }
}
if (!customElements.get('a2ui-sdui-surface')) customElements.define('a2ui-sdui-surface', A2uiSduiSurfaceElement);
export const A2uiSduiSurface = {...A2uiSduiSurfaceApi, tagName: 'a2ui-sdui-surface'};
export const AtlasSourceSurface = {...AtlasSourceSurfaceApi, tagName: 'a2ui-sdui-surface'};
