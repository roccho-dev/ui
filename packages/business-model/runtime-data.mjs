import { parseBusinessModelSemanticJsonl } from './model.mjs';

export const BUSINESS_MODEL_RUNTIME_DATA_SCHEMA = 'business-model-runtime-data/1';
export const BUSINESS_MODEL_PRESENTATION_A2UI_SCHEMA = 'business-model-presentation-a2ui/1';

const fail = message => { throw new Error(`business-model-runtime-data: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, name) => {
  invariant(typeof value === 'string' && value.length > 0, `${name} is required`);
  return value;
};
const exactKeys = (value, keys, name) => {
  invariant(plain(value), `${name} must be an object`);
  const expected = new Set(keys);
  for (const key of keys) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(expected.has(key), `${name}.${key} is not allowed`);
};

const parsePresentation = (record, line) => {
  exactKeys(record, ['type', 'schema', 'profileId', 'a2ui'], `line ${line}`);
  invariant(record.type === 'presentation', `line ${line}.type must be presentation`);
  invariant(record.schema === BUSINESS_MODEL_PRESENTATION_A2UI_SCHEMA, `line ${line}.schema must be ${BUSINESS_MODEL_PRESENTATION_A2UI_SCHEMA}`);
  exactKeys(record.a2ui, ['version', 'createSurface'], `line ${line}.a2ui`);
  exactKeys(record.a2ui.createSurface, ['surfaceId', 'catalogId', 'sendDataModel'], `line ${line}.a2ui.createSurface`);
  invariant(record.a2ui.createSurface.sendDataModel === true, `line ${line}.a2ui.createSurface.sendDataModel must be true`);
  return Object.freeze({
    schema: record.schema,
    profileId: text(record.profileId, `line ${line}.profileId`),
    a2ui: Object.freeze({
      version: text(record.a2ui.version, `line ${line}.a2ui.version`),
      createSurface: Object.freeze({
        surfaceId: text(record.a2ui.createSurface.surfaceId, `line ${line}.a2ui.createSurface.surfaceId`),
        catalogId: text(record.a2ui.createSurface.catalogId, `line ${line}.a2ui.createSurface.catalogId`),
        sendDataModel: true,
      }),
    }),
  });
};

export const parseBusinessModelRuntimeJsonl = input => {
  invariant(typeof input === 'string' && input.trim().length > 0, 'non-empty JSONL text is required');
  const semanticLines = [];
  let presentation = null;
  const lines = input.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let record;
    try { record = JSON.parse(line); } catch (error) { fail(`line ${index + 1} is invalid JSON: ${error.message}`); }
    invariant(plain(record), `line ${index + 1} must be an object`);
    if (record.type !== 'presentation') {
      semanticLines.push(line);
      continue;
    }
    invariant(presentation === null, 'presentation record is duplicated');
    presentation = parsePresentation(record, index + 1);
  }
  invariant(semanticLines.length > 0, 'semantic records are required');
  const semanticText = `${semanticLines.join('\n')}\n`;
  const model = parseBusinessModelSemanticJsonl(semanticText);
  return Object.freeze({
    schema: BUSINESS_MODEL_RUNTIME_DATA_SCHEMA,
    semanticText,
    model,
    presentation,
  });
};
