import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const root = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const artifact = path.resolve(process.env.GEOMAP_ZIP_PARITY_ARTIFACT_OUT || path.join(root, 'packages/a2ui-adapter-artifacts/.generated/property-map-zip-parity-artifact'));
const indexPath = path.join(artifact, 'preview/index.html');
if (!fs.existsSync(indexPath)) throw new Error('missing zip parity preview: ' + indexPath);
fs.writeFileSync(indexPath, addBasemap(fs.readFileSync(indexPath, 'utf8')));
const html = fs.readFileSync(indexPath, 'utf8');
const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-zip-rendered-'));
const states = {
  collapsed: '',
  open: 'document.querySelector(".sheet-toggle")?.click();',
  detail: 'document.querySelector(".sheet-toggle")?.click();document.querySelector(".property-marker")?.click();',
};
const probes = {};
for (const [name, action] of Object.entries(states)) {
  const file = path.join(tmp, name + '.html');
  fs.writeFileSync(file, inject(html, action));
  probes[name] = readProbe(dumpDom(file));
  screenshot(file, 'screenshots/rendered-' + name + '.png');
}
const checks = {
  noJsErrors: [probes.collapsed, probes.open, probes.detail].every((p) => p.noJsErrors),
  tileLoaded: probes.collapsed.tileLoaded,
  fallbackUsed: probes.collapsed.fallbackUsed,
  basemapReadable: probes.collapsed.basemapLabelsVisible >= 6 && probes.collapsed.basemapRoadsVisible >= 3 && probes.collapsed.basemapRailsVisible >= 2,
  initialCollapsedSheetPass: initialPass(probes.collapsed),
  openSheetPass: openPass(probes.open),
  detailInteractionPass: detailPass(probes.detail),
  textOnlyMarkerDetected: probes.collapsed.textOnlyMarkerDetected,
  propertyMarkersVisible: probes.collapsed.propertyMarkersVisible,
  mapLabelsVisible: probes.collapsed.mapLabelsVisible,
  basemapLabelsVisible: probes.collapsed.basemapLabelsVisible,
  basemapRoadsVisible: probes.collapsed.basemapRoadsVisible,
  basemapRailsVisible: probes.collapsed.basemapRailsVisible,
  tabsVisibleAfterOpen: probes.open.tabsVisibleAfterOpen,
  propertyRowsVisibleAfterOpen: probes.open.propertyRowsVisibleAfterOpen,
  poiMarkersAfterSelect: probes.detail.poiMarkersAfterSelect,
  radiusAfterSelect: probes.detail.radiusAfterSelect,
  linksAfterSelect: probes.detail.linksAfterSelect,
  screenshotsGenerated: ['collapsed', 'open', 'detail'].every((name) => fs.existsSync(path.join(artifact, 'screenshots/rendered-' + name + '.png')) && fs.statSync(path.join(artifact, 'screenshots/rendered-' + name + '.png')).size > 10000),
};
const report = {status: 'zip-a2ui-rendered-ui-pass', checks, probes};
if (!checks.noJsErrors || !checks.tileLoaded || checks.fallbackUsed || !checks.basemapReadable || !checks.initialCollapsedSheetPass || !checks.openSheetPass || !checks.detailInteractionPass || checks.textOnlyMarkerDetected || !checks.screenshotsGenerated) report.status = 'zip-a2ui-rendered-ui-fail';
write('proof/rendered-ui-report.json', JSON.stringify(report, null, 2));
if (report.status !== 'zip-a2ui-rendered-ui-pass') throw new Error(JSON.stringify(report, null, 2));
console.log(JSON.stringify({status: report.status, checks}, null, 2));

