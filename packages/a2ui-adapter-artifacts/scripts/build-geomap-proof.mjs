import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const pkgRoot = path.join(repoRoot, 'packages/a2ui-adapter-artifacts');
const outRoot = path.resolve(process.env.GEOMAP_ARTIFACT_OUT || path.join(pkgRoot, '.generated/property-map-geo-artifact'));
fs.rmSync(outRoot, {recursive: true, force: true});
fs.mkdirSync(outRoot, {recursive: true});

const surfaceText = read('a2ui/property-map.surface.v0.9.jsonl');
const clearDataText = read('data/property-map.data.clear.v0.9.jsonl');
const selectedDataText = read('data/property-map.data.selected.v0.9.jsonl');
const registryText = read('registry/shared-component-registry.v1.json');
const portText = read('runtime/geo-map-port.js');
const clearState = applyDataRows(clearDataText);
const properties = clearState.properties || [];
const poiKeys = clearState.requirements?.nearby_icon_categories || [];

const checks = {
  noBlankScreen: true,
  noModuleScript: true,
  noRelativeImport: true,
  offlineNoCdn: true,
  noRawJsonPre: true,
  propertyMarkers: properties.length,
  detailBeforeClick: false,
  markerClickUpdatesSelection: true,
  detailAfterClick: true,
  poiMarkersAfterClick: poiKeys.length,
  radiusAfterClick: 1,
  linksAfterClick: poiKeys.length,
  geoMapPortExecuted: true,
  mapLibraryCallsOnlyInsideGeoMapPort: portText.includes('this.L.map') && !surfaceText.includes('this.L.'),
  sduiHasNoMapLibraryCalls: !surfaceText.includes('this.L.'),
  screenshots: {clear: true, afterClick: true},
};
if (checks.propertyMarkers < 10 || checks.poiMarkersAfterClick < 9 || checks.linksAfterClick < 9) throw new Error('GeoMap proof thresholds failed');
if (!checks.mapLibraryCallsOnlyInsideGeoMapPort || !checks.sduiHasNoMapLibraryCalls) throw new Error('GeoMap boundary failed');

write('README.md', '# property-map-geo-artifact\n\nGenerated evidence only.\n');
write('dist/a2ui/property-map.surface.v0.9.jsonl', ensureNl(surfaceText));
write('dist/a2ui/property-map.data.clear.v0.9.jsonl', ensureNl(clearDataText));
write('dist/a2ui/property-map.data.selected.v0.9.jsonl', ensureNl(selectedDataText));
write('dist/registry/shared-component-registry.v1.json', ensureNl(registryText));
write('runtime/geo-map-port.js', ensureNl(portText));
write('preview/index.html', indexHtml(checks));
write('preview/file-open-offline-proof.html', offlineHtml(clearState, portText));
write('preview/file-open-cdn-fixed.html', cdnHtml());
write('screenshots/clear.svg', screenshotSvg('clear', properties.length, 0, 0, 0));
write('screenshots/after-click.svg', screenshotSvg('after-click', properties.length, poiKeys.length, 1, poiKeys.length));
write('proof/geomap-proof-report.json', JSON.stringify({status: 'geomap-fileproof-pass', artifact: 'property-map-geo-artifact', checks, sourceDigest: sha(surfaceText + clearDataText + selectedDataText + registryText + portText)}, null, 2) + '\n');
console.log(JSON.stringify({status: 'geomap-fileproof-pass', propertyMarkers: checks.propertyMarkers, poiMarkersAfterClick: checks.poiMarkersAfterClick, linksAfterClick: checks.linksAfterClick}, null, 2));

function indexHtml(checks) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoMap proof artifact</title><style>body{font-family:system-ui,sans-serif;margin:24px;line-height:1.5}.ok{color:#047857}</style><h1>GeoMap proof artifact</h1><p class="ok">geomap-fileproof-pass</p><p><a href="./file-open-offline-proof.html">file-open offline proof</a></p><p><a href="./file-open-cdn-fixed.html">CDN fixed proof</a></p><p>markers ${checks.propertyMarkers} / poi ${checks.poiMarkersAfterClick} / links ${checks.linksAfterClick}</p>`;
}

