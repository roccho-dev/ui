import { splitDataPinJSONL } from '../data-pin/contract.mjs';
import { parseBusinessModelSemanticJsonl } from '../business-model/model.mjs';

export const compilePresentationRuntimeData = semanticText => {
  if (typeof semanticText !== 'string' || !semanticText.trim()) throw new Error('source-compiler.presentation: non-empty JSONL required');
  const source = splitDataPinJSONL(semanticText);
  parseBusinessModelSemanticJsonl(source.dataText);
  return semanticText.endsWith('\n') ? semanticText : `${semanticText}\n`;
};
