/* Shared WebGL raster companion for the authoritative native-SVG renderer.
 * Both scene types use the same depth-tested triangle and feature-stroke path.
 * Colors are supplied by the SVG style resolver; there is no transition animation.
 */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rgb=s=>{if(Array.isArray(s))return s;const v=String(s||'#8caea5').trim(),hex=v.replace('#','');
 if(hex.length===6&&/^[a-f\d]{6}$/i.test(hex))return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const m=v.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
 return m?[+m[1]/255,+m[2]/255,+m[3]/255]:[.55,.68,.64];};
function shader(gl,t,code){const s=gl.createShader(t);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
const VS='attribute vec4 aPosition;attribute float aLight;attribute vec3 aColor;uniform vec2 uSize;uniform float uPerspective;varying float vLight;varying vec3 vColor;void main(){float iv=mix(1.0,aPosition.w,uPerspective);float x=(aPosition.x/uSize.x*2.0-1.0)/iv;float y=(1.0-aPosition.y/uSize.y*2.0)/iv;float z=mix(-aPosition.z*.08,(.72-.30*iv)/iv,uPerspective);gl_Position=vec4(x,y,z,1.0/iv);vLight=aLight;vColor=aColor;}';
const FS='precision mediump float;varying float vLight;varying vec3 vColor;uniform float uMesh;uniform vec3 uPalette[4];void main(){vec3 c=vColor;if(uMesh>.5){c=uPalette[0];if(vLight<.74)c=uPalette[1];if(vLight<.55)c=uPalette[2];if(vLight<.37)c=uPalette[3];}gl_FragColor=vec4(c,1.0);}';
const LVS='attribute vec4 aPosition;attribute vec3 aColor;uniform vec2 uSize;uniform float uPerspective;varying vec3 vColor;void main(){float iv=mix(1.0,aPosition.w,uPerspective);float x=(aPosition.x/uSize.x*2.0-1.0)/iv;float y=(1.0-aPosition.y/uSize.y*2.0)/iv;float z=mix(-aPosition.z*.08-.0005,(.72-.30*iv-.0002)/iv,uPerspective);gl_Position=vec4(x,y,z,1.0/iv);vColor=aColor;}';
const LFS='precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.0);}';
function quad(out,a,b,width,col){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 if(len<.01)return;
 const nx=-dy/len*width/2,ny=dx/len*width/2;
 const pts=[[a.x+nx,a.y+ny,a],[a.x-nx,a.y-ny,a],[b.x+nx,b.y+ny,b],
            [b.x+nx,b.y+ny,b],[a.x-nx,a.y-ny,a],[b.x-nx,b.y-ny,b]];
 for(const [x,y,p] of pts)out.push(x,y,p.depth,p.inv,...col);
}
class RasterPreview{
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false});
  if(!this.gl)throw Error('WebGL is unavailable');
  const gl=this.gl;
  this.fill=program(gl,VS,FS);this.line=program(gl,LVS,LFS);
  this.fillBuffer=gl.createBuffer();this.lineBuffer=gl.createBuffer();
  this.aFill=['aPosition','aLight','aColor'].map(k=>gl.getAttribLocation(this.fill,k));
  this.aLine=['aPosition','aColor'].map(k=>gl.getAttribLocation(this.line,k));
  this.palette=[[.8,.87,.85],[.7,.79,.77],[.58,.7,.67],[.49,.62,.58]];
 }
 begin(w,h,perspective,palette){
  const gl=this.gl;this.width=w;this.height=h;this.perspective=perspective;
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.BLEND);
  this.palette=(palette||this.palette).map(rgb);
 }
 drawGeometry(fills,edges,mesh){
  const gl=this.gl;
  if(fills.length){
   gl.useProgram(this.fill);gl.bindBuffer(gl.ARRAY_BUFFER,this.fillBuffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(fills),gl.DYNAMIC_DRAW);
   for(const [j,size,offset] of [[0,4,0],[1,1,16],[2,3,20]]){
    gl.enableVertexAttribArray(this.aFill[j]);gl.vertexAttribPointer(this.aFill[j],size,gl.FLOAT,false,32,offset);
   }
   gl.uniform2f(gl.getUniformLocation(this.fill,'uSize'),this.width,this.height);
   gl.uniform1f(gl.getUniformLocation(this.fill,'uPerspective'),this.perspective?1:0);
   gl.uniform1f(gl.getUniformLocation(this.fill,'uMesh'),mesh?1:0);
   const p=gl.getUniformLocation(this.fill,'uPalette[0]');
   gl.uniform3fv(p,new Float32Array(this.palette.flat()));
   gl.drawArrays(gl.TRIANGLES,0,fills.length/8);
  }
  if(edges.length){
   gl.useProgram(this.line);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(edges),gl.DYNAMIC_DRAW);
   gl.enableVertexAttribArray(this.aLine[0]);gl.vertexAttribPointer(this.aLine[0],4,gl.FLOAT,false,28,0);
   gl.enableVertexAttribArray(this.aLine[1]);gl.vertexAttribPointer(this.aLine[1],3,gl.FLOAT,false,28,16);
   gl.uniform2f(gl.getUniformLocation(this.line,'uSize'),this.width,this.height);
   gl.uniform1f(gl.getUniformLocation(this.line,'uPerspective'),this.perspective?1:0);
   gl.drawArrays(gl.TRIANGLES,0,edges.length/7);
  }
 }
 drawMesh(mesh,camera,style={}){
  const m=mesh,n=m.nv,v=m.v,f=m.f,normal=m.vectorNormals||m.normals;
  if(!m||!normal)return;
  const w=800,h=610,CAM=3.65;
  this.begin(w,h,true,style.palette);
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const p=new Array(n),l=new Float32Array(n);
  for(let i=0;i<n;i++){
   const j=i*3,x=v[j],y=v[j+1],z=v[j+2],nx=normal[j],ny=normal[j+1],nz=normal[j+2];
   const X=cy*x+sy*z,Z=-sy*x+cy*z,Y=cp*y-sp*Z,ZZ=sp*y+cp*Z;
   const NX=cy*nx+sy*nz,NZ=-sy*nx+cy*nz,NY=cp*ny-sp*NZ,NZZ=sp*ny+cp*NZ;
   const inv=1/(CAM-ZZ),factor=235*camera.zoom*CAM*inv;
   p[i]={x:400+X*factor,y:296-Y*factor,depth:ZZ,inv};
   l[i]=.22+.78*Math.max(0,-.39*NX+.65*NY+.65*NZZ);
  }
  const faceFront=new Uint8Array(m.nf),fills=[],lines=[];
  for(let i=0;i<m.nf;i++){
   const j=i*3,a=f[j],b=f[j+1],c=f[j+2],A=p[a],B=p[b],C=p[c];
   const signed=(B.x-A.x)*(C.y-A.y)-(B.y-A.y)*(C.x-A.x);
   if(signed>=-1e-8)continue;
   faceFront[i]=1;
   let light=null;
   if(m.angular){
    const nx=m.normals[j],ny=m.normals[j+1],nz=m.normals[j+2];
    const NX=cy*nx+sy*nz,NZ=-sy*nx+cy*nz,NY=cp*ny-sp*NZ,NZZ=sp*ny+cp*NZ;
    light=.22+.78*Math.max(0,-.39*NX+.65*NY+.65*NZZ);
   }
   for(const id of [a,b,c]){const q=p[id];fills.push(q.x,q.y,q.depth,q.inv,light===null?l[id]:light,0,0,0);}
  }
  const silhouette=rgb(style.ink||'#293b36'),crease=rgb(style.crease||'#3a5a53');
  const threshold=Math.cos((m.angular?33:63)*Math.PI/180);
  for(const e of m.edges||[]){
   const A=faceFront[e.a],B=e.b<0?!A:faceFront[e.b];
   const sil=e.b<0||A!==B;
   if(sil&&!style.contours)continue;
   let sharp=false;
   if(!sil&&style.internal&&A&&B){
    const a=e.a*3,b=e.b*3;
    const d=m.normals[a]*m.normals[b]+m.normals[a+1]*m.normals[b+1]+m.normals[a+2]*m.normals[b+2];
    sharp=d<threshold;
   }
   if((sil&& (A||B))||sharp)quad(lines,p[e.p],p[e.q],sil?(style.lineWidth||1.9):1.35,silhouette&&sil?silhouette:crease);
  }
  this.drawGeometry(fills,lines,true);
 }
 drawMechanism(scene,camera,style={}){
  this.begin(camera.w,camera.h,false);
  const fills=[],lines=[],selected=style.selected;
  const ink=rgb(style.ink||'#293b36'),crease=rgb(style.crease||'#36443e');
  const projected=point=>{const p=camera.project(point);return {x:p.x,y:p.y,depth:p.d,inv:1};};
  for(const part of scene.parts){
   const col=rgb(part.cssColor||'#a9c3bd');
   for(const face of part.faces){
    if(face.worldNormal.reduce((sum,x,j)=>sum+x*camera.front[j],0)<=1e-6)continue;
    const pp=face.worldPts.map(projected);
    for(let i=1;i<pp.length-1;i++){
      for(const q of [pp[0],pp[i],pp[i+1]])fills.push(q.x,q.y,q.depth,q.inv,1,...col);
    }
   }
  }
  // Draw edges through the same depth-buffer and style path as the mesh.
  for(const part of scene.parts){
   const features=style.features?style.features(part,camera):part.features||[];
   for(const f of features){
    const points=f.worldPts||[];
    if(points.length<2)continue;
    const kind=f.kind||'crease';
    if(kind==='sketch'||kind==='hidden')continue;
    const color=part.id===selected?rgb('#b24d32'):kind==='silhouette'?ink:crease;
    const width=kind==='silhouette'?1.8:1.12;
    for(let j=1;j<points.length;j++)quad(lines,projected(points[j-1]),projected(points[j]),width,color);
   }
  }
  this.drawGeometry(fills,lines,false);
 }
}
root.VectorRasterPreview=RasterPreview;
})(typeof window!=='undefined'?window:self);
