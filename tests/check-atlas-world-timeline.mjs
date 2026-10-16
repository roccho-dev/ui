// Timeline layer checks. Pure; no browser. The browser journey (keys, the
// present control and reload) is tests/atlas-world-timeline-browser-proof.mjs.
import assert from 'node:assert/strict';
import { parseAtlasWorldInput, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { PLAN_UNDECLARED, TIMELINE_ID_PREFIX, formatViewHash, parseViewHash, stepIndex, timelinePosition } from '../packages/control/src/atlas-timeline.mjs';
import { worldWithFrames } from './fixtures/atlas-timeline-frames.mjs';

const timelineOf = projection => new Map(projection.scene.representations
  .filter(item => item.regionId.startsWith(TIMELINE_ID_PREFIX)).map(item => [item.regionId.slice(TIMELINE_ID_PREFIX.length), item]));
const hudCount = projection => projection.scene.representations
  .filter(item => !item.regionId.startsWith(TIMELINE_ID_PREFIX) && (item.isGuide || item.zIndex >= 10000)).length;

let cases = 0;
for (const count of [1, 2, 3, 5]) {
  const input = parseAtlasWorldInput(worldWithFrames(count));
  const selected = input.presentation.defaultSelection;
  const project = (index, { chrome = 'none', latest = index === count - 1, viewport = { width: 1280, height: 720 } } = {}) => {
    const pair = index === 0 && count > 1 ? worldPair(input) : worldPair(input, index);
    const frame = index === 0 && count > 1 ? pair.before : pair.after;
    return projectAtlasWorld({ input, frame, counterpart: frame === pair.after ? pair.before : pair.after, latest, viewport, chrome,
      selected: 'entity:' + encodeURIComponent(selected.space) + ':' + selected.kind + ':' + selected.id });
  };

  // Every frame is reachable by single steps back from the present, and no
  // step goes past the present.
  const visited = [];
  let position = timelinePosition(input.frames, input.frames.at(-1).id);
  visited.push(position.index);
  for (;;) {
    const next = stepIndex(position, -1);
    if (next === position.index) break;
    position = timelinePosition(input.frames, input.frames[next].id);
    visited.push(position.index);
  }
  assert.deepEqual(visited, [...Array(count).keys()].reverse(), count + ' frames: back steps visit every frame once');
  let forward = 0;
  for (let index = 0; index < count; index += 1) {
    const next = stepIndex(timelinePosition(input.frames, input.frames[index].id), 1);
    assert.ok(next <= count - 1, 'a step never leaves the received frames');
    if (index === count - 1 && next !== index) forward += 1;
  }
  assert.equal(forward, 0, count + ' frames: 0 steps into the future');

  for (let index = 0; index < count; index += 1) {
    for (const chrome of ['none', 'full']) for (const viewport of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }]) {
      const projection = project(index, { chrome, viewport });
      const cells = timelineOf(projection);
      const present = index === count - 1;
      assert.deepEqual([...cells.keys()], ['back', 'position', 'forward', 'present', 'plan'], 'one strip in every chrome');
      if (chrome === 'none') assert.equal(hudCount(projection), 0, 'none: 0 HUD regions besides the timeline');
      assert.deepEqual(projection.timeline, { index, count, present }, 'projection names the displayed position');
      assert.equal(cells.get('position').label.startsWith('表示中：' + (present ? '現在' : '過去') + ' ' + (index + 1) + '/' + count), true, 'position label');
      assert.equal(Boolean(cells.get('back').activation), index > 0, 'back steps only while a past frame remains');
      assert.equal(Boolean(cells.get('forward').activation), index < count - 1, 'forward never steps past the present');
      assert.equal(cells.get('present').activation?.type ?? null, present ? null : 'atlas.world.latest', 'return to the present from the past');
      assert.equal(cells.get('plan').label, PLAN_UNDECLARED + ' · 詳細', 'no plan is shown as undeclared, not empty');
      assert.equal(cells.get('plan').activation.type, 'atlas.world.plan-toggle', 'the plan cell only opens its detail');
      const { graph, timeline } = projection.viewport;
      assert.ok(timeline.y >= graph.y + graph.height && timeline.y + timeline.height <= viewport.height, 'strip sits below the graph inside the viewport');
      for (const item of cells.values()) {
        assert.ok(item.bounds.x >= timeline.x - 1e-9 && item.bounds.x + item.bounds.width <= timeline.x + timeline.width + 1e-9, 'cells stay in the strip');
      }
      cases += 1;
    }
  }
  // A held present (stepped onto, not followed) still offers the return.
  assert.equal(timelineOf(project(count - 1, { latest: false })).get('present').activation.type, 'atlas.world.latest');
  assert.equal(worldViewport({ width: 1280, height: 720 }, { panel: false }).panel, null);
}

// The URL fragment round trip used for reload.
for (const view of [{ selected: '', frameId: '' }, { selected: 'entity:a%3Ab:c:d & e', frameId: '' },
  { selected: 'relation:x:y:z', frameId: 'after-t2' }, { selected: '', frameId: 't 3/#?' }]) {
  assert.deepEqual(parseViewHash(formatViewHash(view)), view, 'fragment round trip ' + JSON.stringify(view));
}
assert.equal(formatViewHash({ selected: 'k', frameId: '' }), '#sel=k', 'the present writes no t');
assert.deepEqual(parseViewHash('#sel=' + encodeURIComponent('entity:a%3Ab:c:d')), { selected: 'entity:a%3Ab:c:d', frameId: '' }, 'existing #sel links still read');
console.log(JSON.stringify({ status: 'atlas-world-timeline-checks-pass', cases }));
