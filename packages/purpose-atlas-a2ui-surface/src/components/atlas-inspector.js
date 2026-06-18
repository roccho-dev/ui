import {html, css, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';
import {LAYER_COLORS, ACTOR_LAYER, ROLES} from '../domain/atlas-engine.js';
import {AtlasInspectorApi} from '../a2ui/apis.js';

function actorColor(actor) { return LAYER_COLORS[ACTOR_LAYER[actor] || 'ceo'] || '#93a6c9'; }
const OP_ICON = {mismatch: '⚠', request: '👤', hold: '⏸'};

export class AtlasInspectorElement extends A2uiLitElement {
  static styles = css`
    :host { display: block; height: 100%; min-height: 0; }
    .panel { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--atlas-border); border-radius: 18px; background: var(--atlas-panel); box-shadow: var(--atlas-shadow); overflow: hidden; }
    .head { padding: 14px; border-bottom: 1px solid rgba(170,195,255,.12); }
    .kicker { color: var(--atlas-muted); font-size: 11px; font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }
    h2 { margin: 4px 0 5px; font-size: 20px; line-height: 1.15; }
    p { margin: 0; color: var(--atlas-muted); font-size: 12px; line-height: 1.48; }
    .body { padding: 12px 14px 18px; overflow: auto; }
    .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .pill { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.045); border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 800; }
    .section { margin: 15px 0 0; }
    h3 { margin: 0 0 7px; font-size: 12px; color: #dbe7ff; letter-spacing: .03em; }
    .guard { padding: 10px; border: 1px solid rgba(255,209,102,.23); border-radius: 13px; background: rgba(255,209,102,.065); }
    .guard.ok { border-color: rgba(136,240,189,.24); background: rgba(136,240,189,.06); }
    .guard b { display: block; font-size: 12px; margin-bottom: 3px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 12px; }
    button { appearance: none; min-height: 36px; border-radius: 11px; border: 1px solid rgba(170,195,255,.17); background: rgba(255,255,255,.055); color: var(--atlas-ink); font: inherit; font-size: 11px; font-weight: 850; cursor: pointer; padding: 7px 8px; }
    button:hover { background: rgba(127,176,255,.14); }
    button.primary { background: rgba(127,176,255,.15); border-color: rgba(127,176,255,.34); }
    button.warn { background: rgba(255,209,102,.1); border-color: rgba(255,209,102,.28); }
    .list { display: grid; gap: 6px; }
    .item { padding: 8px 9px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); border-radius: 11px; font-size: 11px; line-height: 1.42; }
    .item small { color: var(--atlas-muted); }
    .coverage { display: flex; flex-wrap: wrap; gap: 5px; }
    .cxo { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px; }
    .cxo .item { min-width: 0; }
    .eventbox { white-space: pre-wrap; font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #b8c8e3; }
    .clear { float: right; width: 28px; min-height: 28px; border-radius: 999px; padding: 0; }
    @media (max-width: 900px) { .body { padding-bottom: 12px; } .actions { grid-template-columns: repeat(4, minmax(0,1fr)); } .section.secondary { display: none; } }
    @media (max-width: 570px) { .actions { grid-template-columns: 1fr 1fr; } }
  `;

  createController() { return new A2uiController(this, AtlasInspectorApi); }

  render() {
    const p = this.controller?.props;
    if (!p) return nothing;
    const details = p.details || {title: '選択なし', copy: ''};
    const guard = p.guard || {status: 'warn', text: '確認中', owner: 'CEO', action: ''};
    const operations = Array.isArray(p.operations) ? p.operations : [];
    const eventLog = Array.isArray(p.eventLog) ? p.eventLog : [];
    const cxo = p.cxo || {};
    return html`
      <aside class="panel" aria-label="Selection inspector">
        <div class="head">
          ${details.type !== 'none' ? html`<button class="clear" title="選択解除" @click=${p.onClearSelection}>×</button>` : nothing}
          <div class="kicker">Inspector / A2UI data binding</div>
          <h2>${details.title || '選択なし'}</h2>
          <p>${details.copy || 'nodeを選択してください。'}</p>
          <div class="row">${(details.chips || []).map((chip) => html`<span class="pill" style=${chip.actor ? `border-color:${actorColor(chip.actor)}66` : ''}>${chip.label}</span>`)}</div>
        </div>
        <div class="body">
          <section class=${`guard ${guard.status === 'ok' ? 'ok' : ''}`}>
            <b>${guard.status === 'ok' ? 'Purpose integrity: 一致' : 'Purpose integrity: 要判断'}</b>
            <p>${guard.text}${guard.action ? ` · ${guard.action}` : ''}</p>
            <div class="row"><span class="pill">owner ${guard.owner || 'CEO'}</span><span class="pill">last ${p.lastEvent || '初期投影'}</span></div>
          </section>

          ${(details.coverage || []).length ? html`<section class="section"><h3>責務が覆う要素</h3><div class="coverage">${details.coverage.map((item) => html`<span class="pill">${item}</span>`)}</div></section>` : nothing}

          <div class="actions">
            <button class="warn" data-action="record-mismatch" @click=${p.onRecordMismatch}>ズレとして記録</button>
            <button class="primary" data-action="request-owner" @click=${p.onRequestOwner}>担当へ検査依頼</button>
            <button data-action="hold-decision" @click=${p.onHoldDecision}>CEO判断待ち</button>
            <button data-action="step-forward" @click=${p.onStepForward}>Step JSONL</button>
          </div>

          <section class="section">
            <h3>操作記録</h3>
            <div class="list">${operations.length ? operations.slice(0, 6).map((item) => html`<div class="item"><b>${OP_ICON[item.kind] || '•'} ${item.label}</b><br><small>t${item.t} · ${item.owner} → ${item.target}</small></div>`) : html`<div class="item"><small>まだ記録はありません。A2UI action は重複排除してDataModelへ反映されます。</small></div>`}</div>
          </section>

          <section class="section secondary">
            <h3>責務アクティビティ</h3>
            <div class="cxo">${ROLES.map((role) => html`<div class="item"><b style=${`color:${actorColor(role)}`}>${role} · ${cxo[role]?.count || 0}</b><br><small>${cxo[role]?.latest || '未受信'}</small></div>`)}</div>
          </section>

          <section class="section secondary"><h3>Event projection</h3><div class="item eventbox">${eventLog.length ? eventLog.join('\n') : 't0 初期投影'}</div></section>
        </div>
      </aside>
    `;
  }
}

if (!customElements.get('purpose-atlas-inspector')) customElements.define('purpose-atlas-inspector', AtlasInspectorElement);
export const AtlasInspector = {...AtlasInspectorApi, tagName: 'purpose-atlas-inspector'};
