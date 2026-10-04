import {
  entriesForTarget,
  parseTargetRef,
  resolveResourceEntries,
  resourcePolicyForEntry,
} from '../resource-composition/index.js';

const invariant = (condition, message) => {
  if (!condition) throw new Error(`renderer-resource-dom: ${message}`);
};

const REFERRER_META_SELECTOR = 'meta[name="referrer"]';

export const assertNoReferrerDocumentPolicy = (document) => {
  invariant(document && typeof document.querySelectorAll === 'function', 'document querySelectorAll is required');
  const policies = [...document.querySelectorAll(REFERRER_META_SELECTOR)];
  invariant(policies.length === 1, 'exactly one document referrer policy is required');
  const content = policies[0].getAttribute?.('content');
  invariant(typeof content === 'string' && content.trim().toLowerCase() === 'no-referrer', 'document referrer policy must be no-referrer');
  return policies[0];
};

const setCommon = (element, entry) => {
  const { placement, resource } = entry;
  element.setAttribute('data-resource-id', resource.id);
  element.setAttribute('data-resource-contract', resource.contract);
  element.setAttribute('data-resource-placement', placement.id);
  element.style.width = '100%';
  element.style.height = '100%';
  if (Object.hasOwn(placement.view, 'opacity')) element.style.opacity = String(placement.view.opacity);
  if ('objectFit' in element.style && placement.view.fit) element.style.objectFit = placement.view.fit;
};

const installLoadStatus = (element, readyEvent) => {
  element.setAttribute('data-resource-status', 'loading');
  if (typeof element.addEventListener !== 'function') return;
  element.addEventListener(readyEvent, () => {
    element.setAttribute('data-resource-status', 'ready');
    element.removeAttribute?.('aria-invalid');
  }, { once: true });
  element.addEventListener('error', () => {
    element.setAttribute('data-resource-status', 'failed');
    element.setAttribute('aria-invalid', 'true');
  }, { once: true });
};

export const createResourceElement = ({ document, entry }) => {
  invariant(document && typeof document.createElement === 'function', 'document is required');
  invariant(entry?.resource && entry?.placement, 'resolved resource entry is required');
  assertNoReferrerDocumentPolicy(document);
  const { resource, placement } = entry;
  const policy = resourcePolicyForEntry(entry);
  const src = resource.source.href;
  let element;
  if (policy.adapter === 'dom-image') {
    element = document.createElement('img');
    installLoadStatus(element, 'load');
    element.src = src;
    element.alt = placement.view.alt;
    element.loading = 'lazy';
    element.decoding = 'async';
    element.referrerPolicy = policy.referrerPolicy;
  } else if (policy.adapter === 'dom-video') {
    element = document.createElement('video');
    installLoadStatus(element, 'loadedmetadata');
    element.src = src;
    element.controls = placement.slot === 'content';
    element.muted = placement.slot === 'background';
    element.loop = placement.slot === 'background';
    element.autoplay = placement.slot === 'background';
    element.playsInline = true;
    element.preload = 'metadata';
    invariant(policy.referrerPolicy === 'document-no-referrer', 'video requires the document no-referrer boundary');
    element.setAttribute('data-resource-referrer-boundary', policy.referrerPolicy);
    element.title = placement.view.title;
    element.setAttribute('aria-label', placement.view.title);
  } else if (policy.adapter === 'sandboxed-document') {
    element = document.createElement('iframe');
    element.src = src;
    element.loading = 'lazy';
    element.referrerPolicy = policy.referrerPolicy;
    element.setAttribute('sandbox', 'allow-scripts');
    element.title = placement.view.title;
  } else {
    throw new Error(`renderer-resource-dom: ${policy.adapter} is not a DOM adapter`);
  }
  if (placement.view.title && policy.adapter !== 'sandboxed-document') element.title = placement.view.title;
  setCommon(element, entry);
  if (!placement.action) return element;
  const link = document.createElement('a');
  link.href = placement.action.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('data-resource-action', placement.action.kind);
  link.setAttribute('aria-label', placement.view.alt || placement.view.title || 'Open resource link');
  link.style.display = 'block';
  link.style.width = '100%';
  link.style.height = '100%';
  link.append(element);
  return link;
};

export const renderResourceTarget = ({ document, mount, composition, targetRef, slot = null }) => {
  invariant(mount && typeof mount.replaceChildren === 'function', 'mount is required');
  if (composition) assertNoReferrerDocumentPolicy(document);
  const entries = composition ? entriesForTarget(composition, targetRef, slot) : [];
  const nodes = entries.map(entry => createResourceElement({ document, entry }));
  mount.replaceChildren(...nodes);
  mount.hidden = nodes.length === 0;
  return Object.freeze({ count: nodes.length, entries, targetRef, slot });
};

export const renderElementResourceComposition = ({ document, composition, strict = true }) => {
  if (composition) assertNoReferrerDocumentPolicy(document);
  const mounts = new Map();
  for (const mount of document.querySelectorAll('[data-resource-target]')) {
    const targetRef = mount.getAttribute('data-resource-target');
    const target = parseTargetRef(targetRef, 'data-resource-target');
    invariant(target.catalog === 'element', `DOM mount must use the element catalog: ${targetRef}`);
    invariant(!mounts.has(targetRef), `duplicate DOM target: ${targetRef}`);
    mounts.set(targetRef, mount);
    mount.replaceChildren();
    mount.hidden = true;
  }
  if (!composition) return Object.freeze({ rendered: 0, missing: Object.freeze([]) });

  const targetRefs = [...new Set(resolveResourceEntries(composition)
    .filter(entry => entry.policy.target.catalog === 'element')
    .map(entry => entry.placement.targetRef))];
  const missing = [];
  let rendered = 0;
  for (const targetRef of targetRefs) {
    const mount = mounts.get(targetRef);
    if (!mount) {
      missing.push(targetRef);
      continue;
    }
    const result = renderResourceTarget({ document, mount, composition, targetRef });
    rendered += result.count;
  }
  invariant(!strict || missing.length === 0, `missing element targets: ${missing.join(', ')}`);
  return Object.freeze({ rendered, missing: Object.freeze(missing) });
};
