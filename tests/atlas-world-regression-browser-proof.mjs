// The one World screen against an earlier build of it, as drawn.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-regression-browser-proof.mjs --input=<World JSON> --before=<index.html> --out=<fresh absent directory>
// `--before` is a page built earlier from the same World (e.g. the HQ World
// and the build HQ serves); this checkout builds the other. Both are opened at
// 1500 and 800 px, at the present and after ◀ 前へ, and compared by what is
// visible (text rectangles inside the graph or the list), never page state.
// The page built here must show the earlier one changed by S6 (adrs#647
// comment 6306887827) and nothing else:
// - the phase box is gone; its unique parts are where S6 put them, with the
//   words computed here from the World itself: 差's heading names the phase,
//   when it began, its next stale time or that it went stale, and a mismatch
//   with the gap; 現在状態 the matches resting on observations older than
//   the ideal; 仕訳 ▸ each declaration held up to the frame, and its button
//   counts them;
// - the removed projected parts are not drawn: 差 n, the ideal's 追加 n ·
//   改訂 n, 現在状態's 一致 m/n, a card's state and causes, relation labels,
//   the search count's frame id and rev;
// - every other box (Agents, 目的, GapA, owners, obligations, closed changes)
//   reads as before; the status row and the 予定 ▸ rows are as before.
// The page built here also draws no HUD, panel, strip or band region.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { proofScratch } from './fixtures/proof-scratch.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
for (const name of ['input', 'before', 'out']) if (!args[name]) throw new Error('--' + name + ' is required');
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
if (!driverRoot || !path.isAbsolute(driverRoot) || !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

const { scratch, done } = proofScratch(args.out);
const input = path.join(scratch, 'world.json');
fs.copyFileSync(args.input, input);
const world = JSON.parse(fs.readFileSync(input, 'utf8'));
await buildLiveAtlas({ input, out: path.join(args.out, 'after'), consumer: 'app' });
const bodies = { before: fs.readFileSync(args.before), after: fs.readFileSync(path.join(path.resolve(args.out), 'after', 'index.html')) };
const site = http.createServer((request, response) => {
  const body = bodies[new URL(request.url, 'http://localhost').pathname.split('/')[1]] ?? bodies.after;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));

// Fixed words, computed from the World, so the check does not depend on the module under test.
const PHASE_WORDS = { 'purpose-changed': '目的変更', defining: '定義中', approximating: '近似中', matched: '一致・維持', ended: '目的の終了' };
const dayClock = at => { const match = /^\d{4}-(\d\d-\d\d)T(\d\d:\d\d)/u.exec(at); return match[1] + ' ' + match[2] + 'Z'; };
const flat = text => String(text ?? '').replace(/\s/gu, '');
// What S6 moved, for frame `index` of the World, as the page shows it at `now`.
const moved = (index, now) => {
  const frame = world.frames[index];
  let start = frame;
  for (const item of world.frames.slice(0, index).reverse()) { if (item.phase !== frame.phase) break; start = item; }
  const parts = frame.gap?.parts ?? null;
  const consistent = !frame.phase || (frame.phase === 'approximating' ? parts !== null && parts.length > 0
    : frame.phase === 'matched' ? parts !== null && parts.length === 0 : parts === null);
  const until = frame.phase === 'matched' ? frame.matched_until ?? null : null;
  const stale = until !== null && index === world.frames.length - 1 && now > Date.parse(until);
  const heading = '理想↔現在の差' + (frame.phase ? '（' + PHASE_WORDS[frame.phase] + '・' + dayClock(start.asOf) + ' から'
    + (frame.phase !== 'matched' ? '' : until === null ? '・次の鮮度切れ 不明' : stale ? '・鮮度切れ・最新か不明（' + dayClock(until) + ' を過ぎた）' : '・次の鮮度切れ ' + dayClock(until)) + '）' : '')
    + (consistent ? '' : ' · gap と不整合');
  const held = world.frames.slice(0, index + 1).flatMap(item => item.held ?? [])
    .map(item => '保持 ' + item.reason + ' · ' + (item.kind ?? '種類不明') + ' · ' + item.recordedAt + ' · 出所 ' + item.source.ref);
  const beforeIdeal = frame.gap?.summary?.before_ideal ? '理想状態の確定前の観測で一致 ' + frame.gap.summary.before_ideal + ' 件' : '';
  return { heading, held, beforeIdeal, stale };
};
// The earlier box text changed by S6 (whitespace removed), by kind.
const CAUSED = /(未達|不明)·[^!?]*?·(?=この時点から|\d+時点前から|担当)/gu;
const expectedBox = (kind, before, s6) => {
  if (kind === 'gap') {
    const symbol = s6.stale ? '?·' : before.match(/^(.·)?/u)[0];
    const body = before.replace(/^(.·)?理想↔現在の差/u, '');
    return symbol + flat(s6.heading) + body.replace(/^差\d+（((初回|前[^）]*))）/u, '$1');
  }
  if (kind === 'ideal-state') return before.replace(/（(追加|改訂)\d+(·(追加|改訂)\d+)?）/u, '');
  if (kind === 'current-state') return before.replace(/理想の条件\d+件のうち一致\d+件|理想の条件との一致未供給/u, flat(s6.beforeIdeal));
  return before.replace(CAUSED, '');
};
const REMOVED = [['差 n', /理想↔現在の差(（[^）]*(（[^）]*）)?[^）]*）)?(·gapと不整合)?差\d/u], ['追加 n・改訂 n', /（(追加|改訂)\d/u], ['一致 m/n', /理想の条件.*一致/u],
  ['カードの状態・原因', /(^|·)(未達|不明)·[^!?]*?·(この時点から|\d+時点前から|担当)/u], ['局面の箱', /局面：/u]];

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const press = (page, name) => page.getByRole('button', { name, exact: true }).click({ timeout: 2000 }).then(() => true, () => false);
const pressPrefix = (page, prefix) => page.locator('#atlas-world-search-bar button').filter({ hasText: prefix }).first().click({ timeout: 2000 }).then(() => true, () => false);
// What a page shows: each box's kind and text that lies inside the graph, any
// other visible text in the graph (a relation label), the status row, the
// search count, the journal button and the open list's rows inside the list.
const seen = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const container = document.getElementById('atlas-world');
  const graph = container.getBoundingClientRect();
  const inside = (box, frame) => Boolean(box && box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1);
  const textNodes = new Set();
  const boxes = {};
  for (const item of atlas.projection.scene.representations) {
    const text = view.getState(adapter.cellsByRegionId.get(item.regionId))?.text?.node;
    if (text) textNodes.add(text);
    if (item.atlas?.kind === 'entity' && inside(text?.getBoundingClientRect(), graph)) boxes[item.regionId] = { kind: item.atlas.ref.kind, text: text.textContent.replace(/\s/gu, '') };
  }
  const others = [...container.querySelectorAll('svg text, svg foreignObject')].filter(node => node.textContent.trim()
    && ![...textNodes].some(own => own === node || own.contains(node) || node.contains(own)) && inside(node.getBoundingClientRect(), graph)).map(node => node.textContent);
  const list = document.getElementById('atlas-world-list');
  const listBox = list?.getBoundingClientRect();
  const rows = list && !list.hidden ? [...list.children].filter(row => inside(row.getBoundingClientRect(), listBox)).map(row => row.textContent) : [];
  return { boxes, others, status: document.getElementById('atlas-world-status')?.textContent ?? '', count: document.getElementById('atlas-world-search-count')?.textContent ?? '',
    journalButton: document.getElementById('atlas-world-journal')?.textContent ?? '', rows,
    nonArea: atlas.projection.scene.representations.filter(item => !['area', 'entity'].includes(item.atlas?.kind)).length };
});

