
import {loadHistory,currentness,summarizeScopes,currentRefs,timelineFor} from '../../../packages/control/src/live-atlas.mjs';
import {layoutTopology,projectAtlas,lodFor} from '../../../packages/control/src/live-atlas-projection.mjs';
import {fitCamera} from '../../../packages/semantic-map/camera-fit.js';
import {createMaxGraphAdapter} from '../../../packages/semantic-map/renderer-maxgraph/adapter.js';
import {displayedRegionLabel} from '../../../packages/semantic-map/renderer-maxgraph/labels.js';
import {DEFAULT_THEME} from '../../../packages/semantic-map/renderer-maxgraph/theme.js';
import {createSemanticMap} from '../../../packages/semantic-map/domain/semantic-map.js';
import {createGraphLayout} from '../../../packages/semantic-map/pattern/index.js';
import {createPresentationProjection,SemanticProjector} from '../../../packages/semantic-map/projection/index.js';
import {defaultViewForPattern} from '../../../packages/semantic-map/protocol/index.js';

const input=JSON.parse(document.querySelector('#world-input').textContent);
const history=loadHistory(input.activity),canvas=document.querySelector('#canvas');
const adapter=createMaxGraphAdapter(canvas);adapter.setTool('hand');
adapter.graph.setCellsMovable(false);adapter.graph.setCellsResizable(false);adapter.graph.setCellsEditable(false);adapter.graph.setCellsDisconnectable(false);
const $=id=>document.getElementById(id),key=r=>JSON.stringify([r.space,r.kind,r.id]);
const ref=(space,kind,id)=>({space,kind,id});
const captions={'purpose.company':'目的\n運用・譲渡','purpose.operations':'目的\n引継','purpose.reuse':'目的\nUI再利用','ideal.extraction':'理想\nUI共有','ideal.source':'理想\n実入力','current.before':'現在\n起動はUI内','current.after':'現在\n実入力未接続','gap.extraction':'Gap\n責務分離','gap.source':'Gap\n入力未接続','fill.extraction':'仕事\n起動分離','fill.source':'仕事\n入力接続','receipt.partial':'結果\n一部解消','residual.source':'残件\n実入力接続'};
const labels={purpose:'目的',ideal:'理想',current:'現在の状態',gap:'Business Gap',fill:'仕事',receipt:'結果',residual:'残件'};
const refFields={purpose:['parents'],ideal:['purposes'],current:[],gap:['current','ideal'],fill:['gaps'],receipt:['fill'],residual:['receipt','next']};
const temporalFields=new Set(['asOf','observedAt','createdAt','effectiveAt','validFrom','validTo','line']);
let comparisonIndex=0,side=0,selected=ref('activity','actor','ceo'),fitScale=1,lastWorld=null,lastProjection=null,drawing=false;
const projectionIds=new Map(),inverse=new Map();
function pid(r){const k=key(r);if(!projectionIds.has(k)){const id='n'+projectionIds.size;projectionIds.set(k,id);inverse.set(id,r)}return projectionIds.get(k)}
for(const s of history.history){for(const r of s.topology.rows)if(['scope','actor','target'].includes(r.t))pid(ref('activity',r.t,r.id));for(const r of s.channels.observations.work??[])pid(ref('activity','work',r.id))}
for(const pair of input.purposePairs)for(const rows of pair)for(const r of rows)pid(ref('purpose',r.kind,r.id));
for(const bridge of input.bridges)pid(ref('bridge',bridge.kind,bridge.id));
const aliasIds=new Map();const alias=id=>{if(!aliasIds.has(id))aliasIds.set(id,'v'+aliasIds.size);return aliasIds.get(id)};
const edgeIds=new Map();const eid=k=>{if(!edgeIds.has(k))edgeIds.set(k,'e'+edgeIds.size);return edgeIds.get(k)};
const element=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n};
function button(text,r,parent){const b=element('button',text,parent);b.className='link';b.type='button';b.onclick=()=>choose(r);return b}
function field(title,value){const box=element('p',undefined,$('selected-fields'));element('b',title+'： ',box);element('span',typeof value==='string'?value:JSON.stringify(value),box)}
function activitySnapshot(basis){const s=history.history.find(s=>s.rev===basis.activityRev);if(!s)throw new Error('declared Activity revision unavailable');return s}
function purposeEdges(rows){
 const e=[];for(const n of rows){const add=(from,to,kind)=>e.push({space:'purpose',kind,id:JSON.stringify([from,to,kind]),from:ref('purpose',rows.find(r=>r.id===from).kind,from),to:ref('purpose',rows.find(r=>r.id===to).kind,to),raw:{from,to,kind},sources:n.sources});
 if(n.kind==='purpose')for(const p of n.parents)add(p,n.id,'purpose-parent');
 if(n.kind==='ideal')for(const p of n.purposes)add(p,n.id,'ideal');
 if(n.kind==='gap'){add(n.current,n.id,'current');add(n.ideal,n.id,'gap')}
 if(n.kind==='fill')for(const g of n.gaps)add(g,n.id,'fill');
 if(n.kind==='receipt')add(n.fill,n.id,'receipt');
 if(n.kind==='residual'){add(n.receipt,n.id,'residual');for(const next of n.next)add(n.id,next,'next')}
 }return e;
}
function world(which){
 const declaredBasis=input.comparisons[comparisonIndex][which],basis={...declaredBasis,frameId:declaredBasis.frameId+($('bridge-input').checked?'-bridged':'-unlinked'),bridgeSource:$('bridge-input').checked?declaredBasis.bridgeSource:null,bridgeInputVariant:$('bridge-input').checked?'explicit-synthetic':'not-provided'},snapshot=activitySnapshot(basis),rows=input.purposePairs[comparisonIndex][which],entities=new Map(),relations=[];
 const add=(r,raw,sources,reports=[])=>entities.set(key(r),{ref:r,raw,sources,reports});
 for(const r of snapshot.topology.rows)if(['scope','actor','target'].includes(r.t)){const reports=(snapshot.channels.observations.statuses??[]).filter(s=>s.subject===r.id);add(ref('activity',r.t,r.id),r,[input.activitySources[snapshot.rev].topology,...(reports.length?[input.activitySources[snapshot.rev].observations]:[])],reports);}
 for(const r of snapshot.channels.observations.work??[])add(ref('activity','work',r.id),r,[input.activitySources[snapshot.rev].observations]);
 for(const r of rows)add(ref('purpose',r.kind,r.id),r,r.sources);
 const edge=(raw,kind,from,to,sources)=>relations.push({space:'activity',kind,id:raw.id??JSON.stringify([from,to,kind]),from,to,raw,sources});
 for(const r of snapshot.topology.orgs)edge(r,'org',ref('activity','actor',r.from),ref('activity','actor',r.to),[input.activitySources[snapshot.rev].topology]);
 for(const r of snapshot.topology.members)edge(r,'member',ref('activity','actor',r.actor),ref('activity','scope',r.scope),[input.activitySources[snapshot.rev].topology]);
 for(const r of snapshot.topology.scopes.values())if(r.parent!==null)edge(r,'contains',ref('activity','scope',r.parent),ref('activity','scope',r.id),[input.activitySources[snapshot.rev].topology]);
 for(const r of currentRefs(snapshot,currentness(snapshot,{mode:'sample',now:snapshot.asOfMs})))edge(r,'ref',ref('activity','actor',r.actor),ref('activity','target',r.target),[input.activitySources[snapshot.rev].observations]);
 for(const r of snapshot.channels.observations.work??[]){edge(r,'in-scope',ref('activity','work',r.id),ref('activity','scope',r.scope),[input.activitySources[snapshot.rev].observations]);for(const a of r.actors)edge({...r,id:r.id+':'+a},'assigned',ref('activity','actor',a),ref('activity','work',r.id),[input.activitySources[snapshot.rev].observations])}
 relations.push(...purposeEdges(rows));
 if($('bridge-input').checked)for(const b of input.bridges){if(!entities.has(key(b.from))||!entities.has(key(b.to)))throw new Error('bridge has unresolved endpoint');relations.push({space:'bridge',kind:b.kind,id:b.id,from:b.from,to:b.to,raw:b,sources:b.sources})}
 return {basis,snapshot,rows,entities,relations};
}
function parts(entity){
 const r=entity.raw,fields=entity.ref.space==='purpose'?refFields[r.kind]:r.t==='scope'?['parent','controlId']:r.t==='actor'?['controlId']:r.t==='work'?['scope','actors']:r.t==='target'?[]:[];
 return {M:{record:Object.fromEntries(Object.entries(r).filter(([k])=>!fields.includes(k)&&!temporalFields.has(k)&&!['sources','evidence'].includes(k))),reports:(entity.reports??[]).map(s=>Object.fromEntries(Object.entries(s).filter(([k])=>!temporalFields.has(k)&&!['evidence','sources','subject'].includes(k))))},R:{fields:fields.map(k=>[k,r[k]]),subjects:(entity.reports??[]).map(s=>s.subject)},S:{sources:entity.sources,evidence:[...(r.evidence??[]),...(entity.reports??[]).flatMap(s=>s.evidence??[])]},T:{record:Object.fromEntries(Object.entries(r).filter(([k])=>temporalFields.has(k)&&k!=='line')),reports:(entity.reports??[]).map(s=>Object.fromEntries(Object.entries(s).filter(([k])=>temporalFields.has(k)&&k!=='line')))}};
}
function differences(a,b){
 const json=x=>JSON.stringify(x),aKeys=new Set(a.entities.keys()),bKeys=new Set(b.entities.keys());
 const result={Nplus:[...bKeys].filter(k=>!aKeys.has(k)).length,Nminus:[...aKeys].filter(k=>!bKeys.has(k)).length,M:0,R:0,S:0,T:0};
 for(const k of aKeys)if(bKeys.has(k)){const x=parts(a.entities.get(k)),y=parts(b.entities.get(k));for(const axis of ['M','R','S','T'])if(json(x[axis])!==json(y[axis]))result[axis]++}
 const edgeKey=e=>JSON.stringify([e.space,e.kind,key(e.from),key(e.to)]),ae=new Set(a.relations.map(edgeKey)),be=new Set(b.relations.map(edgeKey));result.Eplus=[...be].filter(k=>!ae.has(k)).length;result.Eminus=[...ae].filter(k=>!be.has(k)).length;return result;
}
function purposePaths(w,start){
 const byId=new Map(w.rows.map(r=>[r.id,r])),pending=[[start]],out=[];
 while(pending.length){const trail=pending.pop(),n=byId.get(trail.at(-1));if(!n)continue;
 const next=n.kind==='purpose'?n.parents:n.kind==='ideal'?n.purposes:n.kind==='current'?w.rows.filter(r=>r.kind==='gap'&&r.current===n.id).map(r=>r.id):n.kind==='gap'?[n.ideal]:n.kind==='fill'?n.gaps:n.kind==='receipt'?[n.fill]:[n.receipt];
 if(n.kind==='purpose'&&!next.length)out.push(trail);
 for(const target of next)if(!trail.includes(target))pending.push([...trail,target]);
 }return out;
}
function detail(w,other){
 $('selected-fields').replaceChildren();$('relations').replaceChildren();$('paths').replaceChildren();
 const k=key(selected),entity=w.entities.get(k)??other.entities.get(k),edge=w.relations.find(e=>e.space===selected.space&&e.kind===selected.kind&&e.id===selected.id)??other.relations.find(e=>e.space===selected.space&&e.kind===selected.kind&&e.id===selected.id);
 $('selected-title').textContent=selected.space+' / '+selected.kind+' / '+selected.id;
 if(edge&&!entity){
 field('関係',edge.kind);field('出所',edge.space==='bridge'?'明示synthetic入力・authority=false':'宣言されたsource関係');
 button('from：'+edge.from.id,edge.from,$('relations'));element('span',' → ',$('relations'));button('to：'+edge.to.id,edge.to,$('relations'));
 $('raw').textContent=JSON.stringify(edge,null,2);$('counterpart').textContent=JSON.stringify({before:world(0).relations.find(e=>e.space===edge.space&&e.id===edge.id)??null,after:world(1).relations.find(e=>e.space===edge.space&&e.id===edge.id)??null},null,2);return;
 }
 if(!entity){field('掲載','この入力setに未提供・理由未提供');$('raw').textContent='選択identityを保持';$('counterpart').textContent='両frameに未掲載';return}
 const current=w.entities.has(k),r=entity.raw,detailWorld=current?w:other;
 if(!current)field('掲載','このframeに未掲載・理由未提供。counterpartの内容を保持');
 field('宣言',r.label??r.id);field('時点/版',entity.ref.space==='purpose'?'Purpose有効時刻は未提供。owner-declared snapshot。':'Activity rev '+detailWorld.snapshot.rev+' / asOf '+detailWorld.snapshot.asOf);
 if(entity.ref.space==='purpose'){
 const byId=new Map(detailWorld.rows.map(x=>[x.id,x]));
 if(r.kind==='gap'){field('Current condition',byId.get(r.current)?.value??r.current);field('Ideal condition',byId.get(r.ideal)?.value??r.ideal);field('宣言されたdelta',r.delta);field('Owner / proof',r.owner+' / '+r.proof)}
 if(r.kind==='current'||r.kind==='ideal')field('値',r.value);
 if(r.kind==='fill')field('Scope',r.scope);
 if(r.kind==='receipt')field('結果',r.status+'（Purpose達成とは別）');
 if(r.kind==='residual')field('次',r.next.length?r.next:'未割当（完了ではない）');
 for(const trail of purposePaths(detailWorld,r.id)){const box=element('div',undefined,$('paths'));box.className='path';for(const [i,id]of trail.entries()){if(i)element('span',' → ',box);const n=byId.get(id);button(n?.label??id,ref('purpose',n.kind,id),box)}}
 }else{
 if(r.t==='work'){field('状態',r.status);field('Scope / actors',r.scope+' / '+r.actors.join(', '))}
 if(r.t==='scope'){const s=summarizeScopes(detailWorld.snapshot,currentness(detailWorld.snapshot,{mode:'sample',now:detailWorld.snapshot.asOfMs})).get(r.id);field('Activity集計',s)}
 const changes=timelineFor(history.history,r.id);field('Activity履歴',changes.length+' changes / '+(history.complete?'complete':'incomplete'));if(entity.reports?.length)field('宣言されたstatus reports',entity.reports);
 const bridges=detailWorld.relations.filter(e=>e.space==='bridge'&&key(e.from)===k);for(const b of bridges)for(const trail of purposePaths(detailWorld,b.to.id)){const box=element('div',undefined,$('paths'));box.className='path';button(r.label??r.id,entity.ref,box);element('span',' —'+b.kind+'（synthetic）→ ',box);for(const [i,id]of trail.entries()){if(i)element('span',' → ',box);const n=detailWorld.rows.find(n=>n.id===id);button(n.label,ref('purpose',n.kind,id),box)}}
 }
 for(const e of detailWorld.relations.filter(e=>key(e.from)===k||key(e.to)===k)){const dest=key(e.from)===k?e.to:e.from;button(e.kind+'：'+dest.id,dest,$('relations'));if(e.space==='bridge')button('［このbridgeのsource］',ref('bridge',e.kind,e.id),$('relations'))}
 $('raw').textContent=JSON.stringify({identity:entity.ref,record:r,reports:entity.reports??[],sources:entity.sources,frameBasis:detailWorld.basis},null,2);
 $('counterpart').textContent=JSON.stringify({before:world(0).entities.get(k)??null,after:world(1).entities.get(k)??null},null,2);
}
function purposeScene(w){
 const rootId='uiRoot',records=[{type:'meta',schema:'semantic-map-state/1',root:rootId,title:'Purpose projection'},{type:'region',id:rootId,parent:null,label:'Purpose projection',kind:'root',bounds:[0,0,1000,1000],summary:''}];
 for(const r of w.rows)records.push({type:'region',id:pid(ref('purpose',r.kind,r.id)),parent:rootId,label:captions[r.id]??Array.from((labels[r.kind]??r.kind)+' · '+r.label).slice(0,110).join(''),kind:r.kind,bounds:[0,0,180,92],summary:r.label});
 for(const e of w.relations.filter(e=>e.space==='purpose'))records.push({type:'relation',id:eid(JSON.stringify([e.space,e.kind,e.id])),from:pid(e.from),to:pid(e.to),kind:e.kind,label:e.kind});
 const domain=createSemanticMap(records),layout=createGraphLayout(domain,{direction:'TB'});
 const presentation=createPresentationProjection({id:'purpose-layout',pattern:'graph/1',layout:[...layout.bounds].map(([regionId,bounds])=>({regionId,bounds})),interactions:[]});
 const projector=new SemanticProjector(domain,null,defaultViewForPattern('graph/1'),{presentationProjection:presentation});
 const scene=projector.project({scale:1,viewport:{x:layout.rootBounds.x,y:layout.rootBounds.y,width:layout.rootBounds.width+10,height:layout.rootBounds.height+10}});
 return {scene,layout,rootId};
}
function renderGraph(w,{fit=false}={}){
 if(drawing)return;drawing=true;
 try{
 const layout=layoutTopology(w.snapshot.topology),current=currentness(w.snapshot,{mode:'sample',now:w.snapshot.asOfMs});
 const camera=adapter.camera(),projection=projectAtlas(w.snapshot,current,{zoom:camera.scale/fitScale,scale:camera.scale,selected:selected.space==='activity'?selected.id:'w-render-3',layout});
 if(!projection.supported)throw new Error(projection.diagnostic);
 const p=purposeScene(w),factor=.24,xOffset=layout.world.x+layout.world.width+24,yOffset=0;
 const nodeRef=id=>[...w.entities.values()].find(e=>e.ref.space==='activity'&&e.ref.id===id)?.ref;
 const reps=projection.scene.representations.map(r=>{
 const origin=nodeRef(r.activation?.id??r.regionId),id=nodeRef(r.regionId)?pid(nodeRef(r.regionId)):alias(r.regionId);
 if(!origin)return {...r,regionId:id,readOnly:true};
 return {...r,regionId:id,sourceRegionId:id,readOnly:true,activation:{type:'select',id:pid(origin)},geometryEditable:false,labelEditable:false};
 });
 const originalIds=new Map(projection.scene.representations.map((r,i)=>[r.regionId,reps[i].regionId]));
 const relations=projection.scene.relations.map((e,i)=>({...e,relationIds:[eid('activity-projection:'+e.relationIds.join(','))],from:originalIds.get(e.from),to:originalIds.get(e.to),readOnly:true}));
 for(const r of p.scene.representations){if(r.regionId===p.rootId)continue;const origin=inverse.get(r.sourceRegionId??r.regionId);if(!origin)continue;reps.push({...r,regionId:pid(origin),sourceRegionId:pid(origin),bounds:{x:xOffset+(r.bounds.x-p.layout.rootBounds.x)*factor,y:yOffset+(r.bounds.y-p.layout.rootBounds.y)*factor,width:r.bounds.width*factor,height:r.bounds.height*factor},readOnly:true,activation:{type:'select',id:pid(origin)},geometryEditable:false,labelEditable:false,visual:{appearance:{strokeColor:'#495057',strokeWidth:1,fillColor:'#f8f9fa'}}})}
 for(const e of p.scene.relations)relations.push({...e,readOnly:true,visual:{appearance:{strokeColor:'#868e96',strokeWidth:1}}});
 for(const b of w.relations.filter(e=>e.space==='bridge')){
 const from=pid(b.from),to=pid(b.to);if(!reps.some(r=>r.regionId===from)||!reps.some(r=>r.regionId===to))continue;
 relations.push({relationIds:[eid('bridge:'+b.id)],from,to,kind:b.kind,label:b.kind+' · synthetic',directed:true,foreground:true,zIndex:30000,readOnly:true,activation:{type:'select',id:pid(ref('bridge',b.kind,b.id))},visual:{appearance:{strokeColor:selected.space==='bridge'&&selected.id===b.id?'#1864ab':'#7950f2',strokeWidth:selected.space==='bridge'&&selected.id===b.id?3:2,dashed:true}}});
 }
 const proxies=Object.fromEntries(reps.map(r=>[r.regionId,r.regionId]));for(const [oldId,dest]of Object.entries(projection.scene.selectionProxies)){const origin=nodeRef(oldId);if(origin&&originalIds.has(dest))proxies[pid(origin)]=originalIds.get(dest)}
 lastWorld={x:Math.min(layout.world.x,0),y:Math.min(layout.world.y,0),width:xOffset+p.layout.rootBounds.width*factor+4,height:Math.max(layout.world.height,p.layout.rootBounds.height*factor)+4};
 lastProjection=projection;
 const scene={pattern:'graph/1',scale:adapter.camera().scale,resourceComposition:null,representations:reps,relations,selectionProxies:proxies};
 const unreadable=scene.representations.filter(r=>r.mode!=='boundary'&&r.label&&displayedRegionLabel(r,scene.scale,DEFAULT_THEME,false)!==r.label).length;$('readability').textContent=unreadable?'縮約表示：'+unreadable+'ラベルを省略。検索・一覧で選び「選択へ」かzoomで読む。':'';
 adapter.render(scene);adapter.setFocusMarker(selected.space==='bridge'?null:pid(selected));
 if(fit){const c=fitCamera(lastWorld,{width:canvas.clientWidth,height:canvas.clientHeight});fitScale=c.scale;adapter.setCamera(c.scale,c.translateX,c.translateY);renderAfterCamera()}
 }finally{drawing=false}
}
function renderAfterCamera(){requestAnimationFrame(()=>renderGraph(world(side)))}
function choose(r){selected=r;render()}
function render({fit=false}={}){
 const w=world(side),other=world(1-side),d=differences(world(0),world(1));
 $('before').setAttribute('aria-pressed',String(side===0));$('after').setAttribute('aria-pressed',String(side===1));
 $('basis').textContent='Frame '+w.basis.frameId+' · Activity rev '+w.snapshot.rev+' / '+w.snapshot.asOf+' · Purpose '+w.basis.purposeSnapshot+' / 有効時刻未提供 · '+w.basis.alignment+'（same-timeではない）';
 $('status').textContent='選択 '+selected.space+'/'+selected.kind+'/'+selected.id+' · bridge '+w.relations.filter(e=>e.space==='bridge').length+' · '+w.entities.size+' entities';
 $('diff').textContent='Snapshot difference：N+ '+d.Nplus+' / N- '+d.Nminus+' / MΔ '+d.M+' / RΔ '+d.R+' / E+ '+d.Eplus+' / E- '+d.Eminus+' / SΔ '+d.S+' / TΔ '+d.T+'。時間/Frame basisは別監査。';
 const summaries=summarizeScopes(w.snapshot,currentness(w.snapshot,{mode:'sample',now:w.snapshot.asOfMs})),roots=w.snapshot.topology.roots.map(id=>summaries.get(id));$('activity-summary').textContent='Activity：'+summaries.size+' scopes · running '+roots.reduce((n,s)=>n+(s.lanes??0),0)+' · blocked '+roots.reduce((n,s)=>n+(s.blocked??0),0)+' · '+currentRefs(w.snapshot,currentness(w.snapshot,{mode:'sample',now:w.snapshot.asOfMs})).length+' refs';
 $('observation-gap').textContent='Observation gap：Activity履歴は不完全、rev 3→5の間は未観測（Business Gapとは別）。Purpose有効時刻：未提供。';
 $('proof').textContent='Renderer/projectionは既存UI。composition host・bridge・frame bindingは討議用。製品のAPI/admission/UNKNOWN replayは未証明。';
 detail(w,other);$('catalog').replaceChildren();
 const q=$('search').value.toLowerCase(),table=element('table',undefined,$('catalog'));
 for(const e of w.entities.values())if(JSON.stringify(e).toLowerCase().includes(q)){const tr=element('tr',undefined,table);const td=element('td',undefined,tr);button(e.ref.space+'/'+e.ref.kind+' · '+(e.raw.label??e.raw.id),e.ref,td);element('td',e.ref.id,tr)}
 for(const b of w.relations.filter(e=>e.space==='bridge')){const tr=element('tr',undefined,table);button('bridge · '+b.kind+' · '+b.from.id+' → '+b.to.id,ref('bridge',b.kind,b.id),element('td',undefined,tr))}
 $('input-audit').textContent=JSON.stringify({authority:false,declaredComparison:input.comparisons[comparisonIndex],effectiveComparison:[world(0).basis,world(1).basis],suppliedBridges:$('bridge-input').checked?input.bridges:[],basisSource:input.basisSource},null,2);
 renderGraph(w,{fit});
}
function zoom(factor,point={x:canvas.clientWidth/2,y:canvas.clientHeight/2}){
 const {scale,translateX,translateY}=adapter.camera(),next=Math.max(fitScale/3,Math.min(fitScale*20,scale*factor));
 adapter.setCamera(next,translateX+point.x/next-point.x/scale,translateY+point.y/next-point.y/scale);renderAfterCamera();
}
function focusSelected(){const id=pid(selected),r=adapter.lastScene?.representations.find(r=>r.regionId===(adapter.lastScene.selectionProxies[id]??id));if(!r)return;const scale=Math.min(fitScale*20,Math.max(fitScale,180/r.bounds.width,70/r.bounds.height));adapter.setCamera(scale,canvas.clientWidth/(2*scale)-r.bounds.x-r.bounds.width/2,canvas.clientHeight/(2*scale)-r.bounds.y-r.bounds.height/2);renderAfterCamera()}
$('focus').onclick=focusSelected;
adapter.setActivationHandler(a=>{const r=inverse.get(a.id);if(r)choose(r)});
$('before').onclick=()=>{side=0;render({fit:true})};$('after').onclick=()=>{side=1;render({fit:true})};
$('comparison').onchange=e=>{comparisonIndex=Number(e.target.value);side=0;render({fit:true})};
$('bridge-input').onchange=()=>render();$('fit').onclick=()=>render({fit:true});$('plus').onclick=()=>zoom(1.6);$('minus').onclick=()=>zoom(1/1.6);
$('search').oninput=()=>render();$('search').onkeydown=e=>{if(e.key!=='Enter')return;const q=$('search').value.trim();const e2=[...world(side).entities.values()].find(e=>e.ref.id===q);if(e2)choose(e2.ref)};
canvas.addEventListener('wheel',e=>{e.preventDefault();const b=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.15:1/1.15,{x:e.clientX-b.left,y:e.clientY-b.top})},{passive:false});
new ResizeObserver(()=>render({fit:true})).observe(canvas);
render({fit:true});
globalThis.unifiedAtlasExample={get selection(){return selected},get scene(){return adapter.lastScene},authority:false};
