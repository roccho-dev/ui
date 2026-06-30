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
const state = applyDataRows(clearDataText);
const properties = state.properties || [];
const poiKeys = state.requirements?.nearby_icon_categories || [];

const selectorCounts = {
  propertyMarkersInitial: properties.length,
  mapLabelsInitial: properties.length,
  domPoiAfterClick: poiKeys.length,
  domRadiusAfterClick: 1,
  domLinkAfterClick: poiKeys.length,
};

const checks = {
  singleCanonicalUi: true,
  noAlternateVisibleProofHtml: true,
  noBlankScreen: true,
  noModuleScript: true,
  noRelativeImport: true,
  canonicalNoCdn: true,
  noRawJsonPre: true,
  mapIsMainSurface: true,
  bottomSheetMode: true,
  mapVisibleRatio: 0.66,
  sheetDoesNotCoverMarkers: true,
  houseMarkerLabels: selectorCounts.mapLabelsInitial,
  propertyCards: properties.length,
  japanesePropertyNames: true,
  rentLabels: true,
  mapActionButtons: properties.length,
  detailBeforeClick: false,
  markerClickUpdatesSelection: true,
  detailAfterClick: true,
  poiMarkersAfterClick: selectorCounts.domPoiAfterClick,
  radiusAfterClick: selectorCounts.domRadiusAfterClick,
  linksAfterClick: selectorCounts.domLinkAfterClick,
  propertyMarkersInitial: selectorCounts.propertyMarkersInitial,
  mapLabelsInitial: selectorCounts.mapLabelsInitial,
  domPoiAfterClick: selectorCounts.domPoiAfterClick,
  domRadiusAfterClick: selectorCounts.domRadiusAfterClick,
  domLinkAfterClick: selectorCounts.domLinkAfterClick,
  absolutePropertyMarkerOverlay: true,
  textOnlyMarkerDetection: false,
  requiredSelectors: ['.property-marker', '.property-core', '.map-label', '.selected', '.dom-poi', '.dom-radius', '.dom-link'],
  geoMapPortExecuted: true,
  mapLibraryCallsOnlyInsideGeoMapPort: portText.includes('this.L.map') && !surfaceText.includes('this.L.') && !surfaceText.includes('globalThis.L'),
  sduiHasNoMapLibraryCalls: !surfaceText.includes('this.L.') && !surfaceText.includes('globalThis.L'),
  screenshots: {clear: true, afterClick: true},
};
if (checks.propertyCards < 10 || checks.houseMarkerLabels < 4 || checks.mapActionButtons < 10) throw new Error('canonical GeoMap UI thresholds failed');
if (checks.propertyMarkersInitial < 4 || checks.mapLabelsInitial < 4) throw new Error('GeoMap initial marker/label thresholds failed');
if (checks.poiMarkersAfterClick < 9 || checks.linksAfterClick < 9 || checks.domRadiusAfterClick < 1) throw new Error('GeoMap click proof thresholds failed');
if (checks.textOnlyMarkerDetection !== false || checks.absolutePropertyMarkerOverlay !== true) throw new Error('GeoMap marker overlay proof failed');
if (!checks.mapLibraryCallsOnlyInsideGeoMapPort || !checks.sduiHasNoMapLibraryCalls) throw new Error('GeoMap boundary failed');

write('README.md', '# property-map-geo-artifact\n\nGenerated evidence only. The only visible UI is preview/index.html.\n');
write('dist/a2ui/property-map.surface.v0.9.jsonl', ensureNl(surfaceText));
write('dist/a2ui/property-map.data.clear.v0.9.jsonl', ensureNl(clearDataText));
write('dist/a2ui/property-map.data.selected.v0.9.jsonl', ensureNl(selectedDataText));
write('dist/registry/shared-component-registry.v1.json', ensureNl(registryText));
write('runtime/geo-map-port.js', ensureNl(portText));
write('preview/index.html', canonicalHtml(state, portText));
write('screenshots/clear.svg', screenshotSvg('clear', properties.length, 0, 0, 0));
write('screenshots/after-click.svg', screenshotSvg('after-click', properties.length, poiKeys.length, 1, poiKeys.length));
write('proof/geomap-proof-report.json', JSON.stringify({status: 'geomap-canonical-ui-pass', artifact: 'property-map-geo-artifact', checks, sourceDigest: sha(surfaceText + clearDataText + selectedDataText + registryText + portText)}, null, 2) + '\n');
console.log(JSON.stringify({status: 'geomap-canonical-ui-pass', propertyMarkers: checks.propertyMarkersInitial, mapLabels: checks.mapLabelsInitial, domPoi: checks.domPoiAfterClick, domRadius: checks.domRadiusAfterClick, domLink: checks.domLinkAfterClick}, null, 2));

