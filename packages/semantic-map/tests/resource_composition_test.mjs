import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSemanticMap } from '../domain/index.js';
import { ModuleResolver } from '../module-embedding/index.js';
import { SemanticProjector } from '../projection/index.js';
import {
  createDecisionLog,
  createEnvelope,
  inspectEnvelope,
  projectView,
} from '../protocol/index.js';
import {
  RESOURCE_COMPOSITION_SCHEMA,
  normalizeResourceComposition,
  parseTargetRef,
  resolveResourceEntries,
  resourcePolicyForEntry,
  resourceRegistryManifest,
} from '../resource-composition/index.js';
import {
  createResourceElement,
  renderElementResourceComposition,
  renderResourceTarget,
} from '../renderer-resource-dom/index.js';
import { createSmapUrl, readSmapHash } from '../transport/index.js';


const requiredReferrerMeta = '<meta name="referrer" content="no-referrer">';
for (const page of ['app.html', 'root.html', 'help.html', 'example-index.html']) {
  const source = readFileSync(new URL(`../authoring/pages/${page}`, import.meta.url), 'utf8');
  assert.equal(
    source.split(requiredReferrerMeta).length - 1,
    1,
    `MUTATION:document-referrer-boundary:${page}`,
  );
}

const records = Object.freeze([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Resource parent' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 900, 620], summary: '' },
  { type: 'region', id: 'visual', parent: 'root', label: 'Visual', kind: 'output', bounds: [70, 90, 320, 210], summary: '' },
  { type: 'region', id: 'proof', parent: 'root', label: 'Proof', kind: 'evidence', bounds: [490, 90, 320, 210], summary: '' },
]);

const sourceHref = '/assets/example/map/hatfield-overview.svg';
const provenanceRef = 'provenance:osm-odbl:2026-08-13';
const imageComposition = {
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'hatfield-map',
    contract: 'image/1',
    source: { type: 'url', href: sourceHref },
    provenanceRef,
  }],
  placements: [
    {
      id: 'as-background',
      resourceRef: 'hatfield-map',
      targetRef: 'surface:root',
      slot: 'background',
      view: { alt: '', title: 'Hatfield background', fit: 'cover', opacity: 0.16 },
    },
    {
      id: 'as-node',
      resourceRef: 'hatfield-map',
      targetRef: 'node:visual',
      slot: 'content',
      view: { alt: 'Hatfield map', title: 'Hatfield map node', fit: 'contain' },
      action: { kind: 'navigate', href: 'https://www.openstreetmap.org/copyright' },
    },
    {
      id: 'as-element',
      resourceRef: 'hatfield-map',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { alt: 'Hatfield map', title: 'Hatfield map panel', fit: 'cover' },
      action: { kind: 'navigate', href: 'https://www.openstreetmap.org/copyright' },
    },
  ],
};

const normalized = normalizeResourceComposition(imageComposition);
assert.equal(normalized.resources.length, 1, 'one URL is defined once');
assert.equal(normalized.placements.length, 3, 'one resource is placed three times');
assert.deepEqual(resourceRegistryManifest(), {
  schema: 'typed-resource-registry/1',
  contracts: ['image/1', 'semantic-map-envelope/3', 'document/1', 'video/1'],
  sourceTypes: ['url'],
  placements: {
    'image/1': ['element:content', 'node:content', 'surface:background'],
    'semantic-map-envelope/3': ['node:content', 'surface:content'],
    'document/1': ['element:content', 'surface:content'],
    'video/1': ['element:content', 'surface:background'],
  },
  serialized: ['resources', 'placements'],
  runtimeOwned: ['adapter', 'boundary', 'target-catalog'],
  integrity: {
    accepted: false,
    owner: 'verified-reference-adapter',
    reason: 'typed-resource-composition/1 has no byte-owning adapter that can enforce it',
  },
  export: {
    sceneImage: 'same-origin-image-only',
    externalComposition: 'url-share-only',
  },
});
assert.equal(resolveResourceEntries(normalized).filter(entry => entry.resource.id === 'hatfield-map').length, 3);
assert.deepEqual(
  Object.fromEntries(resolveResourceEntries(normalized).map((entry) => [
    `${parseTargetRef(entry.placement.targetRef).catalog}:${entry.placement.slot}`,
    resourcePolicyForEntry(entry).adapter,
  ])),
  {
    'surface:background': 'dom-image',
    'node:content': 'maxgraph-image',
    'element:content': 'dom-image',
  },
  'adapter and boundary are registry-derived and not serialized',
);

