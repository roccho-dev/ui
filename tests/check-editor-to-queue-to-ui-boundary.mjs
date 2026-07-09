import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const docs = read('docs/editor-to-queue-to-ui-boundary.md');
const readme = read('README.md');
const joined = `${readme}\n${docs}`;

assert.match(joined, /ui\s*=\s*targetRef emitter \+ projection reader \+ preview/);
assert.match(docs, /ui\.targetRef\.v1/);
assert.match(docs, /repoMap\.projection\.v1/);
assert.match(docs, /ops projection artifact\s*\n\s*-> ui repoMap preview/);
assert.match(docs, /-> edits queue writer\s*\n\s*-> ops queue runtime/);

for (const phrase of [
  'Append queue rows from browser code',
  'Write accepted ledger rows',
  'Perform admission or promotion',
  'Generate ops receipts as authority',
  'Treat generated HTML, screenshots, manifests, or preview digests as source authority',
]) {
  assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

assert.match(readme, /Editor to queue to UI boundary/);
assert.match(readme, /targetRef emitter \+ projection reader \+ preview/);
assert.doesNotMatch(readme, /ui owns queue runtime/i);
assert.doesNotMatch(readme, /ui owns admission/i);
assert.doesNotMatch(readme, /ui owns accepted ledger/i);

console.log(JSON.stringify({ status: 'editor-to-queue-to-ui-boundary-check-pass' }, null, 2));
