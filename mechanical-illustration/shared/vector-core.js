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
  function fastSubtractPerspective(subject,sourcePlane,occluder,epsilon,minArea){
    const eps=epsilon,p=occluder.pts,pl=occluder.plane;
    const cx=pl[0]-sourcePlane[0],cy=pl[1]-sourcePlane[1],cz=pl[2]-sourcePlane[2]-eps;
    let near=false;
    for(let i=0;i<subject.length;i++){
      const q=subject[i];if(cx*q.x+cy*q.y+cz>0){near=true;break;}
    }
    if(!near)return [subject];
    let signs=occluder._edgeEquations;
    if(!signs){
      const sign=Math.sign(area(p))||1;
      signs=p.map((q,i)=>{
        const r=p[(i+1)%p.length],ax=sign*(q.y-r.y),ay=sign*(r.x-q.x);
        return [ax,ay,-ax*q.x-ay*q.y];
      });
      if(Object.isExtensible(occluder))occluder._edgeEquations=signs;
    }
    // A separating edge proves no visible region is affected.
    for(let i=0;i<3;i++){
      const [ax,ay,ac]=signs[i];let anyInside=false;
      for(let k=0;k<subject.length;k++){
        const q=subject[k];if(ax*q.x+ay*q.y+ac>=-1e-10){anyInside=true;break;}
      }
      if(!anyInside)return [subject];
    }
    let inside=subject;
    const out=[];
    function split(poly,ax,ay,ac){
      const ins=[],outs=[];let a=poly[poly.length-1],fa=ax*a.x+ay*a.y+ac;
      for(let i=0;i<poly.length;i++){
        const b=poly[i],fb=ax*b.x+ay*b.y+ac,ia=fa>=-1e-10,ib=fb>=-1e-10;
        if(ia!==ib){
          const t=Math.max(0,Math.min(1,fa/(fa-fb)));
          const v={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
                   inv:a.inv+(b.inv-a.inv)*t,light:a.light+(b.light-a.light)*t};
          ins.push(v);outs.push(v);
        }
        (ib?ins:outs).push(b);a=b;fa=fb;
      }
      return [ins,outs];
    }
    for(let j=0;j<4;j++){
      if(inside.length<3)break;
      const [ax,ay,ac]=j<3?signs[j]:[cx,cy,cz];
      let hasInside=false,hasOutside=false;
      for(let k=0;k<inside.length;k++){
        const q=inside[k],z=ax*q.x+ay*q.y+ac;
        if(z>=-1e-10)hasInside=true;
        if(z<=1e-10)hasOutside=true;
        if(hasInside&&hasOutside)break;
      }
      if(!hasInside){if(Math.abs(area(inside))>minArea)out.push(inside);return out;}
      if(!hasOutside)continue;
      const [ins,outs]=split(inside,ax,ay,ac);
      if(outs.length>=3&&Math.abs(area(outs))>minArea)out.push(outs);
      inside=ins;
    }
    return out;
  }

