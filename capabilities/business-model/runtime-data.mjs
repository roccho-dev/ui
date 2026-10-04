import { splitDataPinJSONL } from '../data-pin/contract.mjs';
import { parseBusinessModelSemanticJsonl } from './model.mjs';

export const BUSINESS_MODEL_RUNTIME_DATA_SCHEMA = 'business-model-runtime-data/1';

const fail = message => { throw new Error(`business-model-runtime-data: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };

export const parseBusinessModelRuntimeJsonl = input => {
  invariant(typeof input === 'string' && input.trim().length > 0, 'non-empty JSONL text is required');
  const source = splitDataPinJSONL(input);
  const semanticText = `${source.dataText.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).join('\n')}\n`;
  const model = parseBusinessModelSemanticJsonl(semanticText);
  return Object.freeze({
    schema: BUSINESS_MODEL_RUNTIME_DATA_SCHEMA,
    semanticText,
    model,
    dataPins: source.dataPinRecords,
  });
};
