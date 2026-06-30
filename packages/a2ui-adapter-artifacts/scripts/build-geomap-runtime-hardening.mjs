import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GeoMapPort} from '../runtime/geo-map-port.js';

const repoRoot = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const pkgRoot = path.join(repoRoot, 'packages/a2ui-adapter-artifacts');
const outRoot = path.resolve(process.env.GEOMAP_ARTIFACT_OUT || path.join(pkgRoot, '.generated/property-map-geo-runtime-hardening'));
fs.rmSync(outRoot, {recursive: true, force: true});
fs.mkdirSync(outRoot, {recursive: true});

const runtimePath = path.join(pkgRoot, 'runtime/geo-map-port.js');
const runtimeText = fs.readFileSync(runtimePath, 'utf8');
const host = createHost();
const L = createMockLeaflet();
const port = new GeoMapPort(host, {L});
const poiKeys = ['スーパー', 'ショッピング', '最寄駅', '新幹線', '病院', 'バス停', '公園', '体育館', '児童館'];
const properties = createProperties(28);

port.mount();
const initialMountCreates = L.metrics.mapCreates;
const initialLayerGroups = L.metrics.layerGroups;
const initialTileUrl = L.metrics.tileUrls[0];
const repeatedHostCounts = [];
let lastRepeatedCounts = null;
for (let i = 0; i < 10; i += 1) {
  lastRepeatedCounts = port.update({properties, selection: null, poiKeys});
  repeatedHostCounts.push(host.children.length);
}
const noSelectionSnapshot = snapshot(port, host);
const selectionCounts = port.update({properties, selection: {propertyId: 'p1'}, poiKeys});
const selectedSnapshot = snapshot(port, host);
const selectionCountsAgain = port.update({properties, selection: {propertyId: 'p2'}, poiKeys});
const replacedSnapshot = snapshot(port, host);
const selectedMarkerCount = port.layers.properties.nodes.filter((node) => node.options.selected).length;
port.dispose();
const afterDispose = {hostChildren: host.children.length, map: port.map, layers: port.layers, disposed: host.getAttribute('data-geomap-disposed')};
port.mount();
const remountCounts = port.update({properties, selection: {propertyId: 'p1'}, poiKeys});
const remountSnapshot = snapshot(port, host);

const checks = {
  mountCreatedMapOnce: initialMountCreates === 1,
  layerGroupsCreatedOncePerMount: initialLayerGroups === 3,
  hostTagged: host.getAttribute('data-geomap-port') === 'leaflet',
  repeatedUpdateNoDuplicateProperties: repeatedHostCounts.every((count) => count === 28) && lastRepeatedCounts?.properties === 28,
  selectedOverlayReplacement: selectedSnapshot.poi === 9 && selectedSnapshot.radius === 1 && selectedSnapshot.links === 9 && replacedSnapshot.poi === 9 && replacedSnapshot.radius === 1 && replacedSnapshot.links === 9,
  selectedMarkerStable: selectedMarkerCount === 1,
  disposeClearsLayers: afterDispose.hostChildren === 0 && afterDispose.map === null && afterDispose.layers === null && afterDispose.disposed === 'true',
  disposeRemountPass: L.metrics.mapCreates === 2 && remountSnapshot.properties === 28 && remountSnapshot.poi === 9 && remountSnapshot.radius === 1 && remountSnapshot.links === 9,
  fileOpenTileFallback: initialTileUrl === 'about:blank',
  mapLibraryCallsOnlyInsideGeoMapPort: runtimeText.includes('this.L.map') && !runtimeText.includes('import L') && !runtimeText.includes("from 'leaflet'"),
  hostNodeCountGrowthWithinThreshold: Math.max(...repeatedHostCounts) - Math.min(...repeatedHostCounts) === 0,
};
const metrics = {
  propertyMarkers: noSelectionSnapshot.properties,
  repeatedUpdates: repeatedHostCounts.length,
  repeatedHostNodeCounts: repeatedHostCounts,
  poiMarkersAfterSelection: selectionCounts.poi,
  radiusAfterSelection: selectionCounts.radius,
  linksAfterSelection: selectionCounts.links,
  poiMarkersAfterReplacement: selectionCountsAgain.poi,
  radiusAfterReplacement: selectionCountsAgain.radius,
  linksAfterReplacement: selectionCountsAgain.links,
  mapsCreatedAcrossRemount: L.metrics.mapCreates,
  mapsRemoved: L.metrics.mapRemoves,
  layerGroupsCreatedAcrossRemount: L.metrics.layerGroups,
  remountPropertyMarkers: remountCounts.properties,
};

