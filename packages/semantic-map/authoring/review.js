import { createSemanticMap } from '../domain/index.js';
import { projectView } from '../protocol/index.js';
import { createSemanticReviewModel } from './review-model.js';
import { createSemanticReviewOverlay } from './review-overlay.js';
import { copyText, waitFor, waitForApp } from './shared.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-review: ${message}`);
}

function deltaSummary(model) {
  const { regions, relations, changed } = model.delta.counts;
  if (model.delta.netNoop) return 'Net no-op · Operation trace retained';
  return [
    `Changed ${changed}`,
    `regions +${regions.added} −${regions.removed} Δ${regions.changed}`,
    `relations +${relations.added} −${relations.removed} Δ${relations.changed}`,
  ].join(' · ');
}

function appendSourceRef(list, value) {
  const item = document.createElement('li');
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('not a review link');
    const anchor = document.createElement('a');
    anchor.href = url.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = value;
    item.append(anchor);
  } catch (_) {
    const code = document.createElement('code');
    code.textContent = value;
    item.append(code);
  }
  list.append(item);
}

async function install() {
  const app = await waitForApp();
  const runtime = await waitFor('semanticMapRuntime');
  const layer = document.getElementById('review-layer');
  const closeButton = document.getElementById('review-close');
  const status = document.getElementById('review-status');
  const previewPanel = document.getElementById('review-preview-panel');
  const diffList = document.getElementById('review-diff');
  const baseLabelOutput = document.getElementById('review-base-label');
  const deltaSummaryOutput = document.getElementById('review-delta-summary');
  const baseHeadOutput = document.getElementById('review-base-head');
  const proposalParentOutput = document.getElementById('review-proposal-parent');
  const proposalIdOutput = document.getElementById('review-proposal-id');
  const proposalDigestOutput = document.getElementById('review-proposal-digest');
  const beforeHashOutput = document.getElementById('review-before-hash');
  const afterHashOutput = document.getElementById('review-after-hash');
  const reasonOutput = document.getElementById('review-reason');
  const assessmentWrap = document.getElementById('review-assessment-wrap');
  const assessmentOutput = document.getElementById('review-assessment');
  const sourceRefsOutput = document.getElementById('review-source-refs');
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
    app.adapter.clearReviewOverlay();
    previewPanel.hidden = true;
    acceptButton.disabled = true;
    acceptButton.textContent = 'Accept';
    rejectButton.disabled = true;
    rejectButton.textContent = 'Reject';
    copyBeforeButton.disabled = true;
    copyAfterButton.disabled = true;
    deliveryOutput.textContent = 'Delivery not planned';
    deliveryOutput.dataset.kind = 'info';
    baseLabelOutput.textContent = 'Base';
    baseLabelOutput.dataset.current = 'false';
    deltaSummaryOutput.textContent = 'No semantic delta';
    deltaSummaryOutput.dataset.netNoop = 'true';
    reasonOutput.textContent = 'Not supplied';
    assessmentWrap.hidden = true;
    assessmentOutput.textContent = '';
    sourceRefsOutput.hidden = true;
    sourceRefsOutput.replaceChildren();
    diffList.replaceChildren();
  }

  async function simulate(proposal, {
    source,
    local,
    view = runtime.view,
    metadata = null,
    currentProofVerifier = null,
  } = {}) {
    const preview = await runtime.preview(proposal);
    const beforeView = projectView(view, runtime.records);
    const afterView = projectView(view, preview.records);
    const preflight = await runtime.preflightAccept(proposal, { view: afterView });
    const rejection = await runtime.preflightReject({ local, view: beforeView });
    const beforeUrl = rejection.delivery.url ?? rejection.delivery.plannedUrl ?? rejection.delivery.code;
    const afterUrl = preflight.delivery.url ?? preflight.delivery.plannedUrl ?? preflight.delivery.code;

    const beforeDomain = createSemanticMap(runtime.records);
    const afterDomain = createSemanticMap(preview.records);
    const resolver = globalThis.semanticMapModuleResolver;
    const beforeModules = await resolver.resolve(beforeDomain, {
      mapId: runtime.mapId,
      head: runtime.head,
      view: beforeView,
    });
    const afterModules = await resolver.resolve(afterDomain, {
      mapId: runtime.mapId,
      head: preview.head,
      view: afterView,
    });
    const beforeScene = app.projectDomain(beforeDomain, beforeView, beforeModules);
    const afterScene = app.projectDomain(afterDomain, afterView, afterModules);
    const model = await createSemanticReviewModel({ preview, metadata, currentProofVerifier });
    const overlay = createSemanticReviewOverlay(model, beforeScene, afterScene);

    return Object.freeze({
      proposal,
      preview,
      model,
      overlay,
      preflight,
      delivery: preflight.delivery,
      rejection,
      source,
      local,
      view: afterView,
      beforeView,
      afterView,
      beforeHash: model.identities.baseStateHash,
      afterHash: model.identities.afterStateHash,
      beforeUrl,
      afterUrl,
      diffs: Object.freeze(model.trace.map((entry) => entry.summary)),
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
    const { model } = value;
    app.adapter.setReviewOverlay(value.overlay);
    previewPanel.hidden = false;
    diffList.replaceChildren(...model.trace.map((entry) => {
      const item = document.createElement('li');
      item.textContent = entry.summary;
      item.dataset.operationType = entry.type;
      return item;
    }));

    baseLabelOutput.textContent = model.baseLabel === 'current' ? 'Current' : 'Base';
    baseLabelOutput.dataset.current = String(model.baseLabel === 'current');
    deltaSummaryOutput.textContent = deltaSummary(model);
    deltaSummaryOutput.dataset.netNoop = String(model.delta.netNoop);
    baseHeadOutput.textContent = model.identities.baseHead;
    proposalParentOutput.textContent = model.identities.proposalParent;
    proposalIdOutput.textContent = model.identities.proposalId;
    proposalDigestOutput.textContent = model.identities.proposalDigest;
    beforeHashOutput.textContent = model.identities.baseStateHash;
    afterHashOutput.textContent = model.identities.afterStateHash;

    reasonOutput.textContent = model.provenance.reason ?? 'Not supplied';
    assessmentWrap.hidden = model.provenance.assessment === null;
    assessmentOutput.textContent = model.provenance.assessment ?? '';
    sourceRefsOutput.replaceChildren();
    for (const ref of model.provenance.sourceRefs) appendSourceRef(sourceRefsOutput, ref);
    sourceRefsOutput.hidden = model.provenance.sourceRefs.length === 0;

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

  async function openDraft(metadata = null, currentProofVerifier = null) {
    const proposal = await runtime.createDraftProposal();
    return previewProposal(proposal, {
      source: 'local',
      local: true,
      view: runtime.view,
      metadata,
      currentProofVerifier,
    });
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
      app.adapter.clearReviewOverlay();
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

  clear();

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
