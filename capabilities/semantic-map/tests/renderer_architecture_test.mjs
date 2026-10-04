import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer-maxgraph');
const files = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.js$/u.test(entry.name))
  .map(entry => path.join(root, entry.name))
  .sort();
const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');

assert.doesNotMatch(source, /(^|[^\w$])class\s+[\w$]+/mu, 'first-party maxGraph renderer must be factory/function composition');
assert.doesNotMatch(source, /export\s+default/u, 'first-party maxGraph renderer must not use default exports');
assert.match(source, /export const createMaxGraphAdapter\s*=/u);
assert.doesNotMatch(source, /new\s+MaxGraphAdapter\b/u);

console.log(JSON.stringify({ schema: 'semantic-map-renderer-architecture-test/1', status: 'PASS', files: files.length }));
