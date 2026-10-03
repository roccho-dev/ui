import { appendDataPinMarker } from '../data-pin.mjs';
import { createBaseCatalog } from './base.mjs';
import { assertExactKeys, extendTrustedCatalog, isPlainObject } from './runtime.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`control-catalog: ${message}`); };
const text = (value, name) => {
  invariant(typeof value === 'string' && value.length > 0, `${name} required`);
  return value;
};
const stringMap = (value, name) => {
  invariant(isPlainObject(value), `${name} must be an object`);
  for (const [key, item] of Object.entries(value)) text(item, `${name}.${key}`);
  return value;
};
const pathTokens = path => String(path).replace(/^\/+/, '').split(/[\/.]/u).filter(Boolean);
const rootKey = path => pathTokens(path)[0];
const readPath = (value, path) => {
  let cursor = value;
  for (const token of pathTokens(path)) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, token)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
};
const className = (classes, key) => classes?.[key] ?? '';
const addClass = (element, value) => { if (value) element.className = value; };
const valueText = value => typeof value === 'string' ? value : JSON.stringify(value);

const validateBoundText = (value, name) => {
  if (typeof value === 'string') return text(value, name);
  invariant(isPlainObject(value), `${name} must be a string or binding`);
  assertExactKeys(value, ['path'], ['prefix', 'suffix'], name);
  text(value.path, `${name}.path`);
  if (value.prefix !== undefined) invariant(typeof value.prefix === 'string', `${name}.prefix invalid`);
  if (value.suffix !== undefined) invariant(typeof value.suffix === 'string', `${name}.suffix invalid`);
  return value;
};
const resolveBoundText = (value, model, name) => {
  if (typeof value === 'string') return value;
  const resolved = readPath(model, value.path);
  invariant(resolved === null || ['boolean', 'number', 'string'].includes(typeof resolved), `${name}.path must resolve to a scalar`);
  return `${value.prefix ?? ''}${resolved === null ? 'null' : String(resolved)}${value.suffix ?? ''}`;
};
const validateJoin = (join, name) => {
  invariant(isPlainObject(join), `${name} must be an object`);
  assertExactKeys(join, ['sourcePath', 'foreignPath', 'localPath'], [], name);
  for (const key of ['sourcePath', 'foreignPath', 'localPath']) text(join[key], `${name}.${key}`);
};
const findJoinedRecord = ({ join, model, record }) => {
  const source = readPath(model, join.sourcePath);
  invariant(Array.isArray(source), `${join.sourcePath} must resolve to an array`);
  const local = readPath(record, join.localPath);
  const matches = source.filter(item => readPath(item, join.foreignPath) === local);
  invariant(matches.length <= 1, `${join.sourcePath} contains duplicate match for ${String(local)}`);
  return matches[0];
};
const propertyElement = ({ classes, document, key, value, rest = false, title = false, editId = null }) => {
  const item = document.createElement(editId && key !== 'id' ? 'button' : 'span');
  addClass(item, className(classes, 'property'));
  if (item.tagName?.toLowerCase() === 'button') {
    item.type = 'button';
    item.dataset.editId = editId;
    item.dataset.editKey = key;
    item.setAttribute('aria-label', `edit ${key} of ${editId}`);
  }
  item.dataset.key = key;
  item.dataset.value = valueText(value);
  if (rest) item.dataset.rest = 'true';
  if (title) item.dataset.variant = 'title';
  item.textContent = title ? valueText(value) : `${key}: ${valueText(value)}`;
  return item;
};
const appendMissing = ({ classes, document, properties, value }) => {
  const missing = document.createElement('span');
  addClass(missing, className(classes, 'property'));
  missing.dataset.key = 'op';
  missing.dataset.missing = 'true';
  missing.textContent = value;
  properties.append(missing);
};
const appendSource = ({ classes, component, dataModel, document, properties, record }) => {
  const titleKey = rootKey(component.titlePath);
  const idKey = rootKey(component.idPath);
  const title = readPath(record, component.titlePath);
  const id = readPath(record, component.idPath);
  const editId = component.editable ? id : null;
  if (title !== undefined) properties.append(propertyElement({ classes, document, key: titleKey, value: title, title: true, editId }));
  properties.append(propertyElement({ classes, document, key: idKey, value: id }));
  appendDataPinMarker({ container: properties, dataModel, document, targetId: id });
  const excluded = new Set([titleKey, idKey, rootKey(component.parentPath), rootKey(component.relationKindPath)]);
  for (const [key, value] of Object.entries(record)) {
    if (excluded.has(key)) continue;
    properties.append(propertyElement({ classes, document, key, value, rest: true, editId }));
  }
  if (component.editable && Object.hasOwn(record, 'rel')) {
    properties.append(propertyElement({ classes, document, key: 'rel', value: record.rel, rest: true, editId }));
  }
};
const appendJoined = ({ classes, component, dataModel, document, joined, properties, record, missing }) => {
  const titleKey = rootKey(component.titlePath);
  const idKey = rootKey(component.idPath);
  const title = readPath(record, component.titlePath);
  const id = readPath(record, component.idPath);
  if (title !== undefined) properties.append(propertyElement({ classes, document, key: titleKey, value: title, title: true }));
  properties.append(propertyElement({ classes, document, key: idKey, value: id }));
  if (!joined) return appendMissing({ classes, document, properties, value: missing });
  appendDataPinMarker({ container: properties, dataModel, document, targetId: readPath(joined, component.idPath) });
  const excluded = new Set([idKey, rootKey(component.join.foreignPath)]);
  for (const [key, value] of Object.entries(joined)) {
    if (excluded.has(key)) continue;
    properties.append(propertyElement({ classes, document, key, value, rest: true }));
  }
};
const validateColumn = (column, index) => {
  const name = `TreeGrid.columns[${index}]`;
  invariant(isPlainObject(column), `${name} must be an object`);
  assertExactKeys(column, ['id', 'title', 'meta', 'source'], ['missing'], name);
  text(column.id, `${name}.id`);
  text(column.title, `${name}.title`);
  validateBoundText(column.meta, `${name}.meta`);
  invariant(column.source === 'record' || column.source === 'join', `${name}.source invalid`);
  if (column.missing !== undefined) text(column.missing, `${name}.missing`);
};

