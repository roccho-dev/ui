const itemKey = item => `${item.kind}:${item.id}`;

const ACTIVE_LIST_CSS = `.maxgraph-active-list {
  position: absolute;
  top: 42px;
  right: 10px;
  z-index: 14;
  width: min(260px, 46vw);
  max-height: min(52vh, 420px);
  overflow: auto;
  padding: 8px;
  border: 1px solid rgba(148,163,184,.72);
  border-radius: 12px;
  background: rgba(255,255,255,.94);
  box-shadow: 0 8px 24px rgba(15,23,42,.14);
  backdrop-filter: blur(8px);
}
.maxgraph-active-list[hidden] { display: none; }
.maxgraph-active-list > strong { display: block; margin: 0 0 5px; color: #64748b; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
.maxgraph-active-list ul { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.maxgraph-active-list button { width: 100%; padding: 6px 7px; overflow: hidden; border: 0; border-radius: 7px; background: transparent; color: #334155; text-align: left; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.maxgraph-active-list button:hover, .maxgraph-active-list button.is-selected { background: #e9edf8; color: #26347d; }
html[data-artifact-module="true"] .maxgraph-active-list { top: 10px; }
`;

const ensureStyles = () => {
  if (document.querySelector('style[data-maxgraph-active-list-style]')) return;
  const style = document.createElement('style');
  style.dataset.maxgraphActiveListStyle = '';
  style.textContent = ACTIVE_LIST_CSS;
  document.head.append(style);
};

const normalizeItems = scene => {
  const regions = (scene?.representations ?? [])
    .filter(item => !item.isRoot && !item.isGuide && !item.moduleNamespace)
    .map(item => Object.freeze({
      kind: 'region',
      id: item.regionId,
      label: item.label || item.regionId,
      description: `${item.label || item.regionId} — ${item.kind || item.mode || 'region'}`,
    }));
  const relations = (scene?.relations ?? [])
    .filter(item => item.sceneId === 'root' && item.relationIds?.length === 1)
    .map(item => Object.freeze({
      kind: 'relation',
      id: item.relationIds[0],
      label: item.label || item.relationIds[0],
      description: `${item.label || item.relationIds[0]} — ${item.kind || 'relation'}`,
    }));
  return Object.freeze([...regions, ...relations]);
};

export const mountActiveList = ({ host, onActivate }) => {
  if (!(host instanceof Element)) throw new TypeError('active-list host must be an Element');
  if (typeof onActivate !== 'function') throw new TypeError('active-list onActivate must be a function');
  ensureStyles();

  const root = document.createElement('aside');
  root.className = 'maxgraph-active-list';
  root.dataset.maxgraphActiveList = '';
  root.setAttribute('aria-label', 'Active elements');
  const heading = document.createElement('strong');
  heading.textContent = 'Active';
  const list = document.createElement('ul');
  root.append(heading, list);
  host.append(root);

  let selected = new Set();
  let items = Object.freeze([]);

  const paintSelection = () => {
    for (const button of list.querySelectorAll('button[data-active-key]')) {
      const active = selected.has(button.dataset.activeKey);
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };

  const render = scene => {
    items = normalizeItems(scene);
    list.replaceChildren(...items.map(item => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.activeKey = itemKey(item);
      button.textContent = item.description;
      button.title = item.description;
      row.append(button);
      return row;
    }));
    root.hidden = items.length === 0;
    paintSelection();
    return items;
  };

  const setSelection = value => {
    const keys = [
      ...(value?.regionIds ?? []).map(id => `region:${id}`),
      ...(value?.relationIds ?? []).map(id => `relation:${id}`),
    ];
    selected = new Set(keys);
    paintSelection();
  };

  const click = event => {
    const button = event.target.closest?.('button[data-active-key]');
    if (!button || !list.contains(button)) return;
    const [kind, ...rest] = button.dataset.activeKey.split(':');
    const id = rest.join(':');
    onActivate(Object.freeze({ kind, id }));
  };
  list.addEventListener('click', click);

  return Object.freeze({
    render,
    setSelection,
    snapshot: () => Object.freeze({
      items: items.map(item => ({ ...item })),
      selected: [...selected],
      visible: !root.hidden,
    }),
    destroy: () => {
      list.removeEventListener('click', click);
      root.remove();
    },
  });
};
