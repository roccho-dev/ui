import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const zipArtifact = path.resolve(process.env.GEOMAP_ZIP_PARITY_ARTIFACT_OUT || path.join(root, 'packages/a2ui-adapter-artifacts/.generated/property-map-zip-parity-artifact'));
const runtimeArtifact = path.resolve(process.env.GEOMAP_RUNTIME_ARTIFACT_OUT || path.join(root, 'packages/a2ui-adapter-artifacts/.generated/property-map-geo-runtime-hardening'));

const reports = {
  static: readJson(path.join(zipArtifact, 'proof/zip-visual-parity-report.json')),
  rendered: readJson(path.join(zipArtifact, 'proof/rendered-ui-report.json')),
  interaction: readJson(path.join(zipArtifact, 'proof/interaction-parity-report.json')),
  runtime: readJson(path.join(runtimeArtifact, 'proof/geomap-runtime-hardening-report.json')),
};
const screenshots = [
  'screenshots/rendered-collapsed.png',
  'screenshots/rendered-open.png',
  'screenshots/rendered-detail.png',
  'screenshots/interaction-tabs.png',
  'screenshots/interaction-filtered.png',
  'screenshots/interaction-detail-after-marker.png',
];
const obsolete = ['preview/file-open-offline-proof.html', 'preview/file-open-cdn-fixed.html', 'dist/index.html'];
const previewHtml = fs.readFileSync(path.join(zipArtifact, 'preview/index.html'), 'utf8');
const renderedChecks = reports.rendered.checks || {};
const checks = {
  staticReportPass: reports.static.status === 'zip-a2ui-parity-pass',
  renderedReportPass: reports.rendered.status === 'zip-a2ui-rendered-ui-pass',
  interactionReportPass: reports.interaction.status === 'property-map-interaction-parity-pass',
  runtimeReportPass: reports.runtime.status === 'geomap-runtime-hardening-pass',
  screenshotsPresent: screenshots.every((rel) => existsWithBytes(path.join(zipArtifact, rel), 10000)),
  singleVisibleHtml: fs.existsSync(path.join(zipArtifact, 'preview/index.html')) && obsolete.every((rel) => !fs.existsSync(path.join(zipArtifact, rel))),
  a2uiAuthority: reports.static.checks?.a2uiOnlySourceAuthority === true && reports.static.checks?.zipHtmlTemplateNotSourceAuthority === true,
  renderedCounts: renderedChecks.propertyMarkersVisible >= 4 && renderedChecks.mapLabelsVisible >= 4 && renderedChecks.poiMarkersAfterSelect >= 9,
  leafletOsmMap: previewHtml.includes('leaflet@1.9.4/dist/leaflet.js') && previewHtml.includes('tile.openstreetmap.org') && renderedChecks.leafletProvider === true && renderedChecks.osmTilesLoaded === true && renderedChecks.osmAttributionVisible === true,
  noFallbackMap: renderedChecks.fallbackUsed === false && !/local-readable-basemap|dom-fallback|about:blank/.test(previewHtml),
  visibleSheetStates: renderedChecks.collapsedSheetVisible === true && renderedChecks.openSheetVisible === true && renderedChecks.detailSheetVisible === true && renderedChecks.sheetAboveLeaflet === true,
  screenshotStateDiffs: renderedChecks.screenshotsDifferent === true,
  interactionCounts: reports.interaction.checks?.tabsClickProof === true && reports.interaction.checks?.dataApplyResetProof === true,
  runtimeCounts: reports.runtime.metrics?.propertyMarkers === 28 && reports.runtime.metrics?.poiMarkersAfterSelection >= 9,
};
const report = {status: 'property-map-final-gate-pass', checks, reportStatuses: Object.fromEntries(Object.entries(reports).map(([key, value]) => [key, value.status]))};
if (Object.values(checks).some((pass) => !pass)) report.status = 'property-map-final-gate-fail';
writeJson(path.join(zipArtifact, 'proof/final-gate-report.json'), report);
if (report.status !== 'property-map-final-gate-pass') throw new Error(JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error('missing final gate input: ' + file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function existsWithBytes(file, minBytes) {
  return fs.existsSync(file) && fs.statSync(file).size > minBytes;
}
