// Rendered readability of the chrome-free World. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-readability-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON> ...]
// For the bundled World, a status World and any given World, at 1280x720 and
// 1500x1000 after Fit: every entity label is drawn whole (the drawn text is the
// projected label: nothing dropped or cut by the UI), none is empty, no two
// entity texts overlap, and each status node is drawn with its color and
// symbol. Ellipses already present in a supplied label are counted separately:
// they come from the supplier, not from this UI.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { ATLAS_STATUS } from '../packages/control/src/atlas-world-projection.mjs';
import { statusWorld } from './fixtures/atlas-readability-worlds.mjs';
import { bundledWorld } from './fixtures/atlas-timeline-frames.mjs';
import { planWorld } from './fixtures/atlas-plan-worlds.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { LABEL_LINE_PX, linePx } from '../packages/control/src/atlas-text.mjs';

const argv = process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
});
const out = argv.find(([name]) => name === 'out')?.[1];
if (!out) throw new Error('--out is required');
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
if (!driverRoot || !path.isAbsolute(driverRoot) || !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-readability-'));
const worlds = [['bundled', bundledWorld()], ['status', statusWorld()], ['plans', planWorld()], ['gap', gapWorld()],
  ...argv.filter(([name]) => name === 'input').map(([, file]) => [path.basename(file), JSON.parse(fs.readFileSync(file, 'utf8'))])];
fs.mkdirSync(out);
const builds = [];
for (const [name, world] of worlds) {
  const input = path.join(scratch, builds.length + '.json');
  fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
  const dir = path.join(out, String(builds.length));
  builds.push({ name, dir, receipt: await buildLiveAtlas({ input, out: dir, consumer: 'app', chrome: 'none' }) });
}

let current = null;
const server = http.createServer((request, response) => {
  const body = fs.readFileSync(path.join(path.resolve(current), 'index.html'));
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const measured = [];
const pageErrors = [], consoleErrors = [];
let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const build of builds) {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }, { width: 1920, height: 1080 }]) {
      current = build.dir;
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => pageErrors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      const frames = await (async () => {
        await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
        return page.evaluate(() => window.liveAtlas.input.frames.length);
      })();
      for (let step = 0; step < frames; step += 1) {
        if (step > 0) { await page.focus('#atlas-world'); await page.keyboard.press('['); }
        await page.evaluate(() => window.liveAtlas.fit());
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const areas = await page.evaluate(() => {
          const atlas = window.liveAtlas, adapter = atlas.adapter;
          return atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'area').map(item => {
            const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(item.regionId));
            const shape = state?.shape?.node?.getBoundingClientRect?.() ?? null;
            const text = state?.text?.node?.getBoundingClientRect?.() ?? null;
            return { areaId: item.atlas.areaId, shape: shape && { left: shape.left, top: shape.top, right: shape.right, bottom: shape.bottom },
              text: text && { left: text.left, top: text.top, right: text.right, bottom: text.bottom } };
          });
        });
        const drawn = await page.evaluate(() => {
          const atlas = window.liveAtlas, adapter = atlas.adapter;
          return atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
            const cell = adapter.cellsByRegionId.get(item.regionId);
            const state = cell ? adapter.graph.getView().getState(cell) : null;
            const node = state?.text?.node ?? null;
            const box = node?.getBoundingClientRect();
            const shape = state?.shape?.node?.getBoundingClientRect?.() ?? null;
            const style = state?.style ?? {};
            return { id: item.regionId, area: item.atlas.area, nested: Boolean(item.atlas.parent), label: item.label, status: item.atlas.status, text: node?.textContent ?? '',
              box: box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
              shape: shape && { left: shape.left, top: shape.top, right: shape.right, bottom: shape.bottom },
              fill: style.fillColor ?? null, stroke: style.strokeColor ?? null };
          });
        });
        const where = build.name + ' frame ' + step + ' at ' + viewport.width + 'x' + viewport.height;
        const flat = value => value.replace(/\s/gu, '');
        const cut = drawn.filter(item => flat(item.text) !== flat(item.label));
        const empty = drawn.filter(item => !item.text.trim() || !item.box || item.box.right - item.box.left <= 0);
        // The text box is the SVG line box, whose leading extends below the
        // glyphs; up to 2 px of it may pass the node edge without any ink.
        const LEADING = 2;
        const outside = drawn.filter(item => item.box && item.shape && (item.box.left < item.shape.left - LEADING || item.box.right > item.shape.right + LEADING
          || item.box.top < item.shape.top - LEADING || item.box.bottom > item.shape.bottom + LEADING));
        const overlaps = [];
        for (let i = 0; i < drawn.length; i += 1) for (let j = i + 1; j < drawn.length; j += 1) {
          const a = drawn[i].box, b = drawn[j].box;
          if (a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push([drawn[i].id, drawn[j].id]);
        }
        // Boxes: inside their area, apart from each other (containers hold
        // their children by design, so nested entities are not compared), and
        // clear of the area's own title.
        const overlap = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        const areaOf = new Map(areas.map(item => [item.areaId, item]));
        const outsideArea = drawn.filter(item => {
          const area = areaOf.get(item.area)?.shape;
          return item.shape && area && (item.shape.left < area.left - 1 || item.shape.right > area.right + 1
            || item.shape.top < area.top - 1 || item.shape.bottom > area.bottom + 1);
        });
        const topLevel = drawn.filter(item => !item.nested);
        const boxOverlaps = [];
        for (let i = 0; i < topLevel.length; i += 1) for (let j = i + 1; j < topLevel.length; j += 1) {
          if (topLevel[i].area === topLevel[j].area && overlap(topLevel[i].shape, topLevel[j].shape)) boxOverlaps.push([topLevel[i].id, topLevel[j].id]);
        }
        const titleHits = drawn.filter(item => overlap(areaOf.get(item.area)?.text, item.shape));
        const areaTitleOutside = areas.filter(item => item.text && item.shape && (item.text.right > item.shape.right + 2 || item.text.left < item.shape.left - 2));
        check(where + ': nodes stay inside their area', outsideArea.length === 0, outsideArea.slice(0, 5));
        check(where + ': top-level nodes do not overlap', boxOverlaps.length === 0, boxOverlaps.slice(0, 5));
        check(where + ': area titles are clear of nodes and inside their area', titleHits.length === 0 && areaTitleOutside.length === 0,
          { titleHits: titleHits.slice(0, 3), areaTitleOutside });
        const statusDrawn = drawn.filter(item => item.status);
        const wrongLook = statusDrawn.filter(item => !item.text.startsWith(ATLAS_STATUS[item.status].symbol)
          || item.fill?.toLowerCase() !== ATLAS_STATUS[item.status].appearance.fillColor.toLowerCase()
          || item.stroke?.toLowerCase() !== ATLAS_STATUS[item.status].appearance.strokeColor.toLowerCase());
        check(where + ': every label drawn whole (no UI cut or drop)', cut.length === 0, cut.slice(0, 5));
        // Font-independent: the box must be wide and tall enough for the label
        // by the fixed-size estimate, whatever the installed font measures.
        const tooSmall = drawn.filter(item => !item.nested && item.shape && (item.label.split('\n').some(line => linePx(line) > item.shape.right - item.shape.left - 8)
          || item.label.split('\n').length * LABEL_LINE_PX > item.shape.bottom - item.shape.top + 1));
        check(where + ': every box holds its label by the label-size estimate', tooSmall.length === 0, tooSmall.slice(0, 5).map(item => ({ id: item.id, label: item.label })));
        check(where + ': no empty label', empty.length === 0, empty.slice(0, 5));
        check(where + ': labels stay inside their node', outside.length === 0, outside.slice(0, 5));
        check(where + ': no overlapping entity text', overlaps.length === 0, overlaps.slice(0, 5));
        check(where + ': status nodes carry color and symbol', wrongLook.length === 0, wrongLook.slice(0, 5));
        // Timeline cells, with the plan detail closed and then open: the drawn
        // text rectangle must lie inside its cell and inside the screen, and be
        // the whole label. textContent alone would pass text drawn off-cell.
        const timelineTexts = () => page.evaluate(() => {
          const atlas = window.liveAtlas, adapter = atlas.adapter;
          const screen = document.getElementById('atlas-world').getBoundingClientRect();
          return { screen: { left: screen.left, top: screen.top, right: screen.right, bottom: screen.bottom },
            cells: atlas.projection.scene.representations.filter(item => item.regionId.startsWith('timeline:')).map(item => {
              const state = adapter.graph.getView().getState(adapter.cellsByRegionId.get(item.regionId));
              const box = state?.text?.node?.getBoundingClientRect?.() ?? null;
              const shape = state?.shape?.node?.getBoundingClientRect?.() ?? null;
              return { id: item.regionId, label: item.label, text: state?.text?.node?.textContent ?? '',
                box: box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
                shape: shape && { left: shape.left, top: shape.top, right: shape.right, bottom: shape.bottom } };
            }) };
        });
        const timelineFailures = ({ screen, cells }) => cells.filter(item => !item.box || !item.shape
          || flat(item.text) !== flat(item.label) || !item.text.trim()
          || item.box.left < item.shape.left - LEADING || item.box.right > item.shape.right + LEADING
          || item.box.top < item.shape.top - LEADING || item.box.bottom > item.shape.bottom + LEADING
          || item.box.left < screen.left - 1 || item.box.right > screen.right + 1);
        const closedCells = await timelineTexts();
        check(where + ': timeline cell text inside its cell and the screen', timelineFailures(closedCells).length === 0, timelineFailures(closedCells).slice(0, 5));
        await page.evaluate(() => { window.liveAtlas.page.planOpen = true; window.liveAtlas.setSession({}); });
        const openCells = await timelineTexts();
        check(where + ': open plan detail rows inside their row and the screen', openCells.cells.some(item => item.id.startsWith('timeline:plan-line:'))
          && timelineFailures(openCells).length === 0, timelineFailures(openCells).slice(0, 5));
        await page.evaluate(() => { window.liveAtlas.page.planOpen = false; window.liveAtlas.setSession({}); });
        measured.push({ where, entities: drawn.length, statuses: statusDrawn.length,
          suppliedEllipsis: drawn.filter(item => item.label.includes('…')).length });
      }
      await page.close();
    }
  }
  check('no browser page/console errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors });
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-readability-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  builds: builds.map(item => ({ name: item.name, output: item.receipt.output })), checks: checks.length, measured, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