const external = normalizeResourceComposition({
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'external-image',
    contract: 'image/1',
    source: { type: 'url', href: 'https://cdn.example.test/media/diagram.png?rev=7' },
    provenanceRef: 'provenance:external-diagram:2026-08-13',
  }],
  placements: [{
    id: 'external-element',
    resourceRef: 'external-image',
    targetRef: 'element:resource-panel',
    slot: 'content',
    view: { alt: 'External diagram' },
  }],
});
assert.equal(external.resources[0].source.href, 'https://cdn.example.test/media/diagram.png?rev=7');
assert.equal(resourcePolicyForEntry(resolveResourceEntries(external)[0]).adapter, 'dom-image');

const log = await createDecisionLog(records, 'semantic-map:test:resource-parent');
const envelope = await createEnvelope(log.log, null, { pattern: 'graph/1', resourceComposition: imageComposition });
const serialized = JSON.stringify(envelope);
assert.equal(serialized.split(sourceHref).length - 1, 1, 'source URL is serialized once');
assert(!serialized.includes('dom-image'), 'adapter policy is not serialized');
assert(!serialized.includes('sandboxed'), 'boundary policy is not serialized');
const url = await createSmapUrl(envelope, 'https://example.test/app');
const opened = await readSmapHash(url);
assert.deepEqual(opened.envelope.view.resourceComposition, normalized);

const pruned = projectView(envelope.view, records.filter(record => record.id !== 'visual'));
assert.equal(pruned.resourceComposition.placements.length, 2);
assert.deepEqual(pruned.resourceComposition.placements.map(placement => placement.id).sort(), ['as-background', 'as-element']);
await assert.rejects(
  inspectEnvelope({
    ...envelope,
    view: {
      pattern: 'graph/1',
      resourceComposition: {
        ...imageComposition,
        placements: [{
          id: 'missing',
          resourceRef: 'hatfield-map',
          targetRef: 'node:missing',
          slot: 'content',
          view: { alt: 'Missing' },
        }],
      },
    },
  }),
  /resource placement node not found/u,
);

assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    resources: [{
      id: 'missing-provenance',
      contract: 'image/1',
      source: { type: 'url', href: 'https://example.test/image.png' },
    }],
    placements: [{
      id: 'element',
      resourceRef: 'missing-provenance',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { alt: 'Missing provenance' },
    }],
  }),
  /requires provenanceRef/u,
  'MUTATION:require-resource-provenance',
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    resources: [imageComposition.resources[0], { ...imageComposition.resources[0], id: 'duplicate' }],
  }),
  /duplicate resource source/u,
  'MUTATION:unique-resource-source',
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    resources: [{
      ...imageComposition.resources[0],
      source: { type: 'url', href: 'https://user:secret@example.test/image.png' },
    }],
  }),
  /must not contain userinfo/u,
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    resources: [{
      ...imageComposition.resources[0],
      source: { type: 'url', href: 'data:image/png;base64,AA==' },
    }],
  }),
  /must use http or https/u,
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    placements: [{
      id: 'bad-target',
      resourceRef: 'hatfield-map',
      targetRef: 'surface:root',
      slot: 'content',
      view: { alt: 'Bad target' },
    }],
  }),
  /image\/1 cannot target surface\/content/u,
  'MUTATION:target-contract-policy',
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    placements: [{
      id: 'background',
      resourceRef: 'hatfield-map',
      targetRef: 'surface:root',
      slot: 'background',
      view: { alt: '' },
      action: { kind: 'navigate', href: 'https://example.test/' },
    }],
  }),
  /does not allow navigate/u,
  'MUTATION:background-action-policy',
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    placements: [{
      id: 'raw-style',
      resourceRef: 'hatfield-map',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { alt: 'Unsafe', style: 'position:fixed' },
    }],
  }),
  /view\.style is not allowed/u,
  'MUTATION:reject-raw-view-style',
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    placements: [{
      id: 'old-shape',
      resourceRef: 'hatfield-map',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { alt: 'Old shape' },
      host: 'element',
    }],
  }),
  /placements\[0\]\.host is not allowed/u,
  'MUTATION:reject-legacy-host-shape',
);
assert.throws(
  () => normalizeResourceComposition({
    ...imageComposition,
    resources: [{
      ...imageComposition.resources[0],
      integrity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }],
  }),
  /resources\[0\]\.integrity is not allowed/u,
  'MUTATION:reject-decorative-integrity',
);
assert.throws(
  () => normalizeResourceComposition({
    schema: RESOURCE_COMPOSITION_SCHEMA,
    resources: [{
      id: 'false-semantic-map',
      contract: 'semantic-map-envelope/3',
      source: { type: 'url', href: 'https://example.test/arbitrary-page' },
    }],
    placements: [{
      id: 'false-semantic-surface',
      resourceRef: 'false-semantic-map',
      targetRef: 'surface:root',
      slot: 'content',
      view: { title: 'Not a semantic map' },
    }],
  }),
  /must contain exactly one #smap token/u,
  'MUTATION:semantic-map-source-contract',
);

