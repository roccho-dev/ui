import { createDecisionLog, createEnvelope } from '../../semantic-map/protocol/index.js';
import { inspectDecisionPacket } from '../protocol/packet.js';

const clip = (value, max = 1_900) => value.length <= max ? value : `${value.slice(0, max - 1)}…`;
const entrySummary = (entries, empty) => clip(entries.length
  ? entries.map((entry) => `${entry.label}: ${entry.summary || '—'}`).join('\n')
  : empty);
const sectionSummary = (sections) => clip(sections.map(([label, value]) => `${label}\n${value}`).join('\n\n'));
const region = (id, label, kind, bounds, summary) => Object.freeze({
  type: 'region', id, parent: 'decision-room', label, kind, bounds, summary: clip(summary),
});
const relation = (id, from, to, kind, label) => Object.freeze({ type: 'relation', id, from, to, kind, label });

export async function projectDecisionPacket(input) {
  const inspected = await inspectDecisionPacket(input);
  const packet = inspected.packet;
  const records = Object.freeze([
    Object.freeze({ type: 'meta', schema: 'semantic-map-state/1', root: 'decision-room', title: packet.title }),
    Object.freeze({
      type: 'region', id: 'decision-room', parent: null, label: packet.title, kind: 'root', bounds: [0, 0, 1_420, 780],
      summary: clip(`${packet.status}\n${packet.recommendation}`),
    }),
    region('question', 'Question', 'input', [60, 90, 250, 120], packet.question),
    region('context', 'Context', 'definition', [60, 270, 270, 170], sectionSummary([
      ['Rationale', packet.rationale],
      ['Changed', entrySummary(packet.changed_since_previous, 'No previous checkpoint.')],
      ['Conditions', entrySummary(packet.conditions, 'No explicit condition.')],
    ])),
    region('evidence-for', 'Evidence for', 'evidence', [60, 510, 270, 150], entrySummary(packet.evidence_for, 'No supporting evidence.')),
    region('evidence-against', 'Evidence against', 'risk', [385, 510, 270, 150], entrySummary(packet.evidence_against, 'No counterevidence.')),
    region('alternatives', 'Alternatives', 'option', [385, 90, 270, 150], entrySummary(packet.alternatives, 'No alternative recorded.')),
    region('gaps', 'Gaps', 'risk', [385, 300, 270, 160], sectionSummary([
      ['Gaps', entrySummary(packet.gaps, 'No known gap.')],
      ['Conflicts', entrySummary(packet.conflicts, 'No unresolved conflict.')],
    ])),
    region('recommendation', 'Recommendation', 'decision', [720, 250, 290, 170], packet.recommendation),
    region('next-action', 'Next action', 'process', [1_075, 130, 260, 130], packet.next_action),
    region('success', 'Success', 'constraint', [1_075, 330, 260, 150], entrySummary(packet.success_conditions, 'No success condition.')),
    region('outcomes', 'Outcomes', 'output', [1_075, 550, 260, 130], entrySummary(packet.outcomes, 'No outcome recorded yet.')),
    region('trace', 'Trace', 'evidence', [720, 520, 290, 160], clip([
      `Decision: ${packet.decision_id}`,
      `Checkpoint: ${packet.checkpoint_id}`,
      `Packet: ${packet.packet_digest}`,
      `Query: ${packet.query_contract_digest}`,
      entrySummary(packet.record_refs, 'No record reference.'),
    ].join('\n'))),
    relation('question-recommendation', 'question', 'recommendation', 'informs', 'evaluate'),
    relation('context-recommendation', 'context', 'recommendation', 'constrains', 'context'),
    relation('support-recommendation', 'evidence-for', 'recommendation', 'supports', 'supports'),
    relation('challenge-recommendation', 'evidence-against', 'recommendation', 'challenges', 'challenge'),
    relation('compare-recommendation', 'alternatives', 'recommendation', 'compares', 'compare'),
    relation('gaps-recommendation', 'gaps', 'recommendation', 'blocks', 'gap'),
    relation('recommendation-next', 'recommendation', 'next-action', 'authorizes', 'act'),
    relation('next-success', 'next-action', 'success', 'evaluates', 'gate'),
    relation('next-outcomes', 'next-action', 'outcomes', 'observes', 'result'),
    relation('trace-recommendation', 'trace', 'recommendation', 'proves', 'trace'),
  ]);
  const mapId = `decision-packet:${packet.decision_id}`;
  const base = await createDecisionLog(records, mapId);
  const envelope = await createEnvelope(base.log, null, { pattern: 'graph/1', frame: { focus: 'decision-room', scale: 0.8 } });
  return Object.freeze({ packet, packetDigest: inspected.packet_digest, mapId, records, envelope });
}
