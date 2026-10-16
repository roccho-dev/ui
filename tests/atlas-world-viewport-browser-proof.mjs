// The World as the User opens it: a chrome-free build served over HTTP with
// `?events=` pointing at an SSE producer, in a browser launched at a window
// size (no viewport emulation), measured without calling Fit. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-viewport-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON>] [--events-input=<World JSON>]
// For each window size, after the SSE snapshot is applied:
// - every node box is wide and tall enough for its label at the fixed label
//   size by the font-independent estimate (no glyph metrics), so a box drawn
//   smaller than its text fails even where the installed font is narrow;
// - the drawn text rectangle stays inside its box;
// - the drawing is not shrunk below the scale Fit gives the current World,
//   and never below 1 when the World cannot be shown whole at 1.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { LABEL_LINE_PX, linePx } from '../packages/control/src/atlas-text.mjs';
import { startAtlasProducer } from './fixtures/live-atlas/sse-producer.mjs';
import { statusWorld } from './fixtures/atlas-readability-worlds.mjs';

const argv = process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error('expected --name=value, got ' + argument);
  return [argument.slice(2, index), argument.slice(index + 1)];
});
const arg = name => argv.find(([key]) => key === name)?.[1];
if (!arg('out')) throw new Error('--out is required');
const driverRoot = process.env.PLAYWRIGHT_DRIVER_ROOT;
if (!driverRoot || !path.isAbsolute(driverRoot) || !path.isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '')) {
  throw new Error('run inside the semantic-map-browser-proof Nix shell');
}
const { chromium } = createRequire(import.meta.url)(driverRoot);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-viewport-'));
const built = arg('input') ? JSON.parse(fs.readFileSync(arg('input'), 'utf8')) : statusWorld();
const streamed = arg('events-input') ? JSON.parse(fs.readFileSync(arg('events-input'), 'utf8')) : built;
const inputPath = path.join(scratch, 'world.json');
fs.writeFileSync(inputPath, JSON.stringify(built), { flag: 'wx' });
const receipt = await buildLiveAtlas({ input: inputPath, out: arg('out'), consumer: 'app', chrome: 'none' });
const body = fs.readFileSync(path.join(path.resolve(arg('out')), 'index.html'));
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const producer = await startAtlasProducer({ connections: Array.from({ length: 8 }, () => [{ data: streamed }]) });
const url = 'http://127.0.0.1:' + server.address().port + '/index.html?events=' + encodeURIComponent(producer.url);

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const measured = [];
let interruption = null;
try {
  // Each size is opened directly at that window size, and also opened at a
  // smaller window that is then resized to it (a window manager or a
  // headless launcher may lay the page out before its final size).
  const sizes = [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }, { width: 1920, height: 1080 }];
  for (const [size, start] of sizes.flatMap(size => [[size, size], [size, { width: 960, height: 540 }]])) {
    const browser = await chromium.launch({ headless: true, args: ['--window-size=' + start.width + ',' + start.height] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true' && window.liveAtlas.page.connected,
        null, { timeout: 60000 });
      if (start !== size) {
        const session = await page.context().newCDPSession(page);
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', { windowId, bounds: { width: size.width, height: size.height } });
        await page.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height, [size.width, size.height], { timeout: 10000 });
      }
      await page.waitForTimeout(500);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await page.evaluate(() => {
        const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
        const rect = node => { const box = node?.getBoundingClientRect?.(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null; };
        return {
          inner: [innerWidth, innerHeight], camera: adapter.camera(), world: atlas.projection.world, graph: atlas.projection.viewport.graph,
          minScale: atlas.projection.minScale ?? null,
          nodes: atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity' && !item.atlas.hasChildren).map(item => {
            const state = view.getState(adapter.cellsByRegionId.get(item.regionId));
            return { id: item.regionId, label: item.label, shape: rect(state?.shape?.node), text: rect(state?.text?.node) };
          }),
        };
      });
      const where = size.width + 'x' + size.height + (start === size ? '' : ' (resized from ' + start.width + 'x' + start.height + ')');
      const fitScale = Math.min(state.graph.width / state.world.width, state.graph.height / state.world.height) * 0.94;
      const small = state.nodes.filter(node => !node.shape || node.label.split('\n').some(line => linePx(line) > node.shape.right - node.shape.left - 8)
        || node.label.split('\n').length * LABEL_LINE_PX > node.shape.bottom - node.shape.top + 1);
      const spill = state.nodes.filter(node => node.text && node.shape && (node.text.left < node.shape.left - 2 || node.text.right > node.shape.right + 2));
      check(where + ': the window is the size asked for', state.inner[0] === size.width && state.inner[1] === size.height, state.inner);
      check(where + ': every node box holds its label at the fixed label size', small.length === 0,
        { scale: state.camera.scale, small: small.slice(0, 4).map(node => ({ id: node.id, label: node.label, width: node.shape && node.shape.right - node.shape.left })) });
      check(where + ': drawn node text stays inside its box', spill.length === 0, spill.slice(0, 4));
      check(where + ': the drawing is not shrunk', state.camera.scale >= Math.min(1, fitScale) * 0.99,
        { scale: state.camera.scale, fitScale, world: state.world });
      // A World taller than the view at its minimum scale is reached by the
      // wheel: scrolling down brings its lowest node into the graph view.
      const overflow = state.world.height * state.camera.scale - state.graph.height;
      if (overflow > 1) {
        const box = await page.evaluate(() => document.getElementById('atlas-world').getBoundingClientRect().toJSON());
        await page.mouse.move(box.left + box.width / 2, box.top + state.graph.y + 40);
        await page.mouse.wheel(0, overflow + 60);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const reach = await page.evaluate(() => {
          const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
          const top = document.getElementById('atlas-world').getBoundingClientRect().top;
          const bottoms = atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity')
            .map(item => view.getState(adapter.cellsByRegionId.get(item.regionId))?.shape?.node?.getBoundingClientRect?.().bottom ?? Infinity);
          const graph = atlas.projection.viewport.graph;
          return { lowest: Math.max(...bottoms) - top, limit: graph.y + graph.height, scale: adapter.camera().scale };
        });
        check(where + ': scrolling brings the lowest node into view at the same scale', reach.lowest <= reach.limit + 1 && reach.scale === state.camera.scale, reach);
      }
      check(where + ': no page or console errors', errors.length === 0, errors);
      measured.push({ where, scale: state.camera.scale, fitScale, world: [Math.round(state.world.width), Math.round(state.world.height)], nodes: state.nodes.length });
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await producer.close();
  await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-viewport-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  output: receipt.output, checks: checks.length, measured, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
