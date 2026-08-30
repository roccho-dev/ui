import { executeArtifactPackage as executeSemanticMapPackage } from '../semantic-map/runtime.js';
import { projectDecisionPacket } from './projection/to-semantic-map.js';

export async function executeArtifactPackage({ document, eventTarget, input, invocation, surfaceMount }) {
  const projected = await projectDecisionPacket(input.packet);
  const mapReceipt = await executeSemanticMapPackage({
    document,
    eventTarget,
    input: Object.freeze({ envelope: projected.envelope }),
    invocation,
    surfaceMount,
  });
  return Object.freeze({
    schema: 'decision-packet-render-receipt/1',
    decisionId: projected.packet.decision_id,
    checkpointId: projected.packet.checkpoint_id,
    packetDigest: projected.packet.packet_digest,
    map: mapReceipt,
    source: Object.freeze({ contract: 'decision-packet/1', mode: 'semantic-map-projection' }),
  });
}
