// A supplied relation that is not drawn (`visible:false`) but is on a declared
// path stays reachable: it is reported as omitted, found by search, and,
// chosen there, brings a drawn end of it into view. Pure; no browser.
import assert from 'node:assert/strict';
import { entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld } from '../packages/control/src/atlas-world-projection.mjs';
import { searchAtlasWorld } from '../packages/control/src/atlas-world-search.mjs';
import { bundledWorld } from './fixtures/atlas-timeline-frames.mjs';

const ref = (kind, id) => ({ space: 'fixture:hidden', kind, id });
const world = bundledWorld();
const [purposeArea, scopeArea] = world.presentation.areas.map(area => area.id);
const source = world.frames[0].entities[0].source;
const entity = (kind, id, area, order) => ({ ref: ref(kind, id), label: id, area, order, visible: true, activity: 'none', source, flags: [] });
const relation = (id, from, to, extra = {}) => ({ ref: ref('declared-relation', id), from, to, kind: 'declared-relation', label: id, source, flags: [], path: true, ...extra });
world.frames = [{
  ...world.frames[0], id: 'hidden', rev: 1,
  entities: [entity('purpose', 'Purpose', purposeArea, 0), entity('target', 'Target', purposeArea, 1), entity('current', 'Current', purposeArea, 2),
    entity('scope', 'Scope', scopeArea, 0)],
  relations: [
    relation('change', ref('current', 'Current'), ref('scope', 'Scope'), { visible: false }),
    relation('take', ref('scope', 'Scope'), ref('target', 'Target')),
    relation('target', ref('target', 'Target'), ref('purpose', 'Purpose')),
    relation('changes', ref('current', 'Current'), ref('target', 'Target'), { label: '変化 1 件', path: false }),
  ],
}];
world.comparisons = [];
world.presentation = { ...world.presentation, directionTargets: [ref('purpose', 'Purpose')], defaultSelection: ref('purpose', 'Purpose') };
const input = parseAtlasWorldInput(world);
const frame = input.frames[0];
const hidden = relationKey(ref('declared-relation', 'change'));

const projection = projectAtlasWorld({ input, frame, selected: hidden });
assert.ok(!projection.scene.relations.some(item => item.relationIds.includes(hidden)), 'the hidden relation is not drawn');
assert.ok(projection.omittedRelationIds.includes(hidden), 'it is reported as omitted');
assert.ok(searchAtlasWorld(frame, 'change').some(row => row.key === hidden), 'search finds the hidden relation');
// Chosen from the search, it brings its drawn from box (Current) into view.
assert.equal(projection.selectedRegionId, 'world:' + entityKey(ref('current', 'Current')), 'its from box is focused');
console.log(JSON.stringify({ status: 'atlas-world-hidden-paths-checks-pass' }));
