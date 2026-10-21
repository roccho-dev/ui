// Supplied containment as drawn, in the one World screen. Run inside the
// semantic-map-browser-proof Nix shell:
//   node tests/atlas-world-nesting-browser-proof.mjs --out=<fresh absent directory> [--input=<World JSON> ...]
// For the gap fixture with its Scope area nested as a producer supplies it
// (担当 / 担当なし / 閉じた差) and any given World, at 1280x720, 1500x1000 and
// 1920x1080 after Fit, on every frame. The oracle is the input's own
// containment relations, never the page: for each supplied parent/child pair,
// both are drawn and the child's rectangle lies inside its parent's;
// children of one parent do not overlap each other or the parent's title;
// every nested text is drawn whole inside its box; and a nested status node
// carries its symbol. Each supplied Scope with an open part (the one whose id
// is the part's scope or condition, read from the input) shows since when the
// part is open, and 担当未確定 when it has no scope, never its causes (S6:
// they are 差's row); one without shows none. As first shown, at 1500x1000 the
// areas stand side by side within the screen, and at 1280x720 the last area
// is at least partly on it. A World supplying no containment, or no Scope
// with an open part, fails: the proof would be empty.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { ATLAS_STATUS } from '../packages/control/src/atlas-world-projection.mjs';
import { CAUSE_LABEL } from '../packages/control/src/atlas-gap.mjs';
import { gapWorld } from './fixtures/atlas-gap-world.mjs';
import { proofScratch } from './fixtures/proof-scratch.mjs';

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
const worlds = prebuilt ? inputs : [['gap-grouped', gapWorld({ groups: true })], ['gap-grouped-unplaced', gapWorld({ groups: 'unplaced' })], ...inputs];
if (prebuilt && worlds.length !== 1) throw new Error('--page needs exactly one --input');
// Its scratch (the Worlds it builds from, the browser's temporary files) sits
// under --out, never the system temp directory, and is removed at the end.
const { scratch, done } = proofScratch(out);
const builds = [];
for (const [name, world] of worlds) {
  if (prebuilt) { builds.push({ name, world, file: path.resolve(prebuilt) }); continue; }
  const input = path.join(scratch, builds.length + '.json');
  fs.writeFileSync(input, JSON.stringify(world), { flag: 'wx' });
  const dir = path.join(out, String(builds.length));
  await buildLiveAtlas({ input, out: dir, consumer: 'app' });
  builds.push({ name, world, file: path.join(path.resolve(dir), 'index.html') });
}

