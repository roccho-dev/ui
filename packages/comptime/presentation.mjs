import {
  assertBusinessModelProjectionCoverage,
  compileBusinessModelPresentationPlan,
  createBusinessModelProjectionCoverage,
  parseBusinessModelSemanticJsonl,
  projectProfiledBusinessModelA2uiSequence,
  projectProfiledBusinessModelMapState,
  projectProfiledBusinessModelSeqState,
  validateProfiledBusinessModelSequence,
} from '../presentation/compiler/index.mjs';
import { derivePublicBusinessModelProjectionProfile } from '../presentation/compiler/public-profile.mjs';
import { canonicalJson, sha256Hex } from '../url-module/src/index.mjs';

export const compilePresentation = async semanticText => {
  if (typeof semanticText !== 'string' || !semanticText.trim()) throw new Error('comptime.presentation: non-empty JSONL required');
  const model = parseBusinessModelSemanticJsonl(semanticText);
  const profile = derivePublicBusinessModelProjectionProfile(model);
  const plan = compileBusinessModelPresentationPlan(model, profile);
  const sequence = validateProfiledBusinessModelSequence(projectProfiledBusinessModelA2uiSequence(model, plan));
  const seqState = projectProfiledBusinessModelSeqState(model, plan);
  const mapState = projectProfiledBusinessModelMapState(model, plan);
  const coverage = assertBusinessModelProjectionCoverage(createBusinessModelProjectionCoverage({ model, plan, sequence, seqState, mapState }));
  const value = Object.freeze({
    schema: 'business-model-presentation-minimal-payload/1',
    id: model.id,
    label: model.title,
    sourceSha256: await sha256Hex(new TextEncoder().encode(semanticText)),
    profileSha256: await sha256Hex(canonicalJson(profile)),
    sequence,
    seqState,
    stageFocus: Object.fromEntries(model.stages.map(stage => [stage.id, stage.focusRef])),
    stageLabels: Object.fromEntries(model.stages.map(stage => [stage.id, stage.name])),
    coverage,
  });
  return Object.freeze({ schema: 'ui-feature-input/1', feature: 'presentation', value });
};
