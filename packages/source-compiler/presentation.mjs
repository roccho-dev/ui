import { A2UI_MESSAGE_VERSION } from '../a2ui-browser/src/index.mjs';
import { parseBusinessModelSemanticJsonl } from '../business-model/model.mjs';
import { BUSINESS_MODEL_PRESENTATION_A2UI_SCHEMA } from '../business-model/runtime-data.mjs';
import { derivePublicBusinessModelProjectionProfile } from '../presentation/compiler/public-profile.mjs';
import {
  PROFILED_BUSINESS_MODEL_CATALOG_ID,
  PROFILED_BUSINESS_MODEL_SURFACE_ID,
} from '../presentation/contracts.mjs';
import { canonicalJson } from '../url-module/src/index.mjs';

export const compilePresentationRuntimeData = semanticText => {
  if (typeof semanticText !== 'string' || !semanticText.trim()) throw new Error('source-compiler.presentation: non-empty JSONL required');
  const model = parseBusinessModelSemanticJsonl(semanticText);
  const profile = derivePublicBusinessModelProjectionProfile(model);
  const presentation = Object.freeze({
    type: 'presentation',
    schema: BUSINESS_MODEL_PRESENTATION_A2UI_SCHEMA,
    profileId: profile.id,
    a2ui: Object.freeze({
      version: A2UI_MESSAGE_VERSION,
      createSurface: Object.freeze({
        surfaceId: PROFILED_BUSINESS_MODEL_SURFACE_ID,
        catalogId: PROFILED_BUSINESS_MODEL_CATALOG_ID,
        sendDataModel: true,
      }),
    }),
  });
  const prefix = semanticText.endsWith('\n') ? semanticText : `${semanticText}\n`;
  return `${prefix}${canonicalJson(presentation)}\n`;
};
