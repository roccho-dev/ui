// Timeline layer checks. Pure; no browser. The browser journey (keys, the
// present control and reload) is tests/atlas-world-timeline-browser-proof.mjs.
import assert from 'node:assert/strict';
import { parseAtlasWorldInput, worldPair } from '../packages/control/src/atlas-world.mjs';
import { projectAtlasWorld, worldViewport } from '../packages/control/src/atlas-world-projection.mjs';
import { parseHeartbeat, snapshotSize } from '../packages/control/src/live-atlas.mjs';
import { PLAN_UNDECLARED, RECEIVE_WINDOW_MS, TIMELINE_ID_PREFIX, UPDATE_INTERVAL_MS, formatViewHash, parseViewHash, stepIndex, timelinePosition, transportOf,
  updateStalled } from '../packages/control/src/atlas-timeline.mjs';
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
      assert.deepEqual(projection.timeline, { index, count, present }, 'projection names the displayed position');
      if (chrome === 'none') {
        // The chrome-free view draws no strip (未設計のため。設計の合意後に戻す): no cell,
        // no HUD, and the graph takes the whole height.
        assert.equal(cells.size, 0, 'none: no strip');
        assert.equal(hudCount(projection), 0, 'none: 0 HUD regions');
        assert.equal(projection.viewport.timeline, null, 'none: no strip reserved');
        assert.equal(projection.viewport.graph.y + projection.viewport.graph.height, viewport.height - 16, 'none: the graph reaches the bottom margin');
        cases += 1;
        continue;
      }
      assert.deepEqual([...cells.keys()], ['back', 'position', 'forward', 'present', 'plan'], 'the HUD keeps one strip');
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
  assert.equal(timelineOf(project(count - 1, { latest: false, chrome: 'full' })).get('present').activation.type, 'atlas.world.latest');
  assert.equal(worldViewport({ width: 1280, height: 720 }, { panel: false }).panel, null);
}

// The URL fragment round trip used for reload.
for (const view of [{ selected: '', frameId: '' }, { selected: 'entity:a%3Ab:c:d & e', frameId: '' },
  { selected: 'relation:x:y:z', frameId: 'after-t2' }, { selected: '', frameId: 't 3/#?' }]) {
  assert.deepEqual(parseViewHash(formatViewHash(view)), view, 'fragment round trip ' + JSON.stringify(view));
}
assert.equal(formatViewHash({ selected: 'k', frameId: '' }), '#sel=k', 'the present writes no t');
assert.deepEqual(parseViewHash('#sel=' + encodeURIComponent('entity:a%3Ab:c:d')), { selected: 'entity:a%3Ab:c:d', frameId: '' }, 'existing #sel links still read');
// The stated connection: an open connection alone is never receiving; it is
// receiving only within the window after a snapshot or heartbeat.
assert.equal(transportOf({ mode: 'sample', connected: true, receivedAt: 1, now: 1 }), 'sample');
assert.equal(transportOf({ mode: 'live', connected: false, receivedAt: 1, now: 1 }), 'disconnected');
assert.equal(transportOf({ mode: 'live', connected: true, receivedAt: null, now: 5 }), 'silent', 'open but nothing received');
assert.equal(transportOf({ mode: 'live', connected: true, receivedAt: 0, now: RECEIVE_WINDOW_MS, snapshotBytes: 10 }), 'live');
assert.equal(transportOf({ mode: 'live', connected: true, receivedAt: 0, now: RECEIVE_WINDOW_MS + 1, snapshotBytes: 10 }), 'silent', 'quiet past the window');
assert.equal(transportOf({ mode: 'live', connected: true, receivedAt: 0, now: null }), 'silent', 'no clock: not receiving');
// Only an accepted snapshot whose size the heartbeats confirm is the latest.
const fresh = { mode: 'live', connected: true, receivedAt: 0, now: 1 };
assert.equal(transportOf({ ...fresh, snapshotBytes: null, heartbeatBytes: 10 }), 'nodata', 'heartbeats without a snapshot');
assert.equal(transportOf({ ...fresh, snapshotBytes: 10, heartbeatBytes: 11 }), 'mismatch', 'heartbeat size differs');
assert.equal(transportOf({ ...fresh, snapshotBytes: 10, heartbeatBytes: 10 }), 'live');
assert.equal(transportOf({ ...fresh, snapshotBytes: 10, heartbeatBytes: null }), 'live', 'a snapshot alone, recently');

// Update stalled: a live page whose newest asOf is more than three update
// periods (10 minutes by default) old, whatever the stream says; a sample
// page claims no updates.
const asOf = '2026-10-19T11:07:17.313Z', at = minutes => Date.parse(asOf) + minutes * 60_000;
assert.equal(UPDATE_INTERVAL_MS, 600_000, 'HQ updates every 10 minutes');
assert.equal(updateStalled({ mode: 'live', now: at(30), asOf }), false, 'exactly three periods: not yet');
assert.equal(updateStalled({ mode: 'live', now: at(30) + 1, asOf }), true, 'past three periods: stalled');
assert.equal(updateStalled({ mode: 'sample', now: at(60), asOf }), false, 'a sample page claims no updates');
assert.equal(updateStalled({ mode: 'live', now: null, asOf }), false, 'no clock: no claim either way');
assert.equal(updateStalled({ mode: 'live', now: at(7), asOf, updateIntervalMs: 2 * 60_000 }), true, 'a 2-minute period: stalled after 6');
assert.equal(updateStalled({ mode: 'live', now: at(5), asOf, updateIntervalMs: 2 * 60_000 }), false);

// Heartbeats: exactly {at: ISO time, bytes: integer >= 0}; anything else is
// not one. Sizes are the snapshot data string's length (UTF-16 code units),
// the producer's JSON.stringify(...).length, also for non-ASCII text.
for (const bad of ['not-json garbage', '', 'null', '[]', '{"at":"yesterday","bytes":1}', '{"at":"2026-10-17T00:00:00Z","bytes":-1}',
  '{"at":"2026-10-17T00:00:00Z","bytes":1.5}', '{"at":"2026-10-17T00:00:00Z"}', '{"at":"2026-10-17T00:00:00Z","bytes":1,"x":0}']) {
  assert.equal(parseHeartbeat(bad), null, 'not a heartbeat: ' + bad);
}
assert.deepEqual(parseHeartbeat('{"at":"2026-10-17T00:00:00.123Z","bytes":0}'), { at: '2026-10-17T00:00:00.123Z', bytes: 0 });
const held = JSON.stringify({ label: '目的：宣言だけで回る組織 🙂', n: 1 });
assert.equal(snapshotSize(held), held.length, 'the producer counts JSON.stringify(...).length');
assert.notEqual(snapshotSize(held), Buffer.byteLength(held), 'which is not the UTF-8 byte count for non-ASCII text');
console.log(JSON.stringify({ status: 'atlas-world-timeline-checks-pass', cases }));