let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1500, 800]) {
    const views = {};
    for (const side of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:' + site.address().port + '/' + side + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      await settle(page);
      const steps = { present: await seen(page) };
      await pressPrefix(page, '仕訳'); await settle(page);
      steps.journal = await seen(page);
      await pressPrefix(page, '仕訳'); await settle(page);
      await press(page, '◀ 前へ'); await settle(page);
      steps.back = await seen(page);
      await pressPrefix(page, '仕訳'); await settle(page);
      steps.backJournal = await seen(page);
      await pressPrefix(page, '仕訳'); await settle(page);
      await press(page, '現在へ'); await settle(page);
      await press(page, '予定 ▸'); await settle(page);
      steps.forecast = await seen(page);
      views[side] = steps;
      await page.close();
    }
    const now = Date.now();
    const count = world.frames.length;
    for (const [step, index] of [['present', count - 1], ['back', count - 2]]) {
      const [before, after] = [views.before[step], views.after[step]];
      const s6 = moved(index, now);
      const where = width + 'px ' + step + ' (' + world.frames[index].id + ')';
      // The layout moves once the phase box is gone: the boxes visible on both pages are compared.
      const both = Object.entries(before.boxes).filter(([id, box]) => box.kind !== 'phase' && after.boxes[id]);
      const wrong = both.filter(([id, box]) => after.boxes[id].text !== expectedBox(box.kind, box.text, s6))
        .map(([id, box]) => ({ id, expected: expectedBox(box.kind, box.text, s6), after: after.boxes[id].text }));
      check(where + ': every box visible on both reads as before changed by S6', both.length >= 5 && wrong.length === 0, { compared: both.length, wrong: wrong.slice(0, 4) });
      check(where + ': the phase box was visible before and is gone', Object.values(before.boxes).some(box => box.kind === 'phase')
        && !Object.values(after.boxes).some(box => box.kind === 'phase'));
      const gap = Object.values(after.boxes).find(box => box.kind === 'gap')?.text ?? '';
      check(where + ': 差\'s heading names the phase, when it began and its freshness', gap.includes(flat(s6.heading)), { heading: s6.heading, gap });
      if (s6.beforeIdeal) check(where + ': 現在状態 reads ' + s6.beforeIdeal, Object.values(after.boxes).some(box => box.kind === 'current-state' && box.text.includes(flat(s6.beforeIdeal))));
      for (const [name, pattern] of REMOVED) {
        const drawn = Object.values(after.boxes).filter(box => pattern.test(box.text));
        check(where + ': ' + name + ' is not drawn', drawn.length === 0, drawn.slice(0, 2));
      }
      check(where + ': no relation label is drawn', after.others.length === 0, after.others.slice(0, 4));
      check(where + ': the same status row', after.status === before.status && after.status.length > 0, { before: before.status, after: after.status });
      check(where + ': the search count names no frame id or rev', !after.count.includes(world.frames[index].id) && !after.count.includes('rev') && before.count.includes(world.frames[index].id), after.count);
      const journal = views.after[step === 'present' ? 'journal' : 'backJournal'], journalBefore = views.before[step === 'present' ? 'journal' : 'backJournal'];
      const entries = journalBefore.rows.filter(row => row !== 'この時点の仕訳はない');
      check(where + ': 仕訳 n · 保持 m ▸ counts the entries and what was held', after.journalButton === '仕訳 ' + entries.length + ' · 保持 ' + s6.held.length + ' ▸', after.journalButton);
      check(where + ': 仕訳 ▸ lists the entries, then each declaration held up to the frame, visible',
        JSON.stringify(journal.rows) === JSON.stringify(entries.length + s6.held.length ? [...entries, ...s6.held] : journalBefore.rows), { before: journalBefore.rows, after: journal.rows, held: s6.held });
      check(where + ': no HUD, panel, strip or band region in this build', after.nonArea === 0, after.nonArea);
    }
    check(width + 'px: ◀ 前へ moves to a past frame', views.after.back.status.includes('HELD · 表示中：過去'), views.after.back.status);
    check(width + 'px: the same visible 予定 ▸ rows', views.after.forecast.rows.length > 0 && JSON.stringify(views.after.forecast.rows) === JSON.stringify(views.before.forecast.rows),
      { before: views.before.forecast.rows, after: views.after.forecast.rows });
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => site.close(resolve));
  done();
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-regression-browser-proof/2', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
