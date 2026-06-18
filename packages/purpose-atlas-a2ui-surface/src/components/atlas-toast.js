import {html, css, nothing} from 'lit';
import {A2uiController, A2uiLitElement} from '@a2ui/lit/v0_9';

import {AtlasToastApi} from '../a2ui/apis.js';

export class AtlasToastElement extends A2uiLitElement {
  static styles = css`
    :host { position: fixed; z-index: 50; left: 50%; bottom: 20px; transform: translateX(-50%); pointer-events: none; }
    .toast { max-width: min(460px, calc(100vw - 24px)); padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(170,195,255,.24); background: rgba(7,14,27,.94); box-shadow: 0 20px 55px rgba(0,0,0,.5); color: #edf5ff; font-size: 12px; font-weight: 850; animation: enter .18s ease-out, leave .24s ease-in 1.75s forwards; }
    @keyframes enter { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    @keyframes leave { to { opacity: 0; transform: translateY(5px) scale(.98); } }
  `;
  createController() { return new A2uiController(this, AtlasToastApi); }
  render() {
    const toast = this.controller?.props?.toast;
    if (!toast?.message) return nothing;
    return html`<div class="toast" role="status" aria-live="polite" data-nonce=${toast.nonce || 0}>${toast.message}</div>`;
  }
}
if (!customElements.get('purpose-atlas-toast')) customElements.define('purpose-atlas-toast', AtlasToastElement);
export const AtlasToast = {...AtlasToastApi, tagName: 'purpose-atlas-toast'};
