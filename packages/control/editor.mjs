import { connectControl, parseControl, scanLines } from './src/control-graph.mjs';

const invalid = message => Object.assign(new Error(`control-editor: ${message}`), { code: 'INVALID_EDIT' });
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const records = source => {
  const parsed = parseControl(source);
  connectControl(parsed);
  return parsed;
};

export const editExistingField = ({ source, id, key, value }) => {
  if (typeof source !== 'string') throw invalid('source required');
  if (typeof id !== 'string' || !id) throw invalid('record id required');
  if (typeof key !== 'string' || !key || key === 'id' || key === 'rel') throw invalid('identity/relation is locked');
  const record = records(source).find(item => item.id === id);
  if (!record) throw invalid(`unknown record ${id}`);
  if (!Object.hasOwn(record, key)) throw invalid(`unknown field ${key}`);
  if (equal(record[key], value)) throw invalid('value is unchanged');
  const updated = { ...record, [key]: value };
  const line = record.sourceLine;
  const candidate = source.slice(0, line.start) + JSON.stringify(updated) + source.slice(line.bodyEnd);
  validateSingleFieldEdit(source, candidate);
  return candidate;
};

export const validateSingleFieldEdit = (source, candidate) => {
  if (typeof source !== 'string' || typeof candidate !== 'string') throw invalid('text required');
  const beforeLines = scanLines(source);
  const afterLines = scanLines(candidate);
  if (beforeLines.length !== afterLines.length) throw invalid('line count changed');
  const changed = [];
  for (let index = 0; index < beforeLines.length; index += 1) {
    if (beforeLines[index].delimiter !== afterLines[index].delimiter) throw invalid('line delimiter changed');
    if (beforeLines[index].body !== afterLines[index].body) changed.push(index);
  }
  if (changed.length !== 1) throw invalid('exactly one existing line must change');

  const before = records(source);
  const after = records(candidate);
  if (before.length !== after.length) throw invalid('record count changed');
  for (let index = 0; index < before.length; index += 1) {
    if (before[index].id !== after[index].id) throw invalid('record identity changed');
    if (!equal(before[index].rel, after[index].rel)) throw invalid('relation changed');
  }
  const lineNumber = changed[0] + 1;
  const oldRecord = before.find(item => item.line === lineNumber);
  const newRecord = after.find(item => item.line === lineNumber);
  if (!oldRecord || !newRecord) throw invalid('changed line is not a record');
  const oldKeys = Object.keys(oldRecord);
  const newKeys = Object.keys(newRecord);
  if (!equal(oldKeys, newKeys)) throw invalid('record fields changed');
  const changedKeys = oldKeys.filter(key => !equal(oldRecord[key], newRecord[key]));
  if (changedKeys.length !== 1 || changedKeys[0] === 'id' || changedKeys[0] === 'rel') throw invalid('exactly one non-identity field must change');
  return Object.freeze({ id: oldRecord.id, key: changedKeys[0], line: lineNumber });
};
