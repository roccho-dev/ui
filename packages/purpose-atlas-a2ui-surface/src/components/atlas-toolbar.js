import {html, css, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';

import {AtlasToolbarApi} from '../a2ui/apis.js';

export class AtlasToolbarElement extends A2uiLitElement {
  static styles = css`
    :host { display: block; }
    .bar { display: grid; grid-template-columns: auto minmax(160px, 1fr) auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--atlas-border); border-radius: 17px; background: var(--atlas-panel); box-shadow: var(--atlas-shadow); backdrop-filter: blur(14px); }
    .group { display: flex; align-items: center; gap: 6px; min-width: 0; }
    button { appearance: none; border: 1px solid rgba(170,195,255,.16); color: var(--atlas-ink); background: rgba(255,255,255,.055); border-radius: 999px; min-width: 34px; height: 34px; padding: 0 10px; font: inherit; font-size: 12px; font-weight: 850; cursor: pointer; }
    button:hover { background: rgba(127,176,255,.14); }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--atlas-info); outline-offset: 2px; }
    button.active { background: rgba(127,176,255,.2); border-color: rgba(127,176,255,.5); color: #fff; }
    .timeline { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; align-items: center; }
    input[type=range] { width: 100%; accent-color: var(--atlas-info); }
    .ticks { grid-column: 1 / -1; height: 8px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; overflow: hidden; }
    .tick { min-width: 0; width: auto; height: 8px; padding: 0; border-radius: 2px; border: 0; background: rgba(255,255,255,.1); }
    .tick.done { background: rgba(127,176,255,.42); }
    .tick.now { background: #fff; box-shadow: 0 0 10px rgba(255,255,255,.8); }
    .tick.key { outline: 1px solid rgba(255,209,102,.65); }
    .step { color: var(--atlas-muted); font-size: 11px; font-weight: 850; min-width: 48px; text-align: right; }
    .modes { justify-content: flex-end; }
    @media (max-width: 980px) { .bar { grid-template-columns: 1fr; } .modes { justify-content: flex-start; overflow-x: auto; } }
    @media (max-width: 560px) { button span { display: none; } .timeline { grid-template-columns: 1fr auto; } }
  `;

  createController() { return new A2uiController(this, AtlasToolbarApi); }

  commitStep(value) {
    const p = this.controller.props;
    const next = Math.max(0, Math.min(Number(p.maxStep || 0), Number(value) || 0));
    p.setStep?.(next);
    queueMicrotask(() => p.onStepChanged?.());
  }

  commitMode(mode) {
    const p = this.controller.props;
    p.setViewMode?.(mode);
    queueMicrotask(() => p.onModeChanged?.());
  }

  render() {
    const p = this.controller?.props;
    if (!p) return nothing;
    const step = Number(p.step || 0);
    const maxStep = Number(p.maxStep || 0);
    const events = Array.isArray(p.events) ? p.events : [];
    const keys = new Set([2, 7, 20, 39]);
    const modes = [
      ['all', '統合'], ['purpose', '目的'], ['responsibility', '責務'], ['risk', '不整合'],
    ];
    return html`
      <nav class="bar" aria-label="Purpose Atlas controls">
        <div class="group">
          <button data-action="reset" title="reset" @click=${p.onReset}>↺ <span>reset</span></button>
          <button data-action="previous" title="previous step" @click=${p.onPrevious}>←</button>
          <button data-action="play" title=${p.playing ? 'pause' : 'play'} @click=${p.onTogglePlay}>${p.playing ? 'Ⅱ' : '▶'}</button>
          <button data-action="next" title="next step" @click=${p.onNext}>→</button>
        </div>
        <div class="timeline">
          <input data-action="timeline" type="range" min="0" max=${maxStep} .value=${String(step)} aria-label="timeline step" @input=${(event) => this.commitStep(event.currentTarget.value)}>
          <span class="step">t${step}/${maxStep}</span>
          <div class="ticks" aria-hidden="true">
            ${Array.from({length: maxStep}, (_, i) => i + 1).map((t) => html`<button tabindex="-1" class=${`tick ${t <= step ? 'done' : ''} ${t === step ? 'now' : ''} ${keys.has(t) ? 'key' : ''}`} title=${`t${t} ${events[t - 1]?.label || events[t - 1]?.type || ''}`} @click=${() => this.commitStep(t)}></button>`)}
          </div>
        </div>
        <div class="group modes">
          ${modes.map(([id, label]) => html`<button data-mode=${id} class=${p.viewMode === id ? 'active' : ''} aria-pressed=${p.viewMode === id ? 'true' : 'false'} @click=${() => this.commitMode(id)}>${label}</button>`)}
          <button data-action="zoom-out" title="zoom out" @click=${p.onZoomOut}>−</button>
          <button data-action="fit" title="fit" @click=${p.onFit}>fit</button>
          <button data-action="zoom-in" title="zoom in" @click=${p.onZoomIn}>＋</button>
        </div>
      </nav>
    `;
  }
}

if (!customElements.get('purpose-atlas-toolbar')) customElements.define('purpose-atlas-toolbar', AtlasToolbarElement);
export const AtlasToolbar = {...AtlasToolbarApi, tagName: 'purpose-atlas-toolbar'};
