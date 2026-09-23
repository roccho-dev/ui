import { connectControl, parseControl, scanLines } from './src/control-graph.mjs';

const invalid = message => Object.assign(new Error(`control-editor: ${message}`), { code: 'INVALID_EDIT' });
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const records = source => {
  const parsed = parseControl(source);
  const graph = connectControl(parsed);
  return { parsed, graph };
};

const locate = (source, id) => {
  if (typeof source !== 'string' || typeof id !== 'string' || !id) throw invalid('source and id required');
  const current = records(source);
  const record = current.parsed.find(item => item.id === id);
  if (!record) throw invalid(`unknown record ${id}`);
  return { ...current, record };
};

const insertBody = (source, parent, value) => {
  const line = parent.sourceLine;
  const delimiter = line.delimiter || scanLines(source).find(item => item.delimiter)?.delimiter || '\n';
  const insertion = line.delimiter ? `${JSON.stringify(value)}${delimiter}` : `${delimiter}${JSON.stringify(value)}`;
  return source.slice(0, line.end) + insertion + source.slice(line.end);
};

export const updateRecord = ({ source, id, value }) => {
  if (!plain(value)) throw invalid('record object required');
  const { record } = locate(source, id);
  const line = record.sourceLine;
  const candidate = source.slice(0, line.start) + JSON.stringify(value) + source.slice(line.bodyEnd);
  validateMutation(source, candidate);
  return candidate;
};

export const createChild = ({ source, parentId, value }) => {
  if (!plain(value)) throw invalid('record object required');
  const { record: parent } = locate(source, parentId);
  const candidate = insertBody(source, parent, value);
  validateMutation(source, candidate);
  return candidate;
};

export const deleteLeaf = ({ source, id }) => {
  const { graph, record } = locate(source, id);
  if (record.rel === null) throw invalid('root cannot be deleted');
  if (graph.children.get(id).length) throw invalid('nonleaf cannot be deleted');
  const line = record.sourceLine;
  const candidate = source.slice(0, line.start) + source.slice(line.end);
  validateMutation(source, candidate);
  return candidate;
};

export const validateMutation = (source, candidate) => {
  if (typeof source !== 'string' || typeof candidate !== 'string') throw invalid('text required');
  const old = records(source);
  const before = old.parsed;
  const after = records(candidate).parsed;
  const oldIds = new Set(before.map(item => item.id));
  const newIds = new Set(after.map(item => item.id));
  const added = after.filter(item => !oldIds.has(item.id));
  const removed = before.filter(item => !newIds.has(item.id));

  if (after.length === before.length && added.length === 0 && removed.length === 0) {
    const oldLines = scanLines(source);
    const newLines = scanLines(candidate);
    if (oldLines.length !== newLines.length) throw invalid('line count changed');
    const changed = [];
    for (let index = 0; index < oldLines.length; index += 1) {
      if (oldLines[index].delimiter !== newLines[index].delimiter) throw invalid('line delimiter changed');
      if (oldLines[index].body !== newLines[index].body) changed.push(index);
    }
    if (changed.length !== 1) throw invalid('exactly one record line must change');
    const oldRecord = before.find(item => item.line === changed[0] + 1);
    const newRecord = after.find(item => item.line === changed[0] + 1);
    if (!oldRecord || !newRecord || oldRecord.id !== newRecord.id) throw invalid('record identity changed');
    if (!equal(oldRecord.rel?.parent, newRecord.rel?.parent)) throw invalid('rel.parent is immutable');
    if ((oldRecord.rel === null) !== (newRecord.rel === null)) throw invalid('root relation is immutable');
    return Object.freeze({ operation: 'update', id: oldRecord.id, line: oldRecord.line });
  }

  if (after.length === before.length + 1 && added.length === 1 && removed.length === 0) {
    const created = added[0];
    if (!created.rel) throw invalid('new root prohibited');
    const parent = before.find(item => item.id === created.rel.parent);
    if (!parent) throw invalid('new parent must be existing');
    if (candidate !== insertBody(source, parent, created)) throw invalid('create must insert exactly after parent without changing surviving bytes');
    return Object.freeze({ operation: 'create', id: created.id, parentId: parent.id, line: created.line });
  }

  if (after.length === before.length - 1 && removed.length === 1 && added.length === 0) {
    const deleted = removed[0];
    if (deleted.rel === null) throw invalid('root cannot be deleted');
    if (old.graph.children.get(deleted.id).length) throw invalid('nonleaf cannot be deleted');
    const line = deleted.sourceLine;
    const expected = source.slice(0, line.start) + source.slice(line.end);
    if (candidate !== expected) throw invalid('delete must remove one leaf without changing surviving bytes');
    return Object.freeze({ operation: 'delete', id: deleted.id, line: deleted.line });
  }

  throw invalid('exactly one update, create, or delete required');
};

// Retain the first-slice API for existing callers.
export const editExistingField = ({ source, id, key, value }) => {
  if (typeof key !== 'string' || !key || key === 'id' || key === 'rel') throw invalid('identity/relation is locked');
  const { record } = locate(source, id);
  if (!Object.hasOwn(record, key)) throw invalid(`unknown field ${key}`);
  if (equal(record[key], value)) throw invalid('value is unchanged');
  return updateRecord({ source, id, value: { ...record, [key]: value } });
};

export const validateSingleFieldEdit = (source, candidate) => {
  const result = validateMutation(source, candidate);
  if (result.operation !== 'update') throw invalid('one existing field required');
  const oldRecord = parseControl(source).find(item => item.id === result.id);
  const newRecord = parseControl(candidate).find(item => item.id === result.id);
  const oldKeys = Object.keys(oldRecord);
  if (!equal(oldKeys, Object.keys(newRecord))) throw invalid('record fields changed');
  const changed = oldKeys.filter(key => !equal(oldRecord[key], newRecord[key]));
  if (changed.length !== 1 || changed[0] === 'id' || changed[0] === 'rel') throw invalid('one non-identity field required');
  return Object.freeze({ id: result.id, key: changed[0], line: result.line });
};
