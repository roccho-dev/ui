import { createBaseCatalog } from './base.mjs';
import { assertExactKeys, assertStringArray, extendTrustedCatalog, isPlainObject } from './runtime.mjs';

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
  const tokens = String(path).replace(/^\/+/, '').split(/[\/.]/u).filter(Boolean);
  let cursor = value;
  for (const token of tokens) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, token)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
};
const className = (classes, key) => classes?.[key] ?? '';
const addClass = (element, value) => { if (value) element.className = value; };
const renderValue = value => typeof value === 'string' ? value : JSON.stringify(value);

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
const validateRest = (rest, name) => {
  if (rest === undefined) return;
  invariant(isPlainObject(rest), `${name} must be an object`);
  assertExactKeys(rest, [], ['path', 'exclude'], name);
  if (rest.path !== undefined) text(rest.path, `${name}.path`);
  if (rest.exclude !== undefined) assertStringArray(rest.exclude, `${name}.exclude`);
};
const validateJoin = (join, name) => {
  if (join === undefined) return;
  assertExactKeys(join, ['sourcePath', 'foreignPath', 'localPath', 'as'], [], name);
  for (const key of ['sourcePath', 'foreignPath', 'localPath', 'as']) text(join[key], `${name}.${key}`);
};
const joinRecord = ({ join, model, record }) => {
  if (!join) return {};
  const source = readPath(model, join.sourcePath);
  invariant(Array.isArray(source), `${join.sourcePath} must resolve to an array`);
  const local = readPath(record, join.localPath);
  const matches = source.filter(item => readPath(item, join.foreignPath) === local);
  invariant(matches.length <= 1, `${join.sourcePath} contains duplicate match for ${String(local)}`);
  return { [join.as]: matches[0] };
};
const fieldElement = ({ classes, document, field, scope }) => {
  const value = readPath(scope, field.path);
  if (value === undefined || value === null || value === '') {
    if (field.omitIfMissing || field.missing === undefined) return null;
    const missing = document.createElement('span');
    addClass(missing, className(classes, 'property'));
    missing.dataset.key = field.label ?? field.path;
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
    : `${field.label ?? field.path}: ${renderValue(value)}`;
  return item;
};
const restElements = ({ classes, document, rest, scope }) => {
  if (!rest) return [];
  const source = rest.path === undefined ? scope : readPath(scope, rest.path);
  if (source === undefined || source === null) return [];
  invariant(isPlainObject(source), 'TreeGrid.rest path must resolve to an object');
  const excluded = new Set(rest.exclude ?? []);
  return Object.entries(source).flatMap(([key, value]) => {
    if (excluded.has(key)) return [];
    const item = document.createElement('span');
    const rendered = renderValue(value);
    addClass(item, className(classes, 'property'));
    item.dataset.key = key;
    item.dataset.value = rendered;
    item.dataset.rest = 'true';
    item.textContent = `${key}: ${rendered}`;
    return [item];
  });
};
const validateColumn = (column, index) => {
  const name = `TreeGrid.columns[${index}]`;
  invariant(isPlainObject(column), `${name} must be an object`);
  assertExactKeys(column, ['id', 'title', 'meta', 'fields'], ['rest'], name);
  text(column.id, `${name}.id`);
  text(column.title, `${name}.title`);
  validateBoundText(column.meta, `${name}.meta`);
  validateFields(column.fields, `${name}.fields`);
  validateRest(column.rest, `${name}.rest`);
};

const definitions = [{
  name: 'TreeGrid',
  validate: component => {
    assertExactKeys(component, ['id', 'component', 'sourcePath', 'idPath', 'parentPath', 'relationKindPath', 'classes', 'columns'], ['join'], 'TreeGrid');
    for (const key of ['sourcePath', 'idPath', 'parentPath', 'relationKindPath']) text(component[key], `TreeGrid.${key}`);
    stringMap(component.classes, 'TreeGrid.classes');
    invariant(Array.isArray(component.columns) && component.columns.length === 2, 'TreeGrid.columns must contain exactly two columns');
    component.columns.forEach(validateColumn);
    invariant(new Set(component.columns.map(column => column.id)).size === component.columns.length, 'TreeGrid column ids must be unique');
    validateJoin(component.join, 'TreeGrid.join');
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
      const scope = { ...record, ...joinRecord({ join: component.join, model: dataModel, record }) };
      const node = document.createElement('section');
      addClass(node, className(component.classes, 'node'));
      node.dataset.controlId = id;
      const row = document.createElement('div');
      addClass(row, className(component.classes, 'row'));
      row.dataset.controlRow = id;
      const cells = [];
      for (const column of component.columns) {
        const cell = document.createElement('div');
        addClass(cell, className(component.classes, 'cell'));
        cell.dataset.controlColumn = column.id;
        const properties = document.createElement('div');
        addClass(properties, className(component.classes, 'properties'));
        for (const field of column.fields) {
          const item = fieldElement({ classes: component.classes, document, field, scope });
          if (item) properties.append(item);
        }
        for (const item of restElements({ classes: component.classes, document, rest: column.rest, scope })) properties.append(item);
        cell.append(properties);
        row.append(cell);
        cells.push(cell);
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
          toggle.textContent = label(true);
          toggle.addEventListener('click', () => {
            branch.hidden = !branch.hidden;
            toggle.textContent = label(!branch.hidden);
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
