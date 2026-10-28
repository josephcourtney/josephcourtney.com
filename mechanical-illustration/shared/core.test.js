'use strict';
const assert=require('node:assert/strict');
const K=require('./vector-core.js');
assert.equal(K.version,'2.1.0');
function check(depthKey){
 const face={id:'panel',owner:'assembly',poly:[
  {x:0,y:0,d:1,inv:1,light:.9},{x:10,y:0,d:1,inv:1,light:.4},
  {x:10,y:10,d:1,inv:1,light:.2},{x:0,y:10,d:1,inv:1,light:.7}],plane:[0,0,1]};
 const cover={id:'cover',owner:'housing',pts:[
  {x:3,y:3},{x:7,y:3},{x:7,y:7},{x:3,y:7}],plane:[0,0,2],maxDepth:2};
 const line={id:'slot',owner:'assembly',kind:'crease',
  points:[{x:0,y:5,d:1,inv:1},{x:10,y:5,d:1,inv:1}]};
 const scene=K.renderProjectedScene({surfaces:[face],occluders:[cover],features:[line]},{depthKey});
 const a=scene.faces[0].fragments.reduce((v,p)=>v+Math.abs(K.area(p)),0);
 assert(Math.abs(a-84)<1e-5,'visible area '+a);
 assert.equal(scene.features[0].visible.length,2);
 const svg=K.compileSVG({...scene,parts:[{id:'assembly',color:'#aabbcc'}]},
  {width:100,height:100,tonalLevels:[.5]});
 assert.match(svg,/data-source-surface="panel"/);
 assert.match(svg,/data-source-feature="slot"/);
 assert.match(svg,/class="tone tone-0"/);
}
check('d');check('inv');
const left=[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}];
const right=[{x:2,y:0},{x:4,y:0},{x:4,y:2},{x:2,y:2}];
const joined=K.mergedFillPath([left,right]);
assert(joined.removedEdges>=2&&joined.subpaths===1);
// Perspective triangles must remain geometrically exact through the fast
// affine-depth path, with lighting attributes intact for SVG tonal regions.
const base=[
 {x:0,y:0,inv:.3,light:.9},{x:10,y:0,inv:.3,light:.6},
 {x:10,y:10,inv:.3,light:.2},{x:0,y:10,inv:.3,light:.7}
];
const pocket={
 pts:[{x:2,y:2},{x:8,y:2},{x:5,y:8}],plane:[0,0,.7],maxDepth:.7
};
const visible=K.subtractPolygon(base,[0,0,.3],pocket,
 {epsilon:.00007,minArea:1e-8,depthKey:'inv'});
const visibleArea=visible.reduce((sum,p)=>sum+Math.abs(K.area(p)),0);
assert(Math.abs(visibleArea-82)<1e-5,'perspective cutout area '+visibleArea);
assert(visible.flat().every(p=>Number.isFinite(p.inv)&&Number.isFinite(p.light)));
assert.equal(pocket._edgeEquations.length,3,'reuse occluder half-planes');
const behind={pts:pocket.pts,plane:[0,0,.1],maxDepth:.1};
assert.equal(K.subtractPolygon(base,[0,0,.3],behind,
 {epsilon:.00007,minArea:1e-8,depthKey:'inv'})[0],base);
console.log('Unified SVG renderer tests passed');
