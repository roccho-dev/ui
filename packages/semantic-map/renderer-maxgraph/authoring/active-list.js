const itemKey = item => `${item.kind}:${item.id}`;

const ensureStyles = () => {
  if (document.querySelector('[data-maxgraph-active-list-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./active-list.css', import.meta.url).href;
  link.dataset.maxgraphActiveListStyle = '';
  document.head.append(link);
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
