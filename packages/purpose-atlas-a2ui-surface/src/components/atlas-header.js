import {html, css, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';
import {LAYER_COLORS, ACTOR_LAYER} from '../domain/atlas-engine.js';
import {AtlasHeaderApi} from '../a2ui/apis.js';

function actorColor(actor) { return LAYER_COLORS[ACTOR_LAYER[actor] || 'ceo'] || '#93a6c9'; }

export class AtlasHeaderElement extends A2uiLitElement {
  static styles = css`
    :host { display: block; }
    .header {
      display: grid; grid-template-columns: minmax(0, 1fr) auto;
      align-items: center; gap: 16px; padding: 13px 15px;
      border: 1px solid var(--atlas-border);
      border-radius: 18px; background: var(--atlas-panel);
      box-shadow: var(--atlas-shadow); backdrop-filter: blur(14px);
    }
    .eyebrow { color: var(--atlas-muted); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; font-weight: 800; }
    h1 { margin: 3px 0 0; font-size: clamp(18px, 2vw, 24px); line-height: 1.08; letter-spacing: -.025em; overflow-wrap: anywhere; }
    .right { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
    .pill { display: inline-flex; align-items: center; gap: 6px; min-height: 29px; padding: 0 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); font-size: 11px; font-weight: 850; white-space: nowrap; }
    .pill.ok { color: #baffd8; border-color: rgba(136,240,189,.35); background: rgba(136,240,189,.1); }
    .pill.warn { color: #ffe7a0; border-color: rgba(255,209,102,.38); background: rgba(255,209,102,.1); }
    .composition { display: flex; align-items: center; gap: 3px; height: 29px; padding: 0 7px; border-radius: 999px; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.16); }
    .segment { display: block; height: 8px; min-width: 6px; border-radius: 999px; }
    @media (max-width: 700px) {
      .header { grid-template-columns: 1fr; gap: 9px; }
      .right { justify-content: flex-start; }
      .pill.optional { display: none; }
    }
  `;

  createController() { return new A2uiController(this, AtlasHeaderApi); }

  render() {
    const p = this.controller?.props;
    if (!p) return nothing;
    const guard = p.guard || {status: 'warn', text: '確認中'};
    const counts = p.counts || {};
    const composition = Array.isArray(p.composition) ? p.composition : [];
    return html`
      <header class="header">
        <div>
          <div class="eyebrow">${p.subtitle || 'Purpose Decision Atlas'} · ${p.protocol || 'A2UI v0.9'}</div>
          <h1>${p.title || '未設定'}</h1>
        </div>
        <div class="right" aria-label="Atlas status">
          <span class="pill ${guard.status === 'ok' ? 'ok' : 'warn'}">${guard.status === 'ok' ? '✓ 一致' : '⚠ ズレあり'}</span>
          <span class="pill">t${p.step ?? 0}/${p.maxStep ?? 0}</span>
          <span class="pill optional">${counts.nodes ?? 0} nodes · ${counts.edges ?? 0} edges</span>
          <span class="composition" title="責務構成" aria-label="責務構成">
            ${composition.length ? composition.map((entry) => html`<i class="segment" style=${`width:${Math.max(6, Math.round((entry.ratio || 0) * 46))}px;background:${actorColor(entry.actor)}`} title=${`${entry.actor} ${Math.round((entry.ratio || 0) * 100)}%`}></i>`) : html`<span class="eyebrow">responsibility —</span>`}
          </span>
        </div>
      </header>
    `;
  }
}

if (!customElements.get('purpose-atlas-header')) customElements.define('purpose-atlas-header', AtlasHeaderElement);
export const AtlasHeader = {...AtlasHeaderApi, tagName: 'purpose-atlas-header'};
