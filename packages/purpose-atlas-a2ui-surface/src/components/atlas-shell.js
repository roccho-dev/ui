import {html, css, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';

import {AtlasShellApi} from '../a2ui/apis.js';

export class AtlasShellElement extends A2uiLitElement {
  static styles = css`
    :host { display: block; height: 100%; min-height: 0; }
    .shell {
      height: 100%; min-height: 0; display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 10px; padding: 10px;
    }
    .workspace {
      min-height: 0; display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(310px, 360px);
      gap: 10px;
    }
    .canvas, .inspector { min-width: 0; min-height: 0; }
    @media (max-width: 900px) {
      .shell { padding: 8px; gap: 8px; }
      .workspace { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(238px, 34vh); }
    }
  `;

  createController() { return new A2uiController(this, AtlasShellApi); }

  render() {
    const props = this.controller?.props;
    if (!props) return nothing;
    return html`
      <main class="shell" data-a2ui-root>
        <div class="header">${this.renderNode(props.header)}</div>
        <div class="toolbar">${this.renderNode(props.toolbar)}</div>
        <section class="workspace">
          <div class="canvas">${this.renderNode(props.canvas)}</div>
          <div class="inspector">${this.renderNode(props.inspector)}</div>
        </section>
        ${this.renderNode(props.toast)}
      </main>
    `;
  }
}

if (!customElements.get('purpose-atlas-shell')) customElements.define('purpose-atlas-shell', AtlasShellElement);
export const AtlasShell = {...AtlasShellApi, tagName: 'purpose-atlas-shell'};
