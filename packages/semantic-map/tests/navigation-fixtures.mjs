import { createHash } from 'node:crypto';
import { createDecisionLog, createEnvelope } from '../protocol/index.js';

// Two unrelated domains use the same input contract and UI paths. Opaque IDs,
// descriptive labels and summaries deliberately avoid a tiny-label size oracle.
const products = ['Customer onboarding', 'Access review', 'Invoice reconciliation', 'Deployment approval',
  'Incident response', 'Data retention', 'Supplier assessment', 'Quarterly reporting',
  'Service recovery', 'Contract amendment', 'Regional operations', 'Account verification'];
const organization = ['Executive office', 'Operations team', 'Finance committee', 'Service desk',
  'Security review', 'People operations', 'Regional leadership', 'Customer success',
  'Procurement team', 'Audit committee', 'Engineering council', 'Risk management'];
export async function navigationFixture({ count = 30, relations = 45, name = 'A', kind = 'product' } = {}) {
  const labels = kind === 'product' ? products : organization;
  const id = (type, i) => `${type}.${createHash('sha256').update(`navigation-v3:${name}:${type}:${i}`).digest('hex').slice(0, 24)}`;
  const ids = Array.from({ length: count }, (_, i) => id('region', i));
  const records = [{ type: 'meta', schema: 'semantic-map-state/1', root: ids[0], title: `${name}: ${kind} hierarchy` },
    ...ids.map((key, i) => ({ type: 'region', id: key, parent: i === 0 ? null : i <= 6 ? ids[i - 1] : ids[0],
      label: i === 0 ? `${name}: ${kind} hierarchy` : `${labels[i % labels.length]} / case ${1000 + i}`,
      kind: i === 0 ? 'root' : i <= 6 ? 'group' : 'process', bounds: [0, 0, i === 0 ? 1400 : i <= 6 ? 600 : 180, i === 0 ? 760 : i <= 6 ? 400 : 80],
      summary: `Review the supporting evidence for ${labels[i % labels.length]}. Preserve the previous revision and confirm the accountable team for case ${74000 + i}.`,
      ...(i === 7 ? { href: `/${name === 'A' ? 'B' : name === 'B' ? 'C' : 'A'}.json` } : {}),
    }))];
  const pairs = new Set();
  const edge = (from, to) => {
    pairs.add(`${from}|${to}`); const i = pairs.size - 1;
    records.push({ type: 'relation', id: id('relation', i), from: ids[from], to: ids[to], kind: 'flow', label: `${labels[i % labels.length]} handoff ${2000 + i}` });
  };
  edge(6, 7); edge(8, 6); edge(5, 6); edge(7, 8); edge(8, 7);
  if (count >= 300) for (let i = 2; i < 102; i++) if (!pairs.has(`1|${i}`)) edge(1, i);
  for (let k = 0; pairs.size < relations; k++) {
    const from = 1 + k % (count - 1), to = 1 + Math.floor(k / (count - 1)) % (count - 1);
    if (from !== to && !pairs.has(`${from}|${to}`)) edge(from, to);
  }
  const log = await createDecisionLog(records, `urn:navigation:${kind}:${name}`);
  return { envelope: await createEnvelope(log.log, null, { pattern: 'graph/1',
    ...(name !== 'A' ? { frame: { focus: ids[7], scale: 1, select: [ids[7]] } } : {}) }), ids, records };
}
