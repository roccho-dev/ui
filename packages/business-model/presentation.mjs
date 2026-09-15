import { A2UI_MESSAGE_VERSION } from '../a2ui-browser/src/index.mjs';
import {
  compileBusinessModelPresentationPlan,
  projectProfiledBusinessModelA2uiSequence,
  validateProfiledBusinessModelSequence,
} from '../presentation/compiler/index.mjs';
import { derivePublicBusinessModelProjectionProfile } from '../presentation/compiler/public-profile.mjs';
import {
  PROFILED_BUSINESS_MODEL_CATALOG_ID,
  PROFILED_BUSINESS_MODEL_SURFACE_ID,
} from '../presentation/contracts.mjs';
import { parseBusinessModelRuntimeJsonl } from './runtime-data.mjs';

const fail = message => { throw new Error(`business-model-presentation: ${message}`); };
const invariant = (condition, message) => { if (!condition) fail(message); };

export const compileBusinessModelPresentationPayload = input => {
  const runtimeData = typeof input === 'string' ? parseBusinessModelRuntimeJsonl(input) : input;
  const presentation = runtimeData?.presentation;
  invariant(presentation, 'presentation A2UI record is required');
  const create = presentation.a2ui;
  invariant(create.version === A2UI_MESSAGE_VERSION, 'A2UI version mismatch');
  invariant(create.createSurface.catalogId === PROFILED_BUSINESS_MODEL_CATALOG_ID, 'A2UI catalogId mismatch');
  invariant(create.createSurface.surfaceId === PROFILED_BUSINESS_MODEL_SURFACE_ID, 'A2UI surfaceId mismatch');
  const model = runtimeData.model;
  const profile = derivePublicBusinessModelProjectionProfile(model);
  invariant(presentation.profileId === profile.id, 'A2UI profileId mismatch');
  const plan = compileBusinessModelPresentationPlan(model, profile);
  const projected = projectProfiledBusinessModelA2uiSequence(model, plan);
  const firstStage = projected.stages[0];
  invariant(firstStage?.messages?.[0]?.createSurface, 'projected createSurface is missing');
  const sequence = validateProfiledBusinessModelSequence(Object.freeze({
    ...projected,
    stages: Object.freeze(projected.stages.map((stage, index) => index === 0
      ? Object.freeze({ ...stage, messages: Object.freeze([create, ...stage.messages.slice(1)]) })
      : stage)),
  }));
  return Object.freeze({
    schema: 'business-model-presentation-runtime-payload/1',
    id: model.id,
    label: model.title,
    sequence,
    stageFocus: Object.freeze(Object.fromEntries(model.stages.map(stage => [stage.id, stage.focusRef]))),
    stageLabels: Object.freeze(Object.fromEntries(model.stages.map(stage => [stage.id, stage.name]))),
  });
};
