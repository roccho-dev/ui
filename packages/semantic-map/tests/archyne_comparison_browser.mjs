import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { navigationFixture } from './navigation-fixtures.mjs';

const reference = process.env.ARCHYNE_ROOT;
assert(reference, 'ARCHYNE_ROOT must be the unchanged pinned upstream checkout');
const driver = process.env.PLAYWRIGHT_DRIVER_ROOT;
assert(driver?.startsWith('/nix/store/'));
const { chromium } = createRequire(import.meta.url)(driver);
const fixture = await navigationFixture();
const regions = fixture.records.filter(r => r.type === 'region');
const mapping = new Map(regions.map((r, i) => [r.id, `n${i}`]));
const lines = ['flowchart TD'];
const emit = region => {
  const children = regions.filter(r => r.parent === region.id);
  if (children.length) {
    lines.push(`subgraph ${mapping.get(region.id)}[${JSON.stringify(region.label)}]`);
    children.forEach(emit); lines.push('end');
  } else lines.push(`${mapping.get(region.id)}[${JSON.stringify(region.label)}]`);
};
regions.filter(r => r.parent === regions[0].id).forEach(emit);
for (const edge of fixture.records.filter(r => r.type === 'relation')) lines.push(`${mapping.get(edge.from)} -->|${JSON.stringify(edge.label)}| ${mapping.get(edge.to)}`);
const code = `${lines.join('\n')}\n`;
const root = path.join(reference, 'dist');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream'); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let page;
try {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?code=${encodeURIComponent(code)}`);
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="n7"]') || document.querySelector('.canvas-blank'));
  if (await page.getByText('This diagram cannot be drawn', { exact: true }).isVisible()) {
    const body = await page.locator('body').innerText();
    const start = body.indexOf('org.eclipse.elk.core.UnsupportedGraphException');
    assert(start >= 0, 'Record the actual upstream error, not an assumed unsupported case');
    await page.screenshot({ path: '/tmp/semantic-map-345-397-archyne-failure.png' });
    console.log(JSON.stringify({ schema: 'semantic-map-archyne-comparison/1', status: 'UNSUPPORTED',
      upstream: '72249c94f76940ce2d4a0fc449b3fd218f239709', logicalFixture: 'product 30 regions / 45 relations / depth 6',
      error: body.slice(start, start + 700), operations: 'not demonstrated: normal fixture cannot render', sourceModified: false }));
    process.exitCode = 0;
  } else {
  const node = page.locator('.react-flow__node[data-id="n7"]');
  await node.waitFor({ state: 'visible' });
  const before = await node.boundingBox();
  assert(before && before.width > 0 && before.height > 0);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down(); await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 30, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="n7"]') !== null);
  const after = await node.boundingBox();
  assert(Math.abs(after.x - before.x) > 10, 'The actual pointer must move the node');
  const source = await page.locator('.cm-content').innerText();
  assert(source.includes('%% graph:positions'), 'Upstream source must carry typed positions after drag');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/semantic-map-345-397-archyne.png' });
  console.log(JSON.stringify({ schema: 'semantic-map-archyne-comparison/1', status: 'PASS',
    scope: 'same logical 30/45 input, normal built upstream UI, real pointer movement and source position output only',
    upstream: '72249c94f76940ce2d4a0fc449b3fd218f239709', moved: 'n7', logicalId: fixture.ids[7], before, after,
    remaining: ['full operation matrix', 'save/fresh-load comparison', 'dependency/bytes/time assessment'] }));
  }
} catch (error) {
  if (page) { console.error((await page.locator('body').innerText()).slice(0, 1600)); await page.screenshot({ path: '/tmp/semantic-map-345-397-archyne-failure.png' }); }
  throw error;
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
