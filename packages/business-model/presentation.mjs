import {
  assertBusinessModelProjectionCoverage,
  compileBusinessModelPresentationPlan,
  createBusinessModelProjectionCoverage,
  projectProfiledBusinessModelA2uiSequence,
  projectProfiledBusinessModelMapState,
  projectProfiledBusinessModelSeqState,
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
  invariant(presentation.a2ui.catalogId === PROFILED_BUSINESS_MODEL_CATALOG_ID, 'A2UI catalogId mismatch');
  invariant(presentation.a2ui.surfaceId === PROFILED_BUSINESS_MODEL_SURFACE_ID, 'A2UI surfaceId mismatch');
  const model = runtimeData.model;
  const profile = derivePublicBusinessModelProjectionProfile(model);
  invariant(presentation.a2ui.profileId === profile.id, 'A2UI profileId mismatch');
  const plan = compileBusinessModelPresentationPlan(model, profile);
  const sequence = validateProfiledBusinessModelSequence(projectProfiledBusinessModelA2uiSequence(model, plan));
  const seqState = projectProfiledBusinessModelSeqState(model, plan);
  const mapState = projectProfiledBusinessModelMapState(model, plan);
  const coverage = assertBusinessModelProjectionCoverage(createBusinessModelProjectionCoverage({ model, plan, sequence, seqState, mapState }));
  return Object.freeze({
    schema: 'business-model-presentation-minimal-payload/1',
    id: model.id,
    label: model.title,
    sequence,
    seqState,
    stageFocus: Object.freeze(Object.fromEntries(model.stages.map(stage => [stage.id, stage.focusRef]))),
    stageLabels: Object.freeze(Object.fromEntries(model.stages.map(stage => [stage.id, stage.name]))),
    coverage,
  });
};
