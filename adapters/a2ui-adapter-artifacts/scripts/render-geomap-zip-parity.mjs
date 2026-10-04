import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const artifact = path.resolve(process.env.GEOMAP_ZIP_PARITY_ARTIFACT_OUT || path.join(root, 'packages/a2ui-adapter-artifacts/.generated/property-map-zip-parity-artifact'));
const indexPath = path.join(artifact, 'preview/index.html');
if (!fs.existsSync(indexPath)) throw new Error('missing zip parity preview: ' + indexPath);
fs.writeFileSync(indexPath, ensureLeafletOsmFinalUi(fs.readFileSync(indexPath, 'utf8')));
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
  fs.writeFileSync(file, injectHarness(html, action));
  probes[name] = readProbe(dumpDom(file));
  screenshot(file, 'screenshots/rendered-' + name + '.png');
}
const screenshotHashes = Object.fromEntries(['collapsed', 'open', 'detail'].map((name) => [name, fileSha(path.join(artifact, 'screenshots/rendered-' + name + '.png'))]));
const screenshotsDifferent = new Set(Object.values(screenshotHashes)).size === 3;
const checks = {
  noJsErrors: [probes.collapsed, probes.open, probes.detail].every((probe) => probe.noJsErrors),
  leafletProvider: probes.collapsed.mapProvider === 'leaflet-osm',
  leafletContainerVisible: probes.collapsed.leafletContainerVisible >= 1,
  osmTilesLoaded: probes.collapsed.osmTilesLoaded >= 1,
  osmAttributionVisible: probes.collapsed.osmAttribution.includes('OpenStreetMap'),
  fallbackUsed: probes.collapsed.fallbackUsed,
  collapsedSheetVisible: probes.collapsed.sheetVisibleHeight >= 80,
  openSheetVisible: probes.open.sheetVisibleHeight >= 300 && probes.open.sheetTop < 540,
  detailSheetVisible: probes.detail.sheetVisibleHeight >= 300 && probes.detail.sheetTop < 540,
  sheetAboveLeaflet: [probes.collapsed, probes.open, probes.detail].every((probe) => probe.sheetZIndex > probe.leafletPaneMaxZIndex),
  screenshotsDifferent,
  initialCollapsedSheetPass: initialPass(probes.collapsed),
  openSheetPass: openPass(probes.open),
  detailInteractionPass: detailPass(probes.detail),
  textOnlyMarkerDetected: probes.collapsed.textOnlyMarkerDetected,
  propertyMarkersVisible: probes.collapsed.propertyMarkersVisible,
  mapLabelsVisible: probes.collapsed.mapLabelsVisible,
  featuredMapLabelsVisible: probes.collapsed.featuredMapLabelsVisible,
  tabsVisibleAfterOpen: probes.open.tabsVisibleAfterOpen,
  propertyRowsVisibleAfterOpen: probes.open.propertyRowsVisibleAfterOpen,
  poiMarkersAfterSelect: probes.detail.poiMarkersAfterSelect,
  radiusAfterSelect: probes.detail.radiusAfterSelect,
  linksAfterSelect: probes.detail.linksAfterSelect,
  screenshotsGenerated: ['collapsed', 'open', 'detail'].every((name) => fs.existsSync(path.join(artifact, 'screenshots/rendered-' + name + '.png')) && fs.statSync(path.join(artifact, 'screenshots/rendered-' + name + '.png')).size > 10000),
};
const report = {status: 'zip-a2ui-rendered-ui-pass', checks, probes, screenshotHashes};
if (!checks.noJsErrors || !checks.leafletProvider || !checks.leafletContainerVisible || !checks.osmTilesLoaded || !checks.osmAttributionVisible || checks.fallbackUsed || !checks.collapsedSheetVisible || !checks.openSheetVisible || !checks.detailSheetVisible || !checks.sheetAboveLeaflet || !checks.screenshotsDifferent || !checks.initialCollapsedSheetPass || !checks.openSheetPass || !checks.detailInteractionPass || checks.textOnlyMarkerDetected || !checks.screenshotsGenerated) report.status = 'zip-a2ui-rendered-ui-fail';
write('proof/rendered-ui-report.json', JSON.stringify(report, null, 2));
if (report.status !== 'zip-a2ui-rendered-ui-pass') throw new Error(JSON.stringify(report, null, 2));
console.log(JSON.stringify({status: report.status, checks}, null, 2));

