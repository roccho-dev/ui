import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const outRoot = path.resolve(process.argv[2] || process.env.REPO_MAP_SVGPANZOOM_ARTIFACT_OUT || 'adapter-result/repo-map-svgpanzoom-artifact');
const htmlPath = path.join(outRoot, 'preview/index.html');
const screenshotsDir = path.join(outRoot, 'screenshots');
const proofDir = path.join(outRoot, 'proof');
const reportPath = path.join(proofDir, 'runtime-report.json');
const manifestPath = path.join(proofDir, 'manifest.json');
const chrome = findChrome();
if (!fs.existsSync(htmlPath)) throw new Error(`HTML artifact missing: ${htmlPath}`);
fs.mkdirSync(screenshotsDir, { recursive: true }); fs.mkdirSync(proofDir, { recursive: true });
const specs = [
  { name: 'desktop-z00', file: 'desktop-z00.png', size: '1280,820', testCase: 'desktop-z00', expect: { repoMin: 10, package: 0, model: 0 } },
  { name: 'desktop-z42', file: 'desktop-z42.png', size: '1280,820', testCase: 'desktop-z42', expect: { repoMin: 1, packageMin: 3, model: 0, packagesInsideRepo: true } },
  { name: 'desktop-z80', file: 'desktop-z80.png', size: '1280,820', testCase: 'desktop-z80', expect: { packageMin: 1, modelMin: 1, modelsInsidePackage: true } },
  { name: 'mobile-z00', file: 'mobile-z00.png', size: '390,844', testCase: 'mobile-z00', expect: { repoMin: 10, package: 0, model: 0, noOverflow: true } },
  { name: 'mobile-z42', file: 'mobile-z42.png', size: '390,844', testCase: 'mobile-z42', expect: { repoMin: 1, packageMin: 2, model: 0, packagesInsideRepo: true, noOverflow: true } },
  { name: 'mobile-z80', file: 'mobile-z80.png', size: '390,844', testCase: 'mobile-z80', expect: { packageMin: 1, modelMin: 1, modelsInsidePackage: true, noOverflow: true } },
];
const cases = [];
for (const spec of specs) {
  const url = `${pathToFileURL(htmlPath).href}?testCase=${encodeURIComponent(spec.testCase)}`;
  const dom = runChrome([...commonChromeArgs(spec.size), '--dump-dom', url], `dump-dom ${spec.name}`).stdout;
  assertNoFatalText(dom, spec.name);
  const smoke = extractSmokeReport(dom, spec.name);
  const evaluation = evaluateCase(spec, smoke);
  const screenshotPath = path.join(screenshotsDir, spec.file);
  runChrome([...commonChromeArgs(spec.size), `--screenshot=${screenshotPath}`, url], `screenshot ${spec.name}`);
  const size = fs.statSync(screenshotPath).size;
  if (size < 5000) evaluation.failures.push(`screenshot too small: ${size}`);
  evaluation.screenshot = path.relative(outRoot, screenshotPath).split(path.sep).join('/');
  evaluation.status = evaluation.failures.length ? 'FAIL' : 'PASS';
  cases.push(evaluation);
}
const report = { kind: 'ui.repoMapSvgPanZoomRuntimeE2E.v1', status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL', html: 'preview/index.html', chrome, checks: ['dom-geometry', 'runtime-smoke-report', 'desktop-screenshots', 'mobile-screenshots', 'no-debug-product-ui'], cases };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
if (fs.existsSync(manifestPath)) { const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); manifest.runtimeReport = 'proof/runtime-report.json'; manifest.runtimeStatus = report.status; manifest.screenshotFiles = cases.map((item) => item.screenshot); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8'); }
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') throw new Error('repo-map svg-pan-zoom runtime smoke failed');
function evaluateCase(spec, smoke) {
  const rects = (smoke.rects || []).filter((rect) => rect.onScreen);
  const roles = countRoles(rects);
  const failures = [];
  for (const role of ['repo', 'package', 'model']) {
    if (role in spec.expect && (roles[role] || 0) !== spec.expect[role]) failures.push(`${role} expected ${spec.expect[role]} got ${roles[role] || 0}`);
    const minKey = `${role}Min`;
    if (minKey in spec.expect && (roles[role] || 0) < spec.expect[minKey]) failures.push(`${role} expected >= ${spec.expect[minKey]} got ${roles[role] || 0}`);
  }
  if (spec.expect.packagesInsideRepo) { const repo = largest(rects.filter((rect) => rect.role === 'repo')); const packages = rects.filter((rect) => rect.role === 'package'); if (!repo || !packages.length) failures.push('missing repo/package geometry'); else if (packages.filter((pkg) => inside(pkg, repo, 6)).length < Math.min(3, packages.length)) failures.push('package rects are not contained by repo rect'); }
  if (spec.expect.modelsInsidePackage) { const packages = Object.fromEntries(rects.filter((rect) => rect.role === 'package').map((rect) => [rect.id, rect])); const models = rects.filter((rect) => rect.role === 'model'); const insideModels = models.filter((model) => packages[model.container] && inside(model, packages[model.container], 6)).length; if (!models.length || insideModels < Math.max(1, Math.min(2, models.length))) failures.push('model rects are not contained by package rect'); }
  if (spec.expect.noOverflow && smoke.scrollWidth > smoke.innerWidth + 2) failures.push(`horizontal overflow ${smoke.scrollWidth}>${smoke.innerWidth}`);
  const labels = smoke.labels || [];
  if (!labels.length) failures.push('no visible labels');
  const oversized = labels.filter((label) => label.h > 32 || label.w > 0.9 * (smoke.innerWidth || 1000));
  if (oversized.length) failures.push(`oversized labels: ${oversized.slice(0, 3).map((label) => label.text).join(', ')}`);
  const leaking = labels.filter((label) => label.role !== 'edge' && label.target && !inside(label, label.target, 8));
  if (leaking.length) failures.push(`labels outside target rect: ${leaking.slice(0, 3).map((label) => label.text).join(', ')}`);
  if (smoke.productUi?.debugZText || smoke.productUi?.hud || smoke.productUi?.repoButtonRow) failures.push('debug UI leaked into product UI');
  return { name: spec.name, status: 'PENDING', failures, roles, z: smoke.stats?.z, zoom: smoke.stats?.zoom, labelCount: labels.length, lineCount: smoke.lineCount };
}
function extractSmokeReport(dom, label) { const match = dom.match(/<script type="application\/json" id="repo-map-smoke-report">([\s\S]*?)<\/script>/); if (!match) throw new Error(`${label}: missing repo-map-smoke-report`); return JSON.parse(decodeHtml(match[1])); }
function decodeHtml(value) { return value.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'); }
function countRoles(rects) { return rects.reduce((acc, rect) => ({ ...acc, [rect.role]: (acc[rect.role] || 0) + 1 }), {}); }
function largest(rects) { return rects.length ? rects.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b)) : null; }
function inside(inner, outer, tolerance = 0) { return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance && inner.x + inner.w <= outer.x + outer.w + tolerance && inner.y + inner.h <= outer.y + outer.h + tolerance; }
function commonChromeArgs(size) { return ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', `--window-size=${size}`]; }
function runChrome(args, label) { const result = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 45000 }); if (result.error) throw new Error(`${label}: ${result.error.message}`); if (result.status !== 0) throw new Error(`${label}: chromium exited ${result.status}\n${result.stderr || ''}`); assertNoFatalText(result.stderr || '', label); return { stdout: result.stdout || '', stderr: result.stderr || '' }; }
function assertNoFatalText(text, label) { if (/(Uncaught|ReferenceError|TypeError|SyntaxError|ERR_FILE_NOT_FOUND|net::ERR)/.test(text)) throw new Error(`${label}: fatal runtime text found\n${text}`); }
function findChrome() { const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean); for (const candidate of candidates) { if (candidate.startsWith('/') && fs.existsSync(candidate)) return candidate; const found = spawnSync('bash', ['-lc', `command -v ${candidate}`], { encoding: 'utf8' }); if (found.status === 0 && found.stdout.trim()) return found.stdout.trim().split(/\r?\n/)[0]; } throw new Error('No headless browser found. Set CHROME_BIN or install chromium/google-chrome.'); }
