// Supplied containment as drawn, in the chrome-free World. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-nesting-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON> ...]
// For the gap fixture with its Scope area nested as a producer supplies it
// (担当 / 担当なし / 閉じた差) and any given World, at 1280x720, 1500x1000 and
// 1920x1080 after Fit, on every frame. The oracle is the input's own
// containment relations, never the page: for each supplied parent/child pair,
// both are drawn and the child's rectangle lies inside its parent's;
// children of one parent do not overlap each other or the parent's title;
// every nested text is drawn whole inside its box; and a nested status node
// carries its symbol. A World supplying no containment at all fails: the
// proof would be empty.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { ATLAS_STATUS } from '../packages/control/src/atlas-world-projection.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';

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

// `--page=<index.html>` (with `--input=` naming the World it was built from)
// reads an existing build instead of building from this checkout.
const prebuilt = argv.find(([name]) => name === 'page')?.[1] ?? null;
const inputs = argv.filter(([name]) => name === 'input').map(([, file]) => [path.basename(file), JSON.parse(fs.readFileSync(file, 'utf8'))]);
const worlds = prebuilt ? inputs : [['gap-grouped', gapWorld({ groups: true })], ...inputs];
if (prebuilt && worlds.length !== 1) throw new Error('--page needs exactly one --input');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-nesting-'));
fs.mkdirSync(out);
const builds = [];
for (const [name, world] of worlds) {
  if (prebuilt) { builds.push({ name, world, file: path.resolve(prebuilt) }); continue; }
  const input = path.join(scratch, builds.length + '.json');
  fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
  const dir = path.join(out, String(builds.length));
  await buildLiveAtlas({ input, out: dir, consumer: 'app', chrome: 'none' });
  builds.push({ name, world, file: path.join(path.resolve(dir), 'index.html') });
}

const keyOf = ref => ref.space + '\u0000' + ref.kind + '\u0000' + ref.id;
// The supplied pairs of a raw frame, read from its relations alone.
const suppliedPairs = frame => frame.relations.filter(item => item.containment).map(item => item.containment === 'from-contains-to'
  ? { parent: keyOf(item.from), child: keyOf(item.to) } : { parent: keyOf(item.to), child: keyOf(item.from) });

let current = null;
const server = http.createServer((request, response) => {
  const body = fs.readFileSync(current);
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.byteLength, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';

const checks = [];
const check = (name, pass, detail = null) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const flat = value => String(value ?? '').replace(/\s/gu, '');
const inside = (inner, outer, slack) => inner && outer && inner.left >= outer.left - slack && inner.right <= outer.right + slack
  && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack;
const overlap = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
// The SVG line box's leading may pass the node edge by up to 2 px without ink.
const LEADING = 2;
const pageErrors = [];
let browser, interruption = null;
try {
  browser = await chromium.launch({ headless: true });
  for (const build of builds) {
    const pairsByFrame = new Map(build.world.frames.map(item => [item.id, suppliedPairs(item)]));
    check(build.name + ': the World supplies containment to draw', [...pairsByFrame.values()].some(list => list.length > 0), null);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }, { width: 1920, height: 1080 }]) {
      current = build.file;
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => pageErrors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      const count = await page.evaluate(() => window.liveAtlas.input.frames.length);
      for (let step = 0; step < count; step += 1) {
        if (step > 0) { await page.focus('#atlas-world'); await page.keyboard.press('['); }
        await page.evaluate(() => window.liveAtlas.fit());
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = await page.evaluate(() => {
          const atlas = window.liveAtlas, adapter = atlas.adapter, view = adapter.graph.getView();
          const rect = node => { const box = node?.getBoundingClientRect?.(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null; };
          const frameId = atlas.page.side === 'before' ? atlas.page.pair.before.id : atlas.page.pair.after.id;
          return { frameId, nodes: atlas.projection.scene.representations.filter(item => item.atlas?.kind === 'entity').map(item => {
            const drawn = view.getState(adapter.cellsByRegionId.get(item.regionId));
            const ref = item.atlas.ref;
            return { key: ref.space + '\u0000' + ref.kind + '\u0000' + ref.id, id: ref.kind + ':' + ref.id, label: item.label, status: item.atlas.status ?? null,
              text: drawn?.text?.node?.textContent ?? '', box: rect(drawn?.text?.node), shape: rect(drawn?.shape?.node) };
          }) };
        });
        const where = build.name + ' ' + state.frameId + ' at ' + viewport.width + 'x' + viewport.height;
        const pairs = pairsByFrame.get(state.frameId) ?? [];
        if (!pairs.length) continue;
        const byKey = new Map(state.nodes.map(item => [item.key, item]));
        const missing = pairs.filter(pair => !byKey.get(pair.parent)?.shape || !byKey.get(pair.child)?.shape);
        check(where + ': every supplied container and child is drawn', missing.length === 0,
          missing.slice(0, 5).map(pair => ({ parent: pair.parent.split('\u0000').slice(1).join(':'), child: pair.child.split('\u0000').slice(1).join(':') })));
        const outside = pairs.filter(pair => {
          const parent = byKey.get(pair.parent)?.shape, child = byKey.get(pair.child)?.shape;
          return parent && child && (child.right - child.left <= 0 || child.bottom - child.top <= 0 || !inside(child, parent, 1));
        }).map(pair => ({ parent: byKey.get(pair.parent).id, child: byKey.get(pair.child).id, parentShape: byKey.get(pair.parent).shape, childShape: byKey.get(pair.child).shape }));
        check(where + ': each child is drawn inside its container', outside.length === 0, outside.slice(0, 5));
        const siblings = new Map();
        for (const pair of pairs) siblings.set(pair.parent, [...(siblings.get(pair.parent) ?? []), pair.child]);
        const crossings = [];
        for (const [parent, children] of siblings) {
          const drawn = children.map(key => byKey.get(key)).filter(Boolean);
          for (let i = 0; i < drawn.length; i += 1) {
            if (overlap(drawn[i].shape, byKey.get(parent)?.box)) crossings.push([byKey.get(parent).id + ' title', drawn[i].id]);
            for (let j = i + 1; j < drawn.length; j += 1) if (overlap(drawn[i].shape, drawn[j].shape)) crossings.push([drawn[i].id, drawn[j].id]);
          }
        }
        check(where + ': children of one container clear each other and its title', crossings.length === 0, crossings.slice(0, 5));
        const nested = [...new Set(pairs.flatMap(pair => [pair.parent, pair.child]))].map(key => byKey.get(key)).filter(Boolean);
        const badText = nested.filter(item => flat(item.text) !== flat(item.label) || !item.text.trim() || !inside(item.box, item.shape, LEADING));
        check(where + ': every container and child text is drawn whole inside its box', badText.length === 0,
          badText.slice(0, 5).map(item => ({ id: item.id, label: item.label, text: item.text, box: item.box, shape: item.shape })));
        const statusless = nested.filter(item => item.status && !item.text.startsWith(ATLAS_STATUS[item.status].symbol));
        check(where + ': nested status nodes show their symbol', statusless.length === 0, statusless.slice(0, 5).map(item => ({ id: item.id, text: item.text })));
      }
      await page.close();
    }
  }
  check('no browser page/console errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (error) {
  interruption = String(error?.stack ?? error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-nesting-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  builds: builds.map(item => item.name), checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
