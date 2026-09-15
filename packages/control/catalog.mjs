import { createBaseCatalog } from '../a2ui-browser/src/catalog/base.mjs';
import { assertExactKeys, assertStringArray, extendTrustedCatalog, isPlainObject } from '../a2ui-browser/src/catalog/runtime.mjs';

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
const readPath = (value, path) => {
  const tokens = String(path).replace(/^\/+/u, '').split(/[\/.]/u).filter(Boolean);
  let cursor = value;
  for (const token of tokens) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, token)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
};
const className = (classes, key) => classes?.[key] ?? '';
const addClass = (element, value) => { if (value) element.className = value; };

const validateFields = (fields, name) => {
  invariant(Array.isArray(fields) && fields.length > 0, `${name} required`);
  for (const [index, field] of fields.entries()) {
    assertExactKeys(field, ['path'], ['label', 'variant', 'omitIfMissing', 'missing'], `${name}[${index}]`);
    text(field.path, `${name}[${index}].path`);
    if (field.label !== undefined) text(field.label, `${name}[${index}].label`);
    if (field.variant !== undefined) text(field.variant, `${name}[${index}].variant`);
    if (field.omitIfMissing !== undefined) invariant(typeof field.omitIfMissing === 'boolean', `${name}[${index}].omitIfMissing invalid`);
    if (field.missing !== undefined) text(field.missing, `${name}[${index}].missing`);
  }
  return fields;
};
const validateJoin = (join, name) => {
  if (join === undefined) return;
  assertExactKeys(join, ['sourcePath', 'foreignPath', 'localPath', 'as', 'pick'], [], name);
  for (const key of ['sourcePath', 'foreignPath', 'localPath', 'as']) text(join[key], `${name}.${key}`);
  invariant(join.pick === 'last', `${name}.pick must be last`);
};
const joinRecord = ({ join, model, record }) => {
  if (!join) return {};
  const source = readPath(model, join.sourcePath);
  invariant(Array.isArray(source), `${join.sourcePath} must resolve to an array`);
  const local = readPath(record, join.localPath);
  const matches = source.filter(item => readPath(item, join.foreignPath) === local);
  return { [join.as]: matches.at(-1) };
};
const fieldElement = ({ classes, document, field, scope }) => {
  const value = readPath(scope, field.path);
  if (value === undefined || value === null || value === '') {
    if (field.omitIfMissing || field.missing === undefined) return null;
    const missing = document.createElement('span');
    addClass(missing, className(classes, 'property'));
    missing.dataset.missing = 'true';
    missing.textContent = field.missing;
    return missing;
  }
  const item = document.createElement('span');
  addClass(item, className(classes, 'property'));
  item.dataset.key = field.label ?? field.path;
  item.dataset.value = String(value);
  if (field.variant) item.dataset.variant = field.variant;
  item.textContent = field.variant === 'title'
    ? String(value)
    : `${field.label ?? field.path}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  return item;
};

const definitions = [
  {
    name: 'Split',
    validate: component => {
      assertExactKeys(component, ['id', 'component', 'children'], ['className'], 'Split');
      assertStringArray(component.children, 'Split.children');
      if (component.className !== undefined) text(component.className, 'Split.className');
      return component;
    },
    render: ({ component, document, renderChild }) => {
      const root = document.createElement('section');
      addClass(root, component.className);
      for (const child of component.children) root.append(renderChild(child));
      return root;
    },
  },
  {
    name: 'Pane',
    validate: component => {
      assertExactKeys(component, ['id', 'component', 'children', 'title', 'meta', 'classes'], [], 'Pane');
      assertStringArray(component.children, 'Pane.children');
      invariant(component.children.length === 1, 'Pane requires exactly one child');
      text(component.title, 'Pane.title');
      text(component.meta, 'Pane.meta');
      stringMap(component.classes, 'Pane.classes');
      return component;
    },
    render: ({ component, document, renderChild }) => {
      const root = document.createElement('article');
      addClass(root, className(component.classes, 'root'));
      const header = document.createElement('header');
      addClass(header, className(component.classes, 'header'));
      const title = document.createElement('span');
      addClass(title, className(component.classes, 'title'));
      title.textContent = component.title;
      const meta = document.createElement('span');
      addClass(meta, className(component.classes, 'meta'));
      meta.textContent = component.meta;
      header.append(title, meta);
      root.append(header, renderChild(component.children[0]));
      return root;
    },
  },
  {
    name: 'Tree',
    validate: component => {
      assertExactKeys(component, ['id', 'component', 'sourcePath', 'idPath', 'parentPath', 'relationKindPath', 'syncKey', 'classes', 'fields'], ['join'], 'Tree');
      for (const key of ['sourcePath', 'idPath', 'parentPath', 'relationKindPath', 'syncKey']) text(component[key], `Tree.${key}`);
      stringMap(component.classes, 'Tree.classes');
      validateFields(component.fields, 'Tree.fields');
      validateJoin(component.join, 'Tree.join');
      return component;
    },
    render: ({ component, dataModel, document }) => {
      const records = readPath(dataModel, component.sourcePath);
      invariant(Array.isArray(records) && records.length > 0, `${component.sourcePath} must resolve to records`);
      const byId = new Map();
      const children = new Map();
      for (const record of records) {
        const id = readPath(record, component.idPath);
        text(id, 'Tree record id');
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
      const root = document.createElement('div');
      addClass(root, className(component.classes, 'root'));
      const sync = (id, kind, open) => {
        for (const node of document.querySelectorAll('[data-control-sync]')) {
          if (node.dataset.controlSync !== component.syncKey || node.dataset.controlId !== id) continue;
          for (const branch of node.querySelectorAll(':scope > [data-control-relation]')) if (branch.dataset.controlRelation === kind) branch.hidden = !open;
          for (const toggle of node.querySelectorAll(':scope > .row [data-control-toggle]')) {
            if (toggle.dataset.controlToggle === kind) {
              const count = Number(toggle.dataset.controlCount);
              toggle.textContent = `${open ? '▾' : '▸'} ${kind} ${count}`;
            }
          }
        }
      };
      const renderNode = record => {
        const id = readPath(record, component.idPath);
        const node = document.createElement('section');
        addClass(node, className(component.classes, 'node'));
        node.dataset.controlSync = component.syncKey;
        node.dataset.controlId = id;
        const row = document.createElement('div');
        addClass(row, className(component.classes, 'row'));
        const properties = document.createElement('div');
        addClass(properties, className(component.classes, 'properties'));
        const scope = { ...record, ...joinRecord({ join: component.join, model: dataModel, record }) };
        for (const field of component.fields) {
          const item = fieldElement({ classes: component.classes, document, field, scope });
          if (item) properties.append(item);
        }
        row.append(properties);
        const nested = children.get(id);
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
          const branches = [];
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
            toggle.textContent = `▾ ${kind} ${members.length}`;
            toggle.addEventListener('click', () => sync(id, kind, branch.hidden));
            controls.append(toggle);
          }
          row.append(controls);
          node.append(row, ...branches);
          return node;
        }
        node.append(row);
        return node;
      };
      root.append(renderNode(roots[0]));
      return root;
    },
  },
];

export const createControlCatalog = ({ id }) => extendTrustedCatalog({ base: createBaseCatalog(), definitions, id });
