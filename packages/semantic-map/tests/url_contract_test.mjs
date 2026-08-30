import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDecision, createDecisionLog, createEnvelope, decisionId } from '../protocol/index.js';
import { parseSemanticMapRecords } from '../domain/index.js';
import {
  MAX_COMPRESSED_BYTES,
  MAX_URL_CHARS,
  assertUrlWithinLimit,
  createSmapUrl,
  decodeEnvelopeToken,
  encodeEnvelopeToken,
  readSmapHash,
} from '../transport/index.js';

const records = parseSemanticMapRecords(readFileSync(new URL('../examples/new.jsonl', import.meta.url), 'utf8'));
const initial = await createDecisionLog(records, 'url-contract-map');
const created = await createDecision(initial.head, [
  { type: 'RenameRegion', regionId: 'root', label: 'Changed' },
], initial.records);
const view = { pattern: 'map/1', frame: { focus: 'root', scale: 1.1, select: ['root'] } };
const envelope = await createEnvelope(initial.log, created.decision, view);

assert.equal(assertUrlWithinLimit('x'.repeat(MAX_URL_CHARS)).length, MAX_URL_CHARS);
assert.throws(() => assertUrlWithinLimit('x'.repeat(MAX_URL_CHARS + 1)), /URL exceeds 8192 characters/u, 'MUTATION:raise-url-limit-silently');

async function verifyExactBoundary() {
  const base = 'https://example.test/app';
  const baseline = await createSmapUrl(envelope, base);
  const usernameChars = MAX_URL_CHARS - baseline.length - 1;
  assert.ok(usernameChars >= 0, `baseline unexpectedly exceeds URL budget: ${baseline.length}`);
  const exactBase = `https://${'x'.repeat(usernameChars)}@example.test/app/example?ignored=yes`;
  const exact = await createSmapUrl(envelope, exactBase);
  assert.equal(exact.length, MAX_URL_CHARS);
  await assert.rejects(
    createSmapUrl(envelope, `https://${'x'.repeat(usernameChars + 1)}@example.test/app/example`),
    /URL exceeds 8192 characters/u,
  );
  assert.equal((await readSmapHash(exact)).base.head, initial.head);
  const fragmentOffset = exact.indexOf('#');
  const over = `${exact.slice(0, fragmentOffset)}x${exact.slice(fragmentOffset)}`;
  assert.equal(over.length, MAX_URL_CHARS + 1);
  await assert.rejects(readSmapHash(over), /URL exceeds 8192 characters/u);
  return Object.freeze({ baselineChars: baseline.length, exactChars: exact.length, overChars: over.length });
}

const token = await encodeEnvelopeToken(envelope);
const decoded = await decodeEnvelopeToken(token);
assert.equal(decoded.base.head, initial.head);
assert.equal(decoded.preview.head, await decisionId(created.decision));
assert.deepEqual(decoded.envelope.view, view);
assert.equal(
  await encodeEnvelopeToken({ view: envelope.view, proposal: envelope.proposal, log: envelope.log, schema: envelope.schema }),
  token,
  'canonical Envelope must have one token',
);

const url = await createSmapUrl(envelope, 'https://example.test/app/example?query=forbidden#old');
const parsed = new URL(url);
assert.equal(parsed.pathname, '/app');
assert.equal(parsed.search, '');
assert.ok(parsed.hash.startsWith('#smap='));
assert.equal((await readSmapHash(parsed.href)).base.head, initial.head);
assert.equal((await readSmapHash(parsed.hash)).base.head, initial.head);
assert.equal((await readSmapHash(`/app${parsed.hash}`)).base.head, initial.head);
assert.equal(await readSmapHash('https://example.test/app'), null);
await assert.rejects(readSmapHash('not-a-url'), /invalid URL/u);
await assert.rejects(readSmapHash('#doc=legacy'), /unsupported fragment/u);
await assert.rejects(readSmapHash('#apply=legacy'), /unsupported fragment/u);
await assert.rejects(readSmapHash(`${parsed.hash}&x=y`), /multiple fragment fields/u, 'MUTATION:accept-multiple-fragment-fields');
await assert.rejects(readSmapHash(`#smap=${token}&smap=${token}`), /multiple fragment fields/u);
await assert.rejects(readSmapHash('#smap=not-gzip'), /invalid gzip payload/u);

const oversizeBytes = new Uint8Array(MAX_COMPRESSED_BYTES + 1);
const oversizeToken = Buffer.from(oversizeBytes).toString('base64url');
await assert.rejects(decodeEnvelopeToken(oversizeToken), /compressed payload exceeds/u);

const boundary = await verifyExactBoundary();
console.log(JSON.stringify({
  schema: 'semantic-map-smap-url-contract-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  maxUrlChars: MAX_URL_CHARS,
  tokenChars: token.length,
  boundary,
  canonicalPath: parsed.pathname,
  legacyFragmentsRejected: true,
}, null, 2));
