import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const root = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const artifact = path.resolve(process.env.GEOMAP_ZIP_PARITY_ARTIFACT_OUT || path.join(root, 'packages/a2ui-adapter-artifacts/.generated/property-map-zip-parity-artifact'));
const indexPath = path.join(artifact, 'preview/index.html');
if (!fs.existsSync(indexPath)) throw new Error('missing zip parity preview: ' + indexPath);
const html = fs.readFileSync(indexPath, 'utf8');
const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-zip-interaction-'));

const probes = {
  tabs: renderProbe('tabs', 'document.querySelector(".sheet-toggle")?.click();const tabProof=[];for(const b of document.querySelectorAll(".tab")){b.click();tabProof.push({label:b.textContent.trim(),view:document.body.dataset.activeView,head:document.querySelector(".head-title")?.textContent?.trim()});}document.body.dataset.tabProof=JSON.stringify(tabProof);', 'screenshots/interaction-tabs.png'),
  filtered: renderProbe('filtered', 'document.querySelector(".sheet-toggle")?.click();const before=document.body.dataset.rowCount;document.querySelector(".sort-select").value="rent";document.querySelector(".sort-select").dispatchEvent(new Event("change"));document.querySelector(".only-rent-ok").checked=true;document.querySelector(".only-rent-ok").dispatchEvent(new Event("change"));document.querySelector(".only-mall-ok").checked=true;document.querySelector(".only-mall-ok").dispatchEvent(new Event("change"));document.body.dataset.filterBefore=before;document.body.dataset.filterAfter=document.body.dataset.rowCount;', 'screenshots/interaction-filtered.png'),
  detail: renderProbe('detail', 'document.querySelector(".sheet-toggle")?.click();document.querySelector(".property-marker")?.click();', 'screenshots/interaction-detail-after-marker.png'),
  json: renderProbe('json', 'document.querySelector(".sheet-toggle")?.click();[...document.querySelectorAll(".tab")].find(b=>b.textContent.trim()==="JSON")?.click();const ta=document.querySelector(".data-json");const next=JSON.parse(ta.value);next.title="interaction-applied";next.properties[0].name="interaction-proof-property";ta.value=JSON.stringify(next);document.querySelector(".data-apply")?.click();document.body.dataset.applyTitle=document.body.dataset.dataTitle;document.body.dataset.applyStatus=document.body.dataset.dataStatus;document.querySelector(".data-reset")?.click();document.body.dataset.resetTitle=document.body.dataset.dataTitle;document.body.dataset.resetStatus=document.body.dataset.dataStatus;', null),
};

const tabProof = JSON.parse(probes.tabs.tabProof || '[]');
const checks = {
  tabsClickProof: tabProof.length === 7 && new Set(tabProof.map((item) => item.view)).size === 7,
  markerSelectionProof: probes.detail.activeView === 'detail' && probes.detail.selection && probes.detail.hasFocusHero && probes.detail.poiMarkersAfterSelect >= 9 && probes.detail.radiusAfterSelect >= 1 && probes.detail.linksAfterSelect >= 9,
  rowSelectionProof: probes.filtered.propertyRowsVisibleAfterOpen > 0,
  filtersSortProof: Number(probes.filtered.filterAfter) > 0 && Number(probes.filtered.filterAfter) < Number(probes.filtered.filterBefore || 28),
  dataApplyResetProof: probes.json.applyStatus === 'applied' && probes.json.applyTitle === 'interaction-applied' && probes.json.resetStatus === 'reset' && probes.json.resetTitle !== 'interaction-applied',
  screenshotsGenerated: ['interaction-tabs.png', 'interaction-filtered.png', 'interaction-detail-after-marker.png'].every((name) => fs.existsSync(path.join(artifact, 'screenshots', name)) && fs.statSync(path.join(artifact, 'screenshots', name)).size > 10000),
};
const report = {status: 'property-map-interaction-parity-pass', checks, probes};
if (Object.values(checks).some((pass) => !pass)) report.status = 'property-map-interaction-parity-fail';
write('proof/interaction-parity-report.json', JSON.stringify(report, null, 2));
if (report.status !== 'property-map-interaction-parity-pass') throw new Error(JSON.stringify(report, null, 2));
console.log(JSON.stringify({status: report.status, checks}, null, 2));

function renderProbe(name, action, screenshotRel) {
  const file = path.join(tmp, name + '.html');
  fs.writeFileSync(file, injectHarness(html, action));
  const probe = readProbe(dumpDom(file));
  if (screenshotRel) screenshot(file, screenshotRel);
  return probe;
}
function injectHarness(source, action) {
  const before = '<script>window.__interactionErrors=[];window.onerror=(m)=>window.__interactionErrors.push(String(m));</script>';
  const after = '<script>' + action + 'document.body.dataset.interactionProbe=encodeURIComponent(JSON.stringify((()=>{const q=(s)=>document.querySelectorAll(s).length;const t=(s)=>document.querySelector(s)?.textContent?.trim()||"";return {noJsErrors:!(window.__interactionErrors||[]).length,activeView:document.body.dataset.activeView||"",selection:document.body.dataset.selection||"",rowCount:document.body.dataset.rowCount||"",filterBefore:document.body.dataset.filterBefore||"",filterAfter:document.body.dataset.filterAfter||"",tabProof:document.body.dataset.tabProof||"[]",applyTitle:document.body.dataset.applyTitle||"",applyStatus:document.body.dataset.applyStatus||"",resetTitle:document.body.dataset.resetTitle||"",resetStatus:document.body.dataset.resetStatus||"",activeTab:t(".tab.active"),hasFocusHero:!!document.querySelector("[data-component=FocusHero]"),hasPropertyTable:!!document.querySelector("[data-component=PropertyTable]"),propertyRowsVisibleAfterOpen:q(".property-row"),poiMarkersAfterSelect:q(".dom-poi"),radiusAfterSelect:q(".dom-radius"),linksAfterSelect:q(".dom-link")};})()));</script>';
  return source.replace('<script>window.__ZIP_PARITY_MODEL__=', before + '<script>window.__ZIP_PARITY_MODEL__=').replace('</body>', after + '</body>');
}
function dumpDom(file) {
  const result = spawnSync(chrome, chromeArgs(['--dump-dom', fileUrl(file)]), {encoding: 'utf8'});
  if (result.status !== 0) throw new Error('Chrome dump failed: ' + result.stderr);
  return result.stdout;
}
function screenshot(file, rel) {
  const out = path.join(artifact, rel);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const result = spawnSync(chrome, chromeArgs(['--screenshot=' + out, '--window-size=390,840', fileUrl(file)]), {encoding: 'utf8'});
  if (result.status !== 0) throw new Error('Chrome screenshot failed: ' + result.stderr);
}
function readProbe(text) {
  const match = text.match(/data-interaction-probe="([^"]*)"/);
  if (!match) throw new Error('missing interaction probe');
  return JSON.parse(decodeURIComponent(match[1].replace(/&amp;/g, '&')));
}
function chromeArgs(rest) { return ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', ...rest]; }
function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean);
  for (const file of candidates) if (fs.existsSync(file)) return file;
  throw new Error('Chrome/Chromium is required for interaction proof');
}
function fileUrl(file) { return 'file://' + path.resolve(file).replace(/#/g, '%23'); }
function write(rel, text) { const file = path.join(artifact, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n'); }
