import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {dispatch,instances,probe,summarize} from '../src/backend.mjs';
const rev='a'.repeat(40);
const healthy=()=>new Response('{"ok":true}',{status:200,headers:{'x-world-application-revision':rev}});
test('probes only the fixed /healthz targets without following redirects',async()=>{
  const seen=[];
  const result=await dispatch('health.check',{},{fetch:async(url,options)=>{seen.push(url);assert.equal(options.redirect,'manual');return healthy();}});
  assert.deepEqual(seen.sort(),instances.flatMap(i=>i.endpoints.map(e=>e.url)).sort());
  assert.ok(seen.every(url=>/^https:\/\/[a-z.-]+\/healthz$/.test(url)));
  assert.deepEqual(result.instances.map(i=>[i.id,i.status]),[['capital','healthy'],['yes','healthy'],['beauty','healthy']]);
  assert.equal(result.instances[0].endpoints[0].revision,rev);
});
test('classifies Access redirects, tunnel errors, wrong bodies and network failures',async()=>{
  const endpoint={id:'x',label:'x',url:'https://x.test/healthz'};
  const gated=await probe(endpoint,async()=>new Response(null,{status:302,headers:{location:'https://team.cloudflareaccess.com/cdn-cgi/access/login'}}));
  assert.equal(gated.state,'gated');
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