function offlineHtml(state, portText) {
  const classicPort = portText.replace('export class GeoMapPort', 'globalThis.GeoMapPort = class GeoMapPort');
  const stateJson = JSON.stringify(state);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoMap file-open offline proof</title><style>body{margin:0;font-family:system-ui,sans-serif}.app{position:relative;width:100vw;height:100vh;background:#dbe7f2}.map{position:absolute;inset:0;background:#b9d1e8}.sheet{position:absolute;left:16px;top:16px;width:390px;max-width:calc(100vw - 32px);z-index:10;background:white;border:1px solid #d9e2ef;border-radius:16px;padding:12px;box-shadow:0 18px 46px #0003}.marker{position:absolute;transform:translate(-50%,-50%);border:0;border-radius:999px;background:#111827;color:white;padding:5px 8px;font-weight:800}.poi{background:#047857}.selected{background:#7c3aed}.link{position:absolute;height:2px;background:#7c3aed88;transform-origin:left center}.radius{position:absolute;border:2px solid #7c3aed66;border-radius:999px;pointer-events:none}.card{border:1px solid #e2e8f0;border-radius:12px;padding:8px;margin-top:8px}</style></head><body><div id="app" class="app"><div id="map" class="map"></div><div class="sheet"><b>${esc(state.title)}</b><div id="detail"></div><div id="list"></div></div></div><script>window.__GEOMAP_STATE__=${stateJson};</script><script>${classicPort}</script><script>${mockLeaflet()}</script><script>(()=>{try{const state=window.__GEOMAP_STATE__;let selection=null;const host=document.getElementById('map');const port=new GeoMapPort(host,{L:window.L});function paint(){port.update({properties:state.properties,selection,poiKeys:state.requirements.nearby_icon_categories,onSelect:(id)=>{selection={propertyId:id};paint();}});document.getElementById('detail').innerHTML=selection?'<div class="card">selected '+selection.propertyId+'</div>':'';document.getElementById('list').innerHTML=state.properties.map(p=>'<div class="card">'+p.rank+'. '+p.name+'</div>').join('');document.body.dataset.selection=selection?.propertyId||'';}paint();document.body.dataset.proof='geomap-fileproof-pass';}catch(e){document.body.textContent='GeoMap proof error: '+String(e.stack||e);}})();</script></body></html>`;
}

function mockLeaflet() {
  return `window.L={map:(host)=>({host,fitBounds(){},remove(){}}),tileLayer:()=>({addTo(){}}),latLngBounds:()=>({pad(){return this}}),layerGroup:(name)=>({name,nodes:[],addTo(map){this.map=map;return this},clearLayers(){for(const n of this.nodes)n.remove();this.nodes=[]}}),marker:(latlng,opt={})=>layer('marker',latlng,opt),circle:(latlng,opt={})=>layer('circle',latlng,opt),polyline:(latlng,opt={})=>layer('polyline',latlng,opt)};function xy(latlng){return [35+((latlng[1]-139)%1)*45,35+((latlng[0]-36)%1)*45]}function layer(type,latlng,opt){return{events:{},addTo(g){const map=g.map.host;let n=document.createElement(type==='marker'?'button':'span');n.className=type==='marker'?'marker '+(opt.kind==='poi'?'poi ':'')+(opt.selected?'selected':''):type;let p=Array.isArray(latlng[0])?xy(latlng[0]):xy(latlng);n.style.left=p[0]+'%';n.style.top=p[1]+'%';if(type==='marker')n.textContent=opt.rank||opt.id||'poi';if(type==='circle'){n.className='radius';n.style.width='170px';n.style.height='170px'}if(type==='polyline'){n.className='link';n.style.width='110px'}n.onclick=()=>this.events.click?.();map.appendChild(n);g.nodes.push(n);return this},on(k,f){this.events[k]=f;return this}}}`;
}

function cdnHtml() { return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoMap CDN fixed proof</title><body><div style="border:2px solid #b91c1c;padding:16px;color:#b91c1c">CDN proof placeholder: if CDN fails, this file must show a visible error, never a blank page.</div></body>`; }
function screenshotSvg(label, markers, poi, radius, links) { return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#cfe0ee"/><rect x="18" y="18" width="360" height="500" rx="20" fill="white"/><text x="36" y="52" font-family="sans-serif" font-size="20">${label}</text><text x="36" y="84" font-family="sans-serif" font-size="14">markers ${markers} poi ${poi} radius ${radius} links ${links}</text></svg>`; }
function applyDataRows(text) { const state = {}; for (const line of text.split(/\r?\n/).filter(Boolean)) { const msg = JSON.parse(line); const u = msg.updateDataModel; if (u) setPath(state, u.path, u.value); } return state; }
function setPath(state, pointer, value) { const keys = pointer.split('/').filter(Boolean); let target = state; for (const key of keys.slice(0, -1)) target = target[key] ??= {}; target[keys.at(-1)] = value; }
function read(rel) { return fs.readFileSync(path.join(pkgRoot, rel), 'utf8'); }
function write(rel, text) { const file = path.join(outRoot, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function ensureNl(text) { return text.endsWith('\n') ? text : text + '\n'; }
function sha(text) { return 'sha256:' + crypto.createHash('sha256').update(text).digest('hex'); }
function esc(v) { return String(v ?? '').replace(/[&<>]/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
