import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {accessHeaders,dispatch,instances,probe,summarize} from '../src/backend.mjs';
const rev='a'.repeat(40);
const healthy=()=>new Response('{"ok":true}',{status:200,headers:{'x-world-application-revision':rev}});
test('probes only the fixed /healthz targets without following redirects',async()=>{
  const seen=[];
  const result=await dispatch('health.check',{},{env:{},fetch:async(url,options)=>{seen.push(url);assert.equal(options.redirect,'manual');return healthy();}});
  assert.deepEqual(seen.sort(),instances.flatMap(i=>i.endpoints.map(e=>e.url)).sort());
  assert.ok(seen.every(url=>/^https:\/\/[a-z0-9.-]+\/healthz$/.test(url)));
  assert.deepEqual(result.instances.map(i=>[i.id,i.status]),[['capital','healthy'],['yes','healthy'],['beauty','healthy']]);
  assert.equal(result.instances[0].endpoints[0].revision,rev);
  assert.deepEqual(result.instances.map(i=>Object.keys(i.services)),[['world','openclaw'],['world','openclaw'],['world']]);
});
test('every instance with an OpenClaw entry is checked on both services',()=>{
  for(const id of ['capital','yes'])assert.ok(instances.find(i=>i.id===id).endpoints.some(e=>e.service==='openclaw'),id);
  assert.ok(instances.every(i=>i.endpoints.every(e=>['world','openclaw'].includes(e.service))));
});
test('Access service token goes only to public unitedrobotics.app hosts',async()=>{
  const env={CF_ACCESS_CLIENT_ID:'id.access',CF_ACCESS_CLIENT_SECRET:'s3cret-value'};
  assert.deepEqual(accessHeaders('https://yes-openclaw.unitedrobotics.app/healthz',env),{'cf-access-client-id':'id.access','cf-access-client-secret':'s3cret-value'});
  for(const url of ['https://yes.queue-musical.ts.net/healthz','https://unitedrobotics.app.evil.test/healthz','https://x.test/healthz'])assert.deepEqual(accessHeaders(url,env),{},url);
  assert.deepEqual(accessHeaders('https://yes.unitedrobotics.app/healthz',{CF_ACCESS_CLIENT_ID:'id.access'}),{});
  const sent={};
  const result=await dispatch('health.check',{},{env,fetch:async(url,options)=>{sent[url]=options.headers['cf-access-client-secret']??null;return healthy();}});
  for(const [url,secret] of Object.entries(sent))assert.equal(secret,/\.unitedrobotics\.app\//.test(url)?'s3cret-value':null,url);
  assert.ok(!JSON.stringify(result).includes('s3cret-value'));
});
test('OpenClaw Gateway health body counts as up',async()=>{
  const endpoint={id:'openclaw-public',service:'openclaw',label:'公网',url:'https://yes-openclaw.unitedrobotics.app/healthz'};
  const up=await probe(endpoint,async()=>new Response('{"ok":true,"status":"live"}',{status:200}),undefined,{});
  assert.deepEqual([up.state,up.service,up.revision],['up','openclaw',null]);
  assert.equal((await probe(endpoint,async()=>new Response('{"ok":false,"status":"starting"}',{status:200}),undefined,{})).state,'down');
});
test('classifies Access redirects, tunnel errors, wrong bodies and network failures',async()=>{
  const endpoint={id:'x',label:'x',url:'https://x.test/healthz'};
  const login=async()=>new Response(null,{status:302,headers:{location:'https://team.cloudflareaccess.com/cdn-cgi/access/login'}});
  const gated=await probe(endpoint,login,undefined,{});
  assert.deepEqual([gated.state,gated.detail],['gated','未配置 Cloudflare Access 服务令牌']);
  const rejected=await probe({...endpoint,url:'https://yes.unitedrobotics.app/healthz'},login,undefined,{CF_ACCESS_CLIENT_ID:'a',CF_ACCESS_CLIENT_SECRET:'b'});
  assert.deepEqual([rejected.state,rejected.detail],['gated','Cloudflare Access 拒绝了服务令牌']);
  assert.equal((await probe(endpoint,async()=>new Response('bad gateway',{status:502}))).state,'down');
  assert.equal((await probe(endpoint,async()=>new Response('<html>login</html>',{status:200}))).state,'down');
  const dns=await probe(endpoint,async()=>{throw new TypeError('fetch failed',{cause:{code:'ENOTFOUND'}});});
  assert.deepEqual([dns.state,dns.detail],['unreachable','ENOTFOUND']);
  const timeout=await probe(endpoint,async()=>{throw new DOMException('t','TimeoutError');});
  assert.match(timeout.detail,/超时/);
});
test('instance status never counts Access as healthy',()=>{
  assert.equal(summarize([{state:'up'},{state:'gated'}]),'degraded');
  assert.equal(summarize([{state:'gated'},{state:'gated'}]),'unknown');
  assert.equal(summarize([{state:'gated'},{state:'unreachable'}]),'down');
  assert.equal(summarize([{state:'unreachable'}]),'down');
});
test('rejects unknown methods and caller-supplied targets',async()=>{
  await assert.rejects(dispatch('health.probe',{}),/不支持/);
  await assert.rejects(dispatch('health.check',{url:'http://169.254.169.254/'}),/参数无效/);
});
test('built one-shot rpc rejects bad protocol on stdout',()=>{
  const run=spawnSync(process.execPath,['dist/rpc.mjs'],{input:'{"version":2}',encoding:'utf8'});
  assert.equal(run.status,1);
  assert.deepEqual(JSON.parse(run.stdout),{version:1,ok:false,error:{code:'instance_health_failed',message:'请求协议无效'}});
});
