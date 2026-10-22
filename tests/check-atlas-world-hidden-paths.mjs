// A supplied relation that is not drawn (`visible:false`) but is on a declared
// path stays reachable: it is reported as omitted, found by search, and,
// chosen there, brings a drawn end of it into view. Pure; no browser.
import assert from 'node:assert/strict';
import { entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld } from '../packages/control/src/atlas-world-projection.mjs';
import { searchAtlasWorld } from '../packages/control/src/atlas-world-search.mjs';
import { bundledWorld } from './fixtures/atlas-timeline-frames.mjs';
import { crowdedGapWorld } from './fixtures/atlas-gap-world.mjs';

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

// D6 (apps#73; adrs#647 c6342302345, R c6342315491): what an area does not
// draw is counted on its heading by reason, in the table's words, and each one
// is found by search. The history units have their own line and are not
// counted again; an area with nothing left out has no phrase.
const headingsOf = (world, id) => {
  const item = world.frames.find(each => each.id === id);
  const reps = projectAtlasWorld({ input: world, frame: item, selected: 'none' }).scene.representations.filter(rep => rep.atlas?.kind === 'area');
  return { item, reps, scopes: reps.find(rep => rep.atlas.areaId === 'scopes') };
};
const crowded = parseAtlasWorldInput(crowdedGapWorld());
const t4 = headingsOf(crowded, 't4');
const limitPhrase = /上限で描かない (\d+) 件（検索で読める）/u.exec(t4.scopes.label);
assert.ok(limitPhrase && Number(limitPhrase[1]) >= 1, 't4: the Scopes heading counts what the limit leaves out: ' + t4.scopes.label);
assert.equal(t4.scopes.atlas.omittedBy.limit, Number(limitPhrase[1]), 't4: the heading and the data agree');
assert.match(t4.scopes.label, / · 非表示 1 件（検索で読める）/u, 't4: the one Scope not visible (and not history) is counted apart');
assert.equal(t4.scopes.atlas.omitted, t4.scopes.atlas.omittedBy.limit + t4.scopes.atlas.omittedBy.hidden, 't4: the total is unchanged');
const drawnKeys = new Set(projectAtlasWorld({ input: crowded, frame: t4.item, selected: 'none' }).scene.representations.map(rep => rep.atlas?.ref).filter(Boolean)
  .map(entityKey));
const leftOut = t4.item.entities.filter(item => item.area === 'scopes' && item.visible && !drawnKeys.has(entityKey(item.ref)));
assert.equal(leftOut.length, t4.scopes.atlas.omittedBy.limit, 't4: exactly that many visible Scopes are not drawn');
for (const item of leftOut) assert.ok(searchAtlasWorld(t4.item, item.ref.id).some(row => row.kind === 'entity' && entityKey(row.record.ref) === entityKey(item.ref)),
  't4: search finds ' + item.ref.id);
// t6: only history is hidden; its line counts it, the heading does not.
const t6 = headingsOf(crowded, 't6');
assert.ok(t6.scopes.atlas.omitted > 0 && !/上限で描かない|非表示/u.test(t6.scopes.label), 't6: history is not counted twice: ' + t6.scopes.label);
// Nothing left out: the heading is the area's name alone.
for (const rep of headingsOf(crowded, 't0').reps) assert.equal(rep.label.includes(' · '), false, 't0: ' + rep.label);
console.log(JSON.stringify({ status: 'atlas-world-hidden-paths-checks-pass' }));
