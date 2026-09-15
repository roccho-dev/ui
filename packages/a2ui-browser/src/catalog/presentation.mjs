import { assertExactKeys, assertStringArray, createTrustedCatalog, isPlainObject } from './runtime.mjs';

const fail = message => { throw new Error(`presentation-catalog: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };
const text = (value, name) => { invariant(typeof value === 'string' && value.length > 0, `${name} required`); return value; };
const element = (document, tag, className = '', value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
};
const semantic = (node, type, id) => {
  node.dataset.semanticType = type;
  node.dataset.semanticId = id;
  return node;
};
const modelData = value => {
  invariant(isPlainObject(value), 'data model required');
  invariant(Array.isArray(value.stages) && value.stages.length > 0, 'stages required');
  invariant(Number.isSafeInteger(value.currentIndex), 'currentIndex required');
  invariant(isPlainObject(value.actors), 'actors required');
  invariant(isPlainObject(value.nodesByActor), 'nodesByActor required');
  invariant(isPlainObject(value.exchanges), 'exchanges required');
  invariant(isPlainObject(value.activities), 'activities required');
  invariant(Array.isArray(value.columns), 'columns required');
  invariant(isPlainObject(value.profile), 'profile required');
  return value;
};
const stageOrder = model => new Map(model.stages.map((stage, index) => [stage.id, index]));
const itemState = (model, born) => {
  const order = stageOrder(model).get(born);
  invariant(Number.isSafeInteger(order), `born stage missing: ${born}`);
  if (order > model.currentIndex) return null;
  return order === model.currentIndex ? 'new' : 'done';
};
const stateClass = state => state === 'new' ? ' is-new' : state === 'done' ? ' is-done' : '';

const renderBusinessModel = ({ component, dataModel, document, emitAction }) => {
  const model = modelData(dataModel);
  const stage = model.stages[model.currentIndex];
  invariant(stage, `stage ${model.currentIndex} missing`);
  const app = element(document, 'main', 'profiled-app');

  const header = element(document, 'header', 'profiled-head');
  const copy = element(document, 'div');
  copy.append(
    element(document, 'p', 'profiled-kicker', model.kicker),
    element(document, 'h1', 'profiled-title', model.title),
    element(document, 'p', 'profiled-profile', model.profile.label),
  );
  const stageLabel = element(document, 'div', 'profiled-stage');
  stageLabel.append(element(document, 'b', '', stage.name), element(document, 'span', '', stage.goal));
  header.append(copy, stageLabel);

  const timeline = element(document, 'nav', 'profiled-timeline');
  timeline.setAttribute('aria-label', '事業モデルの時系列');
  model.stages.forEach((item, index) => {
    const button = element(document, 'button');
    button.type = 'button';
    button.classList.toggle('current', index === model.currentIndex);
    button.classList.toggle('past', index < model.currentIndex);
    button.setAttribute('aria-pressed', String(index === model.currentIndex));
    button.dataset.stageId = item.id;
    button.append(element(document, 'strong', '', item.short), element(document, 'span', '', item.caption));
    button.addEventListener('click', () => emitAction({ action: component.action, context: { index, stageId: item.id } }));
    timeline.append(button);
  });

  const scroll = element(document, 'div', 'profiled-model-scroll');
  const scene = element(document, 'section', 'profiled-scene');
  const layout = [];
  for (const column of model.columns) {
    if (column.kind === 'actor') {
      const actor = model.actors[column.actorRef];
      invariant(isPlainObject(actor), `actor missing: ${column.actorRef}`);
      const state = itemState(model, actor.born);
      if (!state) continue;
      const card = semantic(element(document, 'article', `profiled-actor stage-item${stateClass(state)}`), 'actor', actor.id);
      card.append(element(document, 'div', 'profiled-actor-role', actor.role));
      card.append(element(document, 'h2', '', actor.label));
      card.append(element(document, 'p', 'profiled-actor-detail', actor.detail));
      const nodes = element(document, 'div', 'profiled-owned-nodes');
      for (const node of model.nodesByActor[actor.id] ?? []) {
        const nodeState = itemState(model, node.born);
        if (!nodeState) continue;
        const panel = semantic(element(document, 'section', `profiled-owned-node stage-item kind-${node.kind}${stateClass(nodeState)}`), 'node', node.id);
        panel.style.setProperty('--node-depth', String(node.depth ?? 0));
        if (node.role) panel.append(element(document, 'small', '', node.role));
        panel.append(element(document, 'strong', '', node.label));
        if (node.detail) panel.append(element(document, 'span', '', node.detail));
        if (Array.isArray(node.items) && node.items.length > 0) {
          const items = element(document, 'div', 'profiled-node-items');
          for (const label of node.items) items.append(element(document, 'i', '', label));
          panel.append(items);
        }
        nodes.append(panel);
      }
      if (nodes.childElementCount > 0) card.append(nodes);
      scene.append(card);
      layout.push('actor');
      continue;
    }

    invariant(column.kind === 'exchange', `unsupported column ${column.kind}`);
    const left = model.actors[column.leftActorRef];
    const right = model.actors[column.rightActorRef];
    if (!left || !right || !itemState(model, left.born) || !itemState(model, right.born)) continue;
    const group = element(document, 'section', 'profiled-exchange-group');
    group.dataset.leftActor = column.leftActorRef;
    group.dataset.rightActor = column.rightActorRef;
    for (const ref of column.exchangeRefs) {
      const exchange = model.exchanges[ref];
      invariant(isPlainObject(exchange), `exchange missing: ${ref}`);
      const exchangeState = itemState(model, exchange.born);
      if (!exchangeState) continue;
      const direction = exchange.from === column.leftActorRef ? 'to-right' : 'to-left';
      const lane = semantic(element(document, 'article', `profiled-exchange ${direction} stage-item${stateClass(exchangeState)}`), 'exchange', ref);
      lane.append(element(document, 'small', '', exchange.kind), element(document, 'strong', '', exchange.label));
      if (exchange.detail) lane.append(element(document, 'span', '', exchange.detail));
      group.append(lane);
    }
    if (group.childElementCount === 0) continue;
    scene.append(group);
    layout.push('exchange');
  }
  invariant(layout.length > 0, 'scene has no visible columns');
  scene.style.gridTemplateColumns = layout.map(kind => kind === 'actor' ? 'minmax(280px,1fr)' : 'minmax(150px,.52fr)').join(' ');
  scene.dataset.columnCount = String(layout.length);
  scroll.append(scene);

  const status = element(document, 'section', 'profiled-status');
  const change = element(document, 'div', 'profiled-status-unit');
  change.append(element(document, 'small', '', '今回追加'), element(document, 'strong', '', stage.change));
  const evidence = element(document, 'div', 'profiled-status-unit');
  evidence.append(element(document, 'small', '', '観測'), element(document, 'strong', '', stage.evidence));
  const activities = element(document, 'div', 'profiled-activities');
  for (const activity of Object.values(model.activities).filter(item => item.stage === stage.id).sort((a, b) => a.recordIndex - b.recordIndex)) {
    activities.append(semantic(element(document, 'span', '', activity.label), 'activity', activity.id));
  }
  status.append(change, evidence, activities, element(document, 'div', 'profiled-gate', stage.gate));

  const legend = element(document, 'div', 'profiled-legend');
  legend.append(element(document, 'span', 'new', '今回出現'), element(document, 'span', 'done', '前段まで成立'));
  app.append(header, timeline, scroll, status, legend);
  return app;
};

const definitions = [
  {
    name: 'PresentationFrame',
    validate: component => {
      assertExactKeys(component, ['children', 'component', 'id'], [], 'PresentationFrame');
      assertStringArray(component.children, 'PresentationFrame.children');
      invariant(component.children.length === 2, 'PresentationFrame requires surface and seq children');
      return component;
    },
    render: ({ component, document, renderChild }) => {
      const root = element(document, 'div', 'presentation-frame');
      for (const child of component.children) root.append(renderChild(child));
      return root;
    },
  },
  {
    name: 'PresentationSurface',
    validate: component => { assertExactKeys(component, ['component', 'id'], [], 'PresentationSurface'); return component; },
    render: ({ document }) => {
      const surface = element(document, 'main');
      surface.id = 'surface';
      return surface;
    },
  },
  {
    name: 'PresentationSeqShell',
    validate: component => { assertExactKeys(component, ['component', 'id'], [], 'PresentationSeqShell'); return component; },
    render: ({ document }) => {
      const root = element(document, 'div', 'presentation-seq-root');
      const backdrop = element(document, 'div', 'seq-backdrop');
      backdrop.dataset.open = 'false';
      backdrop.setAttribute('aria-hidden', 'true');
      const shell = element(document, 'aside', 'seq-shell');
      shell.dataset.preview = 'false';
      shell.dataset.expanded = 'false';
      shell.setAttribute('aria-label', '主体別Seq');
      shell.setAttribute('role', 'complementary');
      const toolbar = element(document, 'div', 'seq-toolbar');
      const identity = element(document, 'div', 'seq-identity');
      const marker = element(document, 'span', 'seq-marker');
      marker.setAttribute('aria-hidden', 'true');
      const labels = element(document, 'div', 'seq-labels');
      labels.append(element(document, 'span', 'seq-kind', 'Actor Seq'), element(document, 'strong', 'seq-current'));
      identity.append(marker, labels);
      const close = element(document, 'button', 'seq-close', '×');
      close.type = 'button';
      close.hidden = true;
      close.setAttribute('aria-label', 'Seqを閉じる');
      toolbar.append(identity, close);
      const mount = element(document, 'div', 'seq-mount');
      const open = element(document, 'button', 'seq-open');
      open.type = 'button';
      open.setAttribute('aria-expanded', 'false');
      open.setAttribute('aria-label', '主体別Seqを開く');
      open.append(element(document, 'span', '', 'Open Seq ↗'));
      shell.append(toolbar, mount, open);
      root.append(backdrop, shell);
      return root;
    },
  },
  {
    name: 'ProfiledBusinessModel',
    validate: component => {
      assertExactKeys(component, ['action', 'component', 'id'], [], 'ProfiledBusinessModel');
      text(component.action, 'ProfiledBusinessModel.action');
      return component;
    },
    render: renderBusinessModel,
  },
];

export const createPresentationCatalog = ({ id }) => createTrustedCatalog({ definitions, id });
