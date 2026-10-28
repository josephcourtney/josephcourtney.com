/* Shared geometric engine for mechanical and freeform mesh illustration.
 * No Canvas/WebGL, no pixel sampling, and no DOM dependency.
 * All visibility is resolved in the projected plane using affine depth or
 * perspective-correct affine inverse depth.
 * v1.0 | https://josephcourtney.com/mechanical-illustration/
 */
(function(root){
'use strict';
const EPS=1e-9;
const lerp=(a,b,t)=>a+(b-a)*t;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function area(poly){let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p.x*q.y-q.x*p.y;}return a/2;}
function bounds(poly){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of poly){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}return {x0,y0,x1,y1};}
function rect(bb){return Array.isArray(bb)?{x0:bb[0],y0:bb[1],x1:bb[2],y1:bb[3]}:bb;}
function intersects(a,b){a=rect(a);b=rect(b);return a.x0<=b.x1&&a.x1>=b.x0&&a.y0<=b.y1&&a.y1>=b.y0;}
function spatialIndex(items,cell=64,bound=(item)=>item.bb){
  const grid=new Map();const key=(x,y)=>`${x},${y}`;
  function range(box){const b=rect(box);return [Math.floor(b.x0/cell),Math.floor(b.y0/cell),Math.floor(b.x1/cell),Math.floor(b.y1/cell)];}
  items.forEach((item,i)=>{const [x0,y0,x1,y1]=range(bound(item));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=key(x,y);let v=grid.get(k);if(!v)grid.set(k,v=[]);v.push(i);}});
  return {all:items,query(box){const [x0,y0,x1,y1]=range(box),seen=new Set();for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const i of grid.get(key(x,y))||[])seen.add(i);return [...seen].sort((a,b)=>a-b).map(i=>items[i]);}};
}
function depthPlane(points,key='d'){
  const [a,b,c]=points,den=cross(a,b,c);
  if(Math.abs(den)<EPS)return null;
  const A=((b[key]-a[key])*(c.y-a.y)-(c[key]-a[key])*(b.y-a.y))/den;
  const B=((b.x-a.x)*(c[key]-a[key])-(c.x-a.x)*(b[key]-a[key]))/den;
  return [A,B,a[key]-A*a.x-B*a.y];
}
function depthAt(p,plane){return plane[0]*p.x+plane[1]*p.y+plane[2];}
function interpolate(a,b,t){
  const result={};
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
    if(typeof a[k]==='number'&&typeof b[k]==='number')result[k]=lerp(a[k],b[k],t);
    else result[k]=t<.5?a[k]:b[k];
  }
  return result;
}
function halfplane(poly,fn,keepPositive=true,eps=1e-10){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],fa=fn(a),fb=fn(b);
    const ina=keepPositive?fa>=-eps:fa<=eps,inb=keepPositive?fb>=-eps:fb<=eps;
    if(ina)out.push(a);
    if(ina!==inb){const t=Math.max(0,Math.min(1,fa/(fa-fb)));out.push(interpolate(a,b,t));}
  }
  return out;
}
// Remove the intersection of any convex occluder and the half-space nearer
// than a subject. All inputs are projected polygons with an affine depth law.
function subtractPolygon(subject,subjectPlane,occluder,{epsilon=1e-8,minArea=1e-6,depthKey='d'}={}){
  if(subject.length<3)return [];
  let inside=subject;const outside=[],p=occluder.pts;
  const sign=Math.sign(area(p))||1;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y;
    const eq=q=>sign*(dx*(q.y-a.y)-dy*(q.x-a.x));
    const exposed=halfplane(inside,eq,false);
    if(exposed.length>=3&&Math.abs(area(exposed))>minArea)outside.push(exposed);
    inside=halfplane(inside,eq,true);
    if(inside.length<3)return outside;
  }
  const pl=occluder.plane||occluder.pl;
  if(!pl||!subjectPlane)return outside.concat([inside]);
  const eq=q=>depthAt(q,pl)-depthAt(q,subjectPlane)-epsilon;
  const exposed=halfplane(inside,eq,false);
  if(exposed.length>=3&&Math.abs(area(exposed))>minArea)outside.push(exposed);
  return outside;
}
// Compatibility API for cutting equations used by mechanical part faces.
function subtractByCutters(subject,cutters,{minArea=4e-5,epsilon=1e-7}={}){
  let inside=subject;const visible=[];
  for(const fn of cutters){
    if(inside.length<3)break;
    let someIn=false,someOut=false;
    for(const p of inside){const q=fn(p);if(q>=-epsilon)someIn=true;if(q<=epsilon)someOut=true;if(someIn&&someOut)break;}
    if(!someIn){visible.push(inside);return visible;}
    if(!someOut)continue;
    const exposed=halfplane(inside,fn,false),covered=halfplane(inside,fn,true);
    if(exposed.length>=3&&Math.abs(area(exposed))>minArea)visible.push(exposed);
    inside=covered;
  }
  return visible;
}
// An edge is visible except where another projected triangle overlaps it
// and is closer by the affine depth/inverse-depth comparison.
function occludedSegmentInterval(a,b,tri,{depthKey='d',epsilon=1e-8}={}){
  const p=tri.pts,bb=tri.bb;
  if(bb&&!intersects(bounds([a,b]),bb))return null;
  const sign=Math.sign(area(p))||1;
  let lo=0,hi=1;
  function intersect(fa,fb){const d=fb-fa;if(Math.abs(d)<EPS)return fa>=0;const t=-fa/d;if(d>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);return hi>lo+EPS;}
  for(let i=0;i<p.length;i++){
    const c=p[i],d=p[(i+1)%p.length],dx=d.x-c.x,dy=d.y-c.y;
    if(!intersect(sign*(dx*(a.y-c.y)-dy*(a.x-c.x)),sign*(dx*(b.y-c.y)-dy*(b.x-c.x))))return null;
  }
  const pl=tri.plane||tri.pl;
  if(!pl)return null;
  if(!intersect(depthAt(a,pl)-a[depthKey]-epsilon,depthAt(b,pl)-b[depthKey]-epsilon))return null;
  return [lo,hi];
}
function segmentVisibility(a,b,candidates,{depthKey='d',epsilon=1e-8,ignore=()=>false}={}){
  const intervals=[];for(const tri of candidates){if(ignore(tri))continue;const x=occludedSegmentInterval(a,b,tri,{depthKey,epsilon});if(x)intervals.push(x);}
  if(!intervals.length)return {visible:[[a,b]],hidden:[]};
  intervals.sort((x,y)=>x[0]-y[0]);
  const visible=[],hidden=[],at=t=>interpolate(a,b,t);let last=0;
  for(const [lo,hi] of intervals){if(hi<=last)continue;if(lo>last+EPS)visible.push([at(last),at(lo)]);hidden.push([at(Math.max(lo,last)),at(hi)]);last=Math.max(last,hi);if(last>=1-EPS)break;}
  if(last<1-EPS)visible.push([at(last),b]);
  return {visible,hidden};
}
function thresholdPolygon(poly,level,key='light',depthKey='inv'){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],ia=a[key]<level,ib=b[key]<level;
    if(ia)out.push(a);
    if(ia!==ib){
      const t=Math.max(0,Math.min(1,(level-a[key])/(b[key]-a[key])));
      // Input scalar values are per object-space vertices; use perspective
      // correction when intersecting a projected triangle.
      const wa=a[depthKey],wb=b[depthKey];const ts=(Number.isFinite(wa)&&Number.isFinite(wb))?(t*wb/((1-t)*wa+t*wb)):t;
      const p=interpolate(a,b,ts);p[key]=level;out.push(p);
    }
  }
  return out;
}
function extractMeshFeatures(mesh,frontFacing,{creaseAngle=45}={}){
  const result={silhouettes:[],creases:[]},cos=Math.cos(creaseAngle*Math.PI/180);
  for(const e of mesh.edges){const a=frontFacing[e.a],b=e.b>=0?frontFacing[e.b]:false;
    if(e.b<0||a!==b)result.silhouettes.push(e);
    else if(a&&b){const i=e.a*3,j=e.b*3,n=mesh.normals;const d=n[i]*n[j]+n[i+1]*n[j+1]+n[i+2]*n[j+2];if(d<cos)result.creases.push(e);}
  }
  return result;
}
function meshScene(id,mesh,{label=id,color='#8baaa3',type='mesh'}={}){
  return {type:'scene',id,children:[{type:'part',id,label,color,geometry:{type,mesh},features:mesh.edges||[]}],metadata:{source:'indexed-mesh'}};
}
function joinSegments(segments,{minLength=0,scale=100}={}){
  const key=p=>`${Math.round(p.x*scale)},${Math.round(p.y*scale)}`;
  const segs=segments.filter(([a,b])=>Math.hypot(a.x-b.x,a.y-b.y)>minLength*.2),byNode=new Map();
  for(let i=0;i<segs.length;i++)for(const p of segs[i]){const k=key(p);if(!byNode.has(k))byNode.set(k,[]);byNode.get(k).push(i);}
  const seen=new Set(),paths=[];
  for(let i=0;i<segs.length;i++){
    if(seen.has(i))continue;let [a,b]=segs[i],p=(byNode.get(key(a))||[]).length===1?a:(byNode.get(key(b))||[]).length===1?b:a;
    const poly=[p];let current=i;
    while(current!==undefined&&!seen.has(current)){
      seen.add(current);const [u,v]=segs[current];p=key(u)===key(p)?v:u;poly.push(p);
      const next=(byNode.get(key(p))||[]).filter(j=>!seen.has(j));current=next.length===1?next[0]:undefined;
    }
    const len=poly.reduce((s,p,j)=>j?s+Math.hypot(p.x-poly[j-1].x,p.y-poly[j-1].y):0,0);
    if(len>=minLength)paths.push(poly);
  }
  return paths;
}
const API=Object.freeze({version:'1.0.0',area,bounds,intersects,spatialIndex,depthPlane,depthAt,halfplane,subtractPolygon,subtractByCutters,occludedSegmentInterval,segmentVisibility,thresholdPolygon,extractMeshFeatures,meshScene,joinSegments});
if(typeof module!=='undefined'&&module.exports)module.exports=API;
root.VectorIllustrationCore=API;
})(typeof self!=='undefined'?self:globalThis);
