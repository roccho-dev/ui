// The one World screen against an earlier build of it, as drawn.
// Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-regression-browser-proof.mjs --input=<World JSON> --before=<index.html> --out=<fresh absent directory>
// `--before` is a page built earlier from the same World (e.g. the HQ World and
// the build HQ serves); this checkout builds the other. Both are opened at 1500
// and 800 px and must show the same: every box of the three areas visible in
// the graph with the same text, the status row, the frame after ◀ 前へ, and
// the rows of 予定 ▸ and 仕訳 n ▸. Only what is drawn and visible is compared
// (text rectangles inside the graph or the list), never page state. The page
// built here also draws no HUD, panel, strip or band region.
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
await buildLiveAtlas({ input, out: path.join(args.out, 'after'), consumer: 'app' });
const bodies = { before: fs.readFileSync(args.before), after: fs.readFileSync(path.join(path.resolve(args.out), 'after', 'index.html')) };
const site = http.createServer((request, response) => {
  const body = bodies[new URL(request.url, 'http://localhost').pathname.split('/')[1]] ?? bodies.after;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const press = (page, name) => page.getByRole('button', { name, exact: true }).click({ timeout: 2000 }).then(() => true, () => false);
const pressPrefix = (page, prefix) => page.locator('#atlas-world-search-bar button').filter({ hasText: prefix }).first().click({ timeout: 2000 }).then(() => true, () => false);
// What a page shows: each box's text that lies inside the graph, the status
// row, and the open list's rows that lie inside the list.
const seen = page => page.evaluate(() => {
  const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
  const graph = document.getElementById('atlas-world').getBoundingClientRect();
  const inside = (box, frame) => Boolean(box && box.width > 0 && box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1);
  const boxes = Object.fromEntries(atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
    const text = view.getState(adapter.cellsByRegionId.get(item.regionId))?.text?.node;
    return [item.regionId, inside(text?.getBoundingClientRect(), graph) ? text.textContent.replace(/\s/gu, '') : null];
  }).filter(([, text]) => text !== null));
  const list = document.getElementById('atlas-world-list');
  const listBox = list?.getBoundingClientRect();
  const rows = list && !list.hidden ? [...list.children].filter(row => inside(row.getBoundingClientRect(), listBox)).map(row => row.textContent) : [];
  return { boxes, status: document.getElementById('atlas-world-status')?.textContent ?? '', rows,
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
      await press(page, '◀ 前へ'); await settle(page);
      steps.back = await seen(page);
      await press(page, '現在へ'); await settle(page);
      await press(page, '予定 ▸'); await settle(page);
      steps.forecast = await seen(page);
      await press(page, '予定 ▾'); await settle(page);
      await pressPrefix(page, '仕訳'); await settle(page);
      steps.journal = await seen(page);
      views[side] = steps;
      await page.close();
    }
    for (const step of ['present', 'back', 'forecast', 'journal']) {
      const [before, after] = [views.before[step], views.after[step]];
      check(width + 'px ' + step + ': the same boxes are visible with the same text',
        Object.keys(after.boxes).length > 0 && JSON.stringify(after.boxes) === JSON.stringify(before.boxes),
        { only_before: Object.keys(before.boxes).filter(key => before.boxes[key] !== after.boxes[key]).slice(0, 5),
          only_after: Object.keys(after.boxes).filter(key => before.boxes[key] !== after.boxes[key]).slice(0, 5) });
      check(width + 'px ' + step + ': the same status row', after.status === before.status && after.status.length > 0, { before: before.status, after: after.status });
      check(width + 'px ' + step + ': the same visible list rows', JSON.stringify(after.rows) === JSON.stringify(before.rows), { before: before.rows, after: after.rows });
      check(width + 'px ' + step + ': no HUD, panel, strip or band region in this build', after.nonArea === 0, after.nonArea);
    }
    check(width + 'px: ◀ 前へ moves to a past frame', views.after.back.status.includes('HELD · 表示中：過去'), views.after.back.status);
    check(width + 'px: 予定 ▸ and 仕訳 ▸ show rows', views.after.forecast.rows.length > 0 && views.after.journal.rows.length > 0,
      { forecast: views.after.forecast.rows.length, journal: views.after.journal.rows.length });
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => site.close(resolve));
  done();
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-regression-browser-proof/1', status: !interruption && failed.length === 0 && checks.length > 0 ? 'PASS' : 'FAIL',
  checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
