// The one time axis (S7, adrs#647 comment 6308860425), as drawn and visible.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-time-axis-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON>]
// Builds of the gap fixture (and, with --input, of that World too), served
// over HTTP. A word counts as shown only when its text Range lies inside the
// status row's visible rectangle; a box's text only as far as its drawn lines
// lie inside the graph right after the operation (no scroll, no wheel: I2e-fix),
// never by textContent alone. At 1500x900 and 800x900:
// 1. at the present, 次へ ▶ enters the first step: the status row reads
//    予定 1/K · <minute>（観測が無ければ）, the box of changes reads that step,
//    and every other box reads as at the present;
// 2. 次へ ▶ stops at the last step (disabled); ◀ 前へ goes back step by step
//    to the present; 現在へ returns from a step to the present;
// 3. on a past frame with what was held, the box of changes names it with
//    when and from where, and its heading counts what was held so far;
// 4. on a frame with plans, 理想状態 names each plan (label and serves);
// 5. an approximating present with conditions met has its steps;
// 6. a step whose minute has passed is gone, on the page's clock;
// 7. the largest box of changes is drawn whole inside its box.
// The words are computed here from the World, not by the module under test.
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

// The fixture: up to the matched t5 with upkeep, held declarations and two
// plans at t4; the approximating story up to t6 with its conditions met.
const story = gapWorld({ through: 't5', upkeep: true, held: true });
story.frames[4].plans = [structuredClone(knownPlan), structuredClone(unknownPlan)];
const worlds = { story: { world: story, clock: '2026-10-17T05:30:00Z' }, approx: { world: gapWorld({ through: 't6', upkeep: true }), clock: '2026-10-17T06:30:00Z' } };
if (args.input) worlds.input = { world: JSON.parse(fs.readFileSync(args.input, 'utf8')), clock: null };
const { scratch, done } = proofScratch(args.out);
const bodies = {};
for (const [name, { world }] of Object.entries(worlds)) {
  const input = path.join(scratch, name + '.json');
  fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
  await buildLiveAtlas({ input, out: path.join(args.out, name), consumer: 'app' });
  bodies[name] = fs.readFileSync(path.join(path.resolve(args.out), name, 'index.html'));
}
const site = http.createServer((request, response) => {
  const body = bodies[new URL(request.url, 'http://localhost').pathname.split('/')[1]];
  response.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body ?? '');
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));

// Fixed words from the World.
const flat = text => String(text ?? '').replace(/\s/gu, '');
const minute = at => { const match = /^\d{4}-(\d\d-\d\d)T(\d\d:\d\d)/u.exec(at); return match[1] + ' ' + match[2] + 'Z'; };
const stepsOf = (frame, now) => {
  const steps = new Map();
  for (const item of [...(frame.upkeep ?? [])].sort((a, b) => Date.parse(a.stale_at) - Date.parse(b.stale_at) || a.condition.localeCompare(b.condition))) {
    if (now > Date.parse(item.stale_at)) continue;
    steps.set(minute(item.stale_at), [...(steps.get(minute(item.stale_at)) ?? []), item]);
  }
  return [...steps].map(([at, items]) => ({ at, items }));
};
const heldRow = item => '保持 ' + item.reason + ' · ' + (item.kind ?? '種類不明') + ' · ' + item.recordedAt + ' · 出所 ' + item.source.ref;
const changeHeading = (frames, index) => {
  const frame = frames[index], held = frames.slice(0, index + 1).flatMap(item => item.held ?? []).length;
  return 'この時点の変化 ' + ((frame.journal ?? []).length + (frame.held ?? []).length) + ' 件' + (held ? ' · 保持 累計 ' + held : '');
};

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const press = async (page, name) => { const ok = await page.getByRole('button', { name, exact: true }).click({ timeout: 2000 }).then(() => true, () => false); await settle(page); return ok; };
const disabled = (page, name) => page.getByRole('button', { name, exact: true }).isDisabled();
// Whether each word's Range lies inside the status row's visible rectangle.
const shown = (page, words) => page.evaluate(words => {
  const node = document.getElementById('atlas-world-status');
  const row = node.getBoundingClientRect();
  const right = node.scrollWidth > node.clientWidth + 0.5 ? row.right - 16 : row.right;
  const text = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
  return { text: node.textContent, words: words.map(word => {
    const at = text ? text.data.indexOf(word) : -1;
    if (at < 0) return { word, inside: false };
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + word.length);
    const box = range.getBoundingClientRect();
    return { word, inside: box.width > 0 && box.left >= row.left - 0.5 && box.right <= right + 0.5 && box.top >= row.top - 0.5 && box.bottom <= row.bottom + 0.5 };
  }) };
}, words);
const allShown = result => result.words.every(item => item.inside);
// Each box: its kind, its text, the text of its drawn lines that lie inside
// the graph (`seen`), whether all of it does, and whether it lies inside its own box.
const boxes = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const graph = document.getElementById('atlas-world').getBoundingClientRect();
  const within = (box, frame, slack = 1) => Boolean(box && box.width > 0 && box.left >= frame.left - slack && box.right <= frame.right + slack && box.top >= frame.top - slack && box.bottom <= frame.bottom + slack);
  return atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
    const state = view.getState(adapter.cellsByRegionId.get(item.regionId));
    const text = state?.text?.node?.getBoundingClientRect(), shape = state?.shape?.node?.getBoundingClientRect();
    const lines = [...(state?.text?.node?.querySelectorAll('text') ?? [])];
    return { id: item.regionId, kind: item.atlas.ref.kind, text: (state?.text?.node?.textContent ?? '').replace(/\s/gu, ''),
      seen: lines.filter(line => within(line.getBoundingClientRect(), graph)).map(line => line.textContent).join('').replace(/\s/gu, ''),
      visible: within(text, graph), whole: within(text, shape, 2) };
  });
});
// A box as drawn right after the last operation.
const boxOf = async (page, kind) => (await boxes(page)).find(item => item.kind === kind) ?? null;
const textOf = (list, kind) => list.filter(item => item.kind === kind).map(item => item.text).join('');