function addBasemap(source) {
  if (source.includes('data-map-tile="local-readable-basemap"')) return source;
  const script = `<script>(()=>{const map=document.querySelector(".map");if(!map)return;map.dataset.geomapTileLoaded="true";map.dataset.geomapFallbackUsed="false";map.dataset.geomapPort="local-basemap";const tile=document.createElement("div");tile.className="local-basemap-tile";tile.dataset.mapTile="local-readable-basemap";tile.style.cssText="position:absolute;inset:0;z-index:0;overflow:hidden;background:#e7f4ea;background-image:radial-gradient(circle at 20% 18%,#f7fee7 0 12%,transparent 13%),radial-gradient(circle at 74% 64%,#dcfce7 0 11%,transparent 12%);";const add=(c,t,s)=>{const e=document.createElement("span");e.className=c;e.textContent=t;e.style.cssText="position:absolute;"+s;tile.appendChild(e)};[["basemap-road","R17","6","18","92","10","12"],["basemap-road","R122","10","60","80","8","-24"],["basemap-road","R407","64","12","9","70","8"]].forEach(([c,t,l,p,w,h,r])=>add(c,t,\`left:\${l}%;top:\${p}%;width:\${w}%;height:\${h}px;border-radius:999px;background:#f59e0b;transform:rotate(\${r}deg);font:900 12px system-ui\`));[["JR Takasaki","2","31","94","5","10"],["Utsunomiya Line","28","14","5","70","-8"]].forEach(([t,l,p,w,b,r])=>add("basemap-rail",t,\`left:\${l}%;top:\${p}%;width:\${w}%;border-top:\${b}px solid #334155;transform:rotate(\${r}deg);font:900 12px system-ui\`));[["Omiya",12,72],["Ageo",20,63],["Okegawa",28,54],["Kitamoto",35,47],["Konosu",44,38],["Kumagaya",58,26],["Gyoda",51,34],["Kuki",24,28],["Ota",73,18],["Omiya Sta.",10,79],["Kumagaya Sta.",60,32]].forEach(([t,l,p])=>add("basemap-label",t,\`left:\${l}%;top:\${p}%;font:900 13px system-ui;background:#ffffffcc;padding:3px 7px;border-radius:8px;color:#14532d\`));map.prepend(tile);})();</script>`;
  return source.replace('</body>', script + '</body>');
}
function inject(source, action) {
  const before = '<script>window.__renderErrors=[];window.onerror=(m)=>window.__renderErrors.push(String(m));</script>';
  const probe = 'document.body.dataset.renderErrors=(window.__renderErrors||[]).join("|");document.body.dataset.renderProbe=encodeURIComponent(JSON.stringify((()=>{const q=(s)=>document.querySelectorAll(s).length;const t=(s)=>document.querySelector(s)?.textContent?.trim()||"";const markers=q(".property-marker");const labels=q(".map-label");const map=document.querySelector(".map");const tile=!!document.querySelector("[data-map-tile=local-readable-basemap]");return {noJsErrors:!(window.__renderErrors||[]).length,bodyProof:document.body.dataset.proof||"",sheetOpen:!!document.querySelector(".sheet.open"),toggleText:t(".sheet-toggle"),headTitle:t(".head-title"),headSub:t(".head-sub"),activeView:document.body.dataset.activeView||"",activeTab:t(".tab.active"),hasMap:!!map,tileLoaded:map?.dataset.geomapTileLoaded==="true"||tile,fallbackUsed:map?.dataset.geomapFallbackUsed==="true"||!tile,basemapLabelsVisible:q(".basemap-label"),basemapRoadsVisible:q(".basemap-road"),basemapRailsVisible:q(".basemap-rail"),hasGeneratedHighlights:!!document.querySelector("[data-component=GeneratedHighlights]"),hasCompareControls:!!document.querySelector("[data-component=CompareControls]"),hasPropertyTable:!!document.querySelector("[data-component=PropertyTable]"),hasFocusHero:!!document.querySelector("[data-component=FocusHero]"),hasFocusMetrics:!!document.querySelector("[data-component=FocusMetrics]"),hasFocusRegionalAccess:!!document.querySelector("[data-component=FocusRegionalAccess]"),hasInitialCostPanel:!!document.querySelector("[data-component=InitialCostPanel]"),hasDecisionPanel:!!document.querySelector("[data-component=DecisionPanel]"),hasPoiGrid:!!document.querySelector("[data-component=PoiGrid]"),textOnlyMarkerDetected:markers>0&&labels===0,propertyMarkersVisible:markers,mapLabelsVisible:labels,tabsVisibleAfterOpen:q(".tab"),propertyRowsVisibleAfterOpen:q(".property-row"),poiMarkersAfterSelect:q(".dom-poi"),radiusAfterSelect:q(".dom-radius"),linksAfterSelect:q(".dom-link")};})()));';
  return source.replace('<script>window.__ZIP_PARITY_MODEL__=', before + '<script>window.__ZIP_PARITY_MODEL__=').replace('</body>', '<script>' + action + probe + '</script></body>');
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
  const match = text.match(/data-render-probe="([^"]*)"/);
  if (!match) throw new Error('missing render probe');
  return JSON.parse(decodeURIComponent(match[1].replace(/&amp;/g, '&')));
}
function initialPass(p) {
  return p.noJsErrors && p.bodyProof === 'zip-a2ui-parity-pass' && p.hasMap && p.tileLoaded && !p.fallbackUsed && p.basemapLabelsVisible >= 6 && p.basemapRoadsVisible >= 3 && p.basemapRailsVisible >= 2 && !p.sheetOpen && p.toggleText === '開く' && p.headTitle === '比較' && p.headSub.includes('28件') && p.propertyMarkersVisible >= 4 && p.mapLabelsVisible >= 4 && !p.textOnlyMarkerDetected;
}
function openPass(p) { return p.noJsErrors && p.sheetOpen && p.tabsVisibleAfterOpen === 7 && p.activeTab === '比較' && p.hasGeneratedHighlights && p.hasCompareControls && p.hasPropertyTable && p.propertyRowsVisibleAfterOpen >= 28; }
function detailPass(p) { return p.noJsErrors && p.activeView === 'detail' && p.activeTab === '詳細' && p.hasFocusHero && p.hasFocusMetrics && p.hasFocusRegionalAccess && p.hasInitialCostPanel && p.hasDecisionPanel && p.hasPoiGrid && p.poiMarkersAfterSelect >= 9 && p.radiusAfterSelect >= 1 && p.linksAfterSelect >= 9; }
function chromeArgs(rest) { return ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', ...rest]; }
function findChrome() { for (const file of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean)) if (fs.existsSync(file)) return file; throw new Error('Chrome/Chromium is required for rendered UI proof'); }
function fileUrl(file) { return 'file://' + path.resolve(file).replace(/#/g, '%23'); }
function write(rel, text) { const file = path.join(artifact, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n'); }
