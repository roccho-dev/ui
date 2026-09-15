import { connectControl, parseControl, scanLines } from './src/control-graph.mjs';

const element = (document, tag, text = null, className = '') => {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

export const mountFeature = async ({ input, root, scope = globalThis }) => {
  if (typeof input !== 'string' || !input.trim()) throw new Error('control: non-empty JSONL input required');
  const document = root.ownerDocument;
  const tree = element(document, 'div', null, 'tree');
  tree.id = 'tree';
  tree.setAttribute('aria-live', 'polite');
  const dialog = element(document, 'dialog');
  dialog.id = 'editor';
  const title = element(document, 'h2');
  const titleLabel = element(document, 'label');
  titleLabel.id = 'editor-title';
  titleLabel.htmlFor = 'record-editor';
  title.append(titleLabel);
  const editor = element(document, 'textarea');
  editor.id = 'record-editor';
  editor.spellcheck = false;
  const dialogActions = element(document, 'div', null, 'dialog-actions');
  const cancel = element(document, 'button', 'cancel');
  cancel.id = 'cancel';
  cancel.type = 'button';
  const save = element(document, 'button', 'save');
  save.id = 'save';
  save.type = 'button';
  dialogActions.append(cancel, save);
  const editorError = element(document, 'output', null, 'error');
  editorError.id = 'editor-error';
  dialog.append(title, editor, dialogActions, editorError);
  const status = element(document, 'output', null, 'status');
  status.id = 'status';
  status.setAttribute('aria-live', 'polite');
  root.replaceChildren(tree, dialog, status);

  let source = input.endsWith('\n') ? input : `${input}\n`;
  let graph = connectControl(parseControl(source));
  let editMode = null;
  let editRecord = null;
  let returnFocus = null;
  let saving = false;
  let relationSequence = 0;

  const showStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };
  const action = (label, handler, { disabled = false, className = '' } = {}) => {
    const button = element(document, 'button', label, className);
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', handler);
    return button;
  };
  const setSaving = value => { saving = value; save.disabled = value; };

  const openEditor = (mode, record, trigger) => {
    if (saving) return;
    editMode = mode;
    editRecord = record;
    returnFocus = trigger;
    editorError.textContent = '';
    titleLabel.textContent = `${mode} · ${record.id}`;
    editor.value = JSON.stringify(mode === 'update' ? { ...record } : { id: '', rel: { parent: record.id, kind: '' } }, null, 2);
    dialog.showModal();
    editor.focus();
  };

  const property = (record, key, value) => {
    const locked = key === 'id';
    const item = element(document, locked ? 'span' : 'button', null, 'property');
    if (!locked) {
      item.type = 'button';
      item.addEventListener('click', () => openEditor('update', record, item));
    }
    item.dataset.key = key;
    item.append(element(document, 'span', `${key}:`, 'property-key'), element(document, 'span', typeof value === 'string' ? value : JSON.stringify(value), 'property-value'));
    return item;
  };

  const render = record => {
    const nested = graph.children.get(record.id);
    const node = element(document, 'section', null, 'node');
    const row = element(document, 'div', null, 'row');
    const properties = element(document, 'div', null, 'properties');
    Object.entries(record).forEach(([key, value]) => properties.append(property(record, key, value)));
    row.append(properties);
    const branches = element(document, 'div');
    if (nested.length) {
      const groups = new Map();
      nested.forEach(child => {
        if (!groups.has(child.rel.kind)) groups.set(child.rel.kind, []);
        groups.get(child.rel.kind).push(child);
      });
      const controls = element(document, 'div', null, 'relation-controls');
      groups.forEach((members, kind) => {
        const branch = element(document, 'div', null, 'children');
        branch.id = `relation-${++relationSequence}`;
        members.forEach(child => branch.append(render(child)));
        let open = kind !== 'details';
        const toggle = action('', () => setOpen(!open), { className: 'relation-toggle' });
        const setOpen = value => {
          open = value;
          branch.hidden = !open;
          toggle.textContent = `${open ? '▾' : '▸'} ${kind} ${members.length}`;
        };
        setOpen(open);
        controls.append(toggle);
        branches.append(branch);
      });
      row.append(controls);
    }
    const actions = element(document, 'div', null, 'actions');
    actions.append(
      action('delete', () => removeRecord(record), { disabled: record.rel === null || nested.length > 0, className: 'delete' }),
      action('create', event => openEditor('create', record, event.currentTarget)),
    );
    row.append(actions);
    node.append(row);
    if (nested.length) node.append(branches);
    return node;
  };

  const renderTree = () => {
    relationSequence = 0;
    tree.replaceChildren(render(graph.root));
  };
  const put = async candidate => {
    const nextGraph = connectControl(parseControl(candidate));
    if (saving) throw new Error('save in progress');
    setSaving(true);
    try {
      source = candidate.endsWith('\n') ? candidate : `${candidate}\n`;
      graph = nextGraph;
      renderTree();
      showStatus('saved');
    } finally {
      setSaving(false);
    }
  };
  const candidate = () => {
    const value = JSON.parse(editor.value);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('object required');
    const line = editRecord.sourceLine;
    const encoded = JSON.stringify(value);
    if (editMode === 'update') {
      if (value.id !== editRecord.id || value.rel?.parent !== editRecord.rel?.parent) throw new Error('id and rel.parent are immutable');
      return source.slice(0, line.start) + encoded + source.slice(line.bodyEnd);
    }
    if (value.rel?.parent !== editRecord.id) throw new Error('rel.parent is fixed');
    const delimiter = line.delimiter || scanLines(source).find(item => item.delimiter)?.delimiter || '\n';
    return source.slice(0, line.end) + (line.delimiter ? encoded + delimiter : delimiter + encoded) + source.slice(line.end);
  };
  const removeRecord = async record => {
    if (record.rel === null || graph.children.get(record.id).length > 0 || !scope.confirm(`delete ${record.id}?`)) return;
    const line = record.sourceLine;
    try { await put(source.slice(0, line.start) + source.slice(line.end)); }
    catch (error) { showStatus(error.message, true); }
  };

  cancel.addEventListener('click', () => dialog.close());
  save.addEventListener('click', async () => {
    try { await put(candidate()); dialog.close(); }
    catch (error) { editorError.textContent = error.message; }
  });
  dialog.addEventListener('close', () => returnFocus?.focus());
  renderTree();
  showStatus('loaded');

  return Object.freeze({
    read: () => source,
    schema: 'ui-control-runtime/1',
  });
};
