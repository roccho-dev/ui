import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const required = [
  ['packages/semantic-map/tests/editor-core_test.mjs'],
  ['packages/semantic-map/tests/replace-input_test.mjs'],
  ['packages/semantic-map/tests/runtime_test.mjs'],
  ['packages/semantic-map/tests/publisher_port_test.mjs'],
  ['packages/semantic-map/tests/reconnect-relation_test.mjs'],
  ['packages/semantic-map/tests/adapter-port_test.mjs'],
];
const results = [];
for (const args of required) {
  const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) {
    process.stderr.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    process.exit(run.status ?? 1);
  }
  const receipt = JSON.parse((run.stdout ?? '').trim().split(/\r?\n/u).at(-1));
  if (receipt.status !== 'PASS') throw new Error(`${args[0]} did not pass`);
  results.push(receipt.schema);
}
console.log(JSON.stringify({
  schema: 'ui-runtime-mutations/1',
  status: 'PASS',
  phase: 'p2',
  transport: 'iframe',
  results,
}));
