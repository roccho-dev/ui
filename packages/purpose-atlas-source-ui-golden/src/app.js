import {LitElement, html, css, nothing} from 'lit';
import {A2uiSurface} from '@a2ui/lit/v0_9';
import {AtlasRuntime} from './runtime/atlas-runtime.js';

void A2uiSurface;

export class PurposeAtlasApp extends LitElement {
  static properties = {
    surface: {state: true},
    error: {state: true},
  };

  static styles = css`
    :host { display: block; height: 100%; min-height: 0; }
    a2ui-surface { display: block; height: 100%; min-height: 0; }
    .loading, .error { height: 100%; display: grid; place-items: center; padding: 24px; color: var(--atlas-muted); }
    .loading div, .error div { max-width: 560px; border: 1px solid var(--atlas-border); background: var(--atlas-panel); border-radius: 18px; padding: 18px; box-shadow: var(--atlas-shadow); }
    .error { color: #ffc7d3; }
  `;

  constructor() {
    super();
    this.surface = null;
    this.error = null;
    this.runtime = new AtlasRuntime({
      onSurface: (surface) => { this.surface = surface; },
      onError: (error) => { this.error = error; },
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.runtime.init().then((surface) => {
      this.surface = surface;
      window.__purposeAtlas = {
        runtime: this.runtime,
        getState: () => this.runtime.debugState(),
        getUiState: () => window.__purposeAtlasSourceSurface?.debugState?.() || null,
        getCapabilities: () => this.runtime.processor.getClientCapabilities({includeInlineCatalogs: true}),
        getClientDataModel: () => this.runtime.processor.getClientDataModel(),
      };
      if (window.__purposeAtlasSourceSurface) window.__purposeAtlas.ui = window.__purposeAtlasSourceSurface;
    }).catch((error) => { this.error = error; });
  }

  disconnectedCallback() {
    this.runtime.dispose();
    super.disconnectedCallback();
  }

  render() {
    if (this.error) return html`<div class="error"><div><b>A2UI surface error</b><br>${this.error.message}</div></div>`;
    if (!this.surface) return html`<div class="loading"><div>A2UI JSONLを読み込み、Purpose Atlas surfaceを構築しています…</div></div>`;
    return html`<a2ui-surface .surface=${this.surface}><div slot="loading">surface loading…</div></a2ui-surface>`;
  }
}

if (!customElements.get('purpose-atlas-app')) customElements.define('purpose-atlas-app', PurposeAtlasApp);
