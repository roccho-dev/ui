import { parseBusinessModelSemanticJsonl } from '../business-model/model.mjs';

export const compilePresentationRuntimeData = semanticText => {
  if (typeof semanticText !== 'string' || !semanticText.trim()) throw new Error('source-compiler.presentation: non-empty JSONL required');
  parseBusinessModelSemanticJsonl(semanticText);
  return semanticText.endsWith('\n') ? semanticText : `${semanticText}\n`;
};
