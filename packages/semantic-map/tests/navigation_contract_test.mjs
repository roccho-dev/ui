import assert from 'node:assert/strict';
import { navigationFixture } from './navigation-fixtures.mjs';
import { historyInput, envelopeText } from '../authoring/navigation.js';
import { DecisionRuntime } from '../authoring/runtime.js';
import { createSemanticMap, SemanticDomainStore } from '../domain/index.js';

const a = await navigationFixture(), b = await navigationFixture({ name: 'B', kind: 'organization' });
const runtime = await DecisionRuntime.create(a.envelope);
runtime.attachStore(new SemanticDomainStore(createSemanticMap(runtime.records)));
const before = runtime.snapshot();
const prepared = await runtime.preflightInput(b.envelope);
runtime.store.perform({ type: 'RenameRegion', regionId: a.ids[7], label: 'Unaccepted change' });
assert.throws(() => runtime.commitInput(prepared), /Review Accept\/Reject/);
assert.equal(runtime.log, before.log);
runtime.store.undo();
runtime.commitInput(prepared);
assert.equal(runtime.mapId, 'urn:navigation:organization:B');
assert.equal(runtime.store.domain.meta.title, 'B: organization hierarchy');
assert.equal(runtime.draftCount(), 0);
const valid = { schema: 'semantic-map-history-input/1', mapId: runtime.mapId, head: runtime.head, envelope: b.envelope };
const scope = state => ({ history: { state: { semanticMapInput: state } }, semanticMapDataTransport: { read: async () => null } });
assert.deepEqual(await historyInput(scope(valid)), valid);
await assert.rejects(historyInput(scope({ ...valid, head: before.head })), /identity mismatch/);
await assert.rejects(historyInput({ ...scope(valid), semanticMapDataTransport: { read: async () => a.envelope } }), /URL and history input disagree/);
assert.throws(() => envelopeText({ text: 'x'.repeat(256 * 1024) }), /exceeds 256 KiB/);
assert.equal(runtime.log, prepared.inspection.base.log);
console.log(JSON.stringify({ schema: 'semantic-map-navigation-contract/1', status: 'PASS',
  cases: ['draft blocks input replacement', 'single store replacement', 'identity mismatch', 'old URL conflict', 'bounded file/history input'] }));
