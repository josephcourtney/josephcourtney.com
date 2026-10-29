/* Off-main-thread geometry-native SVG rendering. */
'use strict';
importScripts('/mechanical-illustration/shared/vector-core.js?v=6');
const CAM_D=3.65, DEPTH_LAYERS=1;
let selected=null, contours=true, wire=false, showInternal=true, showSuggestive=false;
let camera={yaw:0,pitch:-.12,zoom:1},visible=0,currentFamily='bunny';
const fmt=n=>Math.round(n*100)/100;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const hypo=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function indexTriangles(tris,cell=54){return VectorIllustrationCore.spatialIndex(tris,cell);}
  function bounding(a,b,c){return [Math.min(a.x,b.x,c.x),Math.min(a.y,b.y,c.y),Math.max(a.x,b.x,c.x),Math.max(a.y,b.y,c.y)];}
  
  // Interpolate isoline crossing in 3D and reproject via perspective-correct screen t.
  
  // Segment clipping against triangle's projected half-planes, then its
  // affine inverse-depth plane. The result is an exact parametric interval.
  
  function clipSegment(a,b,adj,index){
    const bb=[Math.min(a.x,b.x)-.01,Math.min(a.y,b.y)-.01,Math.max(a.x,b.x)+.01,Math.max(a.y,b.y)+.01];
    return VectorIllustrationCore.segmentVisibility(a,b,index.query(bb),{
      depthKey:'inv',epsilon:0.00015,ignore:tri=>tri.id===adj[0]||tri.id===adj[1]
    }).visible;
  }
  function joinLines(segs,minLength=2){
    return VectorIllustrationCore.joinSegments(segs,{minLength}).map(poly=>'M'+poly.map(p=>`${fmt(p.x)},${fmt(p.y)}`).join('L')).join('');
  }
  // A geometric probe distinguishes genuine occluding contours from
  // isolated front/back transitions caused by local scan tessellation.
  // It intersects the projected triangle planes analytically on both sides
  // of an edge; it never reads or constructs a raster depth image.
  function frontDepthAt(x,y,index){
    let depth=-Infinity;
    for(const tri of index.query([x,y,x,y])){
      const p=tri.pts,sign=tri.sign;
      if(sign*cross(p[0],p[1],{x,y}) < -1e-5 ||
         sign*cross(p[1],p[2],{x,y}) < -1e-5 ||
         sign*cross(p[2],p[0],{x,y}) < -1e-5)continue;
      const pl=tri.plane;depth=Math.max(depth,pl[0]*x+pl[1]*y+pl[2]);
    }
    return depth;
  }
  function describesOcclusion(a,b,index,inkPolicy){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<2)return false;
    const mx=(a.x+b.x)*.5,my=(a.y+b.y)*.5,nx=-dy/len,ny=dx/len;
    for(const dist of [2.3,4]){
      const x1=mx+nx*dist,y1=my+ny*dist,x2=mx-nx*dist,y2=my-ny*dist;
      const z1=frontDepthAt(x1,y1,index),z2=frontDepthAt(x2,y2,index);
      if(!Number.isFinite(z1)||!Number.isFinite(z2))return true;
      // A smooth, steeply sloping surface also has a depth difference.
      // Only treat this edge as an overlap when one side remains at the
      // edge's foreground depth and the other side is genuinely behind it.
      const midInv=(a.inv+b.inv)*.5;
      if(Math.abs(z1-z2)>inkPolicy.depthJump&&
         Math.abs(Math.max(z1,z2)-midInv)<inkPolicy.depthNearTolerance&&
         midInv-Math.min(z1,z2)>inkPolicy.depthBehind)return true;
    }
    return false;
  }
  function faceInvPlane(a,b,c){
    return VectorIllustrationCore.depthPlane([a,b,c],'inv')||[0,0,(a.inv+b.inv+c.inv)/3];
  }
  function polygonArea(poly){
    let area=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p.x*q.y-q.x*p.y;}
    return Math.abs(area)*.5;
  }
  
  
  
  function coplanarTjunction(edge,mesh){
    if(!mesh.angular||edge.b>=0)return false;
    const a=mesh.f[edge.a*3],b=mesh.f[edge.a*3+1],c=mesh.f[edge.a*3+2];
    const p=edge.p*3,q=edge.q*3,mid=[(mesh.v[p]+mesh.v[q])*.5,(mesh.v[p+1]+mesh.v[q+1])*.5,(mesh.v[p+2]+mesh.v[q+2])*.5];
    const nx=mesh.normals[edge.a*3],ny=mesh.normals[edge.a*3+1],nz=mesh.normals[edge.a*3+2];
    for(let i=0;i<mesh.nf;i++){
      if(i===edge.a)continue;
      const j=i*3,cos=mesh.normals[j]*nx+mesh.normals[j+1]*ny+mesh.normals[j+2]*nz;
      if(cos<.99999)continue;
      const v0=mesh.f[j]*3,v1=mesh.f[j+1]*3,v2=mesh.f[j+2]*3;
      const A=[mesh.v[v0],mesh.v[v0+1],mesh.v[v0+2]],B=[mesh.v[v1],mesh.v[v1+1],mesh.v[v1+2]],C=[mesh.v[v2],mesh.v[v2+1],mesh.v[v2+2]];
      const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      const diff=(a,b)=>a.map((x,k)=>x-b[k]);
      const v=diff(B,A),w=diff(C,A),t=diff(mid,A);
      if(Math.abs(dot3(t,[nx,ny,nz]))>1e-5)continue;
      const vv=dot3(v,v),vw=dot3(v,w),ww=dot3(w,w),tv=dot3(t,v),tw=dot3(t,w);
      const den=vv*ww-vw*vw;if(Math.abs(den)<1e-12)continue;
      const u=(tv*ww-tw*vw)/den,z=(tw*vv-tv*vw)/den;
      if(u>=-1e-5&&z>=-1e-5&&u+z<=1+1e-5)return true;
    }
    return false;
  }
  // A low-volume, optional suggestive contour: the n·v=0.18 isoline,
  // computed on mesh edges. It is filtered by concavity and precise visibility.
  function organicFormSegments(m,points,transformedNormals,index,faces){
    const out=[],level=.20;
    for(const tri of faces){if(!tri.front)continue;
      const ids=tri.ids,p=ids.map(i=>points[i]);
      const field=ids.map(i=>transformedNormals[i][2]);
      const crossPts=[];
      for(let i=0;i<3;i++){
        const j=(i+1)%3;if((field[i]-level)*(field[j]-level)>=0)continue;
        const t=(level-field[i])/(field[j]-field[i]);
        const a=p[i],b=p[j],ts=t*b.inv/((1-t)*a.inv+t*b.inv);
        crossPts.push({x:a.x+(b.x-a.x)*ts,y:a.y+(b.y-a.y)*ts,inv:a.inv+(b.inv-a.inv)*ts});
      }
      if(crossPts.length===2){for(const s of clipSegment(crossPts[0],crossPts[1],[tri.id],index))out.push(s);}
    }
    return out;
  }


