import assert from 'node:assert/strict';
import { relationLabelOffset } from '../renderer-maxgraph/relation-label-placement.js';
const rect = ([x, y, width, height]) => ({ x, y, width, height });
const overlap = (a,b) => a.x<b.x+b.width && b.x<a.x+a.width && a.y<b.y+b.height && b.y<a.y+a.height;
// Exact glyph/endpoint rectangles from the retained Linux grouped-move failure.
const label=rect([292.5,206.5,28,15]), ends=[rect([325,168.5,180,92]),rect([121,168.5,180,92])], viewport=rect([0,0,626,429]);
const before=JSON.stringify({label,ends,viewport}),offset=relationLabelOffset(label,ends,viewport);
assert.ok(offset.x || offset.y);
const moved={...label,x:label.x+offset.x,y:label.y+offset.y};
assert.ok(ends.every(end=>!overlap(moved,end)));
assert.ok(moved.x>=0 && moved.y>=0 && moved.x+moved.width<=626 && moved.y+moved.height<=429);
assert.equal(JSON.stringify({label,ends,viewport}),before,'display placement does not change supplied geometry');
assert.deepEqual(relationLabelOffset(rect([292.5,140,28,15]),ends,viewport),{x:0,y:0},'already clear annotation stays on its original route position');
assert.deepEqual(relationLabelOffset(label,[rect([0,0,626,429])],viewport),{x:0,y:0},'no clear space retains a possibly unmet default');
for(const scale of [.25,.5,1,2]) {
  const s=b=>({x:b.x*scale,y:b.y*scale,width:b.width*scale,height:b.height*scale});
  const input=s(label),obstacles=ends.map(s),d=relationLabelOffset(input,obstacles,s(viewport),4*scale);
  assert.ok(obstacles.every(o=>!overlap({...input,x:input.x+d.x,y:input.y+d.y},o)));
}
console.log(JSON.stringify({schema:'semantic-map-relation-label-placement/1',status:'PASS',finite:true}));