function fakeElement(tagName) {
  const attributes = new Map();
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    attributes,
    style: {},
    children: [],
    hidden: false,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    hasAttribute(name) { return attributes.has(name); },
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    dispatch(name) { for (const listener of listeners.get(name) ?? []) listener(); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
  };
}

const resourcePanel = fakeElement('aside');
resourcePanel.setAttribute('data-resource-target', 'element:resource-panel');
const referrerMeta = fakeElement('meta');
referrerMeta.setAttribute('name', 'referrer');
referrerMeta.setAttribute('content', 'no-referrer');
const fakeDocument = {
  createElement: fakeElement,
  querySelectorAll: selector => {
    if (selector === '[data-resource-target]') return [resourcePanel];
    if (selector === 'meta[name="referrer"]') return [referrerMeta];
    return [];
  },
};
assert.throws(
  () => renderElementResourceComposition({
    document: { ...fakeDocument, querySelectorAll: () => [] },
    composition: imageComposition,
  }),
  /exactly one document referrer policy is required/u,
  'MUTATION:document-referrer-boundary',
);

const rendered = renderElementResourceComposition({ document: fakeDocument, composition: imageComposition });
assert.equal(rendered.rendered, 1);
assert.equal(resourcePanel.children.length, 1);
assert.equal(resourcePanel.children[0].tagName, 'A');
assert.equal(resourcePanel.children[0].children[0].tagName, 'IMG');
assert.equal(resourcePanel.children[0].children[0].alt, 'Hatfield map');
assert.equal(resourcePanel.children[0].children[0].getAttribute('data-resource-status'), 'loading', 'MUTATION:dom-media-load-status');
resourcePanel.children[0].children[0].dispatch('load');
assert.equal(resourcePanel.children[0].children[0].getAttribute('data-resource-status'), 'ready');

const documentEntry = resolveResourceEntries({
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'doc',
    contract: 'document/1',
    source: { type: 'url', href: 'https://example.test/app' },
  }],
  placements: [{
    id: 'doc-element',
    resourceRef: 'doc',
    targetRef: 'element:resource-panel',
    slot: 'content',
    view: { title: 'External app' },
  }],
})[0];
const frame = createResourceElement({ document: fakeDocument, entry: documentEntry });
assert.equal(frame.tagName, 'IFRAME');
assert.equal(
  frame.attributes.get('sandbox'),
  'allow-scripts',
  'MUTATION:document-sandbox-boundary',
);
assert.equal(frame.referrerPolicy, 'no-referrer');
assert.deepEqual(resourcePolicyForEntry(documentEntry), {
  adapter: 'sandboxed-document',
  boundary: 'sandboxed',
  interaction: 'content',
  referrerPolicy: 'no-referrer',
  action: null,
  target: { ref: 'element:resource-panel', catalog: 'element', id: 'resource-panel' },
});