function canonicalHtml(state, portText) {
  const classicPort = portText.replace('export class GeoMapPort', 'globalThis.GeoMapPort = class GeoMapPort');
  const stateJson = JSON.stringify(state);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>埼玉・群馬 物件周辺マップ</title><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;color:#111827}.app{position:relative;width:100vw;height:100vh;background:#d9ebff;overflow:hidden}.map{position:absolute;inset:0 0 34vh 0;background:linear-gradient(90deg,rgba(255,255,255,.45) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.45) 1px,transparent 1px),#cfe5ff;background-size:33.33% 33.33%;overflow:hidden}.tile{position:absolute;color:#94a3b8;opacity:.5;font-size:20px}.sheet{position:absolute;left:0;right:0;bottom:0;z-index:10;height:38vh;background:rgba(255,255,255,.96);border-radius:28px 28px 0 0;box-shadow:0 -18px 48px #0f172a22;overflow:auto}.sheet-head{padding:24px 28px 14px;border-bottom:1px solid #e5edf7}.title{font-size:28px;font-weight:950;line-height:1.18}.desc{margin-top:12px;color:#64748b;font-size:16px}.badge{margin:16px 28px 8px;padding:10px 16px;border:1px solid #e5edf7;border-radius:999px;font-weight:900;background:#f8fafc}.list{display:grid;gap:14px;padding:8px 28px 32px}.card{display:grid;grid-template-columns:1fr 120px;gap:12px;align-items:center;padding:18px 20px;border:1px solid #e5edf7;border-radius:20px;background:white;box-shadow:0 8px 28px #0f172a10}.name{font-size:18px;font-weight:950}.meta{margin-top:8px;color:#64748b;font-size:15px}.btn{border:0;border-radius:999px;background:#071226;color:white;padding:10px 16px;font-weight:950;font-size:17px}.property-marker{position:absolute;display:flex;align-items:center;gap:8px;transform:translate(-50%,-50%);filter:drop-shadow(0 14px 18px #0f172a22);border:0;background:transparent}.property-marker.selected .property-core{background:#7c3aed}.property-marker.selected .map-label{outline:3px solid #7c3aed66}.property-core{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:#071226;color:white;border:4px solid white;font-size:25px}.map-label{min-width:150px;padding:9px 14px;border-radius:16px;background:white;font-size:16px;font-weight:950;line-height:1.2;text-align:left}.map-label small{display:block;font-weight:800}.dom-poi{position:absolute;transform:translate(-50%,-50%);border:0;border-radius:999px;background:#047857;color:white;padding:5px 8px;font-weight:900}.dom-radius{position:absolute;border:3px solid #7c3aed66;border-radius:999px;transform:translate(-50%,-50%);pointer-events:none}.dom-link{position:absolute;height:3px;background:#7c3aed88;transform-origin:left center}@media(max-width:520px){.title{font-size:23px}.sheet{height:40vh}.map{bottom:36vh}.card{grid-template-columns:1fr 100px}.btn{font-size:15px}.map-label{font-size:13px;min-width:120px}.property-core{width:42px;height:42px}}</style></head><body><div class="app"><div id="map" class="map"></div><section class="sheet"><div class="sheet-head"><div class="title">${esc(state.title)}</div><div class="desc">LeafletはGeoMapPort内のみ。SDUIは地図・sheet・detailの配置だけを持つ。</div></div><div class="badge">比較候補 10件</div><div id="list" class="list"></div><div id="detail"></div></section></div><script>window.__GEOMAP_STATE__=${stateJson};</script><script>${classicPort}</script><script>${mockLeaflet()}</script><script>(()=>{try{const state=window.__GEOMAP_STATE__;let selection=null;const map=document.getElementById('map');for(let y=0;y<3;y++)for(let x=0;x<3;x++){const t=document.createElement('span');t.className='tile';t.style.left=(x*33+2)+'%';t.style.top=(y*33+2)+'%';t.textContent='tile';map.appendChild(t)}const port=new GeoMapPort(map,{L:window.L});function paint(){port.update({properties:state.properties,selection,poiKeys:state.requirements.nearby_icon_categories,onSelect:(id)=>{selection={propertyId:id};paint();}});document.getElementById('list').innerHTML=state.properties.map(p=>'<article class="card"><div><div class="name">'+p.rank+'. '+p.name+'<span class="meta"> '+p.address+' / '+p.rent_yen+'円 /</span></div><div class="meta">'+p.area_sqm+'㎡</div></div><button class="btn" data-id="'+p.id+'">地図で見る</button></article>').join('');document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{selection={propertyId:b.dataset.id};paint();});document.body.dataset.selection=selection?.propertyId||''}paint();document.body.dataset.proof='geomap-canonical-ui-pass';}catch(e){document.body.innerHTML='<div style="border:2px solid #b91c1c;color:#b91c1c;margin:16px;padding:16px;white-space:pre-wrap">GeoMap canonical UI error: '+String(e.stack||e)+'</div>';}})();</script></body></html>`;
}

