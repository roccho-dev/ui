import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import { SemanticDomainStore } from '../domain/authoring-store.js';
import { createDecisionLog, createEnvelope, defaultViewForPattern, inspectEnvelope } from '../protocol/index.js';
import { DecisionRuntime } from '../authoring/runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const records = parseSemanticMapRecords(await fs.readFile(path.join(here, 'fixture.jsonl'), 'utf8'));
const created = await createDecisionLog(records, 'urn:test:decision-runtime');
const envelope = await createEnvelope(created.log, null, defaultViewForPattern('graph/1'));
const runtime = await DecisionRuntime.create(envelope);
const store = new SemanticDomainStore(createSemanticMap(runtime.records));
runtime.attachStore(store);

const base = runtime.snapshot();
store.perform({ type: 'RenameRegion', regionId: 'input', label: 'Input accepted' });
assert.equal(runtime.draftCount(), 1);
assert.equal(runtime.head, base.head);
assert.equal(runtime.stateHash, base.stateHash);
const proposal = await runtime.createDraftProposal();
const preview = await runtime.preview(proposal);
assert.notEqual(preview.head, base.head);
assert.equal(runtime.head, base.head);

const preflight = await runtime.preflightAccept(proposal);
assert.equal(preflight.head, base.head);
assert.equal(preflight.envelope.proposal, null);
const accepted = await runtime.accept(proposal);
assert.equal(runtime.draftCount(), 0);
assert.equal(runtime.head, accepted.decisionId);
assert.notEqual(runtime.head, base.head);
assert.notEqual(runtime.stateHash, base.stateHash);
assert.equal(store.domain.regions.get('input').label, 'Input accepted');
const acceptedInspection = await inspectEnvelope(accepted.envelope);
assert.equal(acceptedInspection.base.head, runtime.head);
assert.equal(acceptedInspection.base.stateHash, runtime.stateHash);
assert.equal(acceptedInspection.envelope.view.pattern, 'graph/1');

const acceptedHead = runtime.head;
const acceptedHash = runtime.stateHash;
store.perform({ type: 'RenameRegion', regionId: 'input', label: 'Rejected draft' });
assert.equal(runtime.draftCount(), 1);
const rejected = await runtime.reject({ local: true });
assert.equal(runtime.draftCount(), 0);
assert.equal(runtime.head, acceptedHead);
assert.equal(runtime.stateHash, acceptedHash);
assert.equal(store.domain.regions.get('input').label, 'Input accepted');
const rejectedInspection = await inspectEnvelope(rejected.envelope);
assert.equal(rejectedInspection.base.head, acceptedHead);

console.log(JSON.stringify({ schema: 'semantic-map-decision-runtime-test/1', status: 'PASS', acceptedHead }));
