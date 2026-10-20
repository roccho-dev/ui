import assert from 'node:assert/strict';
import { planLabelCallouts } from '../renderer-maxgraph/label-callouts.js';
import { DEFAULT_THEME } from '../renderer-maxgraph/theme.js';
const region = (regionId, parentRegionId, label, depth, bounds, mode = 'node') => ({ regionId, parentRegionId, label, depth,
  bounds: { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] }, mode,
  shape: mode === 'boundary' ? 'boundary' : 'graph-node' });
const representations = [
  region('root', null, 'World', 0, [-32,-26,2764,1702], 'boundary'),
  region('aws', 'root', 'AWS Cloud', 1, [0,0,2700,1650], 'boundary'),
  region('container', 'aws', 'VPC', 2, [24,180,2500,1400], 'boundary'),
  region('public', 'container', 'Public Subnet', 3, [48,360,2350,260], 'boundary'),
  region('subnet-a', 'container', 'Private Subnet 1', 3, [48,680,1080,740], 'boundary'),
  region('subnet-b', 'container', 'Private Subnet 2', 3, [1250,680,1080,740], 'boundary'),
  region('alb', 'public', 'Application Load Balancer', 4, [96,510,320,92]),
  region('part-1', 'subnet-a', 'Fargate Task', 4, [60,752,180,92]),
  region('part-2', 'subnet-b', 'Fargate Task', 4, [1262,752,180,92]),
];
const scene = { scale: 619/2764, viewport: {x:-32,y:-133,width:2764,height:1916}, representations };
const before = JSON.stringify(scene), planned = planLabelCallouts(scene, DEFAULT_THEME);
assert.ok(['alb','part-1','part-2','subnet-a','subnet-b'].every(id=>planned.has(id)), 'small node names and obstructed containing titles need clear owned text positions');
for (const [id, box] of planned) {
  const item = representations.find(r=>r.regionId===id),parent=item.mode==='boundary'?item.bounds:representations.find(r=>r.regionId===item.parentRegionId).bounds;
  assert.ok(box.x>=parent.x && box.y>=parent.y && box.x+box.width<=parent.x+parent.width && box.y+box.height<=parent.y+parent.height, 'complete owned name must remain inside the intended parent');
}
assert.equal(JSON.stringify(scene), before, 'callouts do not move any node or saved pin');
const wide = planLabelCallouts({...scene,scale:1259/2764},DEFAULT_THEME);
assert.ok(['alb','part-1','part-2'].every(id=>!wide.has(id)),'wide view keeps normal leaf labels in their own nodes');
for(const id of ['subnet-a','subnet-b']) {
  const title=planned.get(id),child=representations.find(r=>r.parentRegionId===id).bounds;
  assert.ok(title.x>=child.x+child.width||title.x+title.width<=child.x||title.y>=child.y+child.height||title.y+title.height<=child.y,'parent title must not be painted through a child shape');
}
const crowded = structuredClone(scene);crowded.representations.find(r=>r.regionId==='public').bounds={x:96,y:510,width:320,height:92};
assert.equal(planLabelCallouts(crowded,DEFAULT_THEME).has('alb'),false,'no available containing space is not a readability pass');
console.log(JSON.stringify({schema:'semantic-map-label-callouts-test/1',status:'PASS',finite:true}));