function ensureLeafletOsmFinalUi(source) {
  const leafletCss = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">';
  const leafletJs = '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>';
  const finalCss = `<style id="property-map-final-ui-overrides">
    .map{z-index:0!important}.leaflet-container{z-index:0!important}.leaflet-pane{z-index:100!important}.leaflet-tile-pane{z-index:100!important}.leaflet-overlay-pane{z-index:180!important}.leaflet-marker-pane{z-index:220!important}.leaflet-tooltip-pane{z-index:230!important}.leaflet-popup-pane{z-index:240!important}.leaflet-control-container{position:relative;z-index:260!important}
    .sheet{position:fixed!important;left:14px!important;right:14px!important;bottom:0!important;z-index:1200!important;height:112px!important;max-height:76vh!important;background:rgba(255,255,255,.985)!important;border-radius:28px 28px 0 0!important;box-shadow:0 -18px 48px #0f172a33!important;overflow:hidden!important}.sheet.open{height:72vh!important;overflow:auto!important}.sheet-head{background:#fff!important;position:sticky!important;top:0!important;z-index:3!important}.tabs{background:#fff!important;position:sticky!important;top:86px!important;z-index:2!important}.view{padding-bottom:36px!important;background:#fff!important}
    .leaflet-marker-icon.property-marker{border:0!important;background:transparent!important}.property-marker{z-index:250!important}.property-marker .map-label{display:none}.leaflet-marker-pane .property-marker:nth-child(-n+10) .map-label,.property-marker.selected .map-label{display:block}.property-core{box-shadow:0 10px 18px rgba(15,23,42,.25)}.map-label{box-shadow:0 8px 20px rgba(15,23,42,.18);max-width:190px;white-space:normal}.dom-poi{z-index:260!important}.dom-radius{z-index:170!important}.dom-link{z-index:160!important}
    @media(max-width:640px){.sheet{left:12px!important;right:12px!important;height:110px!important}.sheet.open{height:74vh!important}.tabs{top:84px!important}.leaflet-marker-pane .property-marker:nth-child(n+8) .map-label{display:none}.property-marker.selected .map-label{display:block!important}}
  </style>`;
  let next = source;
  if (!next.includes('leaflet@1.9.4/dist/leaflet.css')) next = next.replace('</head>', leafletCss + '</head>');
  if (!next.includes('property-map-final-ui-overrides')) next = next.replace('</head>', finalCss + '</head>');
  if (!next.includes('leaflet@1.9.4/dist/leaflet.js')) next = next.replace('<script>window.__ZIP_PARITY_MODEL__=', leafletJs + '<script>window.__ZIP_PARITY_MODEL__=');
  return next;
}