function buildFrame(){
    const t0=performance.now();
    const m=selected,n=m.nv,cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
    const pts=new Array(n), normals=new Array(n),lightV=new Float32Array(n);
    for(let i=0;i<n;i++){
      const j=i*3,x=m.v[j],y=m.v[j+1],z=m.v[j+2],N=m.vectorNormals;
      const X=cy*x+sy*z,Z=-sy*x+cy*z,Y=cp*y-sp*Z,ZZ=sp*y+cp*Z;
      const wx=cy*N[j]+sy*N[j+2],wz=-sy*N[j]+cy*N[j+2],wy=cp*N[j+1]-sp*wz,nz=sp*N[j+1]+cp*wz;
      const inv=1/(CAM_D-ZZ),scale=235*camera.zoom*CAM_D*inv;
      pts[i]={x:400+X*scale,y:296-Y*scale,inv};
      normals[i]=[wx,wy,nz];
      lightV[i]=.22+.78*Math.max(0,-.39*wx+.65*wy+.65*nz);
    }
    const t1=performance.now();
    const triData=[], allFaces=new Array(m.nf),buckets=Array.from({length:DEPTH_LAYERS},()=>[[],[],[],[]]);
    for(let j=0;j<m.nf;j++){
      const k=j*3,a=m.f[k],b=m.f[k+1],c=m.f[k+2],pa=pts[a],pb=pts[b],pc=pts[c];
      const signed=cross(pa,pb,pc),front=signed < -1e-8;
      const tri={id:j,ids:[a,b,c],pts:[pa,pb,pc],front,bb:bounding(pa,pb,pc),sign:Math.sign(signed)};
      allFaces[j]=tri;
      if(!front)continue;
      tri.plane=faceInvPlane(pa,pb,pc);
      triData.push(tri);
    }
    visible=triData.length;
    const index=indexTriangles(triData,m.angular?64:20);
    // The shared scene renderer is authoritative for triangle visibility.
    // Frontend responsibility ends at projection and surface material values.
    const sharedSurfaces=triData.map(tri=>{
      const [a,b,c]=tri.ids,pa=pts[a],pb=pts[b],pc=pts[c];
      const poly=[{...pa,light:lightV[a]},{...pb,light:lightV[b]},{...pc,light:lightV[c]}];
      if(m.angular){
        const k=tri.id*3,n0=m.normals[k],n1=m.normals[k+1],n2=m.normals[k+2];
        const NX=cy*n0+sy*n2,NZ=-sy*n0+cy*n2,NY=cp*n1-sp*NZ,NZZ=sp*n1+cp*NZ;
        const L=.22+.78*Math.max(0,-.39*NX+.65*NY+.65*NZZ);
        for(const p of poly)p.light=L;
      }
      return {id:tri.id,owner:currentFamily,poly,plane:tri.plane,bb:tri.bb,minDepth:Math.min(pa.inv,pb.inv,pc.inv)};
    });
    // Mesh topology is the authoritative feature source for both models.
    const edgeFeatures=[];
    const inkPolicy=VectorIllustrationCore.meshInkPolicy(m.angular);
    const creaseCos=Math.cos((m.angular?33:63)*Math.PI/180);
    for(const e of m.edges){
      const p=pts[e.p],q=pts[e.q],A=allFaces[e.a],B=e.b>=0?allFaces[e.b]:null;
      if(coplanarTjunction(e,m))continue;
      const silhouette=!B||A.front!==B.front;
      let crease=false;
      if(B&&A.front&&B.front){
        const a=e.a*3,b=e.b*3;
        const dd=m.normals[a]*m.normals[b]+m.normals[a+1]*m.normals[b+1]+m.normals[a+2]*m.normals[b+2];
        crease=dd<creaseCos;
      }
      if(!silhouette&&!crease&&!wire)continue;
      edgeFeatures.push({id:'e'+e.p+'-'+e.q,owner:currentFamily,kind:silhouette?'silhouette':crease?'crease':'wire',
        points:[p,q],adjacentIds:[e.a,e.b],silhouette,crease});
    }
    const projectedFrame=VectorIllustrationCore.renderProjectedScene({surfaces:sharedSurfaces,
      occluders:triData.map(tri=>({...tri,maxDepth:Math.max(...tri.pts.map(p=>p.inv))})),features:edgeFeatures},
      {depthKey:'inv',epsilon:.00007,minArea:.005,minLineLength:0,index,ignoreFace:(face,occluder)=>face.id===occluder.id});
    for(const face of projectedFrame.faces)for(const visiblePoly of face.fragments){
      if(visiblePoly.length<3||Math.abs(VectorIllustrationCore.area(visiblePoly))<.018)continue;
      buckets[0][0].push(VectorIllustrationCore.pathData(visiblePoly,{precision:1}));
      for(let level=1;level<=3;level++){
        const threshold=[0,.74,.55,.37][level];
        const shade=VectorIllustrationCore.thresholdPolygon(visiblePoly,threshold,'light','inv');
        if(shade.length>=3&&Math.abs(VectorIllustrationCore.area(shade))>.018)
          buckets[0][level].push(VectorIllustrationCore.pathData(shade,{precision:1}));
      }
    }
    // Surface and feature visibility share the same scene-render pass.
    const contourPieces=[],creasePieces=[],wirePieces=[];
    for(const f of projectedFrame.features){
      const segments=[];
      for(const poly of f.visible)for(let j=1;j<poly.length;j++)segments.push([poly[j-1],poly[j]]);
      if(f.silhouette&&contours){
        for(const seg of segments)if(m.angular||describesOcclusion(seg[0],seg[1],index,inkPolicy))contourPieces.push(seg);
      }else if(f.crease&&showInternal)creasePieces.push(...segments);
      if(wire)wirePieces.push(...segments);
    }
    let formPieces=[];
    if(!m.angular && showInternal && showSuggestive)formPieces=organicFormSegments(m,pts,normals,index,allFaces);

    const t2=performance.now();
    return {paths:buckets[0].map(a=>a.join('')),outlines:joinLines(contourPieces,inkPolicy.silhouetteMinLength),
      creases:showInternal?joinLines(creasePieces,inkPolicy.creaseMinLength):'',form:joinLines(formPieces,20),
      wire:wire?joinLines(wirePieces,1):'',visible,
      projectionMs:t1-t0,geometryMs:t2-t1,totalMs:t2-t0};
}
let meshVersion=0;
self.onmessage=(ev)=>{
  const msg=ev.data;
  if(msg.type==='mesh'){
    selected=msg.mesh;meshVersion=msg.version;currentFamily=msg.family||'bunny';
    self.postMessage({type:'mesh-ready',version:meshVersion});
  } else if(msg.type==='frame' && selected && msg.version===meshVersion){
    try{
      camera=msg.camera;contours=msg.contours;wire=msg.wire;
      showInternal=msg.showInternal;showSuggestive=msg.showSuggestive;
      const output=buildFrame();
      self.postMessage({type:'frame',version:meshVersion,revision:msg.revision,...output});
    }catch(err){self.postMessage({type:'error',message:String(err),stack:String(err.stack||'')});}
  }
};