function subtractPolygon(subject,subjectPlane,occluder,{epsilon=1e-8,minArea=1e-6,depthKey='d'}={}){
  if(subject.length<3)return [];
  if(depthKey==='inv' && subjectPlane && (occluder.plane||occluder.pl) &&
    subject.every(p=>Number.isFinite(p.inv)&&Number.isFinite(p.light)) && occluder.pts.length===3){
    return fastSubtractPerspective(subject,subjectPlane,occluder,epsilon,minArea);
  }
  const nearPlane=occluder.plane||occluder.pl;
  if(nearPlane&&subjectPlane){
    const dx=nearPlane[0]-subjectPlane[0],dy=nearPlane[1]-subjectPlane[1],dz=nearPlane[2]-subjectPlane[2]-epsilon;
    if(subject.every(v=>dx*v.x+dy*v.y+dz<=0))return [subject];
  }
  let inside=subject;const outside=[],p=occluder.pts;
  const sign=Math.sign(area(p))||1;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y;
    const eq=q=>sign*(dx*(q.y-a.y)-dy*(q.x-a.x));
    let anyIn=false,anyOut=false;
    for(const q of inside){const v=eq(q);if(v>=-1e-10)anyIn=true;if(v<=1e-10)anyOut=true;if(anyIn&&anyOut)break;}
    if(!anyIn){if(inside.length>=3&&Math.abs(area(inside))>minArea)outside.push(inside);return outside;}
    if(!anyOut)continue;
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


/* Shared projected-scene and SVG back end. Both demos use this API. */
(function(root){
'use strict';
const K=root.VectorIllustrationCore;
const {area,bounds,intersects,spatialIndex,depthPlane,subtractPolygon,segmentVisibility,thresholdPolygon,joinSegments}=K;
function visibleSurfaces(surfaces,occluders,{depthKey='d',epsilon=1e-8,minArea=1e-5,index=null,cell=64,ignore=null,candidates=null}={}){
 const idx=index||spatialIndex(occluders,cell),out=[];let fragments=0,hidden=0,candidateTests=0;
 for(const f of surfaces){
  const poly=f.poly||f.projected||f.pts;
  if(!poly||poly.length<3){out.push({...f,fragments:[]});hidden++;continue;}
  const bb=f.bb||bounds(poly),plane=f.plane||f.pl||depthPlane(poly,depthKey);
  if(!plane){out.push({...f,fragments:[]});hidden++;continue;}
  let pieces=[poly];
  const other=(candidates?candidates(f,idx):idx.query(bb)).filter(o=>
    !(ignore&&ignore(f,o)) && !(o.id===f.id&&o.owner===f.owner) &&
    !(o.source===f.id&&o.owner===f.owner) && intersects(bb,o.bb||bounds(o.pts)) &&
    (o.maxDepth??Infinity)>(f.minDepth??-Infinity));
  candidateTests+=other.length;
  for(const o of other){
   const next=[],ob=o.bb||bounds(o.pts);
   for(const part of pieces){
    if(!intersects(bounds(part),ob)){next.push(part);continue;}
    next.push(...subtractPolygon(part,plane,o,{depthKey,epsilon,minArea}));
   }
   pieces=next;if(!pieces.length)break;
  }
  out.push({...f,fragments:pieces});fragments+=pieces.length;if(!pieces.length)hidden++;
 }
 return {surfaces:out,index:idx,fragments,hidden,candidateTests};
}
function visibleFeatures(features,index,{depthKey='d',epsilon=1e-8,minLength=1.6,ignore=null}={}){
 const out=[];
 for(const f of features){
  const pts=f.points||f.projected||f.pts,vis=[],hid=[];
  for(let i=1;i<(pts?.length||0);i++){
   const a=pts[i-1],b=pts[i],r=segmentVisibility(a,b,index.query(bounds([a,b])),{
    depthKey,epsilon,ignore:o=>(o.source===f.id&&o.owner===f.owner)||
    f.adjacentIds?.includes(o.id)||(ignore&&ignore(f,o))
   });
   vis.push(...r.visible);hid.push(...r.hidden);
  }
  out.push({...f,visible:joinSegments(vis,{minLength}),hidden:joinSegments(hid,{minLength})});
 }
 return out;
}
function renderProjectedScene(scene,{depthKey='d',epsilon=1e-8,minArea=1e-5,minLineLength=1.6,index=null,cell=64,ignoreFace=null,ignoreFeature=null,faceCandidates=null}={}){
 const surfaces=scene.surfaces||(scene.parts||[]).flatMap(p=>(p.surfaces||p.faces||[]).map(f=>({...f,owner:f.owner??p.id})));
 const features=scene.features||(scene.parts||[]).flatMap(p=>(p.features||[]).map(f=>({...f,owner:f.owner??p.id})));
 const raw=scene.occluders||surfaces.map(f=>{const pts=f.poly||f.projected||f.pts;return {id:f.id,owner:f.owner,source:f.id,pts,plane:f.plane||f.pl||depthPlane(pts,depthKey),bb:f.bb||bounds(pts)};}).filter(o=>o.plane&&o.pts?.length>=3);
 const occluders=raw.map(o=>o.bb?o:{...o,bb:bounds(o.pts)}),idx=index||spatialIndex(occluders,cell);
 const faces=visibleSurfaces(surfaces,occluders,{depthKey,epsilon,minArea,index:idx,ignore:ignoreFace,candidates:faceCandidates});
 const lines=visibleFeatures(features,idx,{depthKey,epsilon,minLength:minLineLength,ignore:ignoreFeature});
 const byOwner=new Map(),linesByOwner=new Map();
 for(const f of faces.surfaces){if(!byOwner.has(f.owner))byOwner.set(f.owner,[]);byOwner.get(f.owner).push(f);}
 for(const f of lines){if(!linesByOwner.has(f.owner))linesByOwner.set(f.owner,[]);linesByOwner.get(f.owner).push(f);}
 return {faces:faces.surfaces,features:lines,byOwner,linesByOwner,occluders,index:idx,
  stats:{fragments:faces.fragments,hidden:faces.hidden,candidateTests:faces.candidateTests,visibleLines:lines.reduce((n,f)=>n+f.visible.length,0)}};
}
function pathData(points,{closed=true,precision=3}={}){
 if(!points?.length)return '';
 const fmt=n=>String(Number(n.toFixed(precision)));
 return 'M'+points.map((p,i)=>(i?'L':'')+fmt(p.x)+' '+fmt(p.y)).join('')+(closed?'Z':'');
}
function mergedFillPath(polygons,{precision=3}={}){
 if(!polygons?.length)return {d:'',boundaryEdges:0,removedEdges:0,subpaths:0};
 if(polygons.length===1)return {d:pathData(polygons[0],{precision}),boundaryEdges:polygons[0].length,removedEdges:0,subpaths:1};
 const oriented=polygons.map(p=>area(p)<0?p.slice().reverse():p);
 const fallback=()=>({d:oriented.map(p=>pathData(p,{precision})).join(' '),boundaryEdges:oriented.reduce((s,p)=>s+p.length,0),removedEdges:0,subpaths:oriented.length});
 const fmt=n=>String(Number(n.toFixed(precision))),key=p=>fmt(p.x)+','+fmt(p.y),edges=new Map();let count=0,removed=0;
 for(const poly of oriented)for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ka=key(a),kb=key(b);if(ka===kb)continue;
  const reverse=edges.get(kb+'>'+ka),own=ka+'>'+kb;
  if(reverse?.length){reverse.pop();if(!reverse.length)edges.delete(kb+'>'+ka);removed+=2;}
  else {if(!edges.has(own))edges.set(own,[]);edges.get(own).push([a,b,ka,kb]);}
  count++;
 }
 const outs=new Map(),ins=new Map();
 for(const list of edges.values())for(const edge of list){
  if(outs.has(edge[2]))return fallback();
  outs.set(edge[2],edge);ins.set(edge[3],(ins.get(edge[3])||0)+1);
 }
 for(const k of outs.keys())if(ins.get(k)!==1)return fallback();
 if(!outs.size)return fallback();
 const rings=[],unused=new Set(outs.keys());
 while(unused.size){
  const start=unused.values().next().value,loop=[];let k=start;
  do {if(!unused.has(k))return fallback();unused.delete(k);const e=outs.get(k);if(!e)return fallback();loop.push(e[0]);k=e[3];}
  while(k!==start&&loop.length<=count);
  if(k!==start||loop.length<3)return fallback();rings.push(loop);
 }
 return {d:rings.map(p=>pathData(p,{precision})).join(' '),boundaryEdges:count-removed,removedEdges:removed,subpaths:rings.length};
}

// Shared interaction-frame policy for both the articulated scene and mesh scenes.
// Geometry fidelity and CSS styling are never changed by interaction state.
// Intermediate worker frames are displayed in revision order, while newer
// requested camera/pose frames replace queued work.
function frameMayCommit({sceneVersion=0,activeSceneVersion=0,revision=0,lastCommitted=0}={}){
 return sceneVersion===activeSceneVersion&&Number.isFinite(revision)&&revision>lastCommitted;
}
function compileSVG(scene,{width=800,height=610,style='',paper='#f9f7ef',title='Vector illustration',precision=2,tonalLevels=[],includeHidden=false}={}){
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const parts=scene.parts||[...new Set(scene.faces.map(f=>f.owner))].map(id=>({id,color:'#a9c3bd'}));
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" class="drawing"><title>'+esc(title)+'</title><style>'+style+'</style><rect class="paper" width="'+width+'" height="'+height+'" fill="'+paper+'"/>';
 for(const part of parts){
  const faces=scene.byOwner?.get(part.id)||[],lines=scene.linesByOwner?.get(part.id)||[];
  svg+='<g class="part" data-part="'+esc(part.id)+'" fill="'+esc(part.color||'#a9c3bd')+'"><title>'+esc(part.label||part.id)+'</title>';
  for(const f of faces){const d=mergedFillPath(f.fragments,{precision}).d;if(d)svg+='<path class="surface" data-source-surface="'+esc(f.id)+'" d="'+d+'"/>';}
  for(const [j,level] of tonalLevels.entries()){
   const regions=[];for(const f of faces)for(const frag of f.fragments){const poly=thresholdPolygon(frag,level);if(poly.length>=3&&Math.abs(area(poly))>1e-4)regions.push(poly);}
   if(regions.length)svg+='<path class="tone tone-'+j+'" d="'+mergedFillPath(regions,{precision}).d+'"/>';
  }
  for(const f of lines){
   for(const p of f.visible)svg+='<path class="feature '+esc(f.kind||'crease')+'" data-source-feature="'+esc(f.id||'')+'" fill="none" d="'+pathData(p,{closed:false,precision})+'"/>';
   if(includeHidden)for(const p of f.hidden)svg+='<path class="feature hidden" fill="none" d="'+pathData(p,{closed:false,precision})+'"/>';
  }
  svg+='</g>';
 }
 return svg+'</svg>';
}
root.VectorIllustrationCore=Object.freeze({...K,version:'2.2.0',frameMayCommit,visibleSurfaces,visibleFeatures,renderProjectedScene,pathData,mergedFillPath,compileSVG});
})(typeof self!=='undefined'?self:globalThis);

if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.VectorIllustrationCore;
