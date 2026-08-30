import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repoRoot=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const manifest=JSON.parse(await fs.readFile(path.join(repoRoot,"packages/semantic-map/migration-manifest.json"),"utf8"));
assert.equal(manifest.legacyCommit,"1daa001bf780053f4319e3fb20b4ea9a6e0d0442");
assert.equal(manifest.entries.length,206);
assert.equal(new Set(manifest.entries.map(x=>x.source)).size,manifest.entries.length);
assert.equal(new Set(manifest.entries.map(x=>x.target)).size,manifest.entries.length);
const evolutions=manifest.evolutions??[];
assert.equal(new Set(evolutions.map(item=>`${item.id}:${item.target}`)).size,evolutions.length);
const evolutionsByTarget=new Map();
for(const evolution of evolutions){
 assert.equal(typeof evolution.id,"string");
 assert.equal(typeof evolution.reason,"string");
 assert.equal(typeof evolution.sourceCommit,"string");
 assert.equal(typeof evolution.sourcePath,"string");
 const list=evolutionsByTarget.get(evolution.target)??[];
 list.push(evolution);
 evolutionsByTarget.set(evolution.target,list);
}
const changed=[];
for(const item of manifest.entries){
 const bytes=await fs.readFile(path.join(repoRoot,item.target));
 const digest=createHash("sha256").update(bytes).digest("hex");
 let expected=item.targetSha256;
 for(const evolution of evolutionsByTarget.get(item.target)??[]){
  assert.equal(evolution.fromSha256,expected,`${item.target} evolution chain`);
  expected=evolution.toSha256;
 }
 assert.equal(digest,expected,item.target);
 if(item.sourceSha256!==item.targetSha256) changed.push(item.source);
}
for(const target of evolutionsByTarget.keys()) assert.ok(manifest.entries.some(item=>item.target===target),target);
assert.deepEqual(changed.sort(),[
  "packages/app/artifact-module.js",
  "packages/app/entry.js",
  "packages/renderer-maxgraph/adapter.js",
  "packages/renderer-maxgraph/shapes.js",
]);
assert.deepEqual(manifest.transforms.map(item=>item.source).sort(),changed.sort());
for(const item of manifest.entries){
  if(item.sourceSha256===item.targetSha256) assert.equal(Object.hasOwn(item,"transform"),false,item.source);
  else assert.equal(typeof item.transform,"string",item.source);
}
for(const required of ["packages/semantic-map/runtime.js","packages/semantic-map/authoring/pages/embed.html","apps/artifact-shell/capabilities/render-semantic-map/manifest.json","apps/artifact-shell/capabilities/render-semantic-map/engine.mjs"]) await fs.access(path.join(repoRoot,required));
console.log(JSON.stringify({schema:"semantic-map-migration-integrity/1",status:"PASS",legacyCommit:manifest.legacyCommit,files:manifest.entries.length,transformed:changed.length,evolved:evolutions.length}));
