import { readFileSync, writeFileSync } from 'node:fs';
import { createDecisionLog, createEnvelope } from '../protocol/index.js';
import { createSmapUrl } from '../transport/index.js';

function records(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeRecords(path, values) {
  writeFileSync(new URL(path, import.meta.url), `${values.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

async function regenerate({ parentPath, mountId, childPath, mapId, view }) {
  const childLog = await createDecisionLog(records(childPath), mapId);
  const childEnvelope = await createEnvelope(childLog.log, null, view);
  const childUrl = await createSmapUrl(childEnvelope, 'https://semantic-map.invalid/app');
  const relativeUrl = `/app${new URL(childUrl).hash}`;
  const parent = records(parentPath);
  const mount = parent.find((record) => record.type === 'region' && record.id === mountId);
  if (!mount?.mount) throw new Error(`${mountId} mount not found`);
  mount.mount.src = relativeUrl;
  writeRecords(parentPath, parent);
  return Object.freeze({ childHead: childLog.head, childUrlChars: relativeUrl.length });
}

const sequence = await regenerate({
  parentPath: '../examples/example.jsonl',
  mountId: 'portal',
  childPath: '../examples/sequence.jsonl',
  mapId: 'semantic-map:example:sequence-child',
  view: { pattern: 'seq/1', seq: { groupBy: 'actor', axis: 'ordinal' } },
});
const governance = await regenerate({
  parentPath: '../examples/governance-scale.jsonl',
  mountId: 'implementation',
  childPath: '../examples/governance-scale-packages.jsonl',
  mapId: 'semantic-map:proof:all-repos',
  view: { pattern: 'graph/1' },
});

console.log(JSON.stringify({ sequence, governance }));