const videoEntries = resolveResourceEntries({
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'demo-video',
    contract: 'video/1',
    source: { type: 'url', href: 'https://media.example.test/demo.mp4' },
    provenanceRef: 'provenance:demo-video:2026-08-13',
  }],
  placements: [
    {
      id: 'video-background',
      resourceRef: 'demo-video',
      targetRef: 'surface:root',
      slot: 'background',
      view: { title: 'Background video', fit: 'cover', opacity: 0.5 },
    },
    {
      id: 'video-element',
      resourceRef: 'demo-video',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { title: 'Playable video', fit: 'contain' },
    },
  ],
});
const backgroundVideo = createResourceElement({ document: fakeDocument, entry: videoEntries[0] });
assert.equal(backgroundVideo.tagName, 'VIDEO');
assert.equal(backgroundVideo.controls, false);
assert.equal(backgroundVideo.muted, true);
assert.equal(backgroundVideo.loop, true);
assert.equal(backgroundVideo.autoplay, true);
assert.equal(backgroundVideo.playsInline, true);
assert.equal(Object.hasOwn(backgroundVideo, 'referrerPolicy'), false);
assert.equal(backgroundVideo.getAttribute('referrerpolicy'), null);
assert.equal(backgroundVideo.getAttribute('data-resource-referrer-boundary'), 'document-no-referrer');
assert.equal(resourcePolicyForEntry(videoEntries[0]).referrerPolicy, 'document-no-referrer');
assert.equal(backgroundVideo.getAttribute('data-resource-status'), 'loading');
backgroundVideo.dispatch('error');
assert.equal(backgroundVideo.getAttribute('data-resource-status'), 'failed');
assert.equal(backgroundVideo.getAttribute('aria-invalid'), 'true');
const contentVideo = createResourceElement({ document: fakeDocument, entry: videoEntries[1] });
assert.equal(contentVideo.controls, true);
assert.equal(contentVideo.muted, false);
assert.equal(contentVideo.loop, false);
assert.equal(contentVideo.autoplay, false);
assert.equal(contentVideo.getAttribute('aria-label'), 'Playable video');

const videoComposition = {
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'demo-video',
    contract: 'video/1',
    source: { type: 'url', href: 'https://media.example.test/demo.mp4' },
    provenanceRef: 'provenance:demo-video:2026-08-13',
  }],
  placements: [
    {
      id: 'video-background',
      resourceRef: 'demo-video',
      targetRef: 'surface:root',
      slot: 'background',
      view: { title: 'Background video', fit: 'cover', opacity: 0.5 },
    },
    {
      id: 'video-element',
      resourceRef: 'demo-video',
      targetRef: 'element:resource-panel',
      slot: 'content',
      view: { title: 'Playable video', fit: 'contain' },
    },
  ],
};
const videoSurface = fakeElement('section');
const videoSurfaceResult = renderResourceTarget({
  document: fakeDocument,
  mount: videoSurface,
  composition: videoComposition,
  targetRef: 'surface:root',
  slot: 'background',
});
assert.equal(videoSurfaceResult.count, 1);
assert.equal(videoSurface.children[0].tagName, 'VIDEO');

const surfaceDocumentComposition = {
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'surface-doc',
    contract: 'document/1',
    source: { type: 'url', href: 'https://example.test/help' },
  }],
  placements: [{
    id: 'surface-doc-placement',
    resourceRef: 'surface-doc',
    targetRef: 'surface:root',
    slot: 'content',
    view: { title: 'Surface document' },
  }],
};
const documentSurface = fakeElement('section');
const documentSurfaceResult = renderResourceTarget({
  document: fakeDocument,
  mount: documentSurface,
  composition: surfaceDocumentComposition,
  targetRef: 'surface:root',
  slot: 'content',
});
assert.equal(documentSurfaceResult.count, 1);
assert.equal(documentSurface.children[0].tagName, 'IFRAME');
assert.equal(documentSurface.children[0].getAttribute('sandbox'), 'allow-scripts');

