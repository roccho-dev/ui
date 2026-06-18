import {MessageProcessor} from '@a2ui/web_core/v0_9';
import {atlasCatalog} from '../a2ui/catalog.js';
import {validateAtlasMessages} from '../a2ui/validate-messages.js';
import {buildSnapshot, describeSelection, EVENTS, labelFromId} from '../domain/atlas-engine.js';

export const SURFACE_ID = 'purpose-atlas';

function boundedStep(value) {
  return Math.max(0, Math.min(EVENTS.length, Number(value) || 0));
}

function defaultViewport() {
  return {initialized: false, zoom: 1, panX: 0, panY: 0, fitNonce: 0};
}

export async function loadA2uiJsonl(url) {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`A2UI JSONL load failed: ${response.status} ${response.statusText}`);
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid A2UI JSONL at line ${index + 1}: ${error.message}`); }
    });
}

export class AtlasRuntime {
  constructor({onSurface, onError} = {}) {
    this.onSurface = onSurface;
    this.onError = onError;
    this.surface = null;
    this.step = 0;
    this.playing = false;
    this.viewMode = 'all';
    this.viewport = defaultViewport();
    this.selection = null;
    this.operations = [];
    this.operationKeys = new Set();
    this.toastNonce = 0;
    this.toastMessage = '';
    this.timer = null;
    this.lastAction = null;
    this.processor = new MessageProcessor([atlasCatalog], (action) => this.handleAction(action));
    this.surfaceSubscription = this.processor.onSurfaceCreated((surface) => {
      if (surface.id !== SURFACE_ID) return;
      this.surface = surface;
      this.onSurface?.(surface);
    });
  }

  async init() {
    try {
      const messages = await loadA2uiJsonl('./a2ui/purpose-atlas.surface.jsonl');
      validateAtlasMessages(messages);
      this.processor.processMessages(messages);
      if (!this.surface) this.surface = this.processor.model.getSurface(SURFACE_ID);
      if (!this.surface) throw new Error('A2UI surface was not created.');
      this.publish('initial projection');
      return this.surface;
    } catch (error) {
      this.onError?.(error);
      throw error;
    }
  }

  dispose() {
    this.stopPlayback(false);
    this.surfaceSubscription?.unsubscribe();
    this.processor.model.deleteSurface?.(SURFACE_ID);
  }

  syncFromDataModel() {
    if (!this.surface) return;
    const ui = this.surface.dataModel.get('/ui') || {};
    this.step = boundedStep(ui.step ?? this.step);
    this.playing = Boolean(ui.playing ?? this.playing);
    this.viewMode = ['all', 'purpose', 'responsibility', 'risk'].includes(ui.viewMode) ? ui.viewMode : this.viewMode;
    if (ui.viewport && typeof ui.viewport === 'object') this.viewport = {...defaultViewport(), ...ui.viewport};
    this.selection = ui.selection && typeof ui.selection === 'object' ? ui.selection : null;
  }

  dataModel() {
    const snapshot = buildSnapshot(this.step, {zoom: 1});
    const details = describeSelection(snapshot, this.selection);
    return {
      meta: {
        title: 'Purpose Decision Atlas v6',
        subtitle: 'Purpose × Responsibility / JSON-driven surface',
        protocol: 'A2UI v0.9',
        renderer: '@a2ui/lit 0.10.1',
        core: '@a2ui/web_core 0.10.1',
      },
      ui: {
        step: this.step,
        maxStep: EVENTS.length,
        playing: this.playing,
        viewMode: this.viewMode,
        viewport: {...this.viewport},
        selection: this.selection ? {...this.selection} : null,
      },
      atlas: snapshot,
      inspector: {details},
      events: EVENTS.map((event) => ({
        t: event.t,
        type: event.type,
        label: event.label || event.labelText || event.activity || event.type,
      })),
      operations: this.operations.map((item) => ({...item})),
      toast: {message: this.toastMessage, nonce: this.toastNonce},
      runtime: {
        lastAction: this.lastAction,
        capabilities: this.processor.getClientCapabilities(),
        clientDataModelEnabled: Boolean(this.processor.getClientDataModel()),
      },
    };
  }

  publish(toastMessage) {
    if (!this.surface) return;
    if (toastMessage) this.showToast(toastMessage, false);
    this.processor.processMessages([{
      version: 'v0.9',
      updateDataModel: {surfaceId: SURFACE_ID, path: '/', value: this.dataModel()},
    }]);
  }

  showToast(message, publish = true) {
    this.toastMessage = String(message || '');
    this.toastNonce += 1;
    if (publish && this.surface) {
      this.processor.processMessages([{
        version: 'v0.9',
        updateDataModel: {surfaceId: SURFACE_ID, path: '/toast', value: {message: this.toastMessage, nonce: this.toastNonce}},
      }]);
    }
  }

  setStep(value, message = null) {
    this.step = boundedStep(value);
    this.selection = null;
    if (this.surface) this.surface.dataModel.set('/ui/selection', null);
    this.publish(message || `t${this.step} を投影しました`);
  }

  togglePlayback() {
    if (this.timer) { this.stopPlayback(); return; }
    this.playing = true;
    this.publish('timeline再生');
    this.timer = window.setInterval(() => {
      if (this.step >= EVENTS.length) { this.stopPlayback(); return; }
      this.setStep(this.step + 1, `t${this.step + 1}`);
    }, 420);
  }

  stopPlayback(publish = true) {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (publish && this.surface) this.publish('timeline停止');
  }

  zoom(factor) {
    const zoom = Math.max(.32, Math.min(2.5, Number(this.viewport.zoom || 1) * factor));
    this.viewport = {...this.viewport, initialized: true, zoom};
    this.publish(`${Math.round(zoom * 100)}%`);
  }

  fit() {
    this.viewport = {...this.viewport, initialized: false, fitNonce: Number(this.viewport.fitNonce || 0) + 1};
    this.publish('地形を画面にfit');
  }

  recordOperation(kind) {
    const snapshot = buildSnapshot(this.step, {zoom: 1});
    const guard = snapshot.guard;
    const key = `${kind}:${this.step}:${guard.owner}:${guard.text}`;
    if (this.operationKeys.has(key)) {
      this.showToast('記録済み。同じ内容は再記録しません');
      return;
    }
    const labels = {
      mismatch: 'ズレとして記録',
      request: `${guard.owner}へ検査依頼`,
      hold: 'CEO判断待ち',
    };
    const item = {
      id: key,
      kind,
      t: this.step,
      owner: guard.owner,
      target: guard.missing?.[0] ? labelFromId(guard.missing[0]) : '—',
      label: labels[kind] || kind,
      selection: this.selection ? {...this.selection} : null,
      timestamp: new Date().toISOString(),
    };
    this.operationKeys.add(key);
    this.operations.unshift(item);
    this.operations = this.operations.slice(0, 12);
    this.publish(`記録: ${item.label}`);
  }

  handleAction(action) {
    this.lastAction = {...action};
    this.syncFromDataModel();
    switch (action.name) {
      case 'atlas.reset': this.stopPlayback(false); this.setStep(0, 'reset'); break;
      case 'atlas.previous': this.stopPlayback(false); this.setStep(this.step - 1); break;
      case 'atlas.next': this.stopPlayback(false); this.setStep(this.step + 1); break;
      case 'atlas.togglePlay': this.togglePlayback(); break;
      case 'atlas.stepChanged': this.stopPlayback(false); this.setStep(action.context?.step ?? this.step); break;
      case 'atlas.modeChanged':
        this.viewMode = ['all', 'purpose', 'responsibility', 'risk'].includes(action.context?.mode) ? action.context.mode : this.viewMode;
        this.publish(`表示: ${this.viewMode}`);
        break;
      case 'atlas.fit': this.fit(); break;
      case 'atlas.zoomIn': this.zoom(1.18); break;
      case 'atlas.zoomOut': this.zoom(1 / 1.18); break;
      case 'atlas.select': this.publish(); break;
      case 'atlas.clearSelection':
        this.selection = null;
        this.surface?.dataModel.set('/ui/selection', null);
        this.publish('選択解除');
        break;
      case 'atlas.recordMismatch': this.recordOperation('mismatch'); break;
      case 'atlas.requestOwner': this.recordOperation('request'); break;
      case 'atlas.holdDecision': this.recordOperation('hold'); break;
      case 'atlas.stepForward': this.setStep(this.step + 1); break;
      default: this.showToast(`Unhandled A2UI action: ${action.name}`); break;
    }
  }

  debugState() {
    return this.surface?.dataModel.get('/') || this.dataModel();
  }
}
