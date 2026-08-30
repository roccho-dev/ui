import { projectView } from '../protocol/index.js';
import { copyText, waitFor, waitForApp } from './shared.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-review: ${message}`);
}

function regionMap(snapshot) {
  return new Map(snapshot.regions.map((region) => [region.id, region]));
}

function relationMap(snapshot) {
  return new Map(snapshot.relations.map((relation) => [relation.id, relation]));
}

function boundsText(bounds) {
  if (!bounds) return '—';
  return `[${[bounds.x, bounds.y, bounds.width, bounds.height].map((value) => Number(value.toFixed(2))).join(', ')}]`;
}

function sourceText(value) {
  return value.length <= 160 ? value : `${value.slice(0, 120)}… (${value.length} chars)`;
}

function describeEntry(entry) {
  const operation = entry.operation;
  const beforeRegions = regionMap(entry.before);
  const afterRegions = regionMap(entry.after);
  const beforeRelations = relationMap(entry.before);
  const afterRelations = relationMap(entry.after);
  switch (operation.type) {
    case 'RenameRegion':
      return `RenameRegion · ${operation.regionId}: 「${beforeRegions.get(operation.regionId)?.label ?? '—'}」→「${afterRegions.get(operation.regionId)?.label ?? '—'}」`;
    case 'SetRegionOrder':
      return `SetRegionOrder · ${operation.regionId}: ${beforeRegions.get(operation.regionId)?.order ?? '—'} → ${afterRegions.get(operation.regionId)?.order ?? '—'}`;
    case 'SetRegionTemporal':
      return `SetRegionTemporal · ${operation.regionId}: ${JSON.stringify(beforeRegions.get(operation.regionId)?.temporal ?? null)} → ${JSON.stringify(afterRegions.get(operation.regionId)?.temporal ?? null)}`;
    case 'SetRegionLink':
      return `SetRegionLink · ${operation.regionId}: ${beforeRegions.get(operation.regionId)?.href ?? '—'} → ${afterRegions.get(operation.regionId)?.href ?? '—'}`;
    case 'AddRegion':
      return `AddRegion · ${operation.regionId} in ${afterRegions.get(operation.regionId)?.parent ?? '—'} · ${boundsText(afterRegions.get(operation.regionId)?.bounds)}`;
    case 'MoveRegions': {
      const id = operation.regionIds[0];
      return `MoveRegions · ${operation.regionIds.join(', ')} · ${boundsText(beforeRegions.get(id)?.bounds)} → ${boundsText(afterRegions.get(id)?.bounds)}`;
    }
    case 'ResizeRegions': {
      const id = operation.items[0]?.regionId;
      return `ResizeRegions · ${operation.items.map((item) => item.regionId).join(', ')} · ${boundsText(beforeRegions.get(id)?.bounds)} → ${boundsText(afterRegions.get(id)?.bounds)}`;
    }
    case 'PlaceTemporalRegions':
      return `PlaceTemporalRegions · ${operation.axis} · ${operation.items.map((item) => `${item.regionId}[${item.start}..${item.end}]@${item.actor ?? 'unassigned'}`).join(', ')}`;
    case 'ConnectRegions': {
      const relation = afterRelations.get(operation.relationId);
      return `ConnectRegions · ${relation?.from ?? operation.from} → ${relation?.to ?? operation.to} · ${relation?.label || relation?.kind || ''}`;
    }
    case 'MountRegionModule':
      return `MountRegionModule · ${operation.regionId} ← ${sourceText(operation.src)}`;
    case 'UnmountRegionModule':
      return `UnmountRegionModule · ${operation.regionId}`;
    case 'RemoveSelection': {
      const regions = operation.regionIds.filter((id) => beforeRegions.has(id) && !afterRegions.has(id));
      const relations = operation.relationIds.filter((id) => beforeRelations.has(id) && !afterRelations.has(id));
      return `RemoveSelection · region [${regions.join(', ')}] relation [${relations.join(', ')}]`;
    }
    default:
      return operation.type;
  }
}

