// VSync-on live RAF/composer throughput. No manual stepping during timed windows, fences, readbacks or timer queries.
// node tools/cadence.mjs --port 8217 --headed --seconds 6 --warmup 2 --repeat 1 --json out.json
// Renderer submissions/composer returns are observable; physical display presents require external presentation tracing.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const args=process.argv.slice(2), arg=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
const all=JSON.parse(readFileSync(arg('views','tools/profile-views.json'),'utf8'));
const views=all.filter(v=>!arg('only')||arg('only').split(',').includes(v.name));
if(!views.length) throw Error('No views');
const cfg={views,seconds:+arg('seconds',6),warmup:+arg('warmup',2),repeat:+arg('repeat',1),validate:args.includes('--validate')};
const page=`(async()=>{
 const cfg=${JSON.stringify(cfg)}, gl=dev.renderer.getContext(), debug=gl.getExtension('WEBGL_debug_renderer_info');
 const stat=a=>{const s=[...a].sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((a,b)=>a+b,0)/a.length,p50:s[s.length>>1],p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]};};
 const assert=()=>{if(dev.settings.s.q!==2||!dev.settings.s.vsync||Math.abs(devicePixelRatio-1)>1e-5||dev.renderer.getPixelRatio()!==1||innerWidth!==2560||innerHeight!==1440||dev.renderer.domElement.width!==2560||dev.renderer.domElement.height!==1440)throw Error('Expected 2560x1440 DPR1 High VSync; actual '+JSON.stringify([innerWidth,innerHeight,devicePixelRatio,dev.renderer.getPixelRatio(),dev.renderer.domElement.width,dev.renderer.domElement.height,dev.settings.s]));};
 for(let i=0;i<100;i++){try{assert();break;}catch(e){if(i===99)throw e;await new Promise(r=>setTimeout(r,50));}}
 const metadata={settings:{...dev.settings.s},quality:dev.settings.levels[2],viewport:[innerWidth,innerHeight],drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],dpr:devicePixelRatio,renderer:debug&&gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent,screen:{width:screen.width,height:screen.height},visibility:document.visibilityState};
 const next=()=>new Promise((r,b)=>{const timer=setTimeout(()=>b(Error('RAF stalled; page hidden or blocked')),3000);requestAnimationFrame(t=>{clearTimeout(timer);r(t);});});
 const idle=async ms=>{const a=[];let first=await next(),last=first;while(last-first<ms){const t=await next();a.push(t-last);last=t;}return {frames:a.length,durationMs:last-first,fps:1000*a.length/(last-first),intervalMs:stat(a)};};
 dev.hold=true;const heldRaf=cfg.validate?null:await idle(2000);
 let sample=null;const original=dev.composer.render;
 dev.composer.render=function(...a){const start=performance.now();const r=original.apply(this,a);if(sample){const end=performance.now();sample.ends.push(end);sample.submit.push(end-start);}return r;};
 const rows=[];
 try {for(let repeat=0;repeat<cfg.repeat;repeat++)for(const v of cfg.views){
   dev.reset(...v.hash.split(',').map(Number));dev.lift=v.lift||0;if(v.pre)await(0,eval)(v.pre);dev.step(90);if(v.eval){await new (Object.getPrototypeOf(async function(){}).constructor)(v.eval)();dev.step(3);}assert();
   const state=dev.state();if(v.zone&&state.zone!==v.zone)throw Error(v.name+': expected '+v.zone+', got '+state.zone);
   if(cfg.validate){rows.push({name:v.name,state,camera:dev.camera.position.toArray(),floor:dev.floorH(state.x,state.z)});continue;}
   dev.hold=false;await idle(cfg.warmup*1000);
   const t0=performance.now();sample={ends:[],submit:[]};const raf=await idle(cfg.seconds*1000);const t1=performance.now();const raw=sample;sample=null;dev.hold=true;
   const intervals=raw.ends.slice(1).map((t,i)=>t-raw.ends[i]);
   rows.push({name:v.name,zone:state.zone,repeat,state,frames:raw.ends.length,durationMs:t1-t0,averageFps:1000*raw.ends.length/(t1-t0),meanFrameMs:(t1-t0)/raw.ends.length,completionIntervalMs:stat(intervals),composerSubmitMs:stat(raw.submit),raf,visible:!document.hidden,raw});
 }}finally{dev.hold=true;dev.composer.render=original;}
 return {metadata,heldRaf,views:rows};
})()`;
const dir=mkdtempSync(join(tmpdir(),'dc-cadence-')), file=join(dir,'eval.js');writeFileSync(file,page);
let out;try{out=execFileSync(process.execPath,['tools/browse.mjs','--url',`http://127.0.0.1:${arg('port',8217)}/?dev&bare`,'--size','2560x1440','--wait',String(Math.max(90000,views.length*cfg.repeat*(cfg.seconds+cfg.warmup+3)*1000)),'--eval-file',file,...(args.includes('--headed')?['--headed']:[])],{encoding:'utf8',maxBuffer:128*1024*1024});}catch(e){out=e.stdout;if(!out)throw e;}finally{rmSync(dir,{recursive:true,force:true});}
const r=JSON.parse(out);if(r.errors.length)throw Error(r.errors.join('\n'));
const report={baselineSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),date:new Date().toISOString(),mode:args.includes('--headed')?'headed':'headless',protocol:cfg,...r.result};
if(arg('json'))writeFileSync(arg('json'),JSON.stringify(report));
console.log(JSON.stringify({metadata:report.metadata,heldRaf:report.heldRaf,views:report.views.map(({raw,...v})=>v)},null,1));
