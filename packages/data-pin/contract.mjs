export const DATA_PIN_RECORD_TYPE = 'data-pin';
export const DATA_PIN_BASES = Object.freeze(['premise', 'dependency', 'given']);

const BASES = new Set(DATA_PIN_BASES);
const invariant = (condition, message) => { if (!condition) throw new Error(`data-pin: ${message}`); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const exactKeys = (value, required, name) => {
  const allowed = new Set(required);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};

const text = (value, name, { max = null } = {}) => {
  invariant(typeof value === 'string' && value.trim().length > 0, `${name} must be a non-empty string`);
  const result = value.trim();
  if (max !== null) invariant(result.length <= max, `${name} is too long`);
  return result;
};

export const normalizeDataPinRecord = input => {
  invariant(plain(input), 'record must be an object');
  exactKeys(input, ['type', 'targetId', 'basis', 'reason'], 'record');
  invariant(input.type === DATA_PIN_RECORD_TYPE, `record.type must be ${DATA_PIN_RECORD_TYPE}`);
  const targetId = text(input.targetId, 'record.targetId', { max: 240 });
  invariant(BASES.has(input.basis), `record.basis must be ${DATA_PIN_BASES.join(', ')}`);
  return Object.freeze({
    type: DATA_PIN_RECORD_TYPE,
    targetId,
    basis: input.basis,
    reason: text(input.reason, 'record.reason'),
  });
};

export const splitDataPinRecords = records => {
  invariant(Array.isArray(records), 'records must be an array');
  const dataRecords = [];
  const dataPinRecords = [];
  for (const record of records) {
    if (record?.type === DATA_PIN_RECORD_TYPE) dataPinRecords.push(record);
    else dataRecords.push(record);
  }
  return Object.freeze({
    dataRecords: Object.freeze(dataRecords),
    dataPinRecords: Object.freeze(dataPinRecords),
  });
};

export const targetIdsFromRecords = records => {
  invariant(Array.isArray(records), 'data records must be an array');
  const ids = new Set();
  for (const record of records) {
    if (!plain(record) || !Object.hasOwn(record, 'id')) continue;
    const id = text(record.id, 'data record id', { max: 240 });
    invariant(!ids.has(id), `duplicate data id: ${id}`);
    ids.add(id);
  }
  return ids;
};

export const normalizeDataPinRecords = (records, targetIds = null) => {
  invariant(Array.isArray(records), 'pin records must be an array');
  invariant(targetIds === null || targetIds instanceof Set, 'targetIds must be a Set');
  const seen = new Set();
  const normalized = records.map(record => {
    const value = normalizeDataPinRecord(record);
    invariant(!seen.has(value.targetId), `duplicate target: ${value.targetId}`);
    if (targetIds) invariant(targetIds.has(value.targetId), `target not found: ${value.targetId}`);
    seen.add(value.targetId);
    return value;
  });
  normalized.sort((left, right) => left.targetId.localeCompare(right.targetId));
  return Object.freeze(normalized);
};

export const dataPinMap = (records, targetIds = null) => new Map(
  normalizeDataPinRecords(records, targetIds).map(record => [record.targetId, record]),
);

export const dataPinRecordsFromMap = input => {
  invariant(input instanceof Map, 'pin state must be a Map');
  return normalizeDataPinRecords([...input.values()]);
};

export const splitDataPinJSONL = input => {
  invariant(typeof input === 'string' && input.trim().length > 0, 'JSONL must be a non-empty string');
  const dataLines = [];
  const records = [];
  const pinRecords = [];
  for (const [index, line] of input.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch (error) { throw new Error(`data-pin: invalid JSONL line ${index + 1}: ${error.message}`); }
    invariant(plain(record), `JSONL line ${index + 1} must be an object`);
    if (record.type === DATA_PIN_RECORD_TYPE) pinRecords.push(record);
    else {
      records.push(record);
      dataLines.push(line);
    }
  }
  invariant(records.length > 0, 'at least one data record is required');
  const targetIds = pinRecords.length > 0 ? targetIdsFromRecords(records) : null;
  const dataPinRecords = normalizeDataPinRecords(pinRecords, targetIds);
  return Object.freeze({
    dataRecords: Object.freeze(records),
    dataPinRecords,
    dataText: `${dataLines.join('\n')}\n`,
  });
};

export const dataPinContract = Object.freeze({
  recordType: DATA_PIN_RECORD_TYPE,
  bases: DATA_PIN_BASES,
});