if (Object.entries(checks).some(([, pass]) => !pass)) throw new Error(`GeoMap runtime hardening failed: ${JSON.stringify({checks, metrics})}`);
write('proof/geomap-runtime-hardening-report.json', JSON.stringify({status: 'geomap-runtime-hardening-pass', checks, metrics, sourceDigest: sha(runtimeText)}, null, 2) + '\n');
console.log(JSON.stringify({status: 'geomap-runtime-hardening-pass', checks, metrics}, null, 2));

function createProperties(count) {
  return Array.from({length: count}, (_, index) => {
    const rank = index + 1;
    return {
      id: `p${rank}`,
      rank,
      name: `物件${rank}`,
      address: '埼玉県テスト市',
      rent_yen: 40000 + rank * 1000,
      area_sqm: 40 + rank,
      geo: {lat: 36 + index * 0.01, lng: 139 + index * 0.01},
      nearby: Object.fromEntries(poiKeys.map((key, poiIndex) => [key, {label: key, lat: 36 + index * 0.01 + poiIndex * 0.001, lng: 139 + index * 0.01 + poiIndex * 0.001}])),
    };
  });
}

function createHost() {
  const attrs = new Map();
  const host = {
    children: [],
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    removeAttribute(name) { attrs.delete(name); },
    appendChild(node) { this.children.push(node); node.host = this; return node; },
    replaceChildren() { this.children.splice(0); },
  };
  return host;
}

function createMockLeaflet() {
  const metrics = {mapCreates: 0, mapRemoves: 0, layerGroups: 0, tileUrls: []};
  return {
    metrics,
    map(host, options) {
      metrics.mapCreates += 1;
      return {host, options, fitBoundsCalls: 0, fitBounds() { this.fitBoundsCalls += 1; }, off() {}, remove() { metrics.mapRemoves += 1; host.children.splice(0); }};
    },
    tileLayer(url, options) { metrics.tileUrls.push(url); return {url, options, addTo(map) { this.map = map; return this; }, remove() {}}; },
    latLngBounds() { return {pad() { return this; }}; },
    layerGroup(name) {
      metrics.layerGroups += 1;
      return {name, nodes: [], addTo(map) { this.map = map; return this; }, clearLayers() { for (const node of [...this.nodes]) node.remove(); this.nodes = []; }};
    },
    divIcon: (options = {}) => options,
    marker(latlng, options = {}) { return layer('marker', latlng, options); },
    circle(latlng, options = {}) { return layer('circle', latlng, options); },
    polyline(latlng, options = {}) { return layer('polyline', latlng, options); },
  };
}

function layer(type, latlng, options) {
  return {
    type,
    latlng,
    options,
    events: {},
    addTo(group) {
      const node = {
        type,
        latlng,
        options,
        events: this.events,
        remove() {
          const index = group.map.host.children.indexOf(node);
          if (index >= 0) group.map.host.children.splice(index, 1);
        },
      };
      group.nodes.push(node);
      group.map.host.appendChild(node);
      return this;
    },
    on(name, fn) { this.events[name] = fn; return this; },
  };
}

function snapshot(port, host) {
  return {
    properties: port.layers?.properties.nodes.length || 0,
    poi: port.layers?.poi.nodes.length || 0,
    radius: port.layers?.overlay.nodes.filter((node) => node.type === 'circle').length || 0,
    links: port.layers?.overlay.nodes.filter((node) => node.type === 'polyline').length || 0,
    hostChildren: host.children.length,
  };
}

function write(rel, text) { const file = path.join(outRoot, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function sha(text) { return 'sha256:' + crypto.createHash('sha256').update(text).digest('hex'); }
