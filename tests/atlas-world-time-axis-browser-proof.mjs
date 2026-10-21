// The one time axis (S7, S7c: adrs#647), as drawn and visible.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-time-axis-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON>]
// A live page (?events=) of a World without its last frame, served over HTTP
// with an SSE stream this proof writes to when it chooses: the fixture on a
// page clock before its stale times, and, with --input, that World (e.g. the
// HQ World) on the real clock. At 1500x900 and 800x900, right after every
// operation — open, 次へ ▶ through every step past the present, ◀ 前へ back,
// 次へ ▶ then 現在へ, ◀ 前へ through every past frame, 現在へ, the new World
// over SSE — with no scroll and no wheel, it reads what lies inside the
// visible rectangles and checks that:
// - the boxes 目的, 理想状態 and 差 are drawn whole inside the graph;
// - #atlas-world-change (under the time controls) shows the time's heading and
//   first row, and the status row names the time;
// and, at those times: 次へ ▶ stops at the last step; a step changes nothing
// in the graph; a past frame with what was held names it; a frame with plans
// names them on 理想状態; the longest changes scroll inside the panel (six
// lines high, fixed); a step whose minute has passed is gone; an approximating
// present has its steps. The words are computed here from the World.
// Every file it writes is under --out (fixtures/proof-scratch.mjs).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { knownPlan, unknownPlan } from './fixtures/atlas-plan-worlds.mjs';
import { proofScratch } from './fixtures/proof-scratch.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
if (!args.out) throw new Error('--out is required');
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
if (!driverRoot || !path.isAbsolute(driverRoot) || !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

// The fixture: up to the approximating t6 (upkeep on t5 and t6, held at t3
// and t5, two plans at t4), opened without t6 at 05:30, before t5's stale times.
const fixture = gapWorld({ through: 't6', upkeep: true, held: true });
fixture.frames[4].plans = [structuredClone(knownPlan), structuredClone(unknownPlan)];
const world = args.input ? JSON.parse(fs.readFileSync(args.input, 'utf8')) : fixture;
const clock = args.input ? null : '2026-10-17T05:30:00Z';
const opened = { ...world, frames: world.frames.slice(0, -1) };
const { scratch, done } = proofScratch(args.out);
const input = path.join(scratch, 'opened.json');
fs.writeFileSync(input, JSON.stringify(opened), { flag: 'wx' });
await buildLiveAtlas({ input, out: path.join(args.out, 'page'), consumer: 'app' });
const body = fs.readFileSync(path.join(path.resolve(args.out), 'page', 'index.html'));
// The SSE stream: the opened World on connection, the whole World on send.
let stream = null;
const event = data => 'event: snapshot\n' + JSON.stringify(data).split('\n').map(line => 'data: ' + line).join('\n') + '\n\n';
const site = http.createServer((request, response) => {
  if (new URL(request.url, 'http://localhost').pathname === '/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
    response.write('retry: 100000\n\n' + event(opened));
    stream = response;
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + site.address().port;

// Fixed words from the World.
const flat = text => String(text ?? '').replace(/\s/gu, '');
const minute = at => { const match = /^\d{4}-(\d\d-\d\d)T(\d\d:\d\d)/u.exec(at); return match[1] + ' ' + match[2] + 'Z'; };
const stepsOf = (frame, now) => {
  const steps = new Map();
  for (const item of [...(frame.upkeep ?? [])].sort((a, b) => Date.parse(a.stale_at) - Date.parse(b.stale_at) || a.condition.localeCompare(b.condition))) {
    if (now > Date.parse(item.stale_at)) continue;
    steps.set(minute(item.stale_at), [...(steps.get(minute(item.stale_at)) ?? []), item]);
  }
  return [...steps].map(([at, items]) => ({ at, heading: '予定 ' + at + '（観測が無ければ unknown）',
    rows: items.map(item => '鮮度切れの予定 ' + item.condition + ' · 観測 ' + minute(item.observedAt)) }));
};
const heldRow = item => '保持 ' + item.reason + ' · ' + (item.kind ?? '種類不明') + ' · ' + item.recordedAt + ' · 出所 ' + item.source.ref;
// A frame's changes: its heading, and the words its first row must show.
const frameChanges = (frames, index) => {
  const frame = frames[index], held = frames.slice(0, index + 1).flatMap(item => item.held ?? []).length;
  const entry = (frame.journal ?? [])[0];
  return { heading: 'この時点の変化 ' + ((frame.journal ?? []).length + (frame.held ?? []).length) + ' 件' + (held ? ' · 保持 累計 ' + held : ''),
    first: entry ? [entry.recordedAt, '作者 ' + (entry.actor ?? '不明'), '出所 ' + entry.source.ref] : (frame.held ?? []).slice(0, 1).map(heldRow),
    rows: (frame.journal ?? []).length + (frame.held ?? []).length };
};

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
// What is visible right after the last operation: the status row, each box's
// lines inside the graph, the panel's lines inside the panel (and the window).
const state = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const graph = document.getElementById('atlas-world').getBoundingClientRect();
  const within = (box, frame) => box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
  const boxes = {};
  for (const rep of atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity')) {
    const lines = [...(view.getState(adapter.cellsByRegionId.get(rep.regionId))?.text?.node?.querySelectorAll('text') ?? [])];
    boxes[rep.atlas.ref.kind] = { text: lines.map(line => line.textContent).join('').replace(/\s/gu, ''), whole: lines.length > 0 && lines.every(line => within(line.getBoundingClientRect(), graph)) };
  }
  const panel = document.getElementById('atlas-world-change');
  const frame = panel?.getBoundingClientRect();
  const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const rows = panel ? [...panel.children].map(row => ({ text: row.textContent, shown: within(row.getBoundingClientRect(), frame) && within(row.getBoundingClientRect(), screen) })) : [];
  return { status: document.getElementById('atlas-world-status').textContent, boxes, rows, panelHeight: frame?.height ?? 0,
    scrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : false, forward: document.getElementById('atlas-world-step-forward').disabled };
});

let browser, interruption = null, states = 0;
const failed = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1500, 800]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    if (clock) await page.clock.install({ time: new Date(clock) });
    stream = null;
    await page.goto(origin + '/?events=' + encodeURIComponent(origin + '/events'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    await page.waitForFunction(() => window.liveAtlas.page.snapshotBytes !== null, null, { timeout: 60000 });
    await settle(page);
    const now = clock ? Date.parse(clock) : Date.now();
    const press = async name => { await page.getByRole('button', { name, exact: true }).click({ timeout: 2000 }); await settle(page); };
    // One state: the three boxes whole in the graph, the time named, and the panel's heading and first row shown.
    const look = async (name, frames, at, step = null) => {
      const seen = await state(page);
      const expected = step ? { heading: step.heading, first: step.rows.slice(0, 1) } : frameChanges(frames, at);
      const time = step ? '表示中：予定 ' + (step.index + 1) + '/' + step.count + ' · ' + step.at : '表示中：' + (at === frames.length - 1 ? '現在' : '過去') + ' ' + (at + 1) + '/' + frames.length;
      const problems = [
        ...['purpose', 'ideal-state', 'gap'].filter(kind => !seen.boxes[kind]?.whole).map(kind => kind + ' not whole in the graph'),
        ...(seen.boxes['frame-change'] ? ['a box of changes is drawn in the graph'] : []),
        ...(seen.status.includes(time) ? [] : ['status does not name ' + time]),
        ...(seen.rows[0]?.shown && seen.rows[0].text === expected.heading ? [] : ['heading not shown: ' + expected.heading]),
        ...(expected.first.length && !(seen.rows[1]?.shown && expected.first.every(word => flat(seen.rows[1].text).includes(flat(word)))) ? ['first row not shown'] : []),
      ];
      states += 1;
      if (problems.length) failed.push({ name: width + 'px ' + name, problems, status: seen.status.slice(0, 90), rows: seen.rows.slice(0, 2) });
      return seen;
    };
    const frames = opened.frames, count = frames.length;
    await look('open', frames, count - 1);
    // The steps past the present, then back, then 現在へ from a step.
    const steps = stepsOf(frames.at(-1), now).map((step, index, list) => ({ ...step, index, count: list.length }));
    check(width + 'px: the opened present has steps past it', steps.length > 0, frames.at(-1).upkeep);
    const graphAt = async () => JSON.stringify(Object.entries((await state(page)).boxes).map(([kind, box]) => [kind, box.text]));
    const atPresent = await graphAt();
    for (const step of steps) {
      await press('次へ ▶');
      await look('次へ ▶ → 予定 ' + (step.index + 1), frames, count - 1, step);
      check(width + 'px 予定 ' + (step.index + 1) + ': the graph reads as at the present', await graphAt() === atPresent);
    }
    check(width + 'px: 次へ ▶ is disabled on the last step', (await state(page)).forward);
    for (let index = steps.length - 2; index >= -1; index -= 1) {
      await press('◀ 前へ');
      await look('◀ 前へ → ' + (index < 0 ? 'present' : '予定 ' + (index + 1)), frames, count - 1, index < 0 ? null : steps[index]);
    }
    await press('次へ ▶');
    await press('現在へ');
    await look('次へ ▶, 現在へ', frames, count - 1);
    // Every past frame; the longest changes scroll inside the panel.
    const sizes = frames.map(item => (item.journal ?? []).length + (item.held ?? []).length);
    const longest = sizes.indexOf(Math.max(...sizes));
    for (let index = count - 2; index >= 0; index -= 1) {
      await press('◀ 前へ');
      const seen = await look('◀ 前へ → ' + frames[index].id, frames, index);
      const held = frames[index].held ?? [];
      if (held.length) check(width + 'px ' + frames[index].id + ': the panel names what was held (cases 15, 29)',
        held.map(heldRow).every(row => seen.rows.some(item => item.text === row)));
      if ((frames[index].plans ?? []).length) check(width + 'px ' + frames[index].id + ': 理想状態 names each plan, its label and what it serves',
        frames[index].plans.every(plan => seen.boxes['ideal-state'].text.includes(flat('計画 ' + plan.label)) && seen.boxes['ideal-state'].text.includes(flat('寄与 ' + plan.serves.join('、')))), seen.boxes['ideal-state'].text.slice(0, 200));
      if (index === longest) {
        check(width + 'px ' + frames[index].id + ': the panel is six lines high and the longest changes (' + sizes[index] + ' rows) scroll inside it',
          Math.abs(seen.panelHeight - 116) < 0.5 && (sizes[index] <= 3 || seen.scrolls), { height: seen.panelHeight, scrolls: seen.scrolls });
        const last = await page.evaluate(() => { const panel = document.getElementById('atlas-world-change'); panel.scrollTop = panel.scrollHeight;
          const row = panel.lastElementChild.getBoundingClientRect(), box = panel.getBoundingClientRect(); return row.bottom <= box.bottom + 1 && row.top >= box.top - 1; });
        check(width + 'px ' + frames[index].id + ': scrolled inside the panel, its last row is shown', last);
      }
    }
    check(width + 'px: the World has a past frame with what was held, and one with plans', frames.slice(0, -1).some(item => (item.held ?? []).length) && frames.slice(0, -1).some(item => (item.plans ?? []).length));
    await press('現在へ');
    await look('現在へ (again)', frames, count - 1);
    // The new World over SSE: the followed present moves to it.
    stream.write(event(world));
    await page.waitForFunction(total => window.liveAtlas.input.frames.length === total, world.frames.length, { timeout: 60000 });
    await settle(page);
    await look('SSE → ' + world.frames.at(-1).id, world.frames, world.frames.length - 1);
    const after = stepsOf(world.frames.at(-1), now).map((step, index, list) => ({ ...step, index, count: list.length }));
    if (after.length) {
      await press('次へ ▶');
      await look('SSE, 次へ ▶ → 予定 1 (' + world.frames.at(-1).phase + ')', world.frames, world.frames.length - 1, after[0]);
    }
    if (!args.input) check(width + 'px: the approximating present that arrived has its steps', world.frames.at(-1).phase === 'approximating' && after.length > 0);
    // A step whose minute has passed is gone (the fixture's clock only).
    if (clock && after.length > 1) {
      await page.clock.fastForward(Date.parse(after[0].at.replace(/^(\d\d-\d\d) (\d\d:\d\d)Z$/u, '2026-$1T$2:59Z')) - now + 1000);
      await settle(page);
      const rest = stepsOf(world.frames.at(-1), Date.parse(after[0].at.replace(/^(\d\d-\d\d) (\d\d:\d\d)Z$/u, '2026-$1T$2:59Z')) + 1000);
      check(width + 'px: once the first step\'s minute has passed it is gone, and the next is 予定 1/' + rest.length,
        rest.length === after.length - 1 && (await state(page)).status.includes('表示中：予定 1/' + rest.length + ' · ' + rest[0].at));
    }
    await page.close();
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  stream?.end();
  site.closeAllConnections?.();
  await new Promise(resolve => site.close(resolve));
  done();
}
const failedChecks = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-time-axis-browser-proof/2', status: !interruption && failed.length === 0 && failedChecks.length === 0 && states > 0 ? 'PASS' : 'FAIL',
  states, statesFailed: failed.length, checks: checks.length, failed: [...failed.slice(0, 8), ...failedChecks.slice(0, 8)], interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
