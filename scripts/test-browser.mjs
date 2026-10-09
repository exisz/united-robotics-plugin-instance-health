import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const sample={checkedAt:'2026-10-08T09:00:00.000Z',instances:[
  {id:'capital',name:'Capital',status:'healthy',endpoints:[{id:'world-public',service:'world',label:'公网',url:'https://capital.unitedrobotics.app/healthz',state:'up',httpStatus:200,latencyMs:41,revision:'b'.repeat(40)},{id:'world-tailnet',service:'world',label:'Tailnet',url:'https://capital.queue-musical.ts.net/healthz',state:'up',httpStatus:200,latencyMs:12}]},
  {id:'yes',name:'Yes Education',status:'degraded',endpoints:[{id:'world-public',service:'world',label:'公网',url:'https://yes.unitedrobotics.app/healthz',state:'gated',httpStatus:302,latencyMs:80,detail:'未配置 Cloudflare Access 服务令牌'},{id:'world-tailnet',service:'world',label:'Tailnet',url:'https://yes.queue-musical.ts.net/healthz',state:'up',httpStatus:200,latencyMs:60},{id:'openclaw-public',service:'openclaw',label:'公网',url:'https://yes-openclaw.unitedrobotics.app/healthz',state:'up',httpStatus:200,latencyMs:95}],services:{world:'degraded',openclaw:'healthy'}},
  {id:'beauty',name:'Beauty（SkinSpirit）',status:'down',endpoints:[{id:'world-tailnet',service:'world',label:'Tailnet',url:'https://skinspirit.queue-musical.ts.net/healthz',state:'unreachable',latencyMs:8000,detail:'8 秒超时'}]}]};
const server=createServer(async(req,res)=>{
  if(req.url==='/plugin.js'){res.setHeader('content-type','text/javascript; charset=utf-8');return res.end(await readFile(new URL('../dist/plugin.js',import.meta.url)));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html data-theme="dark"><head><style>html{--background:#171717;--foreground:#fafafa;--card:#262626;--card-foreground:#fafafa;--border:#404040}body{margin:0}#root{height:900px;background:var(--background)}h3{color:red!important}</style></head><body><div id="sentinel">Host unaffected</div><div id="root"></div><script type="module">import{mount}from'/plugin.js';window.calls=0;window.cleanup=mount(document.querySelector('#root'),{invoke:async()=>{window.calls++;return ${JSON.stringify(sample)}}});</script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByText('Beauty（SkinSpirit）').waitFor();
 for(const mode of ['dark','light']){
  await page.evaluate(mode=>{document.documentElement.dataset.theme=mode;const dark=mode==='dark';for(const[k,v]of Object.entries({background:dark?'#171717':'#fafafa',foreground:dark?'#fafafa':'#171717',card:dark?'#262626':'#ffffff','card-foreground':dark?'#fafafa':'#171717',border:dark?'#404040':'#e5e5e5'}))document.documentElement.style.setProperty('--'+k,v);},mode);
  await page.locator('.radix-themes.'+mode).waitFor();
  assert.notEqual(await page.getByRole('heading',{name:'Capital'}).evaluate(e=>getComputedStyle(e).color),'rgb(255, 0, 0)','host CSS must not leak in');
  await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'/tmp'}/instance-health-${mode}.png`,fullPage:true});
 }
 assert.equal(await page.evaluate(()=>window.calls),1,'theme changes do not refetch');
 await page.setViewportSize({width:360,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no narrow-panel overflow');
 await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'/tmp'}/instance-health-narrow.png`,fullPage:true});
 await page.evaluate(()=>window.cleanup());assert.equal(await page.locator('#root').evaluate(e=>e.childNodes.length),0);assert.deepEqual(errors,[]);
 console.log('Browser: dark/light, scoped CSS, theme switch without refetch, 360px, cleanup passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}
