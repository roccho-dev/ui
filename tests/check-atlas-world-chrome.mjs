// Chrome composition checks for the World projection. Pure; no browser.
// 'full' is the established HUD screen. 'none' draws the three areas alone:
// no HUD region, a focus marker only on a drawn region, the same scene. Both
// keep the timeline layer, which is checked in check-atlas-world-timeline.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containmentIndex, entityKey, parseAtlasWorldInput, relationKey } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, projectWorldScene, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { TIMELINE_ID_PREFIX } from '../packages/control/src/atlas-timeline.mjs';

const raw = JSON.parse(readFileSync(new URL('../examples/atlas/input/a2-world.json', import.meta.url), 'utf8'));

// Hide one contained entity whose container stays drawn, so 'none' has an
// omitted entity to place.
const withOmitted = structuredClone(raw);
const hiddenFrame = withOmitted.frames.at(-1);
const parents = containmentIndex(parseAtlasWorldInput(withOmitted).frames.at(-1)).parentByChild;
const hidden = hiddenFrame.entities.find(item => parents.has(entityKey(item.ref)));
assert.ok(hidden, 'fixture has a contained entity');
hidden.visible = false;

let cases = 0;
for (const input of [parseAtlasWorldInput(raw), parseAtlasWorldInput(withOmitted)]) {
  for (const [index, frame] of input.frames.entries()) {
    const counterpart = input.frames[index === 0 ? input.frames.length - 1 : 0];
    const scene = projectWorldScene({ input, frame });
    // The chrome-free view fits nested areas to their content as well.
    const fittedScene = projectWorldScene({ input, frame, fitNested: true });
    const drawn = new Set(scene.representations.map(item => item.regionId));
    const keys = [...frame.entities.map(item => entityKey(item.ref)), ...frame.relations.map(item => relationKey(item.ref)), 'entity:missing/none/none'];
    for (const selected of keys) {
      for (const viewport of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }]) {
        const args = { input, frame, counterpart: counterpart === frame ? null : counterpart, selected, viewport,
          camera: { scale: 0.8, translateX: -10, translateY: 20 } };
        const full = projectAtlasWorld(args);
        const none = projectAtlasWorld({ ...args, chrome: 'none' });

        assert.deepEqual(projectAtlasWorld({ ...args, chrome: 'full' }), full, 'full is the default');
        // The timeline layer is present in both chromes and is not HUD.
        const timelineOf = projection => projection.scene.representations.filter(item => item.regionId.startsWith(TIMELINE_ID_PREFIX));
        const withoutTimeline = projection => projection.scene.representations.filter(item => !item.regionId.startsWith(TIMELINE_ID_PREFIX));
        assert.ok(timelineOf(none).length > 0 && timelineOf(full).length === timelineOf(none).length, 'both chromes keep the timeline layer');
        assert.deepEqual(withoutTimeline(none), fittedScene.representations, 'none draws exactly the fitted World scene besides the timeline');
        assert.deepEqual(withoutTimeline(full).slice(0, scene.representations.length), scene.representations,
          'full draws the same scene first');
        const hud = withoutTimeline(full).slice(scene.representations.length);
        assert.ok(hud.length > 0 && hud.every(item => item.isGuide && item.zIndex >= 10000), 'full adds only HUD regions');
        assert.equal(withoutTimeline(none).filter(item => item.isGuide || item.zIndex >= 10000).length, 0, 'none has no HUD region');
        assert.deepEqual(none.scene.relations, full.scene.relations, 'same relations');
        assert.deepEqual([none.world, full.world], [fittedScene.world, scene.world], 'each chrome takes its own scene\'s World bounds');
        assert.deepEqual(none.detail, full.detail, 'detail text and pages do not depend on the chrome');
        assert.deepEqual(none.selected, full.selected, 'same selected record');

        assert.ok(none.selectedRegionId === null || drawn.has(none.selectedRegionId),
          'none focus marker is null or a drawn region: ' + selected + ' -> ' + none.selectedRegionId);
        if (drawn.has('world:' + selected)) assert.equal(none.selectedRegionId, 'world:' + selected, 'a drawn entity marks itself');
        if (selected.startsWith('relation:') || !frame.entities.some(item => entityKey(item.ref) === selected)) {
          assert.equal(none.selectedRegionId, null, 'relations and missing records mark no region');
        }
        assert.equal(none.viewport.panel, null, 'none reserves no panel');
        assert.deepEqual(none.viewport.graph, worldViewport(viewport, { panel: false }).graph, 'none graph takes the viewport');
        cases += 1;
      }
    }
  }
}

// The hidden entity marks its nearest drawn container in 'none'.
const omittedInput = parseAtlasWorldInput(withOmitted);
const omittedFrame = omittedInput.frames.at(-1);
const hiddenKey = entityKey(hidden.ref);
const placed = projectAtlasWorld({ input: omittedInput, frame: omittedFrame, selected: hiddenKey, chrome: 'none' });
assert.ok(placed.omittedEntityIds.includes(hiddenKey), 'the hidden entity is omitted');
assert.equal(placed.selectedRegionId, 'world:' + parents.get(hiddenKey), 'omitted entity marks its drawn container');
assert.equal(projectAtlasWorld({ input: omittedInput, frame: omittedFrame, selected: hiddenKey }).selectedRegionId,
  'world:omitted-entity-cycle', 'full keeps the HUD recovery control');

assert.throws(() => projectAtlasWorld({ input: omittedInput, frame: omittedFrame, selected: hiddenKey, chrome: 'timeline' }), /unsupported chrome/);
console.log(JSON.stringify({ status: 'atlas-world-chrome-checks-pass', cases }));
