import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const dom=new JSDOM('<div id="root"></div>',{url:'https://capital.queue-musical.ts.net',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=typeof dom.window[key]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?dom.window[key].bind(dom.window):dom.window[key];
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
const {mount}=await import('../dist/plugin.js');
const tick=()=>new Promise(r=>setTimeout(r,25));
async function until(predicate){for(let n=0;n<80;n++){if(predicate())return;await tick();}assert.fail('UI did not reach expected state');}
const mountRoot=document.getElementById('root');
const root={querySelectorAll:(s)=>mountRoot.firstChild.shadowRoot.querySelectorAll(s),get textContent(){return mountRoot.firstChild.shadowRoot.textContent;}};
const button=text=>[...root.querySelectorAll('button')].find(x=>x.textContent.includes(text));
const sample={checkedAt:'2026-10-08T09:00:00.000Z',instances:[
  {id:'capital',name:'Capital',status:'healthy',endpoints:[{id:'world-tailnet',service:'world',label:'Tailnet',url:'https://capital.queue-musical.ts.net/healthz',state:'up',httpStatus:200,latencyMs:41,revision:'b'.repeat(40)}]},
  {id:'yes',name:'Yes Education',status:'degraded',endpoints:[{id:'world-public',service:'world',label:'公网',url:'https://yes.unitedrobotics.app/healthz',state:'gated',httpStatus:302,latencyMs:80,detail:'未配置 Cloudflare Access 服务令牌'},{id:'world-tailnet',service:'world',label:'Tailnet',url:'https://yes.queue-musical.ts.net/healthz',state:'up',httpStatus:200,latencyMs:60},{id:'openclaw-public',service:'openclaw',label:'公网',url:'https://yes-openclaw.unitedrobotics.app/healthz',state:'up',httpStatus:200,latencyMs:95}],services:{world:'degraded',openclaw:'healthy'}},
  {id:'beauty',name:'Beauty（SkinSpirit）',status:'down',endpoints:[{id:'world-tailnet',service:'world',label:'Tailnet',url:'https://skinspirit.queue-musical.ts.net/healthz',state:'unreachable',latencyMs:8000,detail:'8 秒超时'}]}]};
test('renders every instance with its status; manual refresh; failure keeps last result; cleanup',async()=>{
  let calls=0,fail=false;
  const cleanup=mount(mountRoot,{props:{window:'health'},invoke:async(method,input)=>{assert.equal(method,'health.check');assert.deepEqual(input,{});calls++;if(fail)throw Error('Synthetic probe failure');return sample;}});
  await until(()=>root.textContent.includes('Beauty'));
  for(const text of ['Capital','Yes Education','健康','部分异常','不健康','8 秒超时','rev bbbbbbb','OpenClaw','yes-openclaw.unitedrobotics.app','健康 1，部分异常 1，不健康 1'])assert.ok(root.textContent.includes(text),text);
  fail=true;button('立即检查').click();
  await until(()=>root.textContent.includes('Synthetic probe failure'));
  assert.ok(root.textContent.includes('以下为上一次结果'));assert.ok(root.textContent.includes('Beauty'));assert.equal(calls,2);
  cleanup();assert.equal(mountRoot.childNodes.length,0);
});
test('failed first check never shows healthy placeholders; malformed responses rejected',async()=>{
  let cleanup=mount(mountRoot,{props:{},invoke:async()=>{throw Error('Synthetic read failure');}});
  await until(()=>root.textContent.includes('Synthetic read failure'));assert.ok(!root.textContent.includes('健康 '));cleanup();
  cleanup=mount(mountRoot,{props:{},invoke:async()=>({checkedAt:'x',instances:[{status:'fine',endpoints:[]}]})});
  await until(()=>root.textContent.includes('服务器返回格式无效'));cleanup();
});
test('unknown window fails explicitly',()=>{assert.throws(()=>mount(mountRoot,{props:{window:'other'},invoke:async()=>sample}),/Unknown window/);});
