// The one World screen against an earlier build of it, as drawn.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-regression-browser-proof.mjs --input=<World JSON> --before=<index.html> --out=<fresh absent directory>
// `--before` is a page built earlier from the same World (e.g. the HQ World
// and the build HQ serves, which has 予定 ▸ and 仕訳 ▸); this checkout builds
// the other. Both are opened at 1500 and 800 px, at the present and after
// ◀ 前へ, and compared by what is visible (text rectangles inside the graph,
// the status row or the earlier list), never page state. The page built here
// must show the earlier one with S7 (adrs#647 comment 6308860425) and nothing
// else:
// - every box visible on both reads as before (理想状態 may add the lines of
//   the frame's plans); the status row is as before;
// - 予定 ▸ and 仕訳 ▸ are gone: the time controls are ◀ 前へ / 次へ ▶ / 現在へ;
//   the rows 仕訳 ▸ listed, and what was held at the frame, are the box of
//   changes, under its heading counted from the World; 次へ ▶ from the present
//   enters 予定 1/K with K the present's upkeep minutes;
// - S6 stays: 差's heading names the phase, when it began and its freshness,
//   no removed projection and no relation label is drawn, and no HUD, panel,
//   strip or band region.
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
const frames = world.frames;
// 差's heading for frame `index` as the page shows it at `now` (S6).
const heading = (index, now) => {
  const frame = frames[index];
  let start = frame;
  for (const item of frames.slice(0, index).reverse()) { if (item.phase !== frame.phase) break; start = item; }
  const parts = frame.gap?.parts ?? null;
  const consistent = !frame.phase || (frame.phase === 'approximating' ? parts !== null && parts.length > 0
    : frame.phase === 'matched' ? parts !== null && parts.length === 0 : parts === null);
  const until = frame.phase === 'matched' ? frame.matched_until ?? null : null;
  const stale = until !== null && index === frames.length - 1 && now > Date.parse(until);
  return '理想↔現在の差' + (frame.phase ? '（' + PHASE_WORDS[frame.phase] + '・' + dayClock(start.asOf) + ' から'
    + (frame.phase !== 'matched' ? '' : until === null ? '・次の鮮度切れ 不明' : stale ? '・鮮度切れ・最新か不明（' + dayClock(until) + ' を過ぎた）' : '・次の鮮度切れ ' + dayClock(until)) + '）' : '')
    + (consistent ? '' : ' · gap と不整合');
};
// The box of changes of frame `index` (S7): heading, then the rows the earlier 仕訳 ▸ listed for it, then what was held at it.
const heldRow = item => '保持 ' + item.reason + ' · ' + (item.kind ?? '種類不明') + ' · ' + item.recordedAt + ' · 出所 ' + item.source.ref;
const changeText = (index, journalRows) => {
  const frame = frames[index], held = frames.slice(0, index + 1).flatMap(item => item.held ?? []).length;
  return flat('この時点の変化 ' + ((frame.journal ?? []).length + (frame.held ?? []).length) + ' 件' + (held ? ' · 保持 累計 ' + held : '')
    + [...journalRows, ...(frame.held ?? []).map(heldRow)].join(''));
};
const minutesAhead = now => new Set((frames.at(-1).upkeep ?? []).filter(item => !(now > Date.parse(item.stale_at))).map(item => dayClock(item.stale_at))).size;
const REMOVED = [['差 n', /理想↔現在の差(（[^）]*(（[^）]*）)?[^）]*）)?(·gapと不整合)?差\d/u], ['追加 n・改訂 n', /（(追加|改訂)\d/u], ['一致 m/n', /理想の条件.*一致/u],
  ['カードの状態・原因', /(^|·)(未達|不明)·[^!?]*?·(この時点から|\d+時点前から|担当)/u], ['局面の箱', /局面：/u]];

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const press = (page, name) => page.getByRole('button', { name, exact: true }).click({ timeout: 2000 }).then(() => true, () => false);
const pressPrefix = (page, prefix) => page.locator('#atlas-world-search-bar button').filter({ hasText: prefix }).first().click({ timeout: 2000 }).then(() => true, () => false);
// What a page shows: each box's kind and text that lies inside the graph, any
// other visible text in the graph (a relation label), the status row, the
// search count, the buttons of the search row and the open list's rows inside the list.
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
    if (item.atlas?.kind === 'entity' && inside(text?.getBoundingClientRect(), graph)) boxes[item.regionId] = { kind: item.atlas.ref.kind, text: text.textContent.replace(/\s/gu, ''),
      top: text.getBoundingClientRect().top - graph.top };
    else if (item.atlas?.kind === 'entity' && item.atlas.ref.kind === 'frame-change') boxes.offscreen = { top: (text?.getBoundingClientRect().top ?? 0) - graph.top };
  }
  const others = [...container.querySelectorAll('svg text, svg foreignObject')].filter(node => node.textContent.trim()
    && ![...textNodes].some(own => own === node || own.contains(node) || node.contains(own)) && inside(node.getBoundingClientRect(), graph)).map(node => node.textContent);
  const list = document.getElementById('atlas-world-list');
  const listBox = list?.getBoundingClientRect();
  const rows = list && !list.hidden ? [...list.children].filter(row => inside(row.getBoundingClientRect(), listBox)).map(row => row.textContent) : [];
  return { boxes, others, status: document.getElementById('atlas-world-status')?.textContent ?? '', count: document.getElementById('atlas-world-search-count')?.textContent ?? '',
    buttons: [...document.querySelectorAll('#atlas-world-search-bar button')].map(button => button.textContent), list: Boolean(list), rows,
    nonArea: atlas.projection.scene.representations.filter(item => !['area', 'entity'].includes(item.atlas?.kind)).length };
});
// The box of changes as seen once the wheel has panned it inside the graph.
const changeSeen = async page => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const view = await seen(page);
    const box = Object.values(view.boxes).find(item => item.kind === 'frame-change');
    if (box) return box.text;
    const graph = await page.locator('#atlas-world').boundingBox();
    await page.mouse.move(graph.x + graph.width / 2, graph.y + graph.height / 2);
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, (view.boxes.offscreen?.top ?? 0) - 24)));
    await settle(page);
  }
  return null;
};

