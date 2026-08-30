import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as legacy from '../dist/protocol/v3/modules/transport/smap-source.js';
import * as canonical from '../dist/protocol/v3/modules/transport/source-export.js';
import {
  createDecisionLog,
  createEnvelope,
  createInlineSmapUrl,
} from '../dist/protocol/v3/codec.mjs';

assert.deepEqual(Object.keys(legacy).sort(), ['SOURCE_EXPORT_SCHEMA', 'decompileSmapInvocation']);
assert.equal(legacy.SOURCE_EXPORT_SCHEMA, canonical.SOURCE_EXPORT_SCHEMA);
assert.equal(legacy.decompileSmapInvocation, canonical.decompileSmapInvocation);

const records = readFileSync(new URL('../examples/new.jsonl', import.meta.url), 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map(line => JSON.parse(line));
const created = await createDecisionLog(records, 'legacy-dist-source-path');
const envelope = await createEnvelope(created.log, null, { pattern: 'map/1' });
const url = await createInlineSmapUrl(envelope, { base: 'https://example.test/app' });
const [legacyResult, canonicalResult] = await Promise.all([
  legacy.decompileSmapInvocation(url),
  canonical.decompileSmapInvocation(url),
]);
assert.deepEqual(legacyResult, canonicalResult);
assert.equal(legacyResult.mapId, 'legacy-dist-source-path');

console.log(JSON.stringify({
  schema: 'semantic-map-smap-source-compatibility-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  legacyPath: '/protocol/v3/modules/transport/smap-source.js',
  canonicalPath: '/protocol/v3/modules/transport/source-export.js',
  exports: Object.keys(legacy).sort(),
}, null, 2));
