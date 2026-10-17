// The gap view as drawn. Run inside the semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-gap-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON with frames[i].gap>]
// A chrome-free build of the gap contract fixture, opened over HTTP in windows
// of 1280x720, 1500x1000 and 1920x1080. Every frame is reached with `[`/`]`
// and read from the drawn SVG text and rectangles (not page state):
// - 目的 / 理想状態 / 差 / 現在状態 and each open part are drawn whole, inside
//   their boxes, with the supplied wording;
// - t1 against t0 reads "the ideal moved, the current did not regress, so a
//   difference opened";
// - the Scope area shows exactly the open parts, the closed ones as history.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';

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

const world = arg('input') ? JSON.parse(fs.readFileSync(arg('input'), 'utf8')) : gapWorld();
const fixture = !arg('input');
const inputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-gap-')), 'world.json');
fs.writeFileSync(inputPath, JSON.stringify(world), { flag: 'wx' });
const receipt = await buildLiveAtlas({ input: inputPath, out: arg('out'), consumer: 'app', chrome: 'none' });
const body = fs.readFileSync(path.join(path.resolve(arg('out')), 'index.html'));
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

// What each fixture frame must read, as drawn (whitespace ignored).
const expected = {
  t0: { 'ideal-state': 'v1 · 追加 0', gap: '差 0（初回）', 'current-state': '00:00Z · ?0 !0' },
  t1: { 'ideal-state': 'v1→v2 移動 · 追加 1', gap: '差 1（前 0）理想の移動 1・現在の後退 0・未観測 0', 'current-state': '01:00Z · ?0 !1' },
  t2: { 'ideal-state': 'v2 · 追加 0', gap: '差 3（前 1）理想の移動 0・現在の後退 1・未観測 1', 'current-state': '02:00Z · ?1 !2' },
  t3: { gap: '差 2（前 3）', 'gap-closed': '閉じた差 1（この時点 1）c3 現在が充足' },
};
const flat = value => String(value ?? '').replace(/\s/gu, '');

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
let interruption = null;
try {
  for (const size of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }, { width: 1920, height: 1080 }]) {
    const browser = await chromium.launch({ headless: true, args: ['--window-size=' + size.width + ',' + size.height] });
    try {
      const page = await (await browser.newContext({ viewport: null })).newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      const frames = await page.evaluate(() => window.liveAtlas.input.frames.map(frame => frame.id));
      const read = () => page.evaluate(() => {
        const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
        const rect = node => { const box = node?.getBoundingClientRect?.(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null; };
        const frameId = atlas.page.side === 'before' ? atlas.page.pair.before.id : atlas.page.pair.after.id;
        return { frameId, nodes: atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
          const state = view.getState(adapter.cellsByRegionId.get(item.regionId));
          return { kind: item.atlas.ref.kind, area: item.atlas.area, label: item.label, text: state?.text?.node?.textContent ?? '',
            box: rect(state?.text?.node), shape: rect(state?.shape?.node) };
        }) };
      });
      await page.focus('#atlas-world');
      for (let step = 0; step < frames.length - 1; step += 1) await page.keyboard.press('[');
      for (let index = 0; index < frames.length; index += 1) {
        if (index > 0) { await page.focus('#atlas-world'); await page.keyboard.press(']'); }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = await read();
        const where = size.width + 'x' + size.height + ' ' + state.frameId;
        check(where + ': the frame reached is the one asked for', state.frameId === frames[index], state.frameId);
        const gapNodes = state.nodes.filter(node => ['purpose', 'ideal-state', 'gap', 'current-state', 'gap-part', 'gap-closed'].includes(node.kind));
        const bad = gapNodes.filter(node => flat(node.text) !== flat(node.label) || !node.box || !node.shape
          || node.box.left < node.shape.left - 2 || node.box.right > node.shape.right + 2 || node.box.top < node.shape.top - 2 || node.box.bottom > node.shape.bottom + 2);
        check(where + ': gap nodes drawn whole inside their boxes', gapNodes.length >= 4 && bad.length === 0, bad.slice(0, 4));
        const purpose = state.nodes.find(node => node.kind === 'purpose');
        check(where + ': 目的 carries no satisfaction mark', purpose && flat(purpose.text).startsWith('目的'), purpose);
        check(where + ': the word 目標 is not drawn in the gap view', !gapNodes.some(node => node.text.includes('目標')), gapNodes.map(node => node.text));
        if (fixture) {
          for (const [kind, words] of Object.entries(expected[state.frameId] ?? {})) {
            const node = state.nodes.find(item => item.kind === kind);
            check(where + ': ' + kind + ' reads ' + words, node && flat(node.text).includes(flat(words)), node?.text);
          }
          // A drawn part reads "<status symbol> · <condition>\n<state> · …".
          const condition = node => flat(node.text).replace(/^[!?∅✓⚠⟲]·/u, '').split(/未達|不明/u)[0];
          const parts = state.nodes.filter(node => node.kind === 'gap-part').map(condition);
          const open = { t0: [], t1: ['c3'], t2: ['c3', 'c1', 'c4'], t3: ['c1', 'c4'] }[state.frameId];
          check(where + ': Scopes are exactly the open parts', JSON.stringify([...parts].sort()) === JSON.stringify([...open].sort()), parts);
          if (state.frameId === 't2') {
            const owner = state.nodes.find(node => node.kind === 'gap-part' && condition(node) === 'c1');
            check(where + ': a part without owner reads 担当なし', owner && owner.text.includes('担当なし'), owner?.text);
          }
        }
      }
      check(size.width + 'x' + size.height + ': no page or console errors', errors.length === 0, errors);
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-gap-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  output: receipt.output, checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