const definitions = [{
  name: 'TreeGrid',
  validate: component => {
    assertExactKeys(component, ['id', 'component', 'sourcePath', 'idPath', 'parentPath', 'relationKindPath', 'titlePath', 'join', 'classes', 'columns'], ['editable', 'collapseDetails'], 'TreeGrid');
    if (component.editable !== undefined) invariant(typeof component.editable === 'boolean', 'TreeGrid.editable must be boolean');
    if (component.collapseDetails !== undefined) invariant(typeof component.collapseDetails === 'boolean', 'TreeGrid.collapseDetails must be boolean');
    for (const key of ['sourcePath', 'idPath', 'parentPath', 'relationKindPath', 'titlePath']) text(component[key], `TreeGrid.${key}`);
    validateJoin(component.join, 'TreeGrid.join');
    stringMap(component.classes, 'TreeGrid.classes');
    invariant(Array.isArray(component.columns) && component.columns.length === 2, 'TreeGrid.columns must contain exactly two columns');
    component.columns.forEach(validateColumn);
    invariant(new Set(component.columns.map(column => column.id)).size === component.columns.length, 'TreeGrid column ids must be unique');
    invariant(component.columns.filter(column => column.source === 'record').length === 1, 'TreeGrid requires one record column');
    invariant(component.columns.filter(column => column.source === 'join').length === 1, 'TreeGrid requires one join column');
    return component;
  },
  render: ({ component, dataModel, document }) => {
    const records = readPath(dataModel, component.sourcePath);
    invariant(Array.isArray(records) && records.length > 0, `${component.sourcePath} must resolve to records`);
    const byId = new Map();
    const children = new Map();
    for (const record of records) {
      const id = readPath(record, component.idPath);
      text(id, 'TreeGrid record id');
      invariant(!byId.has(id), `duplicate record ${id}`);
      byId.set(id, record);
      children.set(id, []);
    }
    const roots = [];
    for (const record of records) {
      const parent = readPath(record, component.parentPath);
      if (parent === null || parent === undefined) roots.push(record);
      else {
        invariant(children.has(parent), `missing parent ${parent}`);
        children.get(parent).push(record);
      }
    }
    invariant(roots.length === 1, `exactly one root required; found ${roots.length}`);

    const root = document.createElement('section');
    addClass(root, className(component.classes, 'root'));
    const header = document.createElement('header');
    addClass(header, className(component.classes, 'header'));
    for (const column of component.columns) {
      const cell = document.createElement('div');
      addClass(cell, className(component.classes, 'headerCell'));
      cell.dataset.controlColumn = column.id;
      const title = document.createElement('span');
      addClass(title, className(component.classes, 'title'));
      title.textContent = column.title;
      const meta = document.createElement('span');
      addClass(meta, className(component.classes, 'meta'));
      meta.textContent = resolveBoundText(column.meta, dataModel, `TreeGrid column ${column.id} meta`);
      cell.append(title, meta);
      header.append(cell);
    }
    root.append(header);

    const renderNode = record => {
      const id = readPath(record, component.idPath);
      const node = document.createElement('section');
      addClass(node, className(component.classes, 'node'));
      node.dataset.controlId = id;
      const row = document.createElement('div');
      addClass(row, className(component.classes, 'row'));
      row.dataset.controlRow = id;
      const joined = findJoinedRecord({ join: component.join, model: dataModel, record });
      const cells = [];
      for (const column of component.columns) {
        const cell = document.createElement('div');
        addClass(cell, className(component.classes, 'cell'));
        cell.dataset.controlColumn = column.id;
        const properties = document.createElement('div');
        addClass(properties, className(component.classes, 'properties'));
        if (column.source === 'record') appendSource({ classes: component.classes, component, dataModel, document, properties, record });
        else appendJoined({ classes: component.classes, component, dataModel, document, joined, properties, record, missing: column.missing ?? '—' });
        cell.append(properties);
        row.append(cell);
        cells.push(cell);
      }

      if (component.editable) {
        const actions = document.createElement('div');
        addClass(actions, className(component.classes, 'actions'));
        for (const name of ['create', 'delete']) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = name;
          button.dataset.controlAction = name;
          button.dataset.controlId = id;
          button.disabled = name === 'delete' && (record === roots[0] || children.get(id).length > 0);
          button.dataset.locked = String(button.disabled);
          actions.append(button);
        }
        cells[0].append(actions);
      }

      const nested = children.get(id);
      const branches = [];
      if (nested.length) {
        const groups = new Map();
        for (const child of nested) {
          const kind = readPath(child, component.relationKindPath);
          text(kind, `relation kind for ${readPath(child, component.idPath)}`);
          if (!groups.has(kind)) groups.set(kind, []);
          groups.get(kind).push(child);
        }
        const controls = document.createElement('div');
        addClass(controls, className(component.classes, 'relationControls'));
        for (const [kind, members] of groups) {
          const branch = document.createElement('div');
          addClass(branch, className(component.classes, 'children'));
          branch.dataset.controlRelation = kind;
          for (const child of members) branch.append(renderNode(child));
          branches.push(branch);
          const toggle = document.createElement('button');
          toggle.type = 'button';
          addClass(toggle, className(component.classes, 'relationToggle'));
          toggle.dataset.controlToggle = kind;
          toggle.dataset.controlCount = String(members.length);
          const label = open => `${open ? '▾' : '▸'} ${kind} ${members.length}`;
          branch.hidden = component.collapseDetails === true && kind === 'details';
          toggle.textContent = label(!branch.hidden);
          toggle.setAttribute('aria-expanded', String(!branch.hidden));
          toggle.addEventListener('click', () => {
            branch.hidden = !branch.hidden;
            toggle.textContent = label(!branch.hidden);
            toggle.setAttribute('aria-expanded', String(!branch.hidden));
          });
          controls.append(toggle);
        }
        cells[0].append(controls);
      }
      node.append(row, ...branches);
      return node;
    };

    root.append(renderNode(roots[0]));
    return root;
  },
}];

export const createControlCatalog = ({ id }) => extendTrustedCatalog({ base: createBaseCatalog(), definitions, id });