let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1500, 800]) {
    const open = async side => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:' + site.address().port + '/' + side + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      await settle(page);
      return page;
    };
    // The earlier build: the present and its 仕訳 ▸ rows, the past frame and its rows.
    const before = {};
    {
      const page = await open('before');
      before.present = await seen(page);
      await pressPrefix(page, '仕訳'); await settle(page);
      before.presentRows = (await seen(page)).rows;
      await pressPrefix(page, '仕訳'); await settle(page);
      await press(page, '◀ 前へ'); await settle(page);
      before.back = await seen(page);
      await pressPrefix(page, '仕訳'); await settle(page);
      before.backRows = (await seen(page)).rows;
      await page.close();
    }
    // This build: the present, its box of changes, the past frame and its box, and the first step.
    const after = {};
    {
      const page = await open('after');
      after.present = await seen(page);
      await press(page, '◀ 前へ'); await settle(page);
      after.back = await seen(page);
      after.backChange = await changeSeen(page);
      await press(page, '現在へ'); await settle(page);
      after.presentChange = await changeSeen(page);
      await press(page, '次へ ▶'); await settle(page);
      after.step = await seen(page);
      await page.close();
    }
    const now = Date.now();
    const count = frames.length;
    for (const [step, index] of [['present', count - 1], ['back', count - 2]]) {
      const [was, is] = [before[step], after[step]];
      const where = width + 'px ' + step + ' (' + frames[index].id + ')';
      const planLines = flat((frames[index].plans ?? []).map(plan => '計画 ' + plan.label).join(''));
      const both = Object.entries(was.boxes).filter(([id]) => id !== 'offscreen' && is.boxes[id]);
      const wrong = both.filter(([id, box]) => box.kind === 'ideal-state' ? !(is.boxes[id].text.startsWith(box.text) && (planLines ? is.boxes[id].text.includes(planLines) : is.boxes[id].text === box.text))
        : is.boxes[id].text !== box.text).map(([id, box]) => ({ id, before: box.text, after: is.boxes[id].text }));
      check(where + ': every box visible on both reads as before', both.length >= 5 && wrong.length === 0, { compared: both.length, wrong: wrong.slice(0, 4) });
      const gap = Object.values(is.boxes).find(box => box.kind === 'gap')?.text ?? '';
      check(where + ': 差\'s heading names the phase, when it began and its freshness', gap.includes(flat(heading(index, now))), { heading: heading(index, now), gap });
      for (const [name, pattern] of REMOVED) {
        const drawn = Object.values(is.boxes).filter(box => pattern.test(box.text ?? ''));
        check(where + ': ' + name + ' is not drawn', drawn.length === 0, drawn.slice(0, 2));
      }
      check(where + ': no relation label is drawn', is.others.length === 0, is.others.slice(0, 4));
      check(where + ': the same status row', is.status === was.status && is.status.length > 0, { before: was.status, after: is.status });
      check(where + ': the search count names no frame id or rev', !is.count.includes(frames[index].id) && !is.count.includes('rev'), is.count);
      check(where + ': the time controls are ◀ 前へ / 次へ ▶ / 現在へ, with no 予定 ▸ or 仕訳 ▸ and no list', JSON.stringify(is.buttons) === JSON.stringify(['◀ 前へ', '次へ ▶', '現在へ']) && !is.list
        && was.buttons.some(text => text.startsWith('仕訳')), { before: was.buttons, after: is.buttons });
      const rows = before[step + 'Rows'].filter(row => row.startsWith('保持 ') === false && row !== 'この時点の仕訳はない');
      const change = after[step + 'Change'];
      check(where + ': the box of changes holds the rows 仕訳 ▸ listed and what was held at the frame, under its heading, visible',
        change === changeText(index, rows), { expected: changeText(index, rows).slice(0, 200), after: change?.slice(0, 200) });
      check(where + ': no HUD, panel, strip or band region in this build', is.nonArea === 0, is.nonArea);
    }
    check(width + 'px: ◀ 前へ moves to a past frame', after.back.status.includes('HELD · 表示中：過去'), after.back.status);
    const ahead = minutesAhead(now);
    check(width + 'px: 次へ ▶ from the present enters 予定 1/' + ahead + ' (the present\'s upkeep minutes ahead)',
      ahead === 0 ? after.step.status === after.present.status : after.step.status.includes('表示中：予定 1/' + ahead + ' · '), after.step.status);
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => site.close(resolve));
  done();
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-regression-browser-proof/3', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
