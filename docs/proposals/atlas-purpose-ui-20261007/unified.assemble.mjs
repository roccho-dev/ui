(async function buildUnifiedArtifact(){
if(!process.argv[2])throw new Error('Pass an absent output directory; no overwrite');
const fs=await import('node:fs/promises'),path=await import('node:path'),{createHash}=await import('node:crypto');
const {packBrowserModules,moduleId,embeddedNoticesScript}=await import(path.resolve("./packages/semantic-map/scripts/browser-module-closure.mjs"));
const {ATLAS_MODULE_ROOTS,resolveHistory}=await import(path.resolve("./scripts/build-live-atlas.mjs"));
const digest=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const root='docs/proposals/atlas-purpose-ui-20261007',entry=root+'/unified.example.mjs',template=await fs.readFile(root+'/unified.example.html','utf8');
const specification=JSON.parse(await fs.readFile(root+'/unified.input.example.json','utf8'));
const pair=[specification.purposeSnapshots.before,specification.purposeSnapshots.after];
const replacement=specification.purposeSnapshots.replacement;
const activity=await resolveHistory(specification.activity.path);
const activitySources={};for(const s of activity.snapshots){activitySources[s.rev]={};for(const [name,c]of Object.entries(s.channels))activitySources[s.rev][name]={sourceRef:'ui:fixture:'+name+'@rev'+s.rev,sourceDigest:digest(c.text),authority:false}}
const bridges=structuredClone(specification.bridges);
const bridgeSource={sourceRef:specification.bridgeSourceRef,sourceDigest:digest(JSON.stringify(bridges)),authority:false};
for(const b of bridges)b.sources=[bridgeSource];
const basis=(frameId,activityRev,purposeSnapshot,rows)=>({frameId,activityRev,activityAsOf:activity.snapshots.find(s=>s.rev===activityRev).asOf,purposeSnapshot,purposeDigest:digest(JSON.stringify(rows)),purposeEffectiveAt:null,bridgeSource,alignment:'synthetic scenario/version対応'});
const purposePairs=specification.purposeCases.map(c=>[specification.purposeSnapshots[c.before],specification.purposeSnapshots[c.after]]);
const comparisons=specification.comparisons.map(c=>c.map(f=>({...basis(f.frameId,f.activityRev,f.purposeSnapshot,purposePairs[f.purposeCase][f.purposeSide]),purposeEffectiveAt:f.purposeEffectiveAt,alignment:f.alignment})));
const basisSource={sourceRef:specification.basisSourceRef,sourceDigest:digest(JSON.stringify(comparisons)),authority:false,sameEffectiveTime:false};
const input={authority:false,activity,activitySources,purposePairs,bridges,comparisons,basisSource};
const {imports,modules}=await packBrowserModules({repoRoot:process.cwd(),entry,roots:[...ATLAS_MODULE_ROOTS,root+'/']});
const parts={'@IMPORTMAP':'<script type="importmap">'+JSON.stringify({imports}).replaceAll('</','<\\/')+'</script>','@INPUT':'<script type="application/json" id="world-input">'+JSON.stringify(input).replaceAll('<','\\u003c')+'</script>','@NOTICES':await embeddedNoticesScript(path.join(process.cwd(),'packages/semantic-map')),'@ENTRY':moduleId(entry)};
const html=template.replace(/@IMPORTMAP|@INPUT|@NOTICES|@ENTRY/g,m=>parts[m]),output=process.argv[2];
await fs.mkdir(output,{recursive:false});await fs.writeFile(output+'/index.html',html,{flag:'wx'});
const receipt={kind:'atlas.unified.discussion/1',authority:false,ui:'3fd451996d05e304a38be2a6696acb18b3103a37',source:{html:digest(template),module:digest(await fs.readFile(entry)),specification:digest(await fs.readFile(root+'/unified.input.example.json'))},inputs:{activity:digest(JSON.stringify(activity)),bridges:bridgeSource,basis:basisSource},output:{bytes:Buffer.byteLength(html),sha256:digest(html)},modules:modules.length};
await fs.writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
})();