const keyOf = ref => ref.space + '\u0000' + ref.kind + '\u0000' + ref.id;
// The supplied Scope each open part belongs to, read from the input alone: the
// one Scope-area entity whose id is the part's scope or its condition. A part
// with no such entity, with more than one, or sharing its entity with another
// part, is matched to none and counted as unplaced (when Scopes are supplied).
const partOwners = (frame, scopeArea) => {
  const scopes = frame.entities.filter(item => item.area === scopeArea);
  const byScope = new Map();
  for (const part of frame.gap?.parts ?? []) {
    const hits = scopes.filter(item => item.ref.id === part.scope || item.ref.id === part.condition);
    if (hits.length === 1) byScope.set(keyOf(hits[0].ref), [...(byScope.get(keyOf(hits[0].ref)) ?? []), part]);
  }
  const owners = new Map([...byScope].filter(([, parts]) => parts.length === 1).map(([scope, [part]]) => [scope, part]));
  const unplaced = scopes.length ? (frame.gap?.parts ?? []).length - owners.size : 0;
  return { scopes, owners, unplaced };
};
const causeList = cause => Array.isArray(cause) ? cause : [cause.ideal, cause.current].flat().filter(Boolean);
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
    const scopeArea = build.world.presentation.areas[build.world.presentation.areas.findIndex(item => item.id === build.world.presentation.purposeAreaId) + 1].id;
    const ownersByFrame = new Map(build.world.frames.map(item => [item.id, partOwners(item, scopeArea)]));
    check(build.name + ': some supplied Scope has an open part to show', [...ownersByFrame.values()].some(item => item.owners.size > 0), null);
    if (build.name === 'gap-grouped-unplaced') check(build.name + ': some open part is on no Scope', [...ownersByFrame.values()].some(item => item.unplaced > 0), null);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1500, height: 1000 }, { width: 1920, height: 1080 }]) {
      current = build.file;
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => pageErrors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
      const count = await page.evaluate(() => window.liveAtlas.input.frames.length);
      // As first shown (no Fit, no input): at 1500x1000 the areas stand side by
      // side, each across within the screen with its top in the graph view
      // (whose bottom is the projection's; the one screen draws no strip
      // or band); a taller area continues below and is reached by panning. At
      // 1280x720 the last area (Agent) is at least partly on the screen.
      const first = await page.evaluate(() => {
        const atlas = window.liveAtlas, view = atlas.adapter.graph.getView();
        const rect = node => { const box = node?.getBoundingClientRect?.(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null; };
        const shapeOf = item => rect(view.getState(atlas.adapter.cellsByRegionId.get(item.regionId))?.shape?.node);
        const reps = atlas.projection.scene.representations;
        const screen = rect(document.getElementById('atlas-world'));
        const graph = atlas.projection.viewport.graph;
        return { screen, graphBottom: screen.top + graph.y + graph.height,
          areas: reps.filter(item => item.atlas?.kind === 'area').map(item => ({ id: item.atlas.areaId, shape: shapeOf(item) })) };
      });
      const firstWhere = build.name + ' first shown at ' + viewport.width + 'x' + viewport.height;
      if (viewport.width === 1500) check(firstWhere + ': every area lies across within the screen, its top in the graph view',
        first.areas.length >= 3 && first.areas.every(item => item.shape && item.shape.left >= first.screen.left - 1 && item.shape.right <= first.screen.right + 1
          && item.shape.top >= first.screen.top - 1 && item.shape.top < first.graphBottom - 40), first);
      if (viewport.width === 1280) check(firstWhere + ': the last area is at least partly on the screen',
        first.areas.length >= 3 && first.areas.at(-1).shape && first.areas.at(-1).shape.left < first.screen.right - 40, first);
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
        // Each supplied Scope with an open part shows since when (and 担当未確定),
        // never its causes; one without shows no such line (nothing is attached by guess).
        const { scopes, owners, unplaced } = ownersByFrame.get(state.frameId);
        // An open part on no Scope is counted on 差, never dropped in silence.
        const delta = state.nodes.find(item => item.id.startsWith('gap:'));
        const unplacedWords = 'Scopeに付かない差' + unplaced + '件';
        check(where + ': 差 counts the open parts on no Scope (' + unplaced + ')', delta && (unplaced
          ? flat(delta.text).includes(unplacedWords) : !flat(delta.text).includes('Scopeに付かない差')), { unplaced, text: delta?.text });
        const drawnByKey = new Map(state.nodes.map(item => [item.key, item]));
        const noCause = [], guessed = [];
        for (const scope of scopes) {
          const drawn = drawnByKey.get(keyOf(scope.ref));
          if (!drawn) continue;
          const part = owners.get(keyOf(scope.ref));
          const sinceShown = /時点(前)?から/u.test(drawn.text);
          if (part) {
            const causes = causeList(part.cause).map(cause => CAUSE_LABEL[cause]);
            if (!sinceShown || (part.scope === null && !flat(drawn.text).includes('担当未確定')) || causes.some(word => flat(drawn.text).includes(flat(word)))) {
              noCause.push({ id: drawn.id, causes, text: drawn.text });
            }
          } else if (sinceShown) guessed.push({ id: drawn.id, text: drawn.text });
        }
        if (owners.size) check(where + ': each Scope with an open part shows since when, not its causes', noCause.length === 0, noCause.slice(0, 5));
        check(where + ': a Scope with no open part gets no cause line', guessed.length === 0, guessed.slice(0, 5));
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
  done();
}
const failed = checks.filter(item => !item.pass);
const result = { schema: 'atlas-world-nesting-browser-proof/1', status: !interruption && failed.length === 0 ? 'PASS' : 'FAIL',
  builds: builds.map(item => item.name), checks: checks.length, failed, interruption };
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
