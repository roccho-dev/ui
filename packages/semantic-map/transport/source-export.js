import { recordsToJSONL } from '../domain/index.js';
import { canonicalJson, inspectEnvelope } from '../protocol/index.js';
import { resolveSmapInvocation } from './smap-delivery.js';

export const SOURCE_EXPORT_SCHEMA = 'semantic-map-source-export/1';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-source-export: ${message}`);
}

function fromInspection(inspection, delivery = null) {
  invariant(inspection && typeof inspection === 'object', 'Envelope inspection is required');
  const proposalStateJSONL = inspection.preview
    ? recordsToJSONL(inspection.preview.records)
    : null;
  const proposal = inspection.preview
    ? Object.freeze({
      decisionId: inspection.envelope.proposal.id,
      stateHash: inspection.preview.stateHash,
      stateJSONL: proposalStateJSONL,
    })
    : null;
  return Object.freeze({
    schema: SOURCE_EXPORT_SCHEMA,
    mapId: inspection.base.mapId,
    head: inspection.base.head,
    stateHash: inspection.base.stateHash,
    stateJSONL: recordsToJSONL(inspection.base.records),
    proposalStateJSONL,
    decisionLogJSONL: inspection.base.log,
    envelopeJSON: `${canonicalJson(inspection.envelope)}\n`,
    proposal,
    view: inspection.envelope.view,
    delivery,
  });
}

export async function exportEnvelopeSources(input) {
  return fromInspection(await inspectEnvelope(input));
}

export async function decompileSmapUrl(input, options = {}) {
  const inspection = await resolveSmapInvocation(input, options);
  invariant(inspection, 'URL has no #smap or #smap-ref invocation');
  const invocation = inspection.delivery ?? Object.freeze({ mode: 'inline' });
  return fromInspection(inspection, invocation);
}

export async function decompileSmapInvocation(input, options = {}) {
  return decompileSmapUrl(input, options);
}
