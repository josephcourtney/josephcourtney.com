/* Browser regression and visual comparison for the unified illustration renderer.
 * Runs against a local GitHub Pages checkout; no external runtime API calls.
 * Image differences are diagnostic until baselines are calibrated on devices.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const base=process.env.TEST_BASE||'http://127.0.0.1:8765/mechanical-illustration/';
const dir=process.env.ARTIFACT_DIR||'render-test-artifacts';
fs.mkdirSync(dir,{recursive:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function compare(a,b){
 const x=PNG.sync.read(a),y=PNG.sync.read(b);
 assert.equal(x.width,y.width);assert.equal(x.height,y.height);
 let sum=0,changed=0;
 for(let i=0;i<x.data.length;i+=4){
  let d=0;for(let j=0;j<3;j++)d+=Math.abs(x.data[i+j]-y.data[i+j]);
  sum+=d;if(d>48)changed++;
 }
 const pixels=x.width*x.height;
 return {pixels,changedPct:Math.round(changed/pixels*10000)/100,meanRGBError:Math.round(sum/(pixels*3*255)*10000)/10000};
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const findings=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:980},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push('console: '+e.text());});
  await page.goto(base+'?scene=bunny',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.meshIllustrationRenderer?.selectedMesh?.nf>0,{timeout:30000});
  await page.evaluate(()=>{
   const root=window.__unifiedMeshRoot,spin=root.getElementById('spin-speed');
   spin.value='0';spin.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(()=>{
   const d=window.__unifiedMeshRoot.querySelector('#render-layers path.geom-silhouette')?.getAttribute('d');
   return d&&d.length>50;
  },{timeout:30000});
  for(const quality of ['fast','balanced','full']){
   await page.evaluate(q=>window.__unifiedMeshRoot.querySelector('[data-lod="'+q+'"]').click(),quality);
   await page.waitForFunction(q=>window.meshIllustrationRenderer?.selectedMesh?.nf===({fast:554,balanced:1738,full:4968})[q],quality,{timeout:30000});
  }
  await page.waitForFunction(()=>!window.meshIllustrationRenderer?.previewActive,{timeout:30000});
  const svgImage=await page.locator('#unified-mesh-host .viewer').screenshot({timeout:30000});
  fs.writeFileSync(dir+'/bunny-svg.png',svgImage);
  const success=await page.evaluate(()=>window.__meshDrawRaster?.()===true);
  assert(success,'GPU preview unavailable in Chromium');
  const gpuImage=await page.locator('#unified-mesh-host .viewer').screenshot({timeout:30000});
  fs.writeFileSync(dir+'/bunny-raster.png',gpuImage);
  findings.push({scene:'bunny',parity:compare(svgImage,gpuImage)});
  await page.evaluate(()=>window.meshIllustrationRenderer.cancelPreview());
  const before=await page.evaluate(()=>window.meshIllustrationRenderer.camera);
  const box=await page.locator('#unified-mesh-host #bunny-svg').boundingBox();
  assert(box,'bunny SVG has no visible hit-test area');
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.63,box.y+box.height*.55,{steps:4});
  const during=await page.evaluate(()=>({camera:window.meshIllustrationRenderer.camera,preview:window.meshIllustrationRenderer.previewActive,nf:window.meshIllustrationRenderer.selectedMesh.nf}));
  assert.notEqual(during.camera.yaw,before.yaw,'drag did not orbit');
  assert.equal(during.nf,4968,'selected Full geometry was changed while dragging');
  assert(during.preview,'GPU is not visible during orbit');
  await page.mouse.up();
  await page.waitForFunction(()=>!window.meshIllustrationRenderer.previewActive,{timeout:30000});
  findings.push({scene:'bunny',orbit:true,fullResolutionStable:true,rasterHiddenAfterSettle:true});
  await page.locator('[data-unified-target="housing"]').click();
  await page.waitForFunction(()=>window.meshIllustrationRenderer?.sceneType==='housing',{timeout:30000});
  const hRes=await page.evaluate(()=>window.__meshDrawRaster?.()===true);
  assert(hRes,'machined housing GPU preview failed');
  findings.push({scene:'housing',raster:true});
  await page.evaluate(()=>window.meshIllustrationRenderer.cancelPreview());
  await page.locator('[data-unified-target="mechanism"]').click();
  await page.waitForFunction(()=>!!window.demo?.scene?.parts?.length,{timeout:30000});
  await page.waitForFunction(()=>!!document.querySelector('#overviewSvg > svg'),{timeout:30000});
  // Main-thread WebGL preview can be activated in either view, and uses the
  // same model/feature shader as the mesh renderer.
  const state=await page.evaluate(()=>({
    hasRasterBackend:typeof window.VectorRasterPreview==='function',
    hasVectorCore:typeof window.VectorIllustrationCore==='object',
    svgCount:document.querySelectorAll('#overviewSvg > svg, #detailSvg > svg').length,
    canvasCount:document.querySelectorAll('.svgviewport canvas.motion-preview').length
  }));
  assert(state.hasRasterBackend&&state.hasVectorCore&&state.canvasCount>=2,'unified mechanism preview not initialized');
  findings.push({scene:'mechanism',...state});
  // Compare the same orthographic camera in SVG and the live GPU buffer.
  // No animation, camera movement, or LOD change occurs between captures.
  const mechanicalSVG=await page.locator('#overviewSvg').screenshot({timeout:30000});
  fs.writeFileSync(dir+'/mechanism-svg.png',mechanicalSVG);
  const previewReady=await page.evaluate(()=>{
    const image=window.demo?.capturePreview?.('overview');
    if(!image)return false;
    document.getElementById('overviewSvg').classList.add('motion-active');
    window.demo.updatePreviewHandles?.('overview');
    return true;
  });
  assert(previewReady,'mechanism preview capture not exposed');
  const mechanicalGPU=await page.locator('#overviewSvg').screenshot({timeout:30000});
  fs.writeFileSync(dir+'/mechanism-raster.png',mechanicalGPU);
  findings.push({scene:'mechanism',parity:compare(mechanicalSVG,mechanicalGPU)});
  await page.evaluate(()=>document.getElementById('overviewSvg').classList.remove('motion-active'));
  assert(!errors.length,errors.join('\n'));
  console.log(JSON.stringify({status:'PASS',results:findings},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});