async function install() {
  const app = await waitForApp();
  const runtime = await waitFor('semanticMapRuntime');
  const layer = document.getElementById('review-layer');
  const closeButton = document.getElementById('review-close');
  const status = document.getElementById('review-status');
  const previewPanel = document.getElementById('review-preview-panel');
  const diffList = document.getElementById('review-diff');
  const beforeHashOutput = document.getElementById('review-before-hash');
  const afterHashOutput = document.getElementById('review-after-hash');
  const beforeUrlOutput = document.getElementById('review-before-url');
  const afterUrlOutput = document.getElementById('review-after-url');
  const acceptButton = document.getElementById('review-accept');
  const rejectButton = document.getElementById('review-reject');
  const copyBeforeButton = document.getElementById('review-copy-before');
  const copyAfterButton = document.getElementById('review-copy-after');
  const sourceOutput = document.getElementById('review-source');
  const deliveryOutput = document.getElementById('review-delivery');
  let pending = null;
  let lastAccepted = null;

  function showStatus(message, kind = 'info') {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function open() {
    layer.hidden = false;
    setTimeout(() => {
      const target = !pending
        ? closeButton
        : !acceptButton.disabled
          ? acceptButton
          : !rejectButton.disabled
            ? rejectButton
            : closeButton;
      target.focus({ preventScroll: true });
    }, 30);
  }

  function close() {
    layer.hidden = true;
    document.getElementById('handoff-fab')?.focus({ preventScroll: true });
  }

  function clear() {
    pending = null;
    previewPanel.hidden = true;
    acceptButton.disabled = true;
    acceptButton.textContent = 'Accept';
    rejectButton.disabled = true;
    rejectButton.textContent = 'Reject';
    copyBeforeButton.disabled = true;
    copyAfterButton.disabled = true;
    deliveryOutput.textContent = 'Delivery not planned';
    deliveryOutput.dataset.kind = 'info';
    diffList.replaceChildren();
  }

  async function simulate(proposal, { source, local, view = runtime.view } = {}) {
    const preview = await runtime.preview(proposal);
    const beforeView = projectView(view, runtime.records);
    const afterView = projectView(view, preview.records);
    const preflight = await runtime.preflightAccept(proposal, { view: afterView });
    const rejection = await runtime.preflightReject({ local, view: beforeView });
    const beforeUrl = rejection.delivery.url ?? rejection.delivery.plannedUrl ?? rejection.delivery.code;
    const afterUrl = preflight.delivery.url ?? preflight.delivery.plannedUrl ?? preflight.delivery.code;
    return Object.freeze({
      proposal,
      preview,
      preflight,
      delivery: preflight.delivery,
      rejection,
      source,
      local,
      view: afterView,
      beforeView,
      afterView,
      beforeHash: runtime.stateHash,
      afterHash: preview.stateHash,
      beforeUrl,
      afterUrl,
      diffs: Object.freeze(preview.entries.map(describeEntry)),
    });
  }

  function deliveryLabel(delivery) {
    if (delivery.mode === 'existing') return 'current URL retained';
    if (delivery.mode === 'inline') {
      return `inline ${delivery.inspection.urlChars.toLocaleString()} / ${delivery.inspection.maxUrlChars.toLocaleString()} chars`;
    }
    if (delivery.status === 'blocked') {
      return delivery.code === 'PUBLISHER_REQUIRED'
        ? `${delivery.code} · publisher unavailable`
        : `${delivery.code} · blocked`;
    }
    if (delivery.status === 'ready' && delivery.mode === 'reference') {
      return `verified reference · ${delivery.digest}`;
    }
    return `${delivery.publisher.label} · ${delivery.publisher.visibility} · ${delivery.publisher.retention} · ${delivery.publisher.cost}`;
  }

  function render(value) {
    pending = value;
    previewPanel.hidden = false;
    diffList.replaceChildren(...value.diffs.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    beforeHashOutput.textContent = value.beforeHash;
    afterHashOutput.textContent = value.afterHash;
    beforeUrlOutput.textContent = value.beforeUrl;
    afterUrlOutput.textContent = value.afterUrl;
    beforeUrlOutput.title = value.beforeUrl;
    afterUrlOutput.title = value.afterUrl;
    sourceOutput.textContent = value.source === 'url' ? 'URL Proposal' : 'Local Draft';

    const acceptance = value.delivery;
    const rejection = value.rejection.delivery;
    const acceptPublishes = acceptance.status === 'confirmation-required';
    const rejectPublishes = rejection.status === 'confirmation-required';
    const acceptBlocked = acceptance.status === 'blocked';
    const rejectBlocked = rejection.status === 'blocked';

    acceptButton.disabled = acceptBlocked;
    acceptButton.textContent = acceptPublishes ? 'Publish & Accept' : 'Accept';
    rejectButton.disabled = rejectBlocked;
    rejectButton.textContent = rejectPublishes ? 'Publish & Reject' : 'Reject';
    copyBeforeButton.disabled = rejection.status !== 'ready';
    copyAfterButton.disabled = acceptance.status !== 'ready';
    deliveryOutput.textContent = `Accept: ${deliveryLabel(acceptance)} · Reject: ${deliveryLabel(rejection)}`;
    deliveryOutput.dataset.kind = acceptBlocked && rejectBlocked
      ? 'error'
      : acceptPublishes || rejectPublishes
        ? 'publish'
        : 'inline';

    if (acceptBlocked && !rejectBlocked) {
      showStatus(`${acceptance.code}: Acceptには保存先が必要です。Rejectなら現在URLを保ったまま戻せます。`, 'error');
    } else if (acceptBlocked && rejectBlocked) {
      showStatus(`${acceptance.code}: AcceptとRejectの続行には保存先が必要です。StateとProposalは保持されています。`, 'error');
    } else if (acceptPublishes || rejectPublishes) {
      showStatus(`${value.proposal.operations.length} Operation(s) validated. ボタン操作後、Publish成功時だけ確定します。`, 'ok');
    } else {
      showStatus(`${value.proposal.operations.length} Operation(s) validated. DecisionLog has not changed.`, 'ok');
    }
    open();
    return value;
  }

  async function previewProposal(proposal, options = {}) {
    clear();
    try {
      return render(await simulate(proposal, options));
    } catch (error) {
      showStatus(error.message, 'error');
      open();
      throw error;
    }
  }

  async function openDraft() {
    const proposal = await runtime.createDraftProposal();
    return previewProposal(proposal, { source: 'local', local: true, view: runtime.view });
  }

  async function acceptPending() {
    invariant(pending, 'no Proposal is pending');
    acceptButton.disabled = true;
    const accepted = pending;
    try {
      const result = await runtime.accept(accepted.proposal, {
        view: accepted.afterView,
        confirmPublish: accepted.delivery.status === 'confirmation-required',
        expectedDigest: accepted.delivery.digest,
      });
      lastAccepted = Object.freeze({ ...accepted, result });
      pending = null;
      acceptButton.textContent = 'Accepted';
      rejectButton.disabled = true;
      afterUrlOutput.textContent = result.url;
      afterUrlOutput.title = result.url;
      copyAfterButton.disabled = false;
      deliveryOutput.textContent = result.delivery.action === 'publish-reference'
        ? `Published reference · ${result.delivery.digest}`
        : result.delivery.action === 'reuse-reference'
          ? `Reused verified reference · ${result.delivery.digest}`
          : 'Inline URL committed';
      deliveryOutput.dataset.kind = result.delivery.mode;
      showStatus(`Decision appended. Head is ${result.decisionId}.`, 'ok');
      navigator.vibrate?.([12, 35, 18]);
      return result;
    } catch (error) {
      acceptButton.disabled = false;
      showStatus(error.message, 'error');
      throw error;
    }
  }

  async function rejectPending() {
    if (!pending) return false;
    rejectButton.disabled = true;
    const rejected = pending;
    const delivery = rejected.rejection.delivery;
    try {
      const url = await runtime.reject({
        local: rejected.local,
        view: rejected.beforeView,
        confirmPublish: delivery.status === 'confirmation-required',
        expectedDigest: delivery.digest,
      });
      clear();
      showStatus(
        delivery.status === 'confirmation-required'
          ? `Proposal rejected after publishing ${delivery.digest}. DecisionLog did not change.`
          : 'Proposal rejected. DecisionLog did not change.',
        'ok',
      );
      return true;
    } catch (error) {
      rejectButton.disabled = delivery.status === 'blocked';
      showStatus(error.message, 'error');
      throw error;
    }
  }

  closeButton.addEventListener('click', close);
  acceptButton.addEventListener('click', () => acceptPending().catch(() => {}));
  rejectButton.addEventListener('click', () => rejectPending().catch(() => {}));
  copyBeforeButton.addEventListener('click', () => {
    const url = pending?.beforeUrl ?? lastAccepted?.beforeUrl;
    if (url) copyText(url).then(() => showStatus('Before URL copied.', 'ok')).catch((error) => showStatus(error.message, 'error'));
  });
  copyAfterButton.addEventListener('click', () => {
    const url = pending?.afterUrl ?? lastAccepted?.result?.url;
    if (url) copyText(url).then(() => showStatus('After URL copied.', 'ok')).catch((error) => showStatus(error.message, 'error'));
  });
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !layer.hidden) close(); });

  const api = Object.freeze({
    ready: true,
    open,
    close,
    openDraft,
    previewProposal,
    acceptPending,
    rejectPending,
    pending: () => pending,
    lastAccepted: () => lastAccepted,
  });
  globalThis.semanticMapReview = api;
  if (runtime.proposal) await previewProposal(runtime.proposal, { source: 'url', local: false, view: runtime.view });
}

install().catch((error) => {
  console.error(error);
  const status = document.getElementById('review-status');
  if (status) { status.textContent = error.message; status.dataset.kind = 'error'; }
  globalThis.semanticMapReview = Object.freeze({ ready: false, error: error.message });
});