let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  const open = async (width, name) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    if (worlds[name].clock) await page.clock.install({ time: new Date(worlds[name].clock) });
    await page.goto('http://127.0.0.1:' + site.address().port + '/' + name + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
    await settle(page);
    return page;
  };
  for (const width of [1500, 800]) for (const name of Object.keys(worlds).filter(item => item !== 'approx')) {
    const world = worlds[name].world, frames = world.frames, count = frames.length;
    const now = worlds[name].clock ? Date.parse(worlds[name].clock) : Date.now();
    const steps = stepsOf(frames.at(-1), now);
    const where = width + 'px ' + name;
    const page = await open(width, name);
    const present = await boxes(page);
    // 1. The first step: the status row, the box of changes, and the rest as at the present.
    check(where + ': the World has steps past the present', steps.length > 0, frames.at(-1).upkeep);
    await press(page, '次へ ▶');
    const first = await shown(page, ['LATEST', '表示中：予定 1/' + steps.length + ' · ' + steps[0]?.at + '（観測が無ければ）']);
    check(where + ' 次へ ▶ at the present: 予定 1/' + steps.length + ' and its minute are visible on the status row', allShown(first), first);
    const onStep = await boxOf(page, 'frame-change');
    check(where + ' 次へ ▶: the box of changes reads the first step, all of it visible right away', onStep?.visible && onStep.seen === flat('予定 ' + steps[0]?.at + '（観測が無ければ unknown）'
      + (steps[0]?.items ?? []).map(item => '鮮度切れの予定 ' + item.condition + ' · 観測 ' + minute(item.observedAt)).join('')), onStep);
    const others = list => Object.fromEntries(list.filter(item => item.kind !== 'frame-change').map(item => [item.id, item.text]));
    check(where + ' 次へ ▶: every other box reads as at the present', JSON.stringify(others(await boxes(page))) === JSON.stringify(others(present)));
    // 2. To the last step and back.
    for (let index = 1; index < steps.length; index += 1) await press(page, '次へ ▶');
    const last = await shown(page, ['表示中：予定 ' + steps.length + '/' + steps.length + ' · ' + steps.at(-1)?.at]);
    check(where + ': 次へ ▶ reaches the last step and is then disabled', allShown(last) && await disabled(page, '次へ ▶'), last);
    for (let index = 0; index < steps.length; index += 1) await press(page, '◀ 前へ');
    const back = await shown(page, ['LATEST', '表示中：現在 ' + count + '/' + count]);
    check(where + ': ◀ 前へ goes back step by step to the present', allShown(back), back);
    await press(page, '次へ ▶');
    await press(page, '現在へ');
    const home = await shown(page, ['表示中：現在 ' + count + '/' + count]);
    check(where + ': 現在へ returns from a step to the present', allShown(home) && textOf(await boxes(page), 'frame-change') === textOf(present, 'frame-change'), home);
    // 3. A past frame with what was held: its rows and the count so far.
    const heldAt = frames.findIndex((item, index) => index < count - 1 && (item.held ?? []).length);
    check(where + ': the World has a past frame where something was held', heldAt >= 0);
    if (heldAt >= 0) {
      await page.focus('#atlas-world');
      for (let index = count - 1; index > heldAt; index -= 1) await page.keyboard.press('[');
      await settle(page);
      const change = await boxOf(page, 'frame-change');
      const words = [changeHeading(frames, heldAt), ...frames[heldAt].held.map(heldRow),
        ...(frames[heldAt].journal ?? []).map(entry => entry.recordedAt + ' · 作者 ' + (entry.actor ?? '不明') + ' · 出所 ' + entry.source.ref)];
      check(where + ' ' + frames[heldAt].id + ': right after ◀ 前へ / [, the box of changes shows what was held and each entry with when, by whom and from where',
        change && words.every(word => change.seen.includes(flat(word))), { words: words.slice(0, 3), seen: change?.seen.slice(0, 300) });
      await press(page, '現在へ');
    }
    // 4. A frame with plans: 理想状態 names each plan.
    const planAt = frames.findIndex(item => (item.plans ?? []).length);
    check(where + ': the World has a frame with plans', planAt >= 0);
    if (planAt >= 0) {
      await page.focus('#atlas-world');
      for (let index = count - 1; index > planAt; index -= 1) await page.keyboard.press('[');
      await settle(page);
      const ideal = await boxOf(page, 'ideal-state');
      const words = frames[planAt].plans.flatMap(plan => ['計画 ' + plan.label, '寄与 ' + (plan.serves.length ? plan.serves.join('、') : 'なし')]);
      const change = await boxOf(page, 'frame-change');
      check(where + ' ' + frames[planAt].id + ': right after the move, 理想状態 shows each plan, its label and what it serves, and the heading of the changes',
        ideal && words.every(word => ideal.seen.includes(flat(word))) && change?.seen.startsWith(flat(changeHeading(frames, planAt))), { words, seen: ideal?.seen.slice(0, 300), change: change?.seen.slice(0, 80) });
      await press(page, '現在へ');
    }
    // 7. The largest box of changes, drawn whole inside its box.
    const sizes = frames.map(item => (item.journal ?? []).length + (item.held ?? []).length);
    const largest = sizes.indexOf(Math.max(...sizes));
    await page.focus('#atlas-world');
    for (let index = count - 1; index > largest; index -= 1) await page.keyboard.press('[');
    await settle(page);
    const big = (await boxes(page)).find(item => item.kind === 'frame-change');
    check(where + ' ' + frames[largest].id + ': the largest box of changes (' + sizes[largest] + ' rows) is drawn whole inside its box',
      big?.whole && big.text.startsWith(flat(changeHeading(frames, largest))), big && { whole: big.whole, text: big.text.slice(0, 120) });
    // 6. A step whose minute passes is gone (the fixture's clock only).
    if (worlds[name].clock) {
      await press(page, '現在へ');
      await press(page, '次へ ▶');
      await page.clock.fastForward(Date.parse(steps[0].items.at(-1).stale_at) - now + 1000);
      await settle(page);
      const after = stepsOf(frames.at(-1), Date.parse(steps[0].items.at(-1).stale_at) + 1000);
      const gone = await shown(page, ['表示中：予定 1/' + after.length + ' · ' + after[0]?.at]);
      check(where + ': once the first step\'s minute has passed it is gone, and the next is 予定 1/' + after.length, after.length === steps.length - 1 && allShown(gone), gone);
    }
    await page.close();
  }
  // 5. An approximating present with conditions met has its steps (S7, I4a).
  for (const width of [1500, 800]) {
    const page = await open(width, 'approx');
    const frames = worlds.approx.world.frames;
    const steps = stepsOf(frames.at(-1), Date.parse(worlds.approx.clock));
    await press(page, '次へ ▶');
    const first = await shown(page, ['表示中：予定 1/' + steps.length + ' · ' + steps[0]?.at]);
    const change = await boxOf(page, 'frame-change');
    check(width + 'px approx: an approximating present (' + frames.at(-1).phase + ') steps into 予定 1/' + steps.length + ' and its conditions, visible right away',
      frames.at(-1).phase === 'approximating' && steps.length > 0 && allShown(first) && change?.visible && change.seen.includes(flat('鮮度切れの予定 ' + steps[0].items[0].condition)), { first, change });
    await page.close();
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => site.close(resolve));
  done();
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-time-axis-browser-proof/1', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