function injectHarness(source, action) {
  const before = '<script>window.__renderErrors=[];window.onerror=(m)=>window.__renderErrors.push(String(m));</script>';
  const after = `<script>
    ${action}
    setTimeout(() => {
      const q = (s) => document.querySelectorAll(s).length;
      const t = (s) => document.querySelector(s)?.textContent?.trim() || '';
      const map = document.querySelector('.map');
      const sheet = document.querySelector('.sheet');
      const sheetRect = sheet?.getBoundingClientRect();
      const markers = q('.property-marker');
      const labels = q('.map-label');
      const visibleLabels = [...document.querySelectorAll('.map-label')].filter((node) => getComputedStyle(node).display !== 'none').length;
      const sheetZIndex = Number(getComputedStyle(sheet || document.body).zIndex) || 0;
      const leafletPaneMaxZIndex = Math.max(0, ...[...document.querySelectorAll('.leaflet-pane,.leaflet-control-container')].map((node) => Number(getComputedStyle(node).zIndex) || 0));
      document.body.dataset.renderErrors = (window.__renderErrors || []).join('|');
      document.body.dataset.renderProbe = encodeURIComponent(JSON.stringify({
        noJsErrors: !(window.__renderErrors || []).length,
        bodyProof: document.body.dataset.proof || '',
        sheetOpen: !!document.querySelector('.sheet.open'),
        sheetVisibleHeight: Math.max(0, Math.min(window.innerHeight, sheetRect?.bottom || 0) - Math.max(0, sheetRect?.top || 0)),
        sheetTop: sheetRect?.top || 9999,
        sheetZIndex,
        leafletPaneMaxZIndex,
        toggleText: t('.sheet-toggle'),
        headTitle: t('.head-title'),
        headSub: t('.head-sub'),
        activeView: document.body.dataset.activeView || '',
        activeTab: t('.tab.active'),
        hasMap: !!map,
        mapProvider: map?.dataset.geomapProvider || '',
        fallbackUsed: map?.dataset.geomapFallbackUsed === 'true' || map?.dataset.geomapPort !== 'leaflet',
        leafletContainerVisible: q('.leaflet-container'),
        osmTilesLoaded: q('img.leaflet-tile-loaded'),
        osmAttribution: t('.leaflet-control-attribution'),
        hasGeneratedHighlights: !!document.querySelector('[data-component=GeneratedHighlights]'),
        hasCompareControls: !!document.querySelector('[data-component=CompareControls]'),
        hasPropertyTable: !!document.querySelector('[data-component=PropertyTable]'),
        hasFocusHero: !!document.querySelector('[data-component=FocusHero]'),
        hasFocusMetrics: !!document.querySelector('[data-component=FocusMetrics]'),
        hasFocusRegionalAccess: !!document.querySelector('[data-component=FocusRegionalAccess]'),
        hasInitialCostPanel: !!document.querySelector('[data-component=InitialCostPanel]'),
        hasDecisionPanel: !!document.querySelector('[data-component=DecisionPanel]'),
        hasPoiGrid: !!document.querySelector('[data-component=PoiGrid]'),
        textOnlyMarkerDetected: markers > 0 && labels === 0,
        propertyMarkersVisible: markers,
        mapLabelsVisible: labels,
        featuredMapLabelsVisible: visibleLabels,
        tabsVisibleAfterOpen: q('.tab'),
        propertyRowsVisibleAfterOpen: q('.property-row'),
        poiMarkersAfterSelect: q('.dom-poi'),
        radiusAfterSelect: q('.dom-radius'),
        linksAfterSelect: q('.dom-link')
      }));
    }, 4000);
  </script>`;
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
  const match = text.match(/data-render-probe="([^"]*)"/);
  if (!match) throw new Error('missing render probe');
  return JSON.parse(decodeURIComponent(match[1].replace(/&amp;/g, '&')));
}
function initialPass(probe) {
  return probe.noJsErrors && probe.bodyProof === 'zip-a2ui-parity-pass' && probe.hasMap && probe.mapProvider === 'leaflet-osm' && !probe.fallbackUsed && probe.leafletContainerVisible >= 1 && probe.osmTilesLoaded >= 1 && probe.osmAttribution.includes('OpenStreetMap') && !probe.sheetOpen && probe.sheetVisibleHeight >= 80 && probe.sheetZIndex > probe.leafletPaneMaxZIndex && probe.toggleText === '開く' && probe.headTitle === '比較' && probe.headSub.includes('28件') && probe.propertyMarkersVisible >= 4 && probe.mapLabelsVisible >= 4 && probe.featuredMapLabelsVisible >= 4 && !probe.textOnlyMarkerDetected;
}
function openPass(probe) {
  return probe.noJsErrors && probe.sheetOpen && probe.sheetVisibleHeight >= 300 && probe.sheetZIndex > probe.leafletPaneMaxZIndex && probe.tabsVisibleAfterOpen === 7 && probe.activeTab === '比較' && probe.hasGeneratedHighlights && probe.hasCompareControls && probe.hasPropertyTable && probe.propertyRowsVisibleAfterOpen >= 28;
}
function detailPass(probe) {
  return probe.noJsErrors && probe.activeView === 'detail' && probe.sheetOpen && probe.sheetVisibleHeight >= 300 && probe.sheetZIndex > probe.leafletPaneMaxZIndex && probe.activeTab === '詳細' && probe.hasFocusHero && probe.hasFocusMetrics && probe.hasFocusRegionalAccess && probe.hasInitialCostPanel && probe.hasDecisionPanel && probe.hasPoiGrid && probe.poiMarkersAfterSelect >= 9 && probe.radiusAfterSelect >= 1 && probe.linksAfterSelect >= 9;
}
function chromeArgs(rest) { return ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--virtual-time-budget=10000', ...rest]; }
function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean);
  for (const file of candidates) if (fs.existsSync(file)) return file;
  throw new Error('Chrome/Chromium is required for rendered UI proof');
}
function fileUrl(file) { return 'file://' + path.resolve(file).replace(/#/g, '%23'); }
function write(rel, text) { const file = path.join(artifact, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n'); }
function fileSha(file) { return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : ''; }
