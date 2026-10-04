import fs from 'node:fs/promises';
import path from 'node:path';
import { createDecisionLog } from '../../semantic-map/protocol/decision-log.js';
import { createEnvelope } from '../../semantic-map/protocol/envelope.js';
import { loadAndProject } from './project.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error(`expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
for (const name of ['meaning', 'profile', 'source-commit', 'out']) if (!args[name]) throw new Error(`--${name} is required`);
const projection = await loadAndProject({ meaningPath: args.meaning, profilePath: args.profile, sourceCommit: args['source-commit'] });
const decision = await createDecisionLog(projection.records, projection.mapId);
const envelope = await createEnvelope(decision.log, null, projection.view);
await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
await fs.writeFile(args.out, `${JSON.stringify(envelope, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', ...projection.counts, mapId: projection.mapId, head: decision.head, stateHash: decision.stateHash }));