const childRecords = Object.freeze([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'child-root', title: 'Child' },
  { type: 'region', id: 'child-root', parent: null, label: 'Child', kind: 'root', bounds: [0, 0, 500, 360], summary: '' },
  { type: 'region', id: 'child-node', parent: 'child-root', label: 'Child node', kind: 'output', bounds: [90, 90, 250, 150], summary: '' },
]);
const childLog = await createDecisionLog(childRecords, 'semantic-map:test:resource-child');
const childEnvelope = await createEnvelope(childLog.log, null, { pattern: 'graph/1' });
const childUrl = await createSmapUrl(childEnvelope, 'https://example.test/app');
const semanticSurfaceEntry = resolveResourceEntries({
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'child-map-surface',
    contract: 'semantic-map-envelope/3',
    source: { type: 'url', href: childUrl },
  }],
  placements: [{
    id: 'child-map-surface-placement',
    resourceRef: 'child-map-surface',
    targetRef: 'surface:root',
    slot: 'content',
    view: { title: 'Child semantic map surface' },
  }],
})[0];
const semanticSurface = createResourceElement({ document: fakeDocument, entry: semanticSurfaceEntry });
assert.equal(semanticSurface.tagName, 'IFRAME');
assert.equal(semanticSurface.src, childUrl);
assert.equal(semanticSurface.getAttribute('sandbox'), 'allow-scripts');
assert.equal(resourcePolicyForEntry(semanticSurfaceEntry).boundary, 'sandboxed');
const semanticComposition = {
  schema: RESOURCE_COMPOSITION_SCHEMA,
  resources: [{
    id: 'child-map',
    contract: 'semantic-map-envelope/3',
    source: { type: 'url', href: childUrl },
  }],
  placements: [{
    id: 'child-node-placement',
    resourceRef: 'child-map',
    targetRef: 'node:visual',
    slot: 'content',
    view: { title: 'Child semantic map' },
  }],
};
const semanticEnvelope = await createEnvelope(log.log, null, {
  pattern: 'graph/1',
  resourceComposition: semanticComposition,
});
const resolver = new ModuleResolver();
const domain = createSemanticMap(records);
const modules = await resolver.resolve(domain, {
  mapId: 'semantic-map:test:resource-parent',
  head: log.head,
  view: semanticEnvelope.view,
});
assert.equal(modules.moduleCount, 1);
assert.equal(modules.root.mountSources.get('visual'), childUrl);
assert.equal(modules.root.mounts.get('visual').source, childUrl);

const imageScene = new SemanticProjector(domain, null, envelope.view).project({
  scale: 1,
  viewport: { x: 0, y: 0, width: 1000, height: 700 },
});
const visualRepresentation = imageScene.representations.find(item => item.sourceRegionId === 'visual');
assert.equal(visualRepresentation.resource.src, sourceHref);
assert.equal(visualRepresentation.resource.contract, 'image/1');
assert.equal(visualRepresentation.href, 'https://www.openstreetmap.org/copyright');

const scene = new SemanticProjector(domain, modules, semanticEnvelope.view).project({
  scale: 5,
  viewport: { x: 0, y: 0, width: 1000, height: 700 },
});
assert.equal(scene.scenes.length, 2);
assert(scene.representations.some(item => item.regionId.includes('@mount/visual/region/child-node')));
const semanticEntry = resolveResourceEntries(semanticComposition)[0];
assert.equal(resourcePolicyForEntry(semanticEntry).adapter, 'nested-semantic-map');
assert.equal(resourcePolicyForEntry(semanticEntry).boundary, 'validated-read-only');

console.log(JSON.stringify({
  schema: 'semantic-map-resource-composition-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  resourceDefinitions: normalized.resources.length,
  placements: normalized.placements.length,
  parentUrlChars: url.length,
  mountedSemanticMaps: modules.moduleCount,
  registry: resourceRegistryManifest(),
  documentBoundary: frame.attributes.get('sandbox'),
  rendererCoverage: {
    image: ['surface:background', 'node:content', 'element:content'],
    semanticMap: ['surface:content', 'node:content'],
    document: ['surface:content', 'element:content'],
    video: ['surface:background', 'element:content'],
  },
}));