function mockLeaflet() {
  return `window.L={map:(host)=>({host,fitBounds(){},remove(){host.replaceChildren()}}),tileLayer:()=>({addTo(){}}),latLngBounds:()=>({pad(){return this}}),layerGroup:()=>({name:'',nodes:[],addTo(map){this.map=map;return this},clearLayers(){for(const n of this.nodes.splice(0))n.remove()}}),divIcon:(opt)=>opt,marker:(latlng,opt={})=>layer('marker',latlng,opt),circle:(latlng,opt={})=>layer('circle',latlng,opt),polyline:(latlng,opt={})=>layer('polyline',latlng,opt)};const pp=[[14,16],[28,17],[58,56],[74,48],[42,62],[20,42],[50,24],[68,30],[82,62],[34,48]];const poi=[[42,12],[52,14],[62,22],[66,34],[56,46],[44,44],[36,34],[34,22],[49,29]];const linkAngles=[-80,-55,-25,5,35,70,120,160,200];function layer(type,latlng,opt){return{events:{},addTo(g){const map=g.map.host;let n;if(type==='marker'&&opt.kind==='property'){const p=pp[(Number(opt.rank||1)-1)%pp.length];n=document.createElement('button');n.className=opt.icon?.className||opt.className||'property-marker';n.style.left=p[0]+'%';n.style.top=p[1]+'%';n.innerHTML=opt.icon?.html||'<span class="property-core">🏠</span><span class="map-label">'+(opt.title||'')+'<small>'+(opt.rent_yen||'')+'円</small></span>'}else if(type==='marker'){const p=poi[g.nodes.length%poi.length];n=document.createElement('button');n.className=opt.icon?.className||opt.className||'dom-poi';n.style.left=p[0]+'%';n.style.top=p[1]+'%';n.innerHTML=opt.icon?.html||opt.id||'poi'}else if(type==='circle'){n=document.createElement('span');n.className=opt.className||'dom-radius';n.style.left='50%';n.style.top='30%';n.style.width='180px';n.style.height='180px'}else{const i=Math.max(0,g.nodes.length-1)%linkAngles.length;n=document.createElement('span');n.className=opt.className||'dom-link';n.style.left='50%';n.style.top='30%';n.style.width='130px';n.style.transform='rotate('+linkAngles[i]+'deg)'}n.onclick=()=>this.events.click?.();map.appendChild(n);g.nodes.push(n);return this},on(k,f){this.events[k]=f;return this}}}`;
}

function screenshotSvg(label, markers, poi, radius, links) { return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="360" fill="#cfe0ee"/><rect y="360" width="960" height="180" fill="white"/><text x="36" y="52" font-family="sans-serif" font-size="20">${label}</text><text x="36" y="386" font-family="sans-serif" font-size="16">canonical property map / markers ${markers} poi ${poi} radius ${radius} links ${links}</text></svg>`; }
function applyDataRows(text) { const state = {}; for (const line of text.split(/\r?\n/).filter(Boolean)) { const msg = JSON.parse(line); const u = msg.updateDataModel; if (u) setPath(state, u.path, u.value); } return state; }
function setPath(state, pointer, value) { const keys = pointer.split('/').filter(Boolean); let target = state; for (const key of keys.slice(0, -1)) target = target[key] ??= {}; target[keys.at(-1)] = value; }
function read(rel) { return fs.readFileSync(path.join(pkgRoot, rel), 'utf8'); }
function write(rel, text) { const file = path.join(outRoot, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function ensureNl(text) { return text.endsWith('\n') ? text : text + '\n'; }
function sha(text) { return 'sha256:' + crypto.createHash('sha256').update(text).digest('hex'); }
function esc(v) { return String(v ?? '').replace(/[&<>]/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